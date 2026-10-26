import { type Op, type OpBody, validateAll, validateDocument } from "@openspace/ops";
import type { SiteConfig, SiteDocument, SiteId } from "@openspace/schema";
import type { TemplateLook, TemplateMeta } from "./templates";

/**
 * Turn a template's document into a new site's document: site id/hub/deploy in `openspace.json`,
 * name and tagline in `site.json` and the hero, the chosen look's styles and an optional brand
 * color. Content changes go through `@openspace/ops` (Global Constraint 5).
 */
export interface PersonalizeInput {
  siteId: SiteId;
  name: string;
  tagline?: string | undefined;
  look: TemplateLook;
  brandColor?: string | undefined;
  hubUrl: string;
  deployUrl: string;
  template: TemplateMeta;
  actor: string;
  now: number;
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
  for (const [slot, text] of [
    ["title", name],
    ["tagline", tagline],
  ] as const) {
    const target = slots[slot];
    if (!target || !text) continue;
    const fields = blockFields(doc, target.page, target.block);
    if (!fields) continue;
    bodies.push({
      op: "block.update",
      page: target.page,
      block: target.block,
      set: { content: replaceRichText(fields.content, text) },
    });
  }
  if (tagline) {
    const home = Object.values(doc.pages).find((p) => p.slug === "");
    if (home)
      bodies.push({ op: "page.update", page: home.id, set: { "seo.description": tagline } });
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
