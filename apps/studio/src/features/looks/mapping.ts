import { blocksRegistry } from "@openspace/blocks";
import { type Op, type OpBody, stamp, validate } from "@openspace/ops";
import type { Block, Section, SiteDocument, Styles } from "@openspace/schema";

/**
 * "Try a new look" (doc 04 §7.2, arch §11.3): apply another template's Site Styles and preset
 * variants to the existing content. Sections whose preset has a counterpart in the template
 * (same preset, else same category: hero → hero) take that counterpart's color theme, spacing
 * and block variants; unmatched sections keep their structure and simply pick up the new
 * styles. Content — words, images, links, layout — never changes.
 *
 * Everything is expressed as ordinary ops (`styles.patch`, `section.update`, `block.update`,
 * `site.update`), committed together as one undo step. The Site Styles part is the same patch
 * MCP's `apply_template_look` makes (choices; `resetOverrides` ⇔ not keeping your tweaks).
 */

export interface LookOptions {
  /** Keep the site's exact token overrides (colors/fonts set by hand) on top of the look. */
  keepTweaks?: boolean;
}

export interface SectionMatch {
  /** Page id or "footer". */
  page: string;
  section: string;
  category: string;
  /** The template section it follows. */
  counterpart: string;
  /** Same preset (not just the same category): block styles follow too. */
  samePreset: boolean;
}

export interface LookPlan {
  /** Op bodies for one commit. */
  bodies: OpBody[];
  matches: SectionMatch[];
  /** Sections that keep their structure (no preset, or no counterpart in the template). */
  unmatched: Array<{ page: string; section: string }>;
}

/** `hero/split-image@2` → `{ category: "hero", base: "hero/split-image" }`. */
export function presetParts(preset: string | undefined): { category: string; base: string } | null {
  if (!preset) return null;
  const base = preset.split("@")[0] ?? "";
  const category = base.split("/")[0] ?? "";
  return category ? { category, base } : null;
}

interface Candidate {
  section: Section;
  base: string;
}

/** The template's sections by category, home page first (its sections define the look most). */
function templateCatalog(template: SiteDocument): Map<string, Candidate[]> {
  const pages = Object.values(template.pages).sort(
    (a, b) => Number(b.slug === "") - Number(a.slug === ""),
  );
  const out = new Map<string, Candidate[]>();
  for (const p of pages)
    for (const s of p.sections) {
      const parts = presetParts(s.preset);
      if (!parts) continue;
      const list = out.get(parts.category) ?? [];
      out.set(parts.category, list);
      list.push({ section: s, base: parts.base });
    }
  return out;
}

/** Section style keys a look carries (not backgrounds: those hold the owner's photos). */
const SECTION_STYLE_KEYS = ["colorTheme", "padding", "animation"] as const;
/** Block style keys a look carries when the preset matches. */
const BLOCK_STYLE_KEYS = ["colorTheme", "radius", "border", "shadow", "imageTreatment"] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function sectionStylePatch(
  cur: Section,
  next: Section,
): { set: Record<string, unknown>; unset: string[] } {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const k of SECTION_STYLE_KEYS) {
    const a = cur.style[k];
    const b = next.style[k];
    if (same(a, b)) continue;
    if (b === undefined) unset.push(`style.${k}`);
    else set[`style.${k}`] = structuredClone(b);
  }
  return { set, unset };
}

function blockOps(container: string, cur: Section, next: Section, samePreset: boolean): OpBody[] {
  const registry = blocksRegistry();
  const seen = new Map<string, number>();
  const byType = new Map<string, Block[]>();
  for (const b of next.blocks) {
    const l = byType.get(b.type) ?? [];
    byType.set(b.type, l);
    l.push(b);
  }
  const ops: OpBody[] = [];
  for (const b of cur.blocks) {
    const n = seen.get(b.type) ?? 0;
    seen.set(b.type, n + 1);
    const twin = byType.get(b.type)?.[n];
    if (!twin) continue;
    const body: Record<string, unknown> = {};
    if ((twin.variant ?? null) !== (b.variant ?? null)) {
      const known: readonly string[] = registry.get(b.type)?.variants ?? [];
      if (twin.variant === undefined || known.includes(twin.variant))
        body.variant = twin.variant ?? null;
    }
    if (samePreset) {
      const style: Record<string, unknown> = { ...(b.style ?? {}) };
      for (const k of BLOCK_STYLE_KEYS) {
        const v = twin.style?.[k];
        if (v === undefined) delete style[k];
        else style[k] = structuredClone(v);
      }
      if (!same(style, b.style ?? {})) body.style = Object.keys(style).length ? style : null;
    }
    if (Object.keys(body).length)
      ops.push({ op: "block.update", page: container, block: b.id, ...body } as OpBody);
  }
  return ops;
}

