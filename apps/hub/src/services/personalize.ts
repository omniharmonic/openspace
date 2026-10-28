import {
  FOOTER,
  type Op,
  type OpBody,
  validateAll,
  validateDocument,
} from "@omniharmonic/openspace-ops";
import type { MediaId, SiteConfig, SiteDocument, SiteId } from "@omniharmonic/openspace-schema";
import type { TemplateLook, TemplateMeta } from "./templates";

/**
 * Turn a template's document into a new site's document: site id/hub/deploy in `openspace.json`,
 * name and tagline in `site.json` and the hero, the chosen look's styles and an optional brand
 * color. Content changes go through `@omniharmonic/openspace-ops` (Global Constraint 5).
 */
export interface PersonalizeInput {
  siteId: SiteId;
  name: string;
  tagline?: string | undefined;
  /**
   * A longer line about the site (Start with Claude: what they said it's for, trimmed to fit).
   * When given, it replaces the hero's sample subheading and the sample eyebrow is removed (it
   * names the template's demo place, like "Stoneware · Mystic, Connecticut").
   */
  intro?: string | undefined;
  look: TemplateLook;
  brandColor?: string | undefined;
  hubUrl: string;
  deployUrl: string;
  template: TemplateMeta;
  actor: string;
  now: number;
  /** An uploaded logo already placed at `path` in the repo. */
  logo?: {
    path: string;
    mediaId: MediaId;
    mime: string;
    bytes: number;
    width: number;
    height: number;
  };
}

export class PersonalizeError extends Error {
  constructor(
    message: string,
    readonly issues: unknown,
  ) {
    super(message);
    this.name = "PersonalizeError";
  }
}

type RichDoc = {
  type: "doc";
  content?: Array<{ type: string; attrs?: unknown; content?: unknown }>;
};

/** Keep the first node's type/attrs (heading level, preset…) and replace its text. */
export function replaceRichText(content: unknown, text: string): RichDoc {
  const doc = content as RichDoc | undefined;
  const first = doc?.content?.[0];
  const node =
    first && first.type !== "bulletList" && first.type !== "orderedList"
      ? {
          type: first.type,
          ...(first.attrs ? { attrs: first.attrs } : {}),
          content: [{ type: "text", text }],
        }
      : { type: "paragraph", content: [{ type: "text", text }] };
  return { type: "doc", content: [node] };
}

/** Replace a phrase inside every text node of a rich-text value (marks and structure kept). */
export function replaceInRichText(content: unknown, phrase: string, text: string): unknown {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const n = node as Record<string, unknown>;
    if (n.type === "text" && typeof n.text === "string")
      return { ...n, text: n.text.split(phrase).join(text) };
    return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, walk(v)]));
  };
  return walk(content);
}

/** Fields that hold links, ids or settings — never the brand name shown to visitors. */
const NOT_TEXT = /^(?:src|url|href|link|id|type|variant|icon|target|kind|style)$/;

/**
 * Replace the template's sample brand (its demo site title) with the new name in one block's
 * fields, so the footer matches the header. Returns the changed fields, or null when unchanged.
 */
export function rebrandFields(
  fields: Record<string, unknown>,
  from: string,
  to: string,
): Record<string, unknown> | null {
  if (!from || from === to) return null;
  let changed = false;
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === "string") {
      if (key && NOT_TEXT.test(key)) return v;
      if (!v.includes(from)) return v;
      changed = true;
      return v.split(from).join(to);
    }
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.src === "string" && key !== undefined) return v; // an image
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x, k)]));
    }
    return v;
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const next = walk(v, k);
    if (next !== v) out[k] = next;
  }
  return changed ? out : null;
}

function blockFields(
  doc: SiteDocument,
  pageId: string,
  blockId: string,
): Record<string, unknown> | null {
  const page = doc.pages[pageId as keyof typeof doc.pages];
  for (const s of page?.sections ?? [])
    for (const b of s.blocks) if (b.id === blockId) return b.fields as Record<string, unknown>;
  return null;
}

