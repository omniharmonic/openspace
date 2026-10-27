/**
 * Page documents site-kit composes at build time: collection item pages (the item page
 * template with the Markdoc body in its content slot), collection list pages (index,
 * category, tag) and the default 404. They are ordinary `Page` values made of library blocks,
 * so they render through `renderPageHtml` exactly like the owner's pages.
 */
import { rt } from "@omniharmonic/openspace-blocks";
import { isLive, itemDate } from "@omniharmonic/openspace-renderer";
import type {
  Block,
  BlockRegistry,
  CollectionConfig,
  CollectionItem,
  ColorTheme,
  ImageValue,
  Link,
  MediaMeta,
  Page,
  RichTextDoc,
  Section,
  SiteDocument,
} from "@omniharmonic/openspace-schema";
import { stableId } from "./ids";
import { markdocPlainText, markdocToBlocks, requiredDefaults } from "./markdoc";

export interface ComposeContext {
  doc: SiteDocument;
  registry: BlockRegistry;
}

/** Thrown when a collection item's Markdoc body can't be turned into blocks. */
export class ItemBodyError extends Error {
  constructor(
    readonly file: string,
    readonly issues: { line: number; message: string }[],
  ) {
    super(`${file}:\n${issues.map((i) => `  line ${i.line}: ${i.message}`).join("\n")}`);
    this.name = "ItemBodyError";
  }
}