/** The Site Styles a look produces for this site. */
export function lookSiteStyles(current: Styles, look: Styles, opts: LookOptions = {}): Styles {
  const out: Styles = { ...structuredClone(current), choices: structuredClone(look.choices) };
  if (opts.keepTweaks) return out;
  if (look.overrides) out.overrides = structuredClone(look.overrides);
  else delete out.overrides;
  return out;
}

/**
 * Plan the ops that give the current site a template's look. Pure; the ops are validated
 * when committed (and by {@link previewLook}).
 */
export function planLook(
  current: SiteDocument,
  template: SiteDocument,
  look: Styles,
  opts: LookOptions = {},
): LookPlan {
  const bodies: OpBody[] = [];
  const target = lookSiteStyles(current.styles, look, opts);
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  if (!same(current.styles.choices, target.choices)) set.choices = target.choices;
  if (!same(current.styles.overrides, target.overrides)) {
    if (target.overrides === undefined) unset.push("overrides");
    else set.overrides = target.overrides;
  }
  if (Object.keys(set).length || unset.length)
    bodies.push({
      op: "styles.patch",
      patch: { ...(Object.keys(set).length ? { set } : {}), ...(unset.length ? { unset } : {}) },
    } as OpBody);

  // Header layout options (the owner's navigation and logo stay).
  const h = template.site.header;
  const headerSet: Record<string, unknown> = {};
  const headerUnset: string[] = [];
  for (const k of ["variant", "sticky", "transparentOnHero", "mobileMenu", "colorTheme"] as const) {
    if (same(current.site.header[k], h[k])) continue;
    if (h[k] === undefined) headerUnset.push(`header.${k}`);
    else headerSet[`header.${k}`] = h[k];
  }
  if (Object.keys(headerSet).length || headerUnset.length)
    bodies.push({
      op: "site.update",
      ...(Object.keys(headerSet).length ? { set: headerSet } : {}),
      ...(headerUnset.length ? { unset: headerUnset } : {}),
    } as OpBody);

  const catalog = templateCatalog(template);
  const used = new Map<string, number>();
  const matches: SectionMatch[] = [];
  const unmatched: Array<{ page: string; section: string }> = [];

  const follow = (container: string, s: Section, counterpart: Section, samePreset: boolean) => {
    const { set: sSet, unset: sUnset } = sectionStylePatch(s, counterpart);
    if (Object.keys(sSet).length || sUnset.length)
      bodies.push({
        op: "section.update",
        page: container,
        section: s.id,
        ...(Object.keys(sSet).length ? { set: sSet } : {}),
        ...(sUnset.length ? { unset: sUnset } : {}),
      } as OpBody);
    bodies.push(...blockOps(container, s, counterpart, samePreset));
  };

  for (const page of Object.values(current.pages))
    for (const s of page.sections) {
      const parts = presetParts(s.preset);
      const pool = parts ? catalog.get(parts.category) : undefined;
      if (!parts || !pool?.length) {
        unmatched.push({ page: page.id, section: s.id });
        continue;
      }
      // Prefer the same preset; otherwise take the category's sections in turn, so a page with
      // three testimonials sections echoes the template's own variety.
      const exact = pool.find((c) => c.base === parts.base);
      let pick = exact;
      if (!pick) {
        const n = used.get(parts.category) ?? 0;
        used.set(parts.category, n + 1);
        pick = pool[n % pool.length];
      }
      if (!pick) continue;
      const samePreset = pick.base === parts.base;
      matches.push({
        page: page.id,
        section: s.id,
        category: parts.category,
        counterpart: pick.section.id,
        samePreset,
      });
      follow(page.id, s, pick.section, samePreset);
    }

  // The footer follows the template's footer.
  const f = current.site.footer;
  const tf = template.site.footer;
  const fParts = presetParts(f.preset);
  const tParts = presetParts(tf.preset);
  follow("footer", f, tf, Boolean(fParts && tParts && fParts.base === tParts.base));
  matches.push({
    page: "footer",
    section: f.id,
    category: "footer",
    counterpart: tf.id,
    samePreset: Boolean(fParts && tParts && fParts.base === tParts.base),
  });

  return { bodies, matches, unmatched };
}

let previewCounter = 0;

/**
 * Apply a plan to a copy of the document for previewing. Ops that don't validate (a variant
 * the block's version doesn't have, say) are dropped, and left out of `bodies` too, so what
 * is previewed is exactly what Apply commits.
 */
export function previewLook(
  current: SiteDocument,
  plan: LookPlan,
): { doc: SiteDocument; bodies: OpBody[] } {
  const registry = blocksRegistry();
  let doc = current;
  const kept: OpBody[] = [];
  for (const body of plan.bodies) {
    const op = stamp(body as OpBody<Op>, {
      id: `look-preview:${++previewCounter}`,
      actor: "look-preview",
      ts: 0,
    });
    const r = validate(doc, op, { registry, trusted: true });
    if (!r.ok) continue;
    doc = r.doc;
    kept.push(body);
  }
  return { doc, bodies: kept };
}
