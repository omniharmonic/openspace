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
  colors?: Partial<Record<"text" | "heading" | "text-muted" | "accent" | "link", string>>;
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
  return !!b && b.length >= 2 && b.length <= 30 && section.height <= 2400;
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
    ".gx__i { margin: 0; min-width: 0; overflow-wrap: break-word; }",
    ".gx__img picture, .gx__img img { display: block; width: 100%; height: 100%; object-fit: cover; }",
  ];
  const phone: string[] = [];
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
  items.forEach((it, k) => {
    const n = k + 1;
    const cls = `gx__i gx__i${n}`;
    const col = Math.max(1, Math.min(24, Math.floor(((it.box.x - left) / width) * 24) + 1));
    const span = Math.max(1, Math.min(25 - col, Math.round((it.box.w / width) * 24)));
    const row = Math.floor((it.box.y - top) / 8) + 1;
    const rows = Math.max(1, Math.round(it.box.h / 8));
    const place = `grid-column: ${col} / span ${span}; grid-row: ${row} / span ${rows}`;
    if (it.kind === "image") {
      const key = `image${n}`;
      fields[key] = { kind: "image", label: `Picture ${n}` };
      values[key] = { src: it.src, alt: (it.alt ?? "").slice(0, 300) };
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
        parts.push(`<p class="${cls}">{{${label}}}</p>`);
      } else {
        const lk = `link${n}`;
        fields[lk] = {
          kind: "link",
          label: `${it.kind === "button" ? "Button" : "Link"} ${n} goes to`,
        };
        values[lk] = target;
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
    const text = (it.text ?? "").slice(0, it.kind === "heading" ? 300 : 1500);
    fields[key] = {
      kind: "text",
      label: it.kind === "heading" ? `Heading ${n}` : `Text ${n}`,
      maxLength: it.kind === "heading" ? 300 : 1500,
      ...(it.kind === "text" ? { multiline: true } : {}),
    };
    values[key] = text;
    // Headings: h2 for the section's first, h3 after it (the page keeps its own h1).
    const tag = it.kind === "heading" ? (headingSeen ? "h3" : "h2") : "p";
    if (it.kind === "heading") headingSeen = true;
    parts.push(`<${tag} class="${cls}">{{${key}}}</${tag}>`);
    css.push(`.gx__i${n} { ${place}; ${typeCss(it.style, false)}; }`);
    phone.push(`.gx__i${n} { ${typeCss(it.style, true)}; }`);
  });
  if (!parts.length) return undefined;
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
