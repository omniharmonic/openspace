import type { SiteDocument } from "@omniharmonic/openspace-ops";
import {
  COMPONENTS_MIN_KIT,
  type ColorTheme,
  type CompiledComponent,
  type CssNode,
  checkComponent,
  componentInstances,
  describeComponentIssues,
  expandComponent,
  looksAnimated,
  parseCss,
  readsReducedMotion,
  type XNode,
} from "@omniharmonic/openspace-schema";
import { compileStyles, contrastRatio, type ThemeTokens } from "@omniharmonic/openspace-theme";
import { type Issue, issue } from "./issue";

/**
 * Quality gates for custom components (ADR custom-components §4, §8): the definition must be valid,
 * fit its size budgets, honour reduced motion, stay on theme tokens, read well on phones, and its
 * rendered output must be accessible. Errors block a publish (via `publishCheck`); warnings are
 * shown in the Design check.
 */

/** Size budgets (characters). */
export const COMPONENT_BUDGETS = {
  template: 24_000,
  css: 16_000,
  js: 6_000,
  /** All component JavaScript on one page. */
  pageJs: 12_000,
} as const;

const BREAKPOINT_RE = /\((?:max|min)-width:\s*(\d+(?:\.\d+)?)(px|em|rem)\)/g;
const ALLOWED_BREAKPOINTS = new Set([767, 768, 1199, 1200]);
const COLOR_LITERAL_RE =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(|\b(?:red|blue|green|black|white|gray|grey|yellow|orange|purple|pink|brown|navy|teal|maroon|olive|silver|gold|crimson|coral|salmon|tomato|indigo|violet)\b/;
const COLOR_PROPS =
  /^(?:color|background|background-color|border(?:-[a-z]+)?-color|border(?:-(?:top|right|bottom|left))?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|text-decoration-color|caret-color|accent-color|column-rule(?:-color)?|--[a-z0-9-]+)$/;

/** Remove var(--x, fallback) fallbacks and url(...) contents before looking for literals. */
function stripVarsAndUrls(value: string): string {
  let out = value.replace(/url\([^)]*\)/gi, "url()");
  // Fallbacks inside var() are allowed (they only apply without the theme).
  for (let i = 0; i < 5; i++) out = out.replace(/var\(\s*--[\w-]+\s*,[^()]*\)/g, "var()");
  return out;
}

const tokenVarRole = (value: string): string | null => {
  const m = /^var\(\s*--os-color-([a-z0-9-]+)\s*(?:,[^)]*)?\)$/.exec(value.trim());
  return m ? (m[1] as string) : null;
};

function resolveRole(tokens: ThemeTokens, theme: ColorTheme, role: string): string | undefined {
  const roles = tokens.themes[theme] as unknown as Record<string, string>;
  if (roles[role]) return roles[role];
  const m = /^(accent|neutral)-(\d+)$/.exec(role);
  if (m)
    return (tokens.palette[m[1] as "accent" | "neutral"] as unknown as Record<number, string>)[
      Number(m[2])
    ];
  return undefined;
}

/** Text content of expanded nodes (for accessible names). */
function textOf(nodes: readonly XNode[]): string {
  return nodes
    .map((n) => {
      if (typeof n === "string") return n;
      if (n.k === "el" || n.k === "link") return textOf(n.children);
      if (n.k === "button") return n.label;
      if (n.k === "image") return String((n.value as { alt?: string }).alt ?? "");
      if (n.k === "rich") return "x";
      return "";
    })
    .join("")
    .trim();
}

interface A11yFinding {
  severity: "error" | "warning";
  message: string;
  fix: string;
}

