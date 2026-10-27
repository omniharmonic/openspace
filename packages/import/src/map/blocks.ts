/**
 * `SqBlock` → OpenSpace blocks. Every block is built from the block definition's required
 * defaults plus the imported fields and validated against the registry; anything that can't be
 * expressed safely becomes a report entry instead of invalid content.
 */
import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import {
  type Block,
  type BlockStyle,
  FORBIDDEN_FIELD_PATTERN,
  type Form,
  type FormField,
  type ImageValue,
  type Link,
  newId,
  type RichTextDoc,
} from "@omniharmonic/openspace-schema";
import { requiredDefaults } from "@omniharmonic/openspace-site-kit/markdoc";
import type { MediaImporter } from "../media";
import type { SqBlock, SqForm, SqNotice } from "../squarespace/types";
import { htmlToRichText, textToRichText } from "./richtext";
import { slugify, type UrlMap } from "./urls";

export interface MapContext {
  urls: UrlMap;
  media: MediaImporter;
  notices: SqNotice[];
  /** Where we are, for the report (`/about`). */
  where: string;
  /** Collections that ended up in the site (name → kind). */
  collections: Map<string, string>;
  /** Set when a newsletter block was imported. */
  usesNewsletter: { value: boolean };
  /** The site's IANA time zone (events). */
  timeZone?: string;
}

const registry = blocksRegistry();

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A validated block, or undefined (with a report entry) when the fields don't fit. */
export function makeBlock(
  ctx: Pick<MapContext, "notices" | "where">,
  type: string,
  fields: Record<string, unknown>,
  opts: { variant?: string; style?: BlockStyle } = {},
): Block | undefined {
  const def = registry.get(type);
  if (!def) {
    ctx.notices.push({
      kind: "unsupported-block",
      where: ctx.where,
      message: `No ${type} block in this version of OpenSpace.`,
    });
    return undefined;
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) clean[k] = v;
  const block: Block = {
    id: newId("blk") as Block["id"],
    type,
    v: def.version,
    fields: { ...requiredDefaults(def.meta.fields), ...clean },
  };
  if (opts.variant && def.variants.includes(opts.variant)) block.variant = opts.variant;
  if (opts.style) {
    const style: BlockStyle = {};
    for (const [k, v] of Object.entries(opts.style))
      if ((def.styleSlots as readonly string[]).includes(k))
        (style as Record<string, unknown>)[k] = v;
    if (Object.keys(style).length) block.style = style;
  }
  const r = def.validate(block);
  if (!r.success) {
    ctx.notices.push({
      kind: "unsupported-block",
      where: ctx.where,
      message: `A ${type} block couldn't be imported (${r.issues
        .slice(0, 2)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}).`,
    });
    return undefined;
  }
  return block;
}

/** Old href → link value (downloads `/s/` files; unknown internal paths go home, reported). */
export async function linkFor(
  ctx: MapContext,
  href: string,
  newTab?: boolean,
): Promise<Link | undefined> {
  const r = ctx.urls.resolve(href, newTab);
  switch (r.kind) {
    case "page":
    case "item":
    case "collection":
    case "external":
      return r.link;
    case "file": {
      const path = await ctx.media.file(r.url, ctx.where);
      return path ? { type: "file", src: path as never } : { type: "url", url: r.url };
    }
    case "missing": {
      if (r.path.startsWith("#")) return undefined;
      const home = ctx.urls.pages.get("/");
      ctx.notices.push({
        kind: "link",
        where: ctx.where,
        message: `Link to ${r.path} led to a page that wasn't imported; it now points ${home ? "at the home page" : "nowhere"}. Point it at the right page.`,
      });
      return home ? { type: "page", page: home.id } : undefined;
    }
  }
}

