import type {
  BlockNode,
  FieldMeta,
  FontRole,
  ListFieldMeta,
  RichTextDoc,
  Styles,
  TypeScalePreset,
  TypeStep,
} from "@omniharmonic/openspace-schema";
import { mobileSize, presetDefaults } from "@omniharmonic/openspace-theme";
import type { StylesSet } from "./model";

/**
 * Text styles (Figma's local text styles; Squarespace's "Fonts → sizes"): every typography
 * preset with its size and fine settings, site-wide. A text style changes every piece of text
 * that uses it, on every page — so changing "Heading 2" keeps the site consistent.
 */

export interface TextStyleRow {
  preset: TypeScalePreset;
  label: string;
  /** The font role it uses by default. */
  role: FontRole;
  min: number;
  max: number;
}

export const TEXT_STYLE_ROWS: readonly TextStyleRow[] = [
  { preset: "display", label: "Display", role: "heading", min: 24, max: 200 },
  { preset: "h1", label: "Heading 1", role: "heading", min: 20, max: 160 },
  { preset: "h2", label: "Heading 2", role: "heading", min: 16, max: 120 },
  { preset: "h3", label: "Heading 3", role: "heading", min: 14, max: 96 },
  { preset: "h4", label: "Heading 4", role: "heading", min: 12, max: 72 },
  { preset: "lead", label: "Lead", role: "body", min: 12, max: 40 },
  { preset: "body", label: "Body", role: "body", min: 12, max: 28 },
  { preset: "small", label: "Small", role: "body", min: 10, max: 20 },
  { preset: "eyebrow", label: "Eyebrow", role: "label", min: 9, max: 24 },
  { preset: "button", label: "Buttons", role: "label", min: 10, max: 28 },
  { preset: "nav", label: "Menu", role: "label", min: 10, max: 28 },
];

export function textStyleRow(preset: string): TextStyleRow | undefined {
  return TEXT_STYLE_ROWS.find((r) => r.preset === preset);
}

export interface ResolvedStep {
  size: number;
  /** Phone size; `auto` when it follows the desktop size. */
  sizeMobile: number;
  mobileAuto: boolean;
  lineHeight: number;
  /** null: the pairing's tracking. */
  letterSpacing: number | null;
  weight: number | null;
  case: NonNullable<TypeStep["case"]> | null;
  font: FontRole;
  tuned: boolean;
}

/** Phone size the theme derives from a desktop size. */
export function autoMobile(desktop: number): number {
  return Math.round(Math.min(desktop, mobileSize(desktop)));
}

/** A preset's current values: what the site tuned, else the scale's defaults. */
export function resolveStep(styles: Styles, preset: TypeScalePreset): ResolvedStep {
  const row = textStyleRow(preset);
  const d = presetDefaults(preset);
  const t = styles.choices.typography?.scale?.[preset];
  const size = t?.size ?? d.size;
  const mobileAuto = t?.sizeMobile === undefined;
  return {
    size: Math.round(size),
    sizeMobile: Math.round(
      t?.sizeMobile ?? (t?.size !== undefined ? autoMobile(size) : d.sizeMobile),
    ),
    mobileAuto,
    lineHeight: t?.lineHeight ?? d.lineHeight,
    letterSpacing: t?.letterSpacing ?? null,
    weight: t?.weight ?? null,
    case: t?.case ?? (preset === "eyebrow" ? "uppercase" : null),
    font: t?.font ?? row?.role ?? "body",
    tuned: Boolean(t && Object.keys(t).length),
  };
}

const base = (preset: TypeScalePreset) => `choices.typography.scale.${preset}`;

/** New desktop size; the phone size follows it unless it was set on its own. */
export function sizePatch(preset: TypeScalePreset, px: number, keepMobile = false): StylesSet {
  return {
    [`${base(preset)}.size`]: Math.round(px),
    ...(keepMobile ? {} : { [`${base(preset)}.sizeMobile`]: undefined }),
  };
}

/** One fine setting (`undefined` returns it to the scale's default). */
export function stepPatch<K extends keyof TypeStep>(
  preset: TypeScalePreset,
  key: K,
  value: TypeStep[K] | undefined,
): StylesSet {
  return { [`${base(preset)}.${key}`]: value };
}

export function resetStepPatch(preset: TypeScalePreset): StylesSet {
  return { [base(preset)]: undefined };
}

/**
 * Every text style a bit smaller or larger (Squarespace's one-click "text size"): multiplies the
 * current desktop sizes, keeping each in its range; phone sizes follow.
 */
export function scaleAllPatch(styles: Styles, factor: number): StylesSet {
  const set: StylesSet = {};
  for (const row of TEXT_STYLE_ROWS) {
    const cur = resolveStep(styles, row.preset);
    const next = Math.min(row.max, Math.max(row.min, Math.round(cur.size * factor)));
    Object.assign(set, sizePatch(row.preset, next));
  }
  return set;
}

/** The content text styles used in a block's rich text (for the Design tab), in scale order. */
export function textStylesIn(
  fields: Record<string, FieldMeta>,
  values: Record<string, unknown>,
): TypeScalePreset[] {
  const used = new Set<string>();
  const walk = (nodes: readonly BlockNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === "heading") used.add(node.attrs.preset ?? `h${node.attrs.level}`);
      else if (node.type === "paragraph") used.add(node.attrs?.preset ?? "body");
      else if ("content" in node && Array.isArray(node.content))
        walk(node.content as readonly BlockNode[]);
    }
  };
  const visit = (meta: FieldMeta | undefined, value: unknown) => {
    if (!meta || value == null) return;
    if (meta.kind === "richText" && typeof value === "object")
      walk((value as RichTextDoc).content as readonly BlockNode[]);
    if (meta.kind === "list" && Array.isArray(value))
      for (const v of value)
        if (v && typeof v === "object")
          for (const [k, m] of Object.entries((meta as ListFieldMeta).fields))
            visit(m, (v as Record<string, unknown>)[k]);
  };
  for (const [k, meta] of Object.entries(fields)) visit(meta, values[k]);
  return TEXT_STYLE_ROWS.map((r) => r.preset).filter((p) => used.has(p));
}