/** Axe-style checks over one expanded instance. */
function a11y(nodes: readonly XNode[]): A11yFinding[] {
  const out: A11yFinding[] = [];
  const visit = (list: readonly XNode[], hidden: boolean) => {
    for (const n of list) {
      if (typeof n === "string") continue;
      if (n.k === "link") {
        if (hidden)
          out.push({
            severity: "error",
            message: "A link sits inside something hidden from screen readers (aria-hidden).",
            fix: "Remove aria-hidden from the element around the link.",
          });
        if (!textOf(n.children))
          out.push({
            severity: "error",
            message: "A link has no text, so screen readers can't say where it goes.",
            fix: "Put the link's words inside {{#link}}…{{/link}}, or add an aria-label.",
          });
        visit(n.children, hidden);
        continue;
      }
      if (n.k === "button" && hidden)
        out.push({
          severity: "error",
          message: "A button sits inside something hidden from screen readers (aria-hidden).",
          fix: "Remove aria-hidden from the element around the button.",
        });
      if (n.k === "image") {
        const alt = (n.value as { alt?: unknown }).alt;
        if (typeof alt !== "string")
          out.push({
            severity: "error",
            message: "An image has no description (alt text).",
            fix: "Describe the picture in its image field.",
          });
      }
      if (n.k !== "el") continue;
      const isHidden = hidden || n.attrs["aria-hidden"] === "true";
      const label =
        typeof n.attrs["aria-label"] === "string" && n.attrs["aria-label"].trim().length > 0;
      if ((n.tag === "a" || n.tag === "button") && !label && !textOf(n.children))
        out.push({
          severity: "error",
          message: `A ${n.tag === "a" ? "link" : "button"} in the template has no text or aria-label.`,
          fix: "Give it visible words or an aria-label that says what it does.",
        });
      if ((n.tag === "a" || n.tag === "button") && isHidden && n.attrs.tabindex !== "-1")
        out.push({
          severity: "error",
          message: `A ${n.tag === "a" ? "link" : "button"} is hidden from screen readers but can still be focused.`,
          fix: 'Remove aria-hidden, or add tabindex="-1" if it is purely decorative.',
        });
      if (n.tag === "svg" && !isHidden && !label && n.attrs.role !== "img")
        out.push({
          severity: "warning",
          message: "A drawing (svg) isn't marked decorative or labelled.",
          fix: 'Add aria-hidden="true" to decorative drawings, or role="img" and an aria-label.',
        });
      visit(n.children, isHidden);
    }
  };
  visit(nodes, false);
  return out;
}

/** Heading levels in expanded output (template headings and rich-text headings), in order. */
function headingLevels(nodes: readonly XNode[]): number[] {
  const out: number[] = [];
  const walk = (list: readonly XNode[]) => {
    for (const n of list) {
      if (typeof n === "string") continue;
      if (n.k === "el") {
        const h = /^h([1-6])$/.exec(n.tag);
        if (h) out.push(Number(h[1]));
        walk(n.children);
      } else if (n.k === "link") walk(n.children);
      else if (n.k === "rich") {
        const doc = n.doc as { content?: Array<{ type?: string; attrs?: { level?: number } }> };
        for (const b of doc.content ?? [])
          if (b.type === "heading" && typeof b.attrs?.level === "number") out.push(b.attrs.level);
      }
    }
  };
  walk(nodes);
  return out;
}

function hasReducedMotionBlock(nodes: readonly CssNode[]): boolean {
  return nodes.some(
    (n) =>
      n.t === "at" &&
      ((n.name === "media" && /prefers-reduced-motion/.test(n.prelude)) ||
        (n.children !== null && hasReducedMotionBlock(n.children))),
  );
}