/** Old href → a path string for rich text (internal links keep working through redirects). */
export function hrefFor(ctx: MapContext, href: string): string | undefined {
  const r = ctx.urls.resolve(href);
  switch (r.kind) {
    case "page":
    case "item":
    case "collection":
      return r.path;
    case "external":
      return r.path;
    case "file": {
      const local = ctx.media.fileLinks.get(r.url);
      return local ? `/${local}` : r.url;
    }
    case "missing":
      if (r.path.startsWith("#")) return undefined;
      ctx.notices.push({
        kind: "link",
        where: ctx.where,
        message: `Text link to ${r.path} led to a page that wasn't imported; the link was removed.`,
      });
      return undefined;
  }
}

export async function richText(ctx: MapContext, html: string) {
  // Download linked Squarespace files first so the (synchronous) converter can point at them.
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const r = ctx.urls.resolve((m[1] as string).replace(/&amp;/g, "&"));
    if (r.kind === "file") await ctx.media.file(r.url, ctx.where);
  }
  return htmlToRichText(html, (h) => hrefFor(ctx, h));
}

// --- forms ----------------------------------------------------------------------------------------

function fieldName(label: string, used: Set<string>): string {
  let base = slugify(label, "field").replace(/-/g, "_").slice(0, 36);
  if (!/^[a-z]/.test(base)) base = `f_${base}`.slice(0, 36);
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}_${i}`;
  used.add(name);
  return name;
}

export async function mapForm(ctx: MapContext, sq: SqForm): Promise<Form | undefined> {
  const used = new Set<string>();
  const fields: FormField[] = [];
  for (const f of sq.fields) {
    const label = clip(f.label || f.type, 120);
    if (FORBIDDEN_FIELD_PATTERN.test(label)) {
      ctx.notices.push({
        kind: "form",
        where: ctx.where,
        message: `Form "${sq.name}": field "${label}" asks for a password or card details, which OpenSpace forms never collect; it was left out.`,
      });
      continue;
    }
    const base = {
      name: fieldName(label, used),
      label,
      ...(f.required ? { required: true } : {}),
      ...(f.description ? { help: clip(f.description, 300) } : {}),
    };
    const ph = f.placeholder ? { placeholder: clip(f.placeholder, 120) } : {};
    const options = f.options?.map((o) => clip(o, 120)).slice(0, 100);
    switch (f.type) {
      case "text":
      case "time":
      case "number":
        fields.push({ ...base, type: "text", ...ph });
        break;
      case "website":
        fields.push({
          ...base,
          type: "text",
          placeholder: f.placeholder ? clip(f.placeholder, 120) : "https://",
        });
        break;
      case "name":
        fields.push({ ...base, type: "text", ...ph });
        break;
      case "email":
        fields.push({ ...base, type: "email", ...ph });
        break;
      case "phone":
        fields.push({ ...base, type: "phone", ...ph });
        break;
      case "textarea":
        fields.push({
          ...base,
          type: "textarea",
          placeholder: f.placeholder ? clip(f.placeholder, 200) : undefined,
        } as FormField);
        break;
      case "address":
        fields.push({ ...base, type: "textarea" });
        break;
      case "date":
        fields.push({ ...base, type: "date" });
        break;
      case "file":
        fields.push({ ...base, type: "file" });
        break;
      case "checkbox":
        fields.push({ ...base, type: "checkbox", ...(options?.length ? { options } : {}) });
        break;
      case "radio":
      case "select":
        if (options?.length) fields.push({ ...base, type: f.type, options });
        else fields.push({ ...base, type: "text" });
        break;
      default:
        // Section headings and page breaks inside a form are layout, not fields.
        if (f.rawType === "section" || f.rawType === "page" || f.rawType === "pagebreak") break;
        ctx.notices.push({
          kind: "form",
          where: ctx.where,
          message: `Form "${sq.name}": a ${f.rawType ?? f.type} field ("${label}") has no OpenSpace equivalent and was left out.`,
        });
    }
  }
  const clean = fields.map(
    (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as FormField,
  );
  if (!clean.length) return undefined;
  let success: Form["success"] = {
    type: "message",
    message: clip(sq.successMessage?.trim() || "Thank you! We'll be in touch soon.", 500),
  };
  if (sq.successRedirect) {
    const link = await linkFor(ctx, sq.successRedirect);
    if (link) success = { type: "redirect", link };
  }
  if (sq.fields.some((f) => f.type === "hidden" || f.type === "likert")) {
    // already reported above
  }
  ctx.notices.push({
    kind: "form",
    where: ctx.where,
    message: `Form "${sq.name}" recreated with ${clean.length} field(s). Submissions now arrive in the OpenSpace inbox; Squarespace storage connections (Google Drive, Mailchimp, Zapier) need setting up again.`,
  });
  return {
    id: newId("frm") as Form["id"],
    name: clip(sq.name, 80),
    fields: clean.slice(0, 50),
    submitLabel: clip(sq.submitLabel?.trim() || "Send", 40),
    success,
    notifyOwner: true,
  };
}

// --- blocks ---------------------------------------------------------------------------------------

const SPACER = (ratio?: number) =>
  !ratio
    ? "md"
    : ratio > 10
      ? "xs"
      : ratio > 5
        ? "sm"
        : ratio > 2.5
          ? "md"
          : ratio > 1.2
            ? "lg"
            : "xl";

function alignStyle(align?: "center" | "end"): BlockStyle | undefined {
  return align ? { align: { d: align } } : undefined;
}

async function img(
  ctx: MapContext,
  image: Parameters<MediaImporter["image"]>[0],
): Promise<ImageValue | undefined> {
  return ctx.media.image(image, ctx.where);
}

/** Map one Squarespace block. `inGrid`: spacers are dropped (placement does the spacing). */
export async function mapBlock(
  ctx: MapContext,
  sq: SqBlock,
  opts: { inGrid?: boolean } = {},
): Promise<Block[]> {
  const one = (b: Block | undefined) => (b ? [b] : []);
  switch (sq.kind) {
    case "text": {
      const r = await richText(ctx, sq.html);
      if (!r) return [];
      return one(makeBlock(ctx, "text", { content: r.doc }, { style: alignStyle(r.align) }));
    }
    case "image": {
      const image = await img(ctx, sq.image);
      if (!image) return [];
      const link = sq.href ? await linkFor(ctx, sq.href) : undefined;
      return one(
        makeBlock(ctx, "image", {
          image,
          aspect: "original",
          lightbox: false,
          ...(sq.caption ? { caption: clip(sq.caption, 200) } : {}),
          ...(link ? { link } : {}),
        }),
      );
    }
    case "gallery": {
      const images: { image: ImageValue; caption?: string }[] = [];
      for (const i of sq.images.slice(0, 200)) {
        const image = await img(ctx, i);
        if (image) images.push({ image, ...(i.caption ? { caption: clip(i.caption, 160) } : {}) });
      }
      if (!images.length) return [];
      if (images.length === 1) {
        const only = images[0] as { image: ImageValue; caption?: string };
        return one(
          makeBlock(ctx, "image", {
            image: only.image,
            aspect: "original",
            lightbox: true,
            ...(only.caption ? { caption: only.caption } : {}),
          }),
        );
      }
      return one(
        makeBlock(
          ctx,
          "gallery",
          {
            images,
            aspect: sq.layout === "grid" ? "1:1" : "original",
            columns: images.length >= 4 && sq.layout === "grid" ? "4" : "3",
            lightbox: true,
            showCaptions: images.some((i) => i.caption),
          },
          { variant: sq.layout },
        ),
      );
    }
    case "button": {
      const link = await linkFor(ctx, sq.href);
      if (!link) return [];
      return one(makeBlock(ctx, "button", { label: clip(sq.label, 40), link, role: sq.style }));
    }
    case "form": {
      const form = await mapForm(ctx, sq.form);
      return form ? one(makeBlock(ctx, "form", { form })) : [];
    }
    case "newsletter": {
      ctx.usesNewsletter.value = true;
      ctx.notices.push({
        kind: "form",
        where: ctx.where,
        message:
          "Newsletter signup recreated. Squarespace Email Campaigns / Mailchimp subscribers are not moved: export your list from Squarespace and import it in the Hub.",
      });
      return one(
        makeBlock(
          ctx,
          "newsletter",
          {
            ...(sq.heading ? { heading: clip(sq.heading, 80) } : {}),
            ...(sq.description ? { description: clip(sq.description, 240) } : {}),
            ...(sq.buttonLabel ? { buttonLabel: clip(sq.buttonLabel, 30) } : {}),
            ...(sq.placeholder ? { placeholder: clip(sq.placeholder, 60) } : {}),
            ...(sq.success ? { successMessage: clip(sq.success, 200) } : {}),
          },
          { variant: "stacked" },
        ),
      );
    }
    case "video":
      return one(
        makeBlock(ctx, "video", {
          source: "embed",
          url: sq.url,
          title: clip(sq.title?.trim() || "Video", 120),
          ...(sq.caption ? { caption: clip(sq.caption, 200) } : {}),
          aspect: "16:9",
          background: false,
        }),
      );
    case "map":
      return one(
        makeBlock(ctx, "map", {
          ...(sq.name ? { name: clip(sq.name, 80) } : {}),
          address: clip(sq.address || `${sq.lat.toFixed(5)}, ${sq.lng.toFixed(5)}`, 200),
          latitude: sq.lat,
          longitude: sq.lng,
          zoom: Math.max(1, Math.min(19, sq.zoom ?? 14)),
          linkLabel: "Open in Maps",
          aspect: "16:9",
        }),
      );
    case "code":
    case "embed": {
      const iframeSrc =
        sq.kind === "embed" ? sq.url : /<iframe[^>]+src="(https:\/\/[^"]+)"/i.exec(sq.html)?.[1];
      const code = sq.kind === "code" ? sq.html : sq.html;
      ctx.notices.push({
        kind: "custom-code",
        where: ctx.where,
        message:
          sq.kind === "code"
            ? "Code block moved into a sandboxed Embed block (scripts run isolated from the page). Check it still works; site-wide scripts belong in Settings → Advanced."
            : "Embed moved into a sandboxed Embed block. Check it still works.",
      });
      if (
        iframeSrc &&
        /^https:\/\//.test(iframeSrc) &&
        (!code || /^\s*<iframe[^>]*>\s*<\/iframe>\s*$/i.test(code))
      )
        return one(
          makeBlock(ctx, "embed", {
            embed: { type: "url", url: iframeSrc },
            title: "Embedded content",
            aspect: "16:9",
          }),
        );
      if (code?.trim())
        return one(
          makeBlock(ctx, "embed", {
            embed: { type: "code", code: code.slice(0, 50_000) },
            title: "Embedded content",
            aspect: "auto",
            height: 400,
          }),
        );
      return [];
    }
    case "quote":
      if (sq.text.length > 380)
        return one(
          makeBlock(ctx, "text", {
            content: {
              type: "doc",
              content: [
                { type: "blockquote", content: textToRichText(sq.text).content },
                ...(sq.source
                  ? [
                      {
                        type: "paragraph" as const,
                        content: [{ type: "text" as const, text: `— ${sq.source}` }],
                      },
                    ]
                  : []),
              ],
            },
          }),
        );
      return one(
        makeBlock(ctx, "quote", {
          quote: textToRichText(sq.text),
          ...(sq.source ? { attribution: clip(sq.source, 80) } : {}),
        }),
      );
    case "accordion": {
      const items = [];
      for (const i of sq.items.slice(0, 50))
        items.push({
          question: clip(i.title, 160),
          answer: (await richText(ctx, i.html))?.doc ?? textToRichText(i.title),
        });
      return one(
        makeBlock(ctx, "accordion", {
          items,
          exclusive: false,
          openFirst: false,
          faqSchema: false,
        }),
      );
    }
    case "summary": {
      const name = sq.collectionPath ? ctx.urls.collections.get(sq.collectionPath) : undefined;
      const kind = name ? ctx.collections.get(name) : undefined;
      if (!name || !kind) {
        ctx.notices.push({
          kind: "unsupported-block",
          where: ctx.where,
          message: "A summary block listed a collection that wasn't imported; it was left out.",
        });
        return [];
      }
      if (kind === "events")
        return one(
          makeBlock(ctx, "events", {
            ...(sq.heading ? { heading: clip(sq.heading, 80) } : {}),
            source: { collection: name, filter: { upcoming: true }, limit: 6 },
          }),
        );
      return one(
        makeBlock(
          ctx,
          "summary",
          {
            ...(sq.heading ? { heading: clip(sq.heading, 80) } : {}),
            source: { collection: name, limit: 6 },
            columns: "3",
            showImage: true,
            showDate: kind === "blog",
            showExcerpt: true,
          },
          { variant: "grid" },
        ),
      );
    }
    case "spacer":
      return opts.inGrid ? [] : one(makeBlock(ctx, "spacer", { height: SPACER(sq.ratio) }));
    case "line":
      return one(makeBlock(ctx, "line", {}));
    case "social":
      return one(makeBlock(ctx, "social-links", { source: "site" }));
    case "audio": {
      const r = ctx.urls.resolve(sq.url);
      const remote = r.kind === "file" ? r.url : /^https:\/\//.test(sq.url) ? sq.url : undefined;
      const local = remote ? await ctx.media.file(remote, ctx.where) : undefined;
      const src = local ?? (remote && /^https:\/\//.test(remote) ? remote : undefined);
      if (!src) return [];
      return one(
        makeBlock(
          ctx,
          "audio",
          { audio: { kind: "audio", src }, title: clip(sq.title || "Audio", 120) },
          { variant: "minimal" },
        ),
      );
    }
    case "product": {
      const item = sq.path ? ctx.urls.items.get(ctx.urls.oldPath(sq.path) ?? "") : undefined;
      if (!item) {
        ctx.notices.push({
          kind: "commerce",
          where: ctx.where,
          message: "A product block pointed at a product that wasn't imported; it was left out.",
        });
        return [];
      }
      return one(
        makeBlock(
          ctx,
          "product",
          { product: { collection: item.collection, items: [item.slug] } },
          { variant: "card" },
        ),
      );
    }
    case "cards": {
      const items = [];
      for (const c of sq.items.slice(0, 12)) {
        const image = c.image ? await img(ctx, c.image) : undefined;
        const link = c.href ? await linkFor(ctx, c.href) : undefined;
        const body: RichTextDoc = (c.html ? (await richText(ctx, c.html))?.doc : undefined) ?? {
          type: "doc",
          content: [],
        };
        items.push({
          heading: clip(c.title, 80),
          body,
          ...(image ? { image } : {}),
          ...(link ? { link, ...(c.linkLabel ? { linkLabel: clip(c.linkLabel, 30) } : {}) } : {}),
        });
      }
      if (!items.length) return [];
      return one(
        makeBlock(ctx, "columns", {
          items,
          columns: String(Math.max(2, Math.min(4, items.length))) as "2" | "3" | "4",
          aspect: "4:5",
        }),
      );
    }
    case "unknown": {
      ctx.notices.push({
        kind: "unsupported-block",
        where: ctx.where,
        message: `Squarespace "${sq.type}" block has no direct OpenSpace equivalent${sq.text ? "; its text was kept as a text block" : " and was left out"}.`,
      });
      if (!sq.text) return [];
      return one(makeBlock(ctx, "text", { content: textToRichText(sq.text) }));
    }
  }
}
