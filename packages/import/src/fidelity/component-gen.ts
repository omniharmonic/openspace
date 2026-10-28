/**
 * Importers → custom components (ADR custom-components §9): when a source section can't be
 * reproduced faithfully with presets and blocks, recreate its layout as a custom component —
 * from what a browser measured (the section's blueprint: every heading, paragraph, picture,
 * button and link with its box and text style), never from the original's CSS. The component
 * places each part on a 24-column grid where it sat on a computer and stacks them in reading
 * order on phones; type comes from the theme's font roles, colours from the section theme's
 * roles (no fixed colours), buttons from Site Styles. Every word, picture and link is an
 * editable field, so the owner edits it in Studio like any block.
 */
import type { ComponentDefinition, ComponentFieldSpec, Link } from "@omniharmonic/openspace-schema";
import { colorDistance } from "./compare";
import type { BlueprintItem, ProbeSection } from "./probe";

export interface ComponentGenInput {
  /** Component name (lowercase-hyphenated, ≤ 40). */
  name: string;
  label: string;
  section: ProbeSection;
  /** The original's family for each font role, to pick `--os-font-<role>`. */
  roles: { heading?: string; body?: string; label?: string };
  /** The section theme's role colours (`#rrggbb`), to pick `--os-color-<role>`. */
  colors?: Partial<
    Record<
      "text" | "heading" | "text-muted" | "accent" | "link" | "surface" | "border" | "background",
      string
    >
  >;
  /** The original site's origin: its own links in rich text become paths on the new site. */
  origin?: string;
  /** Turn an original address into a site link (a page of the new site, or the address). */
  link: (href: string) => Link | undefined;
}

export interface GeneratedComponent {
  def: ComponentDefinition;
  /** The instance's fields (pictures still at their original https address). */
  fields: Record<string, unknown>;
}