export function personalizeDocument(base: SiteDocument, input: PersonalizeInput): SiteDocument {
  const name = input.name.trim();
  const tagline = input.tagline?.trim() || undefined;
  const config: SiteConfig = {
    ...base.config,
    siteId: input.siteId,
    template: { id: input.template.id, version: input.template.version },
    hub: input.hubUrl,
    deploy: {
      ...base.config.deploy,
      target: "github-pages",
      url: input.deployUrl,
      customDomain: null,
    },
  };
  const doc: SiteDocument = { ...base, config };

  const bodies: OpBody[] = [];
  const siteSet: Record<string, unknown> = { title: name };
  if (tagline) siteSet.tagline = tagline;
  if (base.site.seo?.titleTemplate) siteSet["seo.titleTemplate"] = `%s — ${name}`;
  bodies.push({ op: "site.update", set: siteSet });

  const slots = input.template.slots ?? {};
  const intro = input.intro?.trim();
  for (const [slot, text] of [
    ["title", name],
    ["tagline", tagline],
  ] as const) {
    const target = slots[slot];
    if (!target || !text) continue;
    const fields = blockFields(doc, target.page, target.block);
    if (!fields) continue;
    const field = target.field ?? "content";
    const current = fields[field];
    let value: unknown;
    if (typeof current === "string")
      value = target.replace ? current.split(target.replace).join(text) : text;
    else if (target.replace) value = replaceInRichText(current, target.replace, text);
    else value = replaceRichText(current, text);
    const set: Record<string, unknown> = { [field]: value };
    const unset: string[] = [];
    if (slot === "tagline" && input.intro !== undefined && field === "text") {
      if (intro) set.subheading = intro;
      else if ("subheading" in fields) unset.push("subheading");
      if ("eyebrow" in fields) unset.push("eyebrow");
    }
    bodies.push({
      op: "block.update",
      page: target.page,
      block: target.block,
      set,
      ...(unset.length ? { unset } : {}),
    });
  }
  // The header shows the site title; the footer's wordmark and copyright line, the pages'
  // words and the sample events still carry the template's sample brand ("Relay", "Saltmarsh
  // Pottery"). Rename it everywhere (the slots above already set their own blocks).
  const sampleBrand = base.site.title.trim();
  if (sampleBrand && sampleBrand !== name) {
    for (const b of doc.site.footer.blocks) {
      const set = rebrandFields(b.fields as Record<string, unknown>, sampleBrand, name);
      if (set) bodies.push({ op: "block.update", page: FOOTER, block: b.id, set });
    }
    const slotBlocks = new Set(Object.values(slots).map((t) => t?.block));
    for (const page of Object.values(doc.pages)) {
      const seo = page.seo?.description;
      if (seo?.includes(sampleBrand) && page.slug !== "")
        bodies.push({
          op: "page.update",
          page: page.id,
          set: { "seo.description": seo.split(sampleBrand).join(name) },
        });
      for (const section of page.sections)
        for (const b of section.blocks) {
          if (slotBlocks.has(b.id)) continue;
          const set = rebrandFields(b.fields as Record<string, unknown>, sampleBrand, name);
          if (set) bodies.push({ op: "block.update", page: page.id, block: b.id, set });
        }
    }
    for (const [collection, items] of Object.entries(doc.collections ?? {}))
      for (const item of Object.values(items ?? {})) {
        const set = rebrandFields(item as unknown as Record<string, unknown>, sampleBrand, name);
        if (set)
          bodies.push({
            op: "collection.upsert",
            collection,
            item: { ...item, ...set },
          } as OpBody);
      }
  }
  const description = intro || tagline;
  if (description) {
    const home = Object.values(doc.pages).find((p) => p.slug === "");
    if (home)
      bodies.push({ op: "page.update", page: home.id, set: { "seo.description": description } });
  }

  if (input.logo) {
    const { path, mediaId, mime, bytes, width, height } = input.logo;
    bodies.push({
      op: "media.add",
      path,
      meta: {
        id: mediaId,
        path,
        kind: "image",
        mime,
        bytes,
        width,
        height,
        alt: name,
        createdAt: new Date(input.now).toISOString(),
      },
    });
    bodies.push({ op: "site.update", set: { logo: { src: path, alt: name, width, height } } });
  }

  const styleSet: Record<string, unknown> = { choices: input.look.styles.choices };
  if (input.look.styles.overrides) styleSet.overrides = input.look.styles.overrides;
  bodies.push({
    op: "styles.patch",
    patch: {
      set: styleSet,
      ...(!input.look.styles.overrides && base.styles.overrides ? { unset: ["overrides"] } : {}),
    },
  });
  if (input.brandColor)
    bodies.push({
      op: "styles.patch",
      patch: {
        set: { "choices.palette.brand": input.brandColor, "choices.palette.source": "brand" },
      },
    });

  const ops = bodies.map(
    (body, i) => ({ ...body, id: `personalize-${i}`, actor: input.actor, ts: input.now }) as Op,
  );
  const result = validateAll(doc, ops);
  if (!result.ok)
    throw new PersonalizeError(
      `Could not personalize the template (step ${result.index + 1})`,
      result.errors,
    );
  const checked = validateDocument(result.doc);
  if (!checked.ok) throw new PersonalizeError("The personalized site is not valid", checked.errors);
  return result.doc;
}
