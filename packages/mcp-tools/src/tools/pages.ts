import { type OpBody, pruneNav } from "@openspace/ops";
import {
  COLOR_THEMES,
  type CollectionItem,
  type CollectionKind,
  FRONTMATTER_SCHEMAS,
  type NavItem,
  newId,
  type Page,
  type Section,
  type SiteDocument,
} from "@openspace/schema";
import { z } from "zod";
import { pagePathOf, resolvePage } from "../context";
import { ToolError } from "../errors";
import { confirmArg, defineTool, siteArg } from "../tool";
import { makeSection, sectionSummary } from "./edit";
import { findPreset } from "./read";

function requireConfirm(confirm: boolean | undefined, what: string) {
  if (confirm !== true)
    throw new ToolError(
      `${what} needs confirm: true. Ask the owner before doing this.`,
      "confirmation_required",
    );
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Add a page link to the nav, before any trailing button (the header CTA stays last). */
function navWithPage(nav: readonly NavItem[], pageId: string, label?: string): NavItem[] {
  const item = { type: "page", page: pageId, ...(label ? { label } : {}) } as NavItem;
  const out = [...nav];
  let at = out.length;
  while (at > 0 && out[at - 1]?.type === "button") at--;
  out.splice(at, 0, item);
  return out;
}

export const createPage = defineTool({
  name: "create_page",
  title: "Create page",
  description:
    'Create a page, optionally composed from section presets in order (fastest way to draft a page: presets ["hero/…", "services/…", "testimonials/…", "cta/…"]) and added to the navigation (default true). Replace the presets\' demo copy afterwards with update_block.',
  input: z.object({
    site: siteArg,
    title: z.string().min(1).max(200),
    slug: z
      .string()
      .optional()
      .describe('URL slug ("about", "services/massage"); default from the title.'),
    presets: z.array(z.string()).max(20).optional().describe("Preset ids to build, in order."),
    themes: z
      .array(z.enum(COLOR_THEMES))
      .optional()
      .describe("Color theme per preset (same order); default each preset's own."),
    sections: z.array(z.looseObject({})).optional().describe("Explicit sections (after presets)."),
    description: z
      .string()
      .max(300)
      .optional()
      .describe("SEO description (50–160 characters is best)."),
    addToNav: z.boolean().optional(),
    navLabel: z.string().max(60).optional(),
    hidden: z.boolean().optional(),
  }),
  annotations: {},
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const slug =
      input.slug !== undefined ? input.slug.replace(/^\/+|\/+$/g, "") : slugify(input.title);
    const sections: Section[] = [];
    (input.presets ?? []).forEach((id, i) => {
      const preset = findPreset(id);
      if (preset.target !== "page")
        throw new ToolError(
          `Preset ${preset.id} is a ${preset.target} preset; use insert_section for it.`,
          "invalid_arguments",
        );
      const colorTheme = input.themes?.[i];
      sections.push(preset.build(colorTheme ? { colorTheme } : {}) as Section);
    });
    for (const raw of input.sections ?? []) sections.push(makeSection(ctx.registry, raw));
    const page: Page = {
      id: newId("pg") as Page["id"],
      title: input.title,
      slug,
      seo: input.description ? { description: input.description } : {},
      sections,
    } as Page;
    if (input.hidden) page.hidden = true;
    const body: Record<string, unknown> = { op: "page.create", page };
    if (input.addToNav !== false && !input.hidden)
      body.nav = navWithPage(doc.site.nav, page.id, input.navLabel);
    await ctx.apply(siteId, [body as OpBody]);
    return {
      data: {
        page: { id: page.id, title: page.title, slug: page.slug, path: pagePathOf(page) },
        sections: sections.map((s) => sectionSummary(ctx.registry, s)),
        inNav: Boolean(body.nav),
      },
    };
  },
});