const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const esc = (s: string) => s.replace(/[<>&"]/g, "");
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** A section that can be recreated: words or pictures to place, nothing interactive. */
export function canGenerate(section: ProbeSection): boolean {
  const b = section.blueprint;
  return (
    !!b &&
    b.filter((i) => i.kind !== "rule" && i.kind !== "panel").length >= 2 &&
    b.length <= 36 &&
    section.height <= 2400
  );
}

export function componentFromBlueprint(input: ComponentGenInput): GeneratedComponent | undefined {
  const items = (input.section.blueprint ?? []).filter(
    (i) => i.box.w > 0 && i.box.h > 0 && (i.kind !== "image" || /^https:\/\//.test(i.src ?? "")),
  );
  if (items.length < 2) return undefined;
  // Reading order: top to bottom, then left to right (rows within 12px).
  items.sort((a, b) => (Math.abs(a.box.y - b.box.y) > 12 ? a.box.y - b.box.y : a.box.x - b.box.x));
  const left = Math.min(...items.map((i) => i.box.x));
  const right = Math.max(...items.map((i) => i.box.x + i.box.w));
  const top = Math.min(...items.map((i) => i.box.y));
  const width = Math.max(1, right - left);
  const fields: Record<string, ComponentFieldSpec> = {};
  const values: Record<string, unknown> = {};
  const parts: string[] = [];
  const css: string[] = [
    ":scope { width: min(100%, " + Math.round(width) + "px); margin-inline: auto; }",
    ".gx { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); grid-auto-rows: minmax(8px, auto); column-gap: 0; }",
    ".gx__i { position: relative; z-index: 1; margin: 0; min-width: 0; overflow-wrap: break-word; }",
    ".gx__i p { margin: 0; }",
    ".gx__p { z-index: 0; }",
    ".gx__img picture, .gx__img img { display: block; width: 100%; height: 100%; object-fit: cover; }",
  ];
  const phone: string[] = [];
  /** Each editable part's role and words, to name its fields once all are known. */
  const named: Array<{ role: PartRole; text: string; keys: string[] }> = [];
  let headingSeen = false;
  const role = (family: string | undefined): "heading" | "body" | "label" => {
    if (norm(family) && norm(family) === norm(input.roles.label)) return "label";
    if (norm(family) && norm(family) === norm(input.roles.heading)) return "heading";
    return "body";
  };
  const colorVar = (hex: string | undefined) => {
    if (!hex || !input.colors) return "inherit";
    let best: string | undefined;
    let d = 40;
    for (const [r, c] of Object.entries(input.colors))
      if (c && /^#[0-9a-f]{6}$/i.test(c) && colorDistance(hex, c) < d) {
        d = colorDistance(hex, c);
        best = r;
      }
    return best ? `var(--os-color-${best})` : "inherit";
  };
  const typeCss = (s: BlueprintItem["style"], phoneSize: boolean) => {
    if (!s) return "";
    const size = phoneSize ? Math.max(14, Math.round(s.size * 0.8)) : Math.round(s.size * 10) / 10;
    return [
      `font-family: var(--os-font-${role(s.family)})`,
      `font-size: ${size}px`,
      ...(phoneSize
        ? []
        : [
            `font-weight: ${s.weight}`,
            `line-height: ${round(s.lineHeight)}`,
            `letter-spacing: ${round(s.letterSpacing, 3)}em`,
            ...(s.case !== "none" ? [`text-transform: ${s.case}`] : []),
            ...(s.italic ? ["font-style: italic"] : []),
            ...(s.align === "center" || s.align === "right" ? [`text-align: ${s.align}`] : []),
            `color: ${colorVar(s.color)}`,
          ]),
    ].join("; ");
  };
  const tokenColor = (hex: string | undefined, fallback: string) => {
    const v = colorVar(hex);
    return v === "inherit" ? fallback : v;
  };
  items.forEach((it, k) => {
    const n = k + 1;
    const cls = `gx__i gx__i${n}`;
    const col = Math.max(1, Math.min(24, Math.floor(((it.box.x - left) / width) * 24) + 1));
    const span = Math.max(1, Math.min(25 - col, Math.round((it.box.w / width) * 24)));
    const row = Math.floor((it.box.y - top) / 8) + 1;
    const rows = Math.max(1, Math.round(it.box.h / 8));
    const place = `grid-column: ${col} / span ${span}; grid-row: ${row} / span ${rows}`;
    if (it.kind === "rule") {
      // An accent rule: a short bar in the theme's accent (or border) color.
      parts.push(`<hr class="gx__p gx__r${n}">`);
      css.push(
        `.gx__r${n} { ${place.replace(/span \d+$/, "span 1")}; align-self: start; width: 100%; height: 0; margin: 0; border: 0; border-top: ${Math.max(1, Math.min(8, it.box.h))}px solid ${tokenColor(it.color, "var(--os-color-border)")}; }`,
      );
      return;
    }
    if (it.kind === "panel") {
      // A panel behind words: its fill and border on theme colors, never exact ones.
      parts.push(`<div class="gx__p gx__p${n}" aria-hidden="true"></div>`);
      css.push(
        `.gx__p${n} { ${place}; ${it.color ? `background: ${tokenColor(it.color, "var(--os-color-surface)")};` : ""} ${it.border ? `border: ${Math.max(1, Math.min(8, it.border.width))}px solid ${tokenColor(it.border.color, "var(--os-color-border)")};` : ""} border-radius: ${Math.min(48, Math.round(it.radius ?? 0))}px; }`,
      );
      phone.push(`.gx__p${n} { display: none; }`);
      return;
    }
    if (it.kind === "image") {
      const key = `image${n}`;
      fields[key] = { kind: "image", label: `Picture ${n}` };
      values[key] = { src: it.src, alt: (it.alt ?? "").slice(0, 300) };
      named.push({ role: "picture", text: it.alt ?? "", keys: [key] });
      parts.push(
        `<div class="${cls} gx__img">{{image ${key} sizes="(max-width: 767px) 100vw, ${Math.max(10, Math.round((it.box.w / 1440) * 100))}vw"}}</div>`,
      );
      css.push(
        `.gx__i${n} { ${place}; aspect-ratio: ${Math.round(it.box.w)} / ${Math.round(it.box.h)}; }`,
      );
      return;
    }
    if (it.kind === "button" || it.kind === "link") {
      const target = input.link(it.href ?? "");
      const label = `label${n}`;
      fields[label] = {
        kind: "text",
        label: `${it.kind === "button" ? "Button" : "Link"} ${n} text`,
        maxLength: 60,
      };
      values[label] = (it.text ?? "").slice(0, 60);
      if (!target) {
        named.push({ role: it.kind, text: it.text ?? "", keys: [label] });
        parts.push(`<p class="${cls}">{{${label}}}</p>`);
      } else {
        const lk = `link${n}`;
        fields[lk] = {
          kind: "link",
          label: `${it.kind === "button" ? "Button" : "Link"} ${n} goes to`,
        };
        values[lk] = target;
        named.push({ role: it.kind, text: it.text ?? "", keys: [label, lk] });
        parts.push(
          it.kind === "button"
            ? `<div class="${cls}">{{button ${lk} label=${label} variant="primary"}}</div>`
            : `<p class="${cls}">{{#link ${lk}}}{{${label}}}{{/link}}</p>`,
        );
      }
      css.push(`.gx__i${n} { ${place}; ${typeCss(it.style, false)}; }`);
      if (it.kind === "button" && it.style?.align === "center")
        css.push(`.gx__i${n} { justify-self: center; }`);
      phone.push(`.gx__i${n} { ${typeCss(it.style, true)}; }`);
      return;
    }
    const key = `text${n}`;
    const doc = it.kind === "text" ? richDoc(it.runs, input.origin) : undefined;
    if (doc) {
      // A paragraph with links or emphasis: a rich text field, so they stay editable.
      fields[key] = {
        kind: "richText",
        label: `Text ${n}`,
        marks: ["bold", "italic", "link"],
        blocks: ["paragraph"],
        maxLength: 3000,
      };
      values[key] = doc;
      named.push({ role: textRole(it), text: it.text ?? "", keys: [key] });
      parts.push(`<div class="${cls}">{{rich ${key}}}</div>`);
      css.push(`.gx__i${n} { ${place}; ${typeCss(it.style, false)}; }`);
      phone.push(`.gx__i${n} { ${typeCss(it.style, true)}; }`);
      return;
    }
    const text = (it.text ?? "").slice(0, it.kind === "heading" ? 300 : 1500);
    fields[key] = {
      kind: "text",
      label: it.kind === "heading" ? `Heading ${n}` : `Text ${n}`,
      maxLength: it.kind === "heading" ? 300 : 1500,
      ...(it.kind === "text" ? { multiline: true } : {}),
    };
    values[key] = text;
    named.push({ role: it.kind === "heading" ? "heading" : textRole(it), text, keys: [key] });
    // Headings: h2 for the section's first, h3 after it (the page keeps its own h1).
    const tag = it.kind === "heading" ? (headingSeen ? "h3" : "h2") : "p";
    if (it.kind === "heading") headingSeen = true;
    parts.push(`<${tag} class="${cls}">{{${key}}}</${tag}>`);
    css.push(`.gx__i${n} { ${place}; ${typeCss(it.style, false)}; }`);
    phone.push(`.gx__i${n} { ${typeCss(it.style, true)}; }`);
  });
  if (!parts.length) return undefined;
  for (const [i, label] of partLabels(named).entries()) {
    const part = named[i] as (typeof named)[number];
    const [first, second] = part.keys as [string, string | undefined];
    const f = fields[first];
    if (f) fields[first] = { ...f, label };
    const l = second ? fields[second] : undefined;
    if (second && l) fields[second] = { ...l, label: `${label} goes to` };
  }
  css.push(
    `@media (max-width: 767px) {\n  .gx { display: flex; flex-direction: column; gap: var(--os-space-sm); }\n  ${phone.join("\n  ")}\n}`,
  );
  const def: ComponentDefinition = {
    name: input.name,
    label: esc(input.label).slice(0, 60) || "Imported section",
    description:
      "Recreated from the original site's layout (measured in a browser): every word, picture and link is editable.",
    version: 1,
    category: "imported",
    fields,
    defaults: values,
    template: `<div class="gx">\n${parts.map((p) => `  ${p}`).join("\n")}\n</div>`,
    css: css.join("\n"),
    section: { width: "wide" },
  };
  return { def, fields: values };
}

type PartRole = "heading" | "small" | "paragraph" | "picture" | "button" | "link";

/** Words: a short all-caps or small line above a heading is a "small label" (an eyebrow). */
function textRole(it: BlueprintItem): PartRole {
  const words = (it.text ?? "").trim().split(/\s+/).filter(Boolean).length;
  const caps = it.style?.case === "uppercase" || /^[^a-z]*[A-Z][^a-z]*$/.test(it.text ?? "");
  return words <= 5 && (caps || (it.style?.size ?? 16) <= 14) ? "small" : "paragraph";
}

const ROLE_LABEL: Record<PartRole, string> = {
  heading: "Heading",
  small: "Small label",
  paragraph: "Paragraph",
  picture: "Picture",
  button: "Button",
  link: "Link",
};

/** The first words of a part, to tell several of the same kind apart (“About”, “Read more”). */
function snippet(text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  let out = "";
  for (const w of words) {
    if (`${out} ${w}`.trim().length > 24) break;
    out = `${out} ${w}`.trim();
  }
  if (!out && words[0]) out = words[0].slice(0, 22);
  if (!out) return "";
  const cased = /[a-z]/.test(out) ? out : out.charAt(0) + out.slice(1).toLowerCase();
  return `${cased}${out.length < text.trim().length ? "…" : ""}`;
}

/**
 * Field labels a non-technical owner understands (wave 4: "Text 2", "Button 4 text"): the part's
 * role ("Small label", "Paragraph", "Button"); when a section has several of one kind, the main
 * button is "Main button" and the others are told apart by their first words.
 */
export function partLabels(parts: ReadonlyArray<{ role: PartRole; text: string }>): string[] {
  const counts = new Map<PartRole, number>();
  for (const p of parts) counts.set(p.role, (counts.get(p.role) ?? 0) + 1);
  const used = new Set<string>();
  const seen = new Map<PartRole, number>();
  return parts.map((p) => {
    const nth = (seen.get(p.role) ?? 0) + 1;
    seen.set(p.role, nth);
    const base = ROLE_LABEL[p.role];
    let label: string;
    if ((counts.get(p.role) ?? 0) === 1) label = base;
    else if (p.role === "button" && nth === 1) label = "Main button";
    else {
      const words = p.role === "picture" ? "" : snippet(p.text);
      label = words ? `${base} “${words}”` : `${base} ${nth}`;
    }
    let unique = label;
    for (let k = 2; used.has(unique); k++) unique = `${label} ${k}`;
    used.add(unique);
    return unique.slice(0, 60);
  });
}

/** A paragraph's runs (words with links, bold, italics) → a one-paragraph rich text document. */
function richDoc(
  runs: BlueprintItem["runs"],
  origin?: string,
): Record<string, unknown> | undefined {
  if (!runs?.length) return undefined;
  const content: Record<string, unknown>[] = [];
  for (const r of runs) {
    if (r.t === "\n") {
      content.push({ type: "hardBreak" });
      continue;
    }
    const text = r.t;
    if (!text) continue;
    const marks: Record<string, unknown>[] = [];
    if (r.b) marks.push({ type: "bold" });
    if (r.i) marks.push({ type: "italic" });
    const href = r.href && safeHref(r.href, origin);
    if (href) marks.push({ type: "link", attrs: { href } });
    const last = content[content.length - 1] as
      | { type: string; text?: string; marks?: unknown[] }
      | undefined;
    // Neighbouring runs with the same marks merge into one text node.
    if (last?.type === "text" && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) {
      last.text = `${last.text}${text}`;
      continue;
    }
    content.push({ type: "text", text, ...(marks.length ? { marks } : {}) });
  }
  // Trim the paragraph's outer spaces.
  const first = content[0] as { type: string; text?: string } | undefined;
  if (first?.type === "text" && first.text) first.text = first.text.replace(/^\s+/, "");
  const end = content[content.length - 1] as { type: string; text?: string } | undefined;
  if (end?.type === "text" && end.text) end.text = end.text.replace(/\s+$/, "");
  const kept = content.filter((c) => c.type !== "text" || (c as { text?: string }).text);
  if (!kept.length) return undefined;
  return { type: "doc", content: [{ type: "paragraph", content: kept }] };
}

/** A link a rich text mark accepts: https, mailto/tel, or a path on the new site. */
function safeHref(href: string, origin?: string): string | undefined {
  if (/^(?:mailto:|tel:)/i.test(href)) return href;
  try {
    const u = new URL(href);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    if (origin && u.origin === origin) return `${u.pathname}${u.hash}` || "/";
    return u.toString();
  } catch {
    return undefined;
  }
}
