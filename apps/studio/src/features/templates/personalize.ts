import type { SiteDocument, Styles } from "@openspace/schema";
import type { TemplateDetail } from "../../api/catalog-types";
import type { TemplateLook } from "../../api/types";

export interface Personalization {
  name?: string;
  tagline?: string;
  /** Brand color (CSS color). */
  brandColor?: string | null;
  /** Logo (data: or https URL). */
  logo?: string | null;
}

/** A look's complete Site Styles: its own, else the registry look with the same id or position. */
export function lookStyles(
  detail: Pick<TemplateDetail, "looks" | "document">,
  lookId: string | undefined,
  summaryLooks?: readonly TemplateLook[],
): Styles {
  const index = Math.max(0, summaryLooks?.findIndex((l) => l.id === lookId) ?? -1);
  const look =
    detail.looks.find((l) => l.id === lookId) ??
    summaryLooks?.find((l) => l.id === lookId) ??
    detail.looks[index] ??
    detail.looks[0];
  return look?.siteStyles ?? detail.looks[index]?.siteStyles ?? detail.document.styles;
}

const norm = (t: string) =>
  t
    .trim()
    .replace(/[.!…]+$/, "")
    .toLowerCase();

/**
 * The template's home page as the owner will see it once created: their name and tagline in
 * the headings that carry the demo owner's (the same slots the Hub personalizes on creation),
 * their brand color and logo, in the chosen look. Pure: returns a new document.
 */
export function personalizeTemplate(
  doc: SiteDocument,
  styles: Styles,
  sample: { name: string; tagline: string } | undefined,
  p: Personalization = {},
): SiteDocument {
  const out = structuredClone(doc);
  out.styles = structuredClone(styles);
  const name = p.name?.trim();
  const tagline = p.tagline?.trim();
  if (name) out.site.title = name;
  if (tagline) out.site.tagline = tagline;
  if (p.brandColor)
    out.styles.choices.palette = { ...out.styles.choices.palette, brand: p.brandColor };
  if (p.logo) out.site.logo = { src: p.logo as never, alt: name || out.site.title };
  if (!sample || (!name && !tagline)) return out;
  const home = Object.values(out.pages).find((pg) => pg.slug === "");
  let titleDone = false;
  let taglineDone = false;
  for (const section of home?.sections.slice(0, 2) ?? [])
    for (const b of section.blocks) {
      if (b.type !== "heading") continue;
      const fields = b.fields as Record<string, unknown>;
      const text = fields.text;
      if (typeof text !== "string") continue;
      if (!taglineDone && tagline && norm(text) === norm(sample.tagline)) {
        fields.text = tagline;
        taglineDone = true;
      } else if (!titleDone && name && text.includes(sample.name)) {
        fields.text = text.trim() === sample.name ? name : text.replace(sample.name, name);
        titleDone = true;
      }
    }
  return out;
}