/** Static findings about one definition (no instance needed). */
export function componentDefinitionIssues(
  c: CompiledComponent,
  tokens: ThemeTokens,
  themes: readonly ColorTheme[],
): Array<Omit<Parameters<typeof issue>[0], "page" | "section" | "block">> {
  const out: Array<Omit<Parameters<typeof issue>[0], "page" | "section" | "block">> = [];
  const def = c.def;
  const name = def.label;
  const size = (what: keyof typeof COMPONENT_BUDGETS, text: string, label: string) => {
    const limit = COMPONENT_BUDGETS[what];
    if (text.length > limit)
      out.push({
        rule: "component-budget",
        severity: "error",
        key: `${def.name}:${what}`,
        message: `The ${name} section's ${label} is ${Math.round(text.length / 100) / 10} KB, over its ${limit / 1000} KB budget.`,
        fix: `Trim the ${label}; heavy sections slow the page down on phones.`,
      });
    else if (text.length > limit * 0.8)
      out.push({
        rule: "component-budget",
        severity: "warning",
        key: `${def.name}:${what}`,
        message: `The ${name} section's ${label} is close to its ${limit / 1000} KB budget.`,
        fix: `Keep the ${label} lean.`,
      });
  };
  size("template", def.template, "template");
  size("css", def.css ?? "", "CSS");
  size("js", def.js ?? "", "JavaScript");

  for (const [key] of Object.entries(def.fields))
    if (!c.usedFields.has(key))
      out.push({
        rule: "component-unused-field",
        severity: "warning",
        key: `${def.name}:${key}`,
        message: `The ${name} section has a "${def.fields[key]?.label ?? key}" field that never shows on the page.`,
        fix: "Use the field in the template, or remove it so owners aren't confused.",
      });

  const { nodes } = parseCss(def.css ?? "");
  let animates = false;
  let transitions = false;
  let hardColors = 0;
  const badBreakpoints = new Set<string>();
  let mobileTrouble: string | null = null;
  const pairs: Array<{ fg: string; bg: string; line: number }> = [];
  const visitRules = (list: readonly CssNode[], at: string[]) => {
    for (const n of list) {
      if (n.t === "at") {
        if (n.name === "media" || n.name === "container")
          for (const m of n.prelude.matchAll(BREAKPOINT_RE)) {
            const px = m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16;
            if (!ALLOWED_BREAKPOINTS.has(px)) badBreakpoints.add(`${m[1]}${m[2]}`);
          }
        if (n.name === "keyframes") animates = true;
        if (n.children) visitRules(n.children, [...at, `@${n.name} ${n.prelude}`]);
        continue;
      }
      const fg = n.decls.find((d) => d.prop === "color");
      const bg = n.decls.find((d) => d.prop === "background-color" || d.prop === "background");
      if (fg && bg) {
        const f = tokenVarRole(fg.value);
        const b = tokenVarRole(bg.value);
        if (f && b && !at.some((a) => /prefers-color-scheme|print/.test(a)))
          pairs.push({ fg: f, bg: b, line: fg.line });
      }
      const inMedia = at.some((a) => /^@(?:media|container)/.test(a));
      for (const d of n.decls) {
        if ((d.prop === "animation" || d.prop === "animation-name") && !/^none\b/.test(d.value))
          animates = true;
        if (d.prop === "transition" && !/^none\b/.test(d.value)) transitions = true;
        if (COLOR_PROPS.test(d.prop) && COLOR_LITERAL_RE.test(stripVarsAndUrls(d.value)))
          hardColors++;
        if (!inMedia && !mobileTrouble) {
          const w = /^(?:width|min-width)$/.test(d.prop) && /^(\d+)px$/.exec(d.value.trim());
          if (w && Number(w[1]) > 390) mobileTrouble = `a fixed ${d.prop} of ${w[1]}px`;
          else if (d.prop === "position" && d.value.trim() === "fixed")
            mobileTrouble = "a fixed position (it can cover the page on phones)";
          else if (/^(?:width|min-width)$/.test(d.prop) && /100vw/.test(d.value))
            mobileTrouble = "a 100vw width (it causes sideways scrolling)";
          else if (
            d.prop === "font-size" &&
            /^(\d+(?:\.\d+)?)px$/.test(d.value.trim()) &&
            Number.parseFloat(d.value) < 12
          )
            mobileTrouble = `a ${d.value.trim()} font size (too small to read)`;
        }
      }
    }
  };
  visitRules(nodes, []);
  const reducedBlock = hasReducedMotionBlock(nodes);
  if (animates && !reducedBlock)
    out.push({
      rule: "component-motion",
      severity: "error",
      key: `${def.name}:css`,
      message: `The ${name} section animates without respecting “reduce motion”.`,
      fix: "Add @media (prefers-reduced-motion: reduce) { … } that turns the animation off.",
    });
  else if (transitions && !reducedBlock)
    out.push({
      rule: "component-motion",
      severity: "warning",
      key: `${def.name}:css-transition`,
      message: `The ${name} section's transitions ignore “reduce motion”.`,
      fix: "Add @media (prefers-reduced-motion: reduce) { … } that shortens or removes them.",
    });
  if (def.js && looksAnimated(def.js) && !readsReducedMotion(def.js))
    out.push({
      rule: "component-motion",
      severity: "warning",
      key: `${def.name}:js`,
      message: `The ${name} section's JavaScript moves things without checking “reduce motion”.`,
      fix: "Return early or skip the animation when ctx.reducedMotion is true.",
    });
  if (hardColors)
    out.push({
      rule: "component-color",
      severity: "warning",
      key: def.name,
      message: `The ${name} section uses ${hardColors} fixed colour${hardColors === 1 ? "" : "s"}, so Site Styles can't restyle ${hardColors === 1 ? "it" : "them"}.`,
      fix: "Use theme colours such as var(--os-color-text), var(--os-color-accent) or var(--os-color-neutral-200).",
    });
  if (badBreakpoints.size)
    out.push({
      rule: "component-breakpoints",
      severity: "warning",
      key: def.name,
      message: `The ${name} section switches layout at ${[...badBreakpoints].join(", ")}, not at OpenSpace's phone/tablet/desktop sizes.`,
      fix: "Use (max-width: 767px) for phones, (min-width: 768px) for tablets and up, (min-width: 1200px) for desktops.",
    });
  if (mobileTrouble)
    out.push({
      rule: "component-mobile",
      severity: "warning",
      key: def.name,
      message: `On phones the ${name} section may not fit: it has ${mobileTrouble}.`,
      fix: "Use max-width, percentages or a (max-width: 767px) rule for small screens.",
    });
  // Contrast of token pairs declared together, in every theme the section appears in.
  for (const p of pairs)
    for (const theme of themes) {
      const fg = resolveRole(tokens, theme, p.fg);
      const bg = resolveRole(tokens, theme, p.bg);
      if (!fg || !bg) continue;
      const ratio = contrastRatio(fg, bg);
      if (ratio < 4.5) {
        out.push({
          rule: "component-contrast",
          severity: ratio < 3 ? "error" : "warning",
          key: `${def.name}:${p.fg}:${p.bg}:${theme}`,
          message: `In the ${name} section, ${p.fg} text on ${p.bg} has a contrast of ${ratio.toFixed(1)}:1 in the ${theme} theme (needs 4.5:1).`,
          fix: "Pair text and background roles the theme solves for contrast, like text on background or accent-text on accent.",
        });
        break;
      }
    }
  return out;
}