export const updatePage = defineTool({
  name: "update_page",
  title: "Update page",
  description:
    'Change page settings with dot paths, e.g. set {"title": "About us", "slug": "about-us", "seo.description": "…", "seo.title": "…", "hidden": true, "header.transparentOnHero": true}.',
  input: z.object({
    site: siteArg,
    page: z.string(),
    set: z.record(z.string(), z.unknown()).optional(),
    unset: z.array(z.string()).optional(),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const { id } = resolvePage(doc, input.page);
    if (!input.set && !input.unset?.length)
      throw new ToolError("Give set or unset.", "invalid_arguments");
    const code = [...Object.keys(input.set ?? {}), ...(input.unset ?? [])].filter((p) =>
      /^(headInjection|footerInjection)(\.|$)/.test(p),
    );
    if (code.length)
      throw new ToolError(
        `These settings can't be changed here: ${code.join(", ")}.`,
        "forbidden",
        [],
        "Per-page custom code is changed by the owner in Studio's page settings (Advanced).",
      );
    const body: Record<string, unknown> = { op: "page.update", page: id };
    if (input.set) body.set = input.set;
    if (input.unset?.length) body.unset = input.unset;
    const { doc: next } = await ctx.apply(siteId, [body as OpBody]);
    const p = next.pages[id as never] as Page;
    return {
      data: { page: { id: p.id, title: p.title, slug: p.slug, path: pagePathOf(p), seo: p.seo } },
    };
  },
});

export const deletePage = defineTool({
  name: "delete_page",
  title: "Delete page",
  description:
    "Delete a page and remove it from the navigation. Destructive: requires confirm: true after the owner agrees.",
  input: z.object({ site: siteArg, page: z.string(), confirm: confirmArg }),
  annotations: { destructiveHint: true },
  async handler(ctx, input) {
    requireConfirm(input.confirm, "Deleting a page");
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const { id, page } = resolvePage(doc, input.page);
    const { warnings } = await ctx.apply(siteId, [
      { op: "page.delete", page: id, nav: pruneNav(doc.site.nav, id) } as OpBody,
    ]);
    return {
      data: {
        deleted: { id, title: page?.title },
        ...(warnings.length ? { warnings: warnings.map((w) => w.message) } : {}),
      },
    };
  },
});

export const updateNavigation = defineTool({
  name: "update_navigation",
  title: "Update navigation",
  description:
    'Replace the navigation tree. Items: {type:"page", page:"pg_…", label?}, {type:"collection", collection, label}, {type:"link", label, href, newTab?}, {type:"button", label, link, style:"primary"|"secondary"|"tertiary"}, {type:"folder", label, page?, items:[…one level…]}. Keep one button at most (the header call to action).',
  input: z.object({ site: siteArg, tree: z.array(z.looseObject({})) }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const { doc } = await ctx.apply(siteId, [{ op: "nav.update", tree: input.tree } as OpBody]);
    return { data: { nav: doc.site.nav } };
  },
});

const SITE_FORBIDDEN = ["nav", "customCss", "headInjection", "footerInjection"];

export const updateSite = defineTool({
  name: "update_site",
  title: "Update site settings",
  description:
    'Change site settings with dot paths: title, tagline, header (variant, sticky, mobileMenu…), announcement, social, seo, locale. Navigation goes through update_navigation; footer blocks through the block tools with page "footer". Custom code (customCss, head/footer injection) can\'t be changed through MCP.',
  input: z.object({
    site: siteArg,
    set: z.record(z.string(), z.unknown()).optional(),
    unset: z.array(z.string()).optional(),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const paths = [...Object.keys(input.set ?? {}), ...(input.unset ?? [])];
    const bad = paths.filter((p) => SITE_FORBIDDEN.includes(p.split(".")[0] ?? ""));
    if (bad.length)
      throw new ToolError(
        `These settings can't be changed here: ${bad.join(", ")}.`,
        "forbidden",
        [],
        "Use update_navigation for the menu; custom code is changed by the owner in Studio's Advanced settings.",
      );
    if (!paths.length) throw new ToolError("Give set or unset.", "invalid_arguments");
    const body: Record<string, unknown> = { op: "site.update" };
    if (input.set) body.set = input.set;
    if (input.unset?.length) body.unset = input.unset;
    const { doc } = await ctx.apply(siteId, [body as OpBody]);
    return {
      data: {
        title: doc.site.title,
        tagline: doc.site.tagline ?? null,
        header: doc.site.header,
        announcement: doc.site.announcement ?? null,
      },
    };
  },
});

export const uploadImage = defineTool({
  name: "upload_image",
  title: "Upload image",
  description:
    'Add an image to the site\'s media from an https URL or base64 data. It is stored at most 2400px on the long edge with metadata stripped. alt describes the image\'s purpose ("" only for decorative images). Use the returned src in image fields as {"src": src, "alt": alt}.',
  input: z.object({
    site: siteArg,
    url: z.string().optional(),
    base64: z.string().optional(),
    alt: z.string().max(500),
    filename: z.string().max(120).optional(),
    credit: z
      .object({
        author: z.string().optional(),
        url: z.string().optional(),
        source: z.string().optional(),
      })
      .optional(),
    license: z.string().max(200).optional(),
  }),
  annotations: { openWorldHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const session = await ctx.session(siteId);
    const meta = await ctx.store.uploadImage(
      siteId,
      {
        url: input.url,
        base64: input.base64,
        alt: input.alt,
        filename: input.filename,
        credit: input.credit,
        license: input.license,
      },
      { actor: session.actor, session: session.sessionId },
    );
    return {
      data: {
        src: meta.path,
        alt: meta.alt ?? "",
        width: meta.width,
        height: meta.height,
        bytes: meta.bytes,
        mediaId: meta.id,
        imageValue: { src: meta.path, alt: meta.alt ?? "" },
      },
    };
  },
});

// --- collections (blog posts, events, …) -----------------------------------------------------

function collectionKindOf(doc: SiteDocument, name: string): CollectionKind | null {
  const cfgKind = doc.collectionConfigs?.[name]?.kind;
  if (cfgKind && cfgKind !== "custom") return cfgKind;
  const first = Object.values(doc.collections[name] ?? {})[0];
  return first?.kind ?? null;
}

function defaultCollection(doc: SiteDocument): string | null {
  const names = new Set([
    ...Object.keys(doc.collections),
    ...Object.keys(doc.collectionConfigs ?? {}),
  ]);
  for (const n of names) if (collectionKindOf(doc, n) === "blog") return n;
  return null;
}

function itemView(item: CollectionItem, withBody: boolean) {
  return {
    slug: item.slug,
    kind: item.kind,
    ...item.frontmatter,
    ...(withBody ? { body: item.body } : {}),
  };
}

const today = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const createPost = defineTool({
  name: "create_post",
  title: "Create post",
  description:
    'Create a blog post (or an item in another collection). body is Markdown; Markdoc tags like {% button href="/contact" %}Book{% /button %} embed blocks. New posts are drafts unless status is "published" (or "scheduled" with publishAt). Never invent facts, quotes or prices.',
  input: z.object({
    site: siteArg,
    collection: z
      .string()
      .optional()
      .describe("Collection name (default: the site's blog collection)."),
    title: z.string().min(1).max(200),
    slug: z.string().optional().describe("Default: <date>-<title>."),
    body: z.string().max(200_000),
    date: z
      .string()
      .optional()
      .describe(
        "YYYY-MM-DD. Used by kinds whose frontmatter has a date (blog and podcast require one and default to today; portfolio keeps it when given).",
      ),
    excerpt: z.string().max(500).optional(),
    image: z.string().optional().describe("media/… path or https URL."),
    imageAlt: z.string().optional(),
    tags: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    author: z.string().optional(),
    status: z.enum(["draft", "scheduled", "published"]).optional(),
    publishAt: z.string().optional(),
    frontmatter: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Extra frontmatter for non-blog kinds — events: start, end (ISO date-times with a UTC offset, e.g. 2026-11-21T14:00:00-08:00, or YYYY-MM-DD with allDay), timezone, location; products: price {amount in minor units, currency}; podcast: audio.",
      ),
  }),
  annotations: {},
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const collection = input.collection ?? defaultCollection(doc) ?? "blog";
    const kind = collectionKindOf(doc, collection) ?? "blog";
    const date = input.date ?? today(ctx.now());
    const slug = input.slug ?? `${date}-${slugify(input.title)}`.slice(0, 80);
    if (doc.collections[collection]?.[slug])
      throw new ToolError(`${collection}/${slug} already exists; use update_post.`, "conflict");
    const fm: Record<string, unknown> = {
      ...(input.frontmatter ?? {}),
      title: input.title,
      status: input.status ?? "draft",
    };
    const dateField = frontmatterField(kind, "date");
    if (dateField === "required") fm.date = input.date ?? fm.date ?? date;
    else if (dateField === "optional" && input.date !== undefined) fm.date = input.date;
    for (const k of [
      "excerpt",
      "image",
      "imageAlt",
      "tags",
      "categories",
      "author",
      "publishAt",
    ] as const)
      if (input[k] !== undefined) fm[k] = input[k];
    const r = FRONTMATTER_SCHEMAS[kind].safeParse(fm);
    if (!r.success)
      throw new ToolError(
        `Invalid ${kind} frontmatter:\n${r.error.issues.map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")}`,
        "invalid_arguments",
      );
    const item = { kind, slug, frontmatter: fm, body: input.body } as CollectionItem;
    await ctx.apply(siteId, [{ op: "collection.upsert", collection, item } as OpBody]);
    return { data: { collection, item: itemView(item, false), path: `/${collection}/${slug}/` } };
  },
});

