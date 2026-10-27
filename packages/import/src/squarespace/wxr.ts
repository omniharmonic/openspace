/**
 * A WordPress export (WXR) — WordPress's own Tools → Export, or Squarespace's blog export
 * (Settings → Import & Export → Export → WordPress): RSS 2.0 +
 * `wp:`, `content:`, `dc:` and `excerpt:` namespaces) file. It is the most faithful source for
 * blog posts — it includes drafts, full bodies, authors, categories and tags.
 */

export interface WxrItem {
  title: string;
  link?: string;
  /** Path of the post on the old site (`/blog/opening-day`). */
  path?: string;
  postType: string;
  status: string;
  slug?: string;
  date?: string;
  author?: string;
  contentHtml: string;
  excerptHtml?: string;
  categories: string[];
  tags: string[];
  /** Featured image URL (resolved from `_thumbnail_id`). */
  image?: string;
  id?: string;
  attachmentUrl?: string;
  /** `wp:postmeta` key → value (Yoast/Rank Math SEO, menu item targets, alt text…). */
  meta: Record<string, string>;
  parent?: string;
  menuOrder?: number;
  /** Navigation menus (slugs) this `nav_menu_item` belongs to. */
  menus: string[];
}

export interface WxrFile {
  title?: string;
  link?: string;
  description?: string;
  language?: string;
  items: WxrItem[];
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

/** Text of the first `<tag>` (CDATA unwrapped, entities decoded). */
function tag(xml: string, name: string): string | undefined {
  const re = new RegExp(
    `<${name.replace(":", "\\:")}(?:\\s[^>]*)?>([\\s\\S]*?)</${name.replace(":", "\\:")}>`,
  );
  const m = re.exec(xml);
  if (!m) return undefined;
  const inner = (m[1] as string).trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(inner);
  return cdata ? (cdata[1] as string) : decode(inner);
}

function allTags(xml: string, name: string): { attrs: string; value: string }[] {
  const re = new RegExp(
    `<${name.replace(":", "\\:")}(\\s[^>]*)?>([\\s\\S]*?)</${name.replace(":", "\\:")}>`,
    "g",
  );
  return [...xml.matchAll(re)].map((m) => {
    const inner = (m[2] as string).trim();
    const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(inner);
    return { attrs: m[1] ?? "", value: cdata ? (cdata[1] as string) : decode(inner) };
  });
}

/** Parse a WXR export. Throws when the file is not one. */
export function parseWxr(xml: string): WxrFile {
  if (!/<rss[\s>]/.test(xml) || !/xmlns:wp=/.test(xml))
    throw new Error("This is not a WordPress (WXR) export file.");
  const channel = /<channel>([\s\S]*?)<item>/.exec(xml)?.[1] ?? "";
  const items: WxrItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = m[1] as string;
    const link = tag(x, "link");
    let path: string | undefined;
    try {
      path = link ? new URL(link).pathname.replace(/\/+$/, "") || "/" : undefined;
    } catch {
      path = link?.startsWith("/") ? link : undefined;
    }
    const cats = allTags(x, "category");
    const meta = allTags(x, "wp:postmeta").map((pm) => ({
      key: tag(pm.value, "wp:meta_key"),
      value: tag(pm.value, "wp:meta_value"),
    }));
    const thumb = meta.find((pm) => pm.key === "_thumbnail_id")?.value;
    const date = tag(x, "wp:post_date_gmt") ?? tag(x, "wp:post_date");
    const pubDate = tag(x, "pubDate");
    let iso: string | undefined;
    if (date && /^\d{4}-\d{2}-\d{2}/.test(date) && !date.startsWith("0000"))
      iso = `${date.replace(" ", "T")}${/Z|[+-]\d\d:?\d\d$/.test(date) ? "" : "Z"}`;
    else if (pubDate && !Number.isNaN(Date.parse(pubDate))) iso = new Date(pubDate).toISOString();
    items.push({
      title: tag(x, "title") ?? "",
      ...(link ? { link } : {}),
      ...(path ? { path } : {}),
      postType: tag(x, "wp:post_type") ?? "post",
      status: tag(x, "wp:status") ?? "publish",
      ...(tag(x, "wp:post_name") ? { slug: tag(x, "wp:post_name") } : {}),
      ...(iso ? { date: iso } : {}),
      ...(tag(x, "dc:creator") ? { author: tag(x, "dc:creator") } : {}),
      contentHtml: tag(x, "content:encoded") ?? "",
      ...(tag(x, "excerpt:encoded") ? { excerptHtml: tag(x, "excerpt:encoded") } : {}),
      categories: cats
        .filter((c) => /domain="category"/.test(c.attrs))
        .map((c) => c.value.trim())
        .filter(Boolean),
      tags: cats
        .filter((c) => /domain="post_tag"/.test(c.attrs))
        .map((c) => c.value.trim())
        .filter(Boolean),
      ...(thumb ? { image: `#attachment:${thumb}` } : {}),
      ...(tag(x, "wp:post_id") ? { id: tag(x, "wp:post_id") } : {}),
      ...(tag(x, "wp:attachment_url") ? { attachmentUrl: tag(x, "wp:attachment_url") } : {}),
      meta: Object.fromEntries(
        meta.filter((pm) => pm.key).map((pm) => [pm.key as string, pm.value ?? ""]),
      ),
      ...(tag(x, "wp:post_parent") && tag(x, "wp:post_parent") !== "0"
        ? { parent: tag(x, "wp:post_parent") }
        : {}),
      ...(tag(x, "wp:menu_order") ? { menuOrder: Number(tag(x, "wp:menu_order")) || 0 } : {}),
      menus: cats
        .filter((c) => /domain="nav_menu"/.test(c.attrs))
        .map((c) => /nicename="([^"]+)"/.exec(c.attrs)?.[1] ?? c.value),
    });
  }
  // Resolve featured images.
  const byId = new Map(items.filter((i) => i.id).map((i) => [i.id as string, i]));
  for (const i of items) {
    if (i.image?.startsWith("#attachment:")) {
      const att = byId.get(i.image.slice("#attachment:".length));
      if (att?.attachmentUrl) i.image = att.attachmentUrl;
      else delete i.image;
    }
  }
  return {
    ...(tag(channel, "title") ? { title: tag(channel, "title") } : {}),
    ...(tag(channel, "link") ? { link: tag(channel, "link") } : {}),
    ...(tag(channel, "description") ? { description: tag(channel, "description") } : {}),
    ...(tag(channel, "language") ? { language: tag(channel, "language") } : {}),
    items,
  };
}