/**
 * Component findings for a document (or one page): invalid definitions, budgets, motion, colour,
 * breakpoints, mobile, contrast, and per-instance accessibility and heading order.
 */
export function componentIssues(doc: SiteDocument, pageId?: string): Issue[] {
  const components = doc.components ?? {};
  const instances = componentInstances(doc).filter(
    (i) => !pageId || i.container === pageId || i.container === "footer",
  );
  if (!Object.keys(components).length && !instances.length) return [];
  const out: Issue[] = [];
  const tokens = compileStyles(doc.styles).tokens;
  const where = (inst: (typeof instances)[number]) => ({
    page: inst.container,
    section: inst.section.id,
    block: inst.blockId,
  });

  // Definitions (once each), with the themes their instances use.
  const used = new Map<string, Set<ColorTheme>>();
  for (const inst of instances) {
    const set = used.get(inst.name) ?? new Set<ColorTheme>();
    set.add(inst.section.style.colorTheme ?? "light");
    used.set(inst.name, set);
  }
  const compiled = new Map<string, CompiledComponent>();
  for (const [name, def] of Object.entries(components)) {
    if (pageId && !used.has(name)) continue;
    const r = checkComponent(def);
    if (!r.ok) {
      out.push(
        issue({
          rule: "component-invalid",
          severity: "error",
          key: name,
          message: `The ${def.label ?? name} designer section has a problem in its code: ${describeComponentIssues(r.issues).slice(0, 2).join("; ")}`,
          fix: "Open the section's Component code (designers) or ask Claude to fix it.",
        }),
      );
      continue;
    }
    compiled.set(name, r.component);
    const themes = [...(used.get(name) ?? new Set<ColorTheme>(["light"]))];
    for (const i of componentDefinitionIssues(r.component, tokens, themes)) out.push(issue(i));
  }

  // Instances: unknown components, accessibility, headings.
  const pageJs = new Map<string, number>();
  for (const inst of instances) {
    if (inst.section.hidden) continue;
    const c = compiled.get(inst.name);
    if (!components[inst.name]) {
      out.push(
        issue({
          rule: "component-missing",
          severity: "error",
          ...where(inst),
          message: `A section uses a designer section (“${inst.name}”) this site doesn't have.`,
          fix: "Delete the section, or add the component back.",
        }),
      );
      continue;
    }
    if (!c) continue;
    const nodes = expandComponent(c, inst.fields, inst.blockId);
    for (const f of a11y(nodes))
      out.push(
        issue({
          rule: "component-a11y",
          severity: f.severity,
          ...where(inst),
          key: f.message.slice(0, 40),
          message: `${c.def.label}: ${f.message}`,
          fix: f.fix,
        }),
      );
    const levels = headingLevels(nodes);
    for (let k = 1; k < levels.length; k++) {
      const prev = levels[k - 1] as number;
      const cur = levels[k] as number;
      if (cur > prev + 1) {
        out.push(
          issue({
            rule: "component-heading-order",
            severity: "warning",
            ...where(inst),
            message: `${c.def.label}: a level ${cur} heading follows a level ${prev} heading, skipping a level.`,
            fix: "Use the next heading level down so screen readers can follow the outline.",
          }),
        );
        break;
      }
    }
    if (c.js) pageJs.set(inst.container, (pageJs.get(inst.container) ?? 0) + c.js.length);
  }
  for (const [page, total] of pageJs)
    if (total > COMPONENT_BUDGETS.pageJs)
      out.push(
        issue({
          rule: "component-budget",
          severity: "error",
          page,
          key: "page-js",
          message: `The designer sections on this page add ${Math.round(total / 100) / 10} KB of JavaScript, over the ${COMPONENT_BUDGETS.pageJs / 1000} KB page budget.`,
          fix: "Use fewer animated designer sections on one page, or trim their JavaScript.",
        }),
      );
  return out;
}