/** Whether a collection kind's frontmatter has `key`, and whether it's required. */
function frontmatterField(kind: keyof typeof FRONTMATTER_SCHEMAS, key: string) {
  const shape = (FRONTMATTER_SCHEMAS[kind] as unknown as { shape?: Record<string, z.ZodType> })
    .shape;
  const field = shape?.[key];
  if (!field) return "absent" as const;
  return field.safeParse(undefined).success ? ("optional" as const) : ("required" as const);
}

export const updatePost = defineTool({
  name: "update_post",
  title: "Update post",
  description:
    'Edit a collection item: frontmatter fields to set (title, excerpt, tags, status "published" to publish it with the next site publish…) and/or a new Markdown body.',
  input: z.object({
    site: siteArg,
    collection: z.string().optional(),
    slug: z.string(),
    set: z.record(z.string(), z.unknown()).optional().describe("Frontmatter fields; null removes."),
    body: z.string().max(200_000).optional(),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const collection = input.collection ?? defaultCollection(doc) ?? "blog";
    const existing = doc.collections[collection]?.[input.slug];
    if (!existing)
      throw new ToolError(
        `No item ${collection}/${input.slug}. Items: ${Object.keys(doc.collections[collection] ?? {}).join(", ") || "none"}.`,
        "not_found",
      );
    const fm: Record<string, unknown> = { ...existing.frontmatter };
    for (const [k, v] of Object.entries(input.set ?? {})) {
      if (v === null) delete fm[k];
      else fm[k] = v;
    }
    const r = FRONTMATTER_SCHEMAS[existing.kind].safeParse(fm);
    if (!r.success)
      throw new ToolError(
        `Invalid ${existing.kind} frontmatter:\n${r.error.issues.map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")}`,
        "invalid_arguments",
      );
    const item = {
      ...existing,
      frontmatter: fm,
      body: input.body ?? existing.body,
    } as CollectionItem;
    await ctx.apply(siteId, [{ op: "collection.upsert", collection, item } as OpBody]);
    return { data: { collection, item: itemView(item, false) } };
  },
});

export const listPosts = defineTool({
  name: "list_posts",
  title: "List posts",
  description:
    "Items in a collection (default: the blog), newest first, with frontmatter. withBody includes the Markdown bodies.",
  input: z.object({
    site: siteArg,
    collection: z.string().optional(),
    status: z.enum(["draft", "scheduled", "published"]).optional(),
    withBody: z.boolean().optional(),
  }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const collection = input.collection ?? defaultCollection(doc);
    const names = Object.keys(doc.collections);
    if (!collection || !doc.collections[collection])
      return { data: { collection, items: [], collections: names } };
    const items = Object.values(doc.collections[collection])
      .filter((i) => !input.status || i.frontmatter.status === input.status)
      .sort((a, b) =>
        String((b.frontmatter as { date?: string }).date ?? b.slug).localeCompare(
          String((a.frontmatter as { date?: string }).date ?? a.slug),
        ),
      )
      .map((i) => itemView(i, Boolean(input.withBody)));
    return { data: { collection, items, collections: names } };
  },
});

export const pageTools = [
  createPage,
  updatePage,
  deletePage,
  updateNavigation,
  updateSite,
  uploadImage,
  createPost,
  updatePost,
  listPosts,
];

export { requireConfirm };
