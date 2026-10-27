/**
 * Strict SVG re-serializer for uploads (M-6). The upload is parsed into a tree and written out
 * again from scratch: only allowlisted elements and attributes survive, every attribute value
 * is entity-decoded, checked and re-escaped, and nothing else of the original text (comments,
 * CDATA wrappers, processing instructions, doctypes, namespaced editor junk) reaches the stored
 * file. Anything active — scripts, event handlers, animation that can rewrite `href`,
 * `foreignObject`, script/data URLs, references outside the document — refuses the upload, so a
 * hostile file is never silently "half fixed".
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const ELEMENTS = (
  "svg a g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath " +
  "title desc metadata clipPath mask pattern marker linearGradient radialGradient stop filter " +
  "feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix " +
  "feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB " +
  "feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight " +
  "feSpecularLighting feSpotLight feTile feTurbulence switch view"
).split(" ");
const ELEMENT_NAMES = new Map(ELEMENTS.map((n) => [n.toLowerCase(), n]));

/** Elements whose presence means the file is active or hostile: the upload is refused. */
const FORBIDDEN = new Set(
  (
    "script foreignobject iframe embed object animate set animatemotion animatetransform " +
    "animatecolor discard handler listener image feimage audio video canvas html body style"
  ).split(" "),
);

const ATTRIBUTES = (
  "id class style transform viewBox preserveAspectRatio width height x y x1 x2 y1 y2 cx cy r " +
  "rx ry d points pathLength fill fill-opacity fill-rule stroke stroke-width stroke-linecap " +
  "stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity " +
  "color display visibility overflow clip-path clip-rule clipPathUnits mask maskUnits " +
  "maskContentUnits filter filterUnits primitiveUnits marker-start marker-mid marker-end " +
  "markerWidth markerHeight markerUnits refX refY orient patternUnits patternContentUnits " +
  "patternTransform gradientUnits gradientTransform spreadMethod offset stop-color " +
  "stop-opacity fx fy fr font-family font-size font-weight font-style font-variant " +
  "font-stretch text-anchor dominant-baseline alignment-baseline baseline-shift letter-spacing " +
  "word-spacing text-decoration writing-mode dx dy rotate textLength lengthAdjust startOffset " +
  "method spacing side href xlink:href xmlns xmlns:xlink version in in2 result stdDeviation " +
  "values type mode operator k1 k2 k3 k4 kernelMatrix order divisor bias targetX targetY " +
  "edgeMode preserveAlpha surfaceScale diffuseConstant specularConstant specularExponent " +
  "kernelUnitLength scale xChannelSelector yChannelSelector flood-color flood-opacity " +
  "lighting-color azimuth elevation z pointsAtX pointsAtY pointsAtZ limitingConeAngle radius " +
  "baseFrequency numOctaves seed stitchTiles tableValues slope intercept amplitude exponent " +
  "color-interpolation color-interpolation-filters shape-rendering text-rendering " +
  "image-rendering vector-effect paint-order mix-blend-mode isolation transform-origin " +
  "systemLanguage xml:space xml:lang lang role aria-label aria-hidden aria-labelledby " +
  "aria-describedby focusable media"
).split(" ");
const ATTRIBUTE_NAMES = new Map(ATTRIBUTES.map((n) => [n.toLowerCase(), n]));
/** Attributes that reference another element: only same-document fragments (`#id`). */
const REFERENCES = new Set(["href", "xlink:href"]);

export type SvgResult = { ok: true; svg: string } | { ok: false; problem: string };

interface Node {
  name: string;
  attrs: Array<[string, string]>;
  children: Array<Node | string>;
}

class Refuse extends Error {}

const NAMED: Record<string, string> = {
  colon: ":",
  lpar: "(",
  rpar: ")",
  tab: "\t",
  newline: "\n",
  sol: "/",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode character references (numeric, and the named ones used to hide `:`/`(`). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code =
        ref[1] === "x" || ref[1] === "X"
          ? Number.parseInt(ref.slice(2), 16)
          : Number.parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    }
    return NAMED[ref.toLowerCase()] ?? whole;
  });
}

