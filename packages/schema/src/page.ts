import { z } from "zod";
import { PageIdSchema } from "./ids";
import { HttpUrlSchema, MediaSrcSchema, PagePathSchema } from "./primitives";
import { named } from "./registry";
import { SectionSchema } from "./section";
import { HeaderOverrideSchema } from "./site";

export const PageSeoSchema = named(
  "PageSeo",
  "Per-page SEO. null/absent values fall back to the page title and the site's SEO defaults.",
  z.strictObject({
    title: z.string().max(120).nullable().optional(),
    description: z.string().max(320).nullable().optional(),
    image: MediaSrcSchema.nullable().optional(),
    noindex: z.boolean().optional(),
    canonical: HttpUrlSchema.optional(),
  }),
);
export type PageSeo = z.infer<typeof PageSeoSchema>;

/**
 * Gating flags. Passwords and member lists live in the Hub, never in content; these flags
 * only say which gate applies.
 */
export const PageAccessSchema = z.strictObject({
  password: z.boolean().optional(),
  members: z.boolean().optional(),
});
export type PageAccess = z.infer<typeof PageAccessSchema>;

/** A page document (`content/pages/**.json`, arch §3.2). */
export const PageSchema = named(
  "Page",
  "A page: id, title, URL slug, SEO, optional header override, gating flags and sections.",
  z
    .strictObject({
      $schema: z.string().optional(),
      id: PageIdSchema,
      title: z.string().min(1).max(120),
      /** URL path without leading slash; "" is the home page. */
      slug: PagePathSchema,
      seo: PageSeoSchema.optional(),
      header: HeaderOverrideSchema.optional(),
      /** Hidden pages are published but left out of navigation, search and the sitemap. */
      hidden: z.boolean().optional(),
      access: PageAccessSchema.optional(),
      sections: z.array(SectionSchema),
    })
    .superRefine((page, ctx) => {
      const sectionIds = new Set<string>();
      const blockIds = new Map<string, number>();
      page.sections.forEach((s, i) => {
        if (sectionIds.has(s.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", i, "id"],
            message: `Duplicate section id ${s.id}`,
          });
        }
        sectionIds.add(s.id);
        s.blocks.forEach((b, j) => {
          const seen = blockIds.get(b.id);
          if (seen !== undefined && seen !== i) {
            ctx.addIssue({
              code: "custom",
              path: ["sections", i, "blocks", j, "id"],
              message: `Block id ${b.id} is also used in another section`,
            });
          }
          blockIds.set(b.id, i);
        });
      });
    }),
);
export type Page = z.infer<typeof PageSchema>;