// --- site-kit gate ------------------------------------------------------------------------------

const KIT = "@omniharmonic/openspace-site-kit";

const parse = (v: string) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const cmp = (a: number[], b: number[]) =>
  (a[0] as number) - (b[0] as number) ||
  (a[1] as number) - (b[1] as number) ||
  (a[2] as number) - (b[2] as number);

/** Does a dependency range (as written in package.json) admit `min`? (caret/tilde/exact/>=). */
export function rangeAdmits(range: string, min: string): boolean {
  const want = parse(min) as number[];
  const r = range.trim();
  if (r === "*" || r === "latest" || r.startsWith("workspace:") || r.startsWith("link:"))
    return true;
  if (r.startsWith(">=")) return true;
  const base = parse(r.replace(/^[\^~=v]+/, ""));
  if (!base) return false;
  if (cmp(base, want) >= 0) return true;
  if (r.startsWith("^")) {
    // ^0.1.x → <0.2.0; ^0.0.x → exact; ^1.x → <2.0.0
    if (base[0] !== 0) return base[0] === want[0];
    if (base[1] !== 0) return want[0] === 0 && base[1] === want[1];
    return false;
  }
  if (r.startsWith("~")) return base[0] === want[0] && base[1] === want[1];
  return false;
}

export interface KitGate {
  ok: boolean;
  /** The site-kit version or range found. */
  found: string | null;
  message?: string;
}

/**
 * Whether the site's site-kit can render custom components. `lock` (package-lock.json text) wins
 * when present (it pins the exact version the publish run installs); otherwise the package.json
 * range must admit `COMPONENTS_MIN_KIT`. An installed version (CLI) can be passed as `installed`.
 */
export function componentsKitGate(input: {
  packageJson?: string | null;
  packageLock?: string | null;
  installed?: string | null;
}): KitGate {
  const fail = (found: string | null): KitGate => ({
    ok: false,
    found,
    message:
      "This site uses a designer section that needs the latest OpenSpace update. Apply the update in Settings → Updates (or run npm install @omniharmonic/openspace-site-kit@latest), then publish again.",
  });
  if (input.installed) {
    const v = parse(input.installed);
    return v && cmp(v, parse(COMPONENTS_MIN_KIT) as number[]) >= 0
      ? { ok: true, found: input.installed }
      : fail(input.installed);
  }
  if (input.packageLock) {
    try {
      const lock = JSON.parse(input.packageLock) as {
        packages?: Record<string, { version?: string }>;
        dependencies?: Record<string, { version?: string }>;
      };
      const v =
        lock.packages?.[`node_modules/${KIT}`]?.version ?? lock.dependencies?.[KIT]?.version;
      if (v) {
        const p = parse(v);
        return p && cmp(p, parse(COMPONENTS_MIN_KIT) as number[]) >= 0
          ? { ok: true, found: v }
          : fail(v);
      }
    } catch {
      /* fall back to package.json */
    }
  }
  if (!input.packageJson) return { ok: true, found: null };
  try {
    const pkg = JSON.parse(input.packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const range = pkg.dependencies?.[KIT] ?? pkg.devDependencies?.[KIT];
    // Ejected sites (no kit dependency) render with their own copy; nothing to gate.
    if (!range) return { ok: true, found: null };
    return rangeAdmits(range, COMPONENTS_MIN_KIT) ? { ok: true, found: range } : fail(range);
  } catch {
    return { ok: true, found: null };
  }
}

/** True when the document has at least one component instance (on any page or the footer). */
export function usesComponents(doc: SiteDocument): boolean {
  return componentInstances(doc).length > 0;
}