/** Lowercase with whitespace and control characters removed (`java\tscript:` → `javascript:`). */
const squash = (t: string) =>
  [...t]
    .filter((ch) => ch.charCodeAt(0) > 0x20)
    .join("")
    .toLowerCase();

const escapeText = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (t: string) => escapeText(t).replace(/"/g, "&quot;");

/** CSS in a `style` attribute that can't load or run anything. */
function checkCss(css: string): void {
  const s = squash(css);
  if (/javascript:|vbscript:|data:/.test(s)) throw new Refuse("it contains a script URL");
  if (s.includes("\\")) throw new Refuse("it contains escaped CSS");
  // Anything that can make the browser fetch: imports, fonts, image-set()/src() and any
  // absolute or scheme-relative address, besides url() pointing outside the document.
  if (
    /@import|@font-face|expression\(|behavior:|-moz-binding|image-set\(|(?:^|[^a-z-])src\(/.test(s)
  )
    throw new Refuse("it refers to outside content");
  if (/https?:|\/\/|ftp:|file:/.test(s)) throw new Refuse("it refers to outside content");
  if (/url\((?!['"]?#)/.test(s)) throw new Refuse("it refers to outside content");
}

/** Check one attribute; returns the value to keep, or null to drop it silently. */
function checkAttribute(name: string, raw: string): [string, string] | null {
  const lower = name.toLowerCase();
  if (lower.startsWith("on")) throw new Refuse("it has event handlers");
  const value = decodeEntities(raw);
  const compact = squash(value);
  if (/javascript:|vbscript:|data:/.test(compact)) throw new Refuse("it contains a script URL");
  const canonical = ATTRIBUTE_NAMES.get(lower);
  if (lower === "xmlns") return value === SVG_NS ? ["xmlns", SVG_NS] : null;
  if (lower === "xmlns:xlink") return value === XLINK_NS ? ["xmlns:xlink", XLINK_NS] : null;
  if (REFERENCES.has(lower)) {
    if (!compact.startsWith("#")) throw new Refuse("it refers to outside content");
    return [canonical as string, value.trim()];
  }
  if (/url\((?!['"]?#)/.test(compact)) throw new Refuse("it refers to outside content");
  if (lower === "style") checkCss(value);
  if (!canonical) return null;
  return [canonical, value];
}

const TAG =
  /<([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/y;
const ATTR = /\s+([^\s=>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const END = /<\/([A-Za-z_][\w:.-]*)\s*>/y;

/** Parse, filter and re-serialize an uploaded SVG. */
export function sanitizeSvg(input: string): SvgResult {
  try {
    return { ok: true, svg: rewrite(input) };
  } catch (err) {
    if (err instanceof Refuse) return { ok: false, problem: err.message };
    throw err;
  }
}

function rewrite(input: string): string {
  const text = input.replace(/^﻿/, "");
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) throw new Refuse("it declares entities");
  const root: Node = { name: "#root", attrs: [], children: [] };
  // Stack of open elements; `null` marks a dropped element whose whole subtree is skipped.
  const stack: Array<{ node: Node | null; raw: string }> = [{ node: root, raw: "#root" }];
  const top = () => stack[stack.length - 1] as { node: Node | null; raw: string };
  let i = 0;
  const pushText = (t: string) => {
    const parent = top().node;
    if (!parent || parent === root || !t) return;
    parent.children.push(t);
  };
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) {
      pushText(decodeEntities(text.slice(i)));
      break;
    }
    if (lt > i) pushText(decodeEntities(text.slice(i, lt)));
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      if (end < 0) throw new Refuse("it contains a malformed comment");
      i = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      const end = text.indexOf("]]>", lt + 9);
      if (end < 0) throw new Refuse("it contains a malformed section");
      pushText(text.slice(lt + 9, end));
      i = end + 3;
      continue;
    }
    if (text.startsWith("<?", lt) || text.startsWith("<!", lt)) {
      // XML declaration, processing instructions (xml-stylesheet…), doctype: never kept.
      const end = text.indexOf(">", lt);
      if (end < 0) throw new Refuse("it contains a malformed tag");
      i = end + 1;
      continue;
    }
    if (text.startsWith("</", lt)) {
      END.lastIndex = lt;
      const m = END.exec(text);
      if (!m) throw new Refuse("it contains a malformed tag");
      const raw = (m[1] ?? "").toLowerCase();
      // Close the nearest matching open element (and anything left open inside it).
      for (let k = stack.length - 1; k > 0; k--)
        if (stack[k]?.raw === raw) {
          stack.length = k;
          break;
        }
      i = END.lastIndex;
      continue;
    }
    TAG.lastIndex = lt;
    const m = TAG.exec(text);
    if (!m) throw new Refuse("it contains a malformed tag");
    i = TAG.lastIndex;
    const rawName = m[1] ?? "";
    const lower = rawName.toLowerCase();
    const local = lower.includes(":") ? (lower.split(":").pop() as string) : lower;
    if (FORBIDDEN.has(lower) || FORBIDDEN.has(local))
      throw new Refuse(
        local === "script" || local === "foreignobject"
          ? "it contains active content"
          : `it contains <${rawName}>`,
      );
    const selfClosing = m[3] === "/";
    const parent = top().node;
    const canonical = lower.includes(":") ? undefined : ELEMENT_NAMES.get(lower);
    // Attributes are always checked (an event handler anywhere refuses the file).
    const attrs: Array<[string, string]> = [];
    for (const a of (m[2] ?? "").matchAll(ATTR)) {
      const kept = checkAttribute(a[1] ?? "", a[2] ?? a[3] ?? a[4] ?? "");
      if (kept && !attrs.some(([n]) => n === kept[0])) attrs.push(kept);
    }
    let node: Node | null = null;
    if (parent && canonical && (parent !== root || canonical === "svg")) {
      if (parent === root && root.children.length) throw new Refuse("it has more than one root");
      node = { name: canonical, attrs, children: [] };
      parent.children.push(node);
    }
    if (!selfClosing) stack.push({ node, raw: lower });
  }
  const svg = root.children[0];
  if (!svg || typeof svg === "string" || svg.name !== "svg")
    throw new Refuse("it isn't an SVG image");
  if (!svg.attrs.some(([n]) => n === "xmlns")) svg.attrs.unshift(["xmlns", SVG_NS]);
  if (!svg.attrs.some(([n]) => n === "xmlns:xlink") && JSON.stringify(svg).includes('"xlink:href"'))
    svg.attrs.push(["xmlns:xlink", XLINK_NS]);
  return serialize(svg);
}

function serialize(node: Node): string {
  const attrs = node.attrs.map(([n, v]) => ` ${n}="${escapeAttr(v)}"`).join("");
  if (!node.children.length) return `<${node.name}${attrs}/>`;
  const inner = node.children
    .map((c) => (typeof c === "string" ? escapeText(c) : serialize(c)))
    .join("");
  return `<${node.name}${attrs}>${inner}</${node.name}>`;
}

/**
 * The intrinsic size of a (sanitized) SVG: its root `width`/`height` in px, else its `viewBox`;
 * undefined when neither says.
 */
export function svgSize(svg: string): { width: number; height: number } | undefined {
  const root = /<svg\b([^>]*)>/i.exec(svg)?.[1] ?? "";
  const attr = (n: string) => new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, "i").exec(root)?.[1];
  const px = (v: string | undefined) => {
    const m = /^\s*([\d.]+)\s*(px)?\s*$/i.exec(v ?? "");
    return m ? Number(m[1]) : undefined;
  };
  const vb = (attr("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const vw = vb.length === 4 && vb[2] && vb[2] > 0 ? vb[2] : undefined;
  const vh = vb.length === 4 && vb[3] && vb[3] > 0 ? vb[3] : undefined;
  let w = px(attr("width"));
  let h = px(attr("height"));
  if (w && !h && vw && vh) h = (w * vh) / vw;
  if (h && !w && vw && vh) w = (h * vw) / vh;
  if (!w || !h) {
    w = vw;
    h = vh;
  }
  if (!w || !h) return undefined;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}
