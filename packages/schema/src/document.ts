import { z } from "zod";
import { CollectionConfigSchema, CollectionItemSchema } from "./collections";
import { ComponentsSchema } from "./components/definition";
import { SiteConfigSchema } from "./config";
import { DesignSystemSchema } from "./design-system";
import { PageIdSchema } from "./ids";
import { MediaMetaSchema } from "./media";
import { PageSchema } from "./page";
import { CollectionNameSchema, MediaPathSchema, SlugSchema } from "./primitives";
import { named } from "./registry";
import { SiteSchema } from "./site";
import { StylesSchema } from "./styles";

/**
 * The whole site's content as one value: what `@omniharmonic/openspace-ops` operates on, what Studio holds
 * in memory and what the Hub/MCP read. Each record key mirrors a file location:
 * pages by page id, collection items by collection name and slug, media by repo path.
 */
export const SiteDocumentSchema = named(
  "SiteDocument",
  "All site content: config, site, styles, pages by id, collection items by collection/slug, collection configs, media by path.",
  z
    .strictObject({
      config: SiteConfigSchema,
      site: SiteSchema,
      styles: StylesSchema,
      pages: z.record(PageIdSchema, PageSchema),
      collections: z.record(CollectionNameSchema, z.record(SlugSchema, CollectionItemSchema)),
      /** `_collection.json` per collection name (optional; collections may rely on defaults). */
      collectionConfigs: z.record(CollectionNameSchema, CollectionConfigSchema).optional(),
      media: z.record(MediaPathSchema, MediaMetaSchema),
      /**
       * Custom components by name (`content/components/<name>.json`, ADR custom-components).
       * Optional: documents without components are unchanged.
       */
      components: ComponentsSchema.optional(),
      /**
       * The design-system record (`content/design-system.json`): brief, brand material, tokens and
       * their Site Styles mapping, for Claude's design skills. Optional; never rendered.
       */
      designSystem: DesignSystemSchema.optional(),
    })
    .superRefine((doc, ctx) => {
      const slugs = new Map<string, string>();
      const sectionIds = new Map<string, string>();
      const blockIds = new Map<string, string>();
      const claim = (
        map: Map<string, string>,
        id: string,
        owner: string,
        path: (string | number)[],
        what: string,
      ) => {
        const prev = map.get(id);
        if (prev !== undefined && prev !== owner) {
          ctx.addIssue({
            code: "custom",
            path,
            message: `${what} ${id} is used in both ${prev} and ${owner}`,
          });
        }
        map.set(id, owner);
      };
      doc.site.footer.blocks.forEach((b, j) => {
        claim(blockIds, b.id, "footer", ["site", "footer", "blocks", j, "id"], "Block id");
      });
      claim(sectionIds, doc.site.footer.id, "footer", ["site", "footer", "id"], "Section id");
      for (const [key, page] of Object.entries(doc.pages)) {
        if (page.id !== key) {
          ctx.addIssue({
            code: "custom",
            path: ["pages", key, "id"],
            message: `Page id ${page.id} does not match its key ${key}`,
          });
        }
        const prev = slugs.get(page.slug);
        if (prev !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["pages", key, "slug"],
            message: `Slug "${page.slug}" is also used by ${prev}`,
          });
        }
        slugs.set(page.slug, key);
        page.sections.forEach((s, i) => {
          claim(sectionIds, s.id, key, ["pages", key, "sections", i, "id"], "Section id");
          s.blocks.forEach((b, j) => {
            claim(
              blockIds,
              b.id,
              key,
              ["pages", key, "sections", i, "blocks", j, "id"],
              "Block id",
            );
          });
        });
      }
      for (const [name, items] of Object.entries(doc.collections)) {
        const kinds = new Set<string>();
        for (const [slug, item] of Object.entries(items)) {
          kinds.add(item.kind);
          if (item.slug !== slug) {
            ctx.addIssue({
              code: "custom",
              path: ["collections", name, slug, "slug"],
              message: `Item slug ${item.slug} does not match its key ${slug}`,
            });
          }
        }
        const configKind = doc.collectionConfigs?.[name]?.kind;
        if (configKind && configKind !== "custom") {
          for (const [slug, item] of Object.entries(items)) {
            if (item.kind !== configKind) {
              ctx.addIssue({
                code: "custom",
                path: ["collections", name, slug, "kind"],
                message: `Collection ${name} is a ${configKind} collection but ${slug} is ${item.kind}`,
              });
            }
          }
        }
        if (kinds.size > 1) {
          ctx.addIssue({
            code: "custom",
            path: ["collections", name],
            message: `Collection ${name} mixes item kinds`,
          });
        }
      }
      for (const [name, def] of Object.entries(doc.components ?? {})) {
        if (def.name !== name)
          ctx.addIssue({
            code: "custom",
            path: ["components", name, "name"],
            message: `Component name ${def.name} does not match its key ${name}`,
          });
      }
      const mediaIds = new Map<string, string>();
      for (const [path, meta] of Object.entries(doc.media)) {
        if (meta.path !== path) {
          ctx.addIssue({
            code: "custom",
            path: ["media", path, "path"],
            message: `Media path ${meta.path} does not match its key`,
          });
        }
        claim(mediaIds, meta.id, path, ["media", path, "id"], "Media id");
      }
    }),
);

export type SiteDocument = z.infer<typeof SiteDocumentSchema>;