/** Build and validate a library block (a programming error if it doesn't validate). */
export function makeBlock(
  ctx: ComposeContext,
  seed: string,
  type: string,
  fields: Record<string, unknown>,
  variant?: string,
): Block {
  const def = ctx.registry.get(type);
  if (!def) throw new Error(`site-kit needs the "${type}" block, which isn't registered`);
  const block: Block = { id: stableId("blk", seed), type, v: def.version, fields };
  if (variant) block.variant = variant;
  const r = def.validate(block);
  if (!r.success)
    throw new Error(
      `site-kit built an invalid ${type} block (${seed}): ${r.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  return block;
}

export function stackSection(
  seed: string,
  blocks: Block[],
  opts: {
    colorTheme?: ColorTheme;
    width?: "narrow" | "content" | "wide" | "full";
    columns?: number[];
  } = {},
): Section {
  const columns = opts.columns ?? [12];
  return {
    id: stableId("sec", seed),
    layout: {
      mode: "stack",
      columns: { d: columns, ...(columns.length > 1 ? { m: [12] } : {}) },
      ...(opts.width ? { width: opts.width } : {}),
    },
    style: { colorTheme: opts.colorTheme ?? "light" },
    blocks,
  };
}

const text = (s: string): RichTextDoc["content"][number] => rt.p(s);

// Live/date rules are shared with the list blocks (renderer `collections`).
export { isLive, itemDate };

export function sortItems(
  items: CollectionItem[],
  sort: CollectionConfig["list"]["sort"] = "date-desc",
): CollectionItem[] {
  const t = (i: CollectionItem) => {
    const d = itemDate(i);
    return d ? Date.parse(d) : 0;
  };
  const out = [...items];
  if (sort === "date-desc") out.sort((a, b) => t(b) - t(a) || a.slug.localeCompare(b.slug));
  else if (sort === "date-asc") out.sort((a, b) => t(a) - t(b) || a.slug.localeCompare(b.slug));
  else if (sort === "title")
    out.sort((a, b) => a.frontmatter.title.localeCompare(b.frontmatter.title));
  return out;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Human date in the site locale: `October 26, 2026`. */
export function formatDate(iso: string, locale: string, timeZone?: string): string {
  const dateOnly = DATE_ONLY.test(iso);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: dateOnly ? "UTC" : (timeZone ?? "UTC"),
  }).format(new Date(dateOnly ? `${iso}T00:00:00Z` : iso));
}

function formatTime(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone ?? "UTC",
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** `Saturday, November 14, 2026 · 9:00 AM – 12:00 PM MST` */
export function formatEventWhen(
  fm: {
    start: string;
    end?: string | undefined;
    allDay?: boolean | undefined;
    timezone?: string | undefined;
  },
  locale: string,
): string {
  const tz = fm.timezone;
  const dayFmt = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: DATE_ONLY.test(iso) ? "UTC" : (tz ?? "UTC"),
    }).format(new Date(DATE_ONLY.test(iso) ? `${iso}T00:00:00Z` : iso));
  const startDay = dayFmt(fm.start);
  if (fm.allDay || DATE_ONLY.test(fm.start)) {
    if (fm.end && dayFmt(fm.end) !== startDay) return `${startDay} – ${dayFmt(fm.end)}`;
    return startDay;
  }
  const startTime = formatTime(fm.start, locale, tz);
  if (!fm.end) return `${startDay} · ${startTime}`;
  if (dayFmt(fm.end) === startDay)
    return `${startDay} · ${startTime.replace(/\s\S+$/, "")} – ${formatTime(fm.end, locale, tz)}`;
  return `${startDay} · ${startTime} – ${dayFmt(fm.end)} · ${formatTime(fm.end, locale, tz)}`;
}

/** `$24.00` (amount in minor units). */
export function formatMoney(m: { amount: number; currency: string }, locale: string): string {
  const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: m.currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  return fmt.format(m.amount / 10 ** digits);
}

function imageValue(src: string, media: Record<string, MediaMeta>, alt?: string): ImageValue {
  const meta = media[src];
  const out: ImageValue = { src, alt: alt ?? meta?.alt ?? "" };
  if (meta?.width && meta.height) {
    out.width = meta.width;
    out.height = meta.height;
  }
  if (meta?.focal) out.focal = meta.focal;
  return out;
}

export function itemPageId(collection: string, slug: string): Page["id"] {
  return stableId("pg", `item:${collection}/${slug}`);
}

function categoryLabel(cfg: CollectionConfig | undefined, slug: string): string {
  return cfg?.taxonomies?.categories?.find((c) => c.slug === slug)?.label ?? humanize(slug);
}

export function humanize(slug: string): string {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** URL-safe tag slug: `Boulder Studio` → `boulder-studio`. */
export function tagSlug(tag: string): string {
  return (
    tag
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tag"
  );
}

/** Shorten text to `max` characters on a word boundary, with an ellipsis. */
function clipText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()}…`;
}

export function itemDescription(item: CollectionItem): string | undefined {
  return (
    item.frontmatter.seo?.description ??
    item.frontmatter.excerpt ??
    (markdocPlainText(item.body, 200) || undefined)
  );
}

/** The item page: header, featured image, the Markdoc body, kind-specific extras, sharing. */
export function itemPage(
  ctx: ComposeContext,
  collection: string,
  item: CollectionItem,
  related: CollectionItem[] = [],
): Page {
  const { doc } = ctx;
  const cfg = doc.collectionConfigs?.[collection];
  const locale = doc.site.locale;
  const fm = item.frontmatter;
  const seed = `item:${collection}/${item.slug}`;
  const file = `content/collections/${collection}/${item.slug}.mdoc`;
  const layout = cfg?.itemPage?.layout ?? "article";
  const width =
    layout === "article" || layout === "minimal"
      ? "narrow"
      : layout === "wide"
        ? "wide"
        : "content";

  // Header text: eyebrow (date / first category), title, excerpt.
  const eyebrow: string[] = [];
  const date = itemDate(item);
  if (item.kind === "events") {
    eyebrow.push(cfg?.itemLabel ?? "Event");
  } else if (date && cfg?.itemPage?.showDate !== false) {
    eyebrow.push(formatDate(date, locale));
  }
  const firstCat = fm.categories?.[0];
  if (firstCat) eyebrow.push(categoryLabel(cfg, firstCat));
  const author =
    item.kind === "blog" && cfg?.itemPage?.showAuthor !== false
      ? item.frontmatter.author
      : undefined;
  const header: RichTextDoc["content"] = [];
  if (eyebrow.length) header.push(rt.p(eyebrow.join(" · "), "eyebrow"));
  header.push(rt.h(1, fm.title));
  if (fm.excerpt) header.push(rt.p(fm.excerpt, "lead"));
  if (author) header.push(rt.p(`By ${author}`, "small"));

  const headerBlocks: Block[] = [
    makeBlock(ctx, `${seed}#title`, "text", { content: rt.doc(...header) }),
  ];

  if (item.kind === "events") {
    const e = item.frontmatter;
    const lines: RichTextDoc["content"] = [rt.p([rt.bold("When: "), formatEventWhen(e, locale)])];
    const where = [e.location?.name, e.location?.address].filter(Boolean).join(", ");
    if (where) lines.push(rt.p([rt.bold("Where: "), where]));
    else if (e.location?.online) lines.push(rt.p([rt.bold("Where: "), "Online"]));
    if (e.price) lines.push(rt.p([rt.bold("Price: "), e.price]));
    headerBlocks.push(
      makeBlock(ctx, `${seed}#when`, "text", { content: rt.doc(...lines) }, "callout"),
    );
    const reg = e.registrationUrl ?? e.location?.url;
    if (reg)
      headerBlocks.push(
        makeBlock(ctx, `${seed}#register`, "button", {
          label: "Register",
          link: { type: "url", url: reg, newTab: true },
          role: "primary",
        }),
      );
  }
  if (item.kind === "products") {
    const p = item.frontmatter;
    const price: RichTextDoc["content"][number] = rt.p(
      p.compareAtPrice
        ? [rt.bold(formatMoney(p.price, locale)), ` (was ${formatMoney(p.compareAtPrice, locale)})`]
        : [rt.bold(formatMoney(p.price, locale))],
      "lead",
    );
    const extra: RichTextDoc["content"] = [price];
    if (p.available === false) extra.push(text("Currently sold out."));
    if (p.options?.length)
      extra.push(text(p.options.map((o) => `${o.name}: ${o.values.join(", ")}`).join(" · ")));
    // Add to cart: the library's product block (blocks B) when registered — it shows price,
    // options and the cart button (data-os-add contract); otherwise a price line.
    const productDef = ctx.registry.get("product");
    const ref = Object.entries(productDef?.meta.fields ?? {}).find(
      ([, m]) => m.kind === "reference",
    );
    if (productDef && ref) {
      headerBlocks.push(
        makeBlock(ctx, `${seed}#buy`, "product", {
          ...requiredDefaults(productDef.meta.fields),
          [ref[0]]: { collection, items: [item.slug] },
        }),
      );
    } else {
      headerBlocks.push(makeBlock(ctx, `${seed}#price`, "text", { content: rt.doc(...extra) }));
    }
  }

  const sections: Section[] = [stackSection(`${seed}#header`, headerBlocks, { width })];

  if (fm.image) {
    sections.push(
      stackSection(
        `${seed}#hero`,
        [
          makeBlock(ctx, `${seed}#image`, "image", {
            image: imageValue(fm.image, doc.media, fm.imageAlt),
            aspect: "original",
            lightbox: false,
          }),
        ],
        { width: width === "narrow" ? "content" : width },
      ),
    );
  }

  if (item.kind === "podcast") {
    const a = item.frontmatter.audio;
    const minutes = Math.max(1, Math.round(a.duration / 60));
    const media = doc.media[a.src];
    const href = a.src;
    // ADAPTER POINT: an `audio` block (blocks B) replaces this download link when registered.
    if (ctx.registry.has("audio")) {
      const def = ctx.registry.get("audio");
      const field = Object.entries(def?.meta.fields ?? {}).find(([, m]) => m.kind === "media");
      if (field)
        sections.push(
          stackSection(
            `${seed}#audio`,
            [
              makeBlock(ctx, `${seed}#player`, "audio", {
                ...requiredDefaults(def?.meta.fields ?? {}),
                [field[0]]: { kind: "audio", src: href, title: fm.title },
                ...("title" in (def?.meta.fields ?? {}) ? { title: fm.title } : {}),
                ...("episode" in (def?.meta.fields ?? {}) && item.frontmatter.episode !== undefined
                  ? { episode: item.frontmatter.episode }
                  : {}),
                ...("show" in (def?.meta.fields ?? {}) && cfg?.label ? { show: cfg.label } : {}),
              }),
            ],
            { width },
          ),
        );
    } else {
      sections.push(
        stackSection(
          `${seed}#audio`,
          [
            makeBlock(ctx, `${seed}#listen`, "button", {
              label: `Listen (${minutes} min)`,
              link: { type: "file", src: href },
              role: "primary",
              ...(media?.bytes ? { note: `${Math.round(media.bytes / 1e6)} MB audio file` } : {}),
            }),
          ],
          { width },
        ),
      );
    }
  }

  const body = markdocToBlocks(item.body, {
    registry: ctx.registry,
    media: doc.media,
    idSeed: seed,
  });
  if (body.issues.length) throw new ItemBodyError(file, body.issues);
  if (body.blocks.length) sections.push(stackSection(`${seed}#body`, body.blocks, { width }));

  const galleryImages =
    item.kind === "portfolio"
      ? item.frontmatter.gallery
      : item.kind === "products"
        ? item.frontmatter.images
        : undefined;
  if (galleryImages?.length) {
    sections.push(
      stackSection(
        `${seed}#gallery`,
        [
          makeBlock(
            ctx,
            `${seed}#gallery-block`,
            "gallery",
            {
              images: galleryImages.map((image) => ({ image })),
              aspect: "auto",
              columns: "3",
              lightbox: true,
              showCaptions: false,
            },
            "grid",
          ),
        ],
        { width: "wide" },
      ),
    );
  }

  if (item.kind === "portfolio") {
    const p = item.frontmatter;
    const facts: RichTextDoc["content"] = [];
    if (p.client) facts.push(rt.p([rt.bold("Client: "), p.client]));
    if (p.role) facts.push(rt.p([rt.bold("Role: "), p.role]));
    if (p.year) facts.push(rt.p([rt.bold("Year: "), String(p.year)]));
    if (p.projectUrl) facts.push(rt.p([rt.link("Visit the project", p.projectUrl)]));
    if (facts.length)
      sections.splice(
        1,
        0,
        stackSection(
          `${seed}#facts`,
          [makeBlock(ctx, `${seed}#facts-text`, "text", { content: rt.doc(...facts) })],
          { width },
        ),
      );
  }

  // Footer of the article: taxonomy links and sharing.
  const tail: Block[] = [];
  const taxLinks: RichTextDoc["content"][number][] = [];
  const base = `/${collection}`;
  if (fm.categories?.length)
    taxLinks.push(
      rt.p(
        [
          "Filed under ",
          ...fm.categories.flatMap((c, i) => [
            ...(i ? [", "] : []),
            rt.link(categoryLabel(cfg, c), `${base}/category/${c}/`),
          ]),
        ],
        "small",
      ),
    );
  if (fm.tags?.length && cfg?.taxonomies?.tags !== false)
    taxLinks.push(
      rt.p(
        [
          "Tags: ",
          ...fm.tags.flatMap((t, i) => [
            ...(i ? [", "] : []),
            rt.link(t, `${base}/tag/${tagSlug(t)}/`),
          ]),
        ],
        "small",
      ),
    );
  if (taxLinks.length)
    tail.push(makeBlock(ctx, `${seed}#tax`, "text", { content: rt.doc(...taxLinks) }));
  tail.push(
    makeBlock(
      ctx,
      `${seed}#share`,
      "share-buttons",
      {
        label: "Share",
        networks: [
          { network: "facebook" },
          { network: "x" },
          { network: "linkedin" },
          { network: "email" },
        ],
      },
      "icons",
    ),
  );
  sections.push(stackSection(`${seed}#tail`, tail, { width }));

  if (related.length && cfg?.itemPage?.showRelated !== false) {
    sections.push(
      ...cardRows(ctx, `${seed}#related`, related.slice(0, 3), collection, "Keep reading"),
    );
  }

  const seo: NonNullable<Page["seo"]> = {};
  const description = itemDescription(item);
  if (fm.seo?.title) seo.title = fm.seo.title;
  if (description) seo.description = description;
  const image = fm.seo?.image ?? fm.image;
  if (image) seo.image = image;
  if (fm.seo?.noindex) seo.noindex = true;
  if (fm.seo?.canonical) seo.canonical = fm.seo.canonical;

  return {
    id: itemPageId(collection, item.slug),
    title: fm.title,
    slug: `${collection}/${item.slug}`,
    seo,
    hidden: true,
    sections,
  };
}

/** Rows of item cards (3 per row), optionally under a heading. */
export function cardRows(
  ctx: ComposeContext,
  seed: string,
  items: CollectionItem[],
  collection: string,
  heading?: string,
): Section[] {
  const { doc } = ctx;
  const sections: Section[] = [];
  if (heading)
    sections.push(
      stackSection(`${seed}#heading`, [
        makeBlock(ctx, `${seed}#heading-text`, "text", { content: rt.doc(rt.h(2, heading)) }),
      ]),
    );
  for (let row = 0; row * 3 < items.length; row++) {
    const chunk = items.slice(row * 3, row * 3 + 3);
    const blocks = chunk.map((item, i) => {
      const fm = item.frontmatter;
      const date = itemDate(item);
      const fields: Record<string, unknown> = {
        aspect: "3:2",
        // Card headings hold up to 90 characters; titles may be up to 200.
        heading: clipText(fm.title, 90),
        // Card bodies hold up to 400 characters; excerpts may be up to 500.
        body: rt.doc(rt.p(clipText(itemDescription(item) ?? "", 400))),
        link: { type: "item", collection, slug: item.slug } satisfies Link,
      };
      if (fm.image) fields.image = imageValue(fm.image, doc.media, fm.imageAlt);
      const eyebrow =
        item.kind === "events"
          ? formatEventWhen(item.frontmatter, doc.site.locale).split(" · ")[0]
          : item.kind === "products"
            ? formatMoney(item.frontmatter.price, doc.site.locale)
            : date
              ? formatDate(date, doc.site.locale)
              : undefined;
      if (eyebrow) fields.eyebrow = eyebrow;
      if (!itemDescription(item)) fields.body = rt.doc(rt.p(clipText(fm.title, 400)));
      const b = makeBlock(ctx, `${seed}#card-${item.slug}`, "card", fields, "stacked");
      b.column = i;
      return b;
    });
    sections.push(
      stackSection(`${seed}#row-${row}`, blocks, { columns: [4, 4, 4], width: "wide" }),
    );
  }
  return sections;
}

export interface ListPageInput {
  collection: string;
  /** URL slug of the list page (`journal`, `journal/category/news`, `journal/page/2`). */
  slug: string;
  title: string;
  intro?: string | undefined;
  items: CollectionItem[];
  /** Pagination links (site-relative, without base). */
  prev?: string | undefined;
  next?: string | undefined;
  /** Feed links shown under the intro. */
  feeds?: { label: string; href: string }[];
}

/** A generated collection list page (index, category, tag, page N). */
export function listPage(ctx: ComposeContext, input: ListPageInput): Page {
  const seed = `list:${input.slug}`;
  const head: RichTextDoc["content"] = [rt.h(1, input.title)];
  if (input.intro) head.push(rt.p(input.intro, "lead"));
  if (input.feeds?.length)
    head.push(
      rt.p(
        input.feeds.flatMap((f, i) => [...(i ? [" · "] : []), rt.link(f.label, f.href)]),
        "small",
      ),
    );
  const sections: Section[] = [
    stackSection(
      `${seed}#header`,
      [makeBlock(ctx, `${seed}#title`, "text", { content: rt.doc(...head) })],
      { width: "wide" },
    ),
  ];
  if (input.items.length) sections.push(...cardRows(ctx, seed, input.items, input.collection));
  else
    sections.push(
      stackSection(
        `${seed}#empty`,
        [
          makeBlock(ctx, `${seed}#empty-text`, "text", {
            content: rt.doc(text("Nothing here yet — check back soon.")),
          }),
        ],
        { width: "wide" },
      ),
    );
  if (input.prev || input.next) {
    const fields: Record<string, unknown> = input.next
      ? { label: "Older", link: { type: "url", url: input.next }, role: "secondary" }
      : { label: "Newer", link: { type: "url", url: input.prev }, role: "secondary" };
    if (input.next && input.prev) {
      fields.secondaryLabel = "Newer";
      fields.secondaryLink = { type: "url", url: input.prev };
    }
    sections.push(
      stackSection(`${seed}#pager`, [makeBlock(ctx, `${seed}#pager-buttons`, "button", fields)], {
        width: "wide",
      }),
    );
  }
  return {
    id: stableId("pg", seed),
    title: input.title,
    slug: input.slug,
    ...(input.intro ? { seo: { description: input.intro } } : {}),
    hidden: true,
    sections,
  };
}

/** The default "page not found" page (used unless the owner made a page with slug `404`). */
export function notFoundPage(ctx: ComposeContext): Page {
  const seed = "404";
  const home = Object.values(ctx.doc.pages).find((p) => p.slug === "");
  const link: Link = home ? { type: "page", page: home.id } : { type: "url", url: "/" };
  return {
    id: stableId("pg", seed),
    title: "Page not found",
    slug: "404",
    seo: { noindex: true },
    hidden: true,
    sections: [
      stackSection(
        `${seed}#main`,
        [
          makeBlock(ctx, `${seed}#text`, "text", {
            content: rt.doc(
              rt.p("Error 404", "eyebrow"),
              rt.h(1, "We couldn't find that page"),
              rt.p(
                "It may have moved, or the link may be mistyped. Try the home page or the menu above.",
                "lead",
              ),
            ),
          }),
          makeBlock(ctx, `${seed}#home`, "button", {
            label: "Go to the home page",
            link,
            role: "primary",
          }),
        ],
        { width: "narrow" },
      ),
    ],
  };
}
