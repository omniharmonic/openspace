/**
 * WordPress post content as HTML the shared extractor can read.
 *
 * - REST `content.rendered` is already HTML (blocks rendered, shortcodes expanded).
 * - A WXR export holds the raw `post_content`: block-editor content is HTML wrapped in
 *   `<!-- wp:name {attrs} -->` comments (dynamic blocks have only the comment), classic-editor
 *   content is text with blank lines for paragraphs and shortcodes. This module turns both into
 *   rendered-style HTML: comments resolved (latest posts, reusable blocks, embeds), classic text
 *   paragraphed (a simplified `wpautop`), and the common shortcodes (`[caption]`, `[gallery]`,
 *   `[embed]`, `[video]`, `[audio]`) expanded; other shortcodes are removed and reported.
 */
import { videoUrl } from "../squarespace/blocks";
import type { SqNotice } from "../types";

export interface Attachment {
  url: string;
  alt?: string;
  caption?: string;
}

export interface WpContentContext {
  attachments: Map<string, Attachment>;
  notices: SqNotice[];
  where: string;
}

const BLOCK_TAGS =
  "table|thead|tfoot|caption|col|colgroup|tbody|tr|td|th|div|dl|dd|dt|ul|ol|li|pre|form|map|area|blockquote|address|math|style|p|h[1-6]|hr|fieldset|legend|section|article|aside|hgroup|header|footer|nav|figure|figcaption|details|menu|summary|iframe|video|audio";

/** A simplified `wpautop`: blank lines → paragraphs, single newlines → `<br>`. */
export function autop(raw: string): string {
  let t = raw.replace(/\r\n?/g, "\n");
  if (!t.trim()) return "";
  t = t
    .replace(new RegExp(`(<(?:${BLOCK_TAGS})[\\s/>])`, "gi"), "\n\n$1")
    .replace(new RegExp(`(</(?:${BLOCK_TAGS})>)`, "gi"), "\n\n$1\n\n");
  const blockStart = new RegExp(`^</?(?:${BLOCK_TAGS})[\\s/>]`, "i");
  return t
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => (blockStart.test(c) ? c : `<p>${c.replace(/\n/g, "<br />\n")}</p>`))
    .join("\n");
}

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function attrsOf(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/g))
    out[(m[1] as string).toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

const HANDLED = new Set(["caption", "wp_caption", "gallery", "embed", "video", "audio", "playlist"]);

/** Expand the shortcodes OpenSpace can represent; strip (and report) the rest. */
export function expandShortcodes(html: string, ctx: WpContentContext): string {
  let t = html;
  // [caption …]<img …> Caption[/caption]
  t = t.replace(/\[(?:wp_)?caption([^\]]*)\]([\s\S]*?)\[\/(?:wp_)?caption\]/gi, (_, _a, inner: string) => {
    const img = /(<a[^>]*>\s*)?<img[^>]*>(\s*<\/a>)?/i.exec(inner)?.[0] ?? "";
    const cap = inner.replace(img, "").trim();
    return `<figure class="wp-caption">${img}${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
  });
  // [gallery ids="1,2,3"]
  t = t.replace(/\[gallery([^\]]*)\]/gi, (_, a: string) => {
    const ids = (attrsOf(a).ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const figs = ids
      .map((id) => ctx.attachments.get(id))
      .filter((x): x is Attachment => !!x)
      .map(
        (x) =>
          `<figure class="wp-block-image"><img src="${escAttr(x.url)}" alt="${escAttr(x.alt ?? "")}"/>${x.caption ? `<figcaption>${x.caption}</figcaption>` : ""}</figure>`,
      );
    if (!figs.length) {
      ctx.notices.push({
        kind: "media",
        where: ctx.where,
        message: "A [gallery] shortcode listed images that weren't in the export; it was left out.",
      });
      return "";
    }
    return `<figure class="wp-block-gallery">${figs.join("")}</figure>`;
  });
  // [embed]url[/embed]
  t = t.replace(/\[embed[^\]]*\]([\s\S]*?)\[\/embed\]/gi, (_, url: string) => embedFigure(url.trim()));
  // [video src=""] / [audio mp3=""]
  t = t.replace(/\[video([^\]]*)\](?:[\s\S]*?\[\/video\])?/gi, (_, a: string) => {
    const at = attrsOf(a);
    const src = at.src ?? at.mp4 ?? at.webm ?? at.m4v;
    return src ? `<video src="${escAttr(src)}"></video>` : "";
  });
  t = t.replace(/\[audio([^\]]*)\](?:[\s\S]*?\[\/audio\])?/gi, (_, a: string) => {
    const at = attrsOf(a);
    const src = at.src ?? at.mp3 ?? at.m4a ?? at.ogg ?? at.wav;
    return src ? `<audio src="${escAttr(src)}"></audio>` : "";
  });
  // Anything else: [name …]…[/name] or [name …].
  const seen = new Set<string>();
  t = t.replace(/\[([a-z_][\w-]*)(?=[\s\]/])([^\]]*)\](?:([\s\S]*?)\[\/\1\])?/gi, (all, name: string, _a, inner?: string) => {
    const n = name.toLowerCase();
    if (HANDLED.has(n)) return all;
    seen.add(n);
    // Layout shortcodes (columns, rows) keep their content.
    return /^(?:vc_|et_pb_|fusion_|one_|two_|three_|column|row|section|container|tab|toggle|accordion)/.test(n)
      ? (inner ?? "")
      : "";
  });
  if (seen.size)
    ctx.notices.push({
      kind: "unsupported-block",
      where: ctx.where,
      message: `Shortcodes without an OpenSpace equivalent were removed: ${[...seen]
        .slice(0, 8)
        .map((s) => `[${s}]`)
        .join(", ")}. Recreate what they showed with OpenSpace blocks.`,
    });
  return t;
}

function embedFigure(url: string): string {
  if (!/^https?:\/\//.test(url)) return "";
  return `<figure class="wp-block-embed"><div class="wp-block-embed__wrapper">${escAttr(url)}</div></figure>`;
}

/** Dynamic blocks (comment only) that become something. */
const DYNAMIC: Record<string, (attrs: Record<string, unknown>) => string> = {
  "core/latest-posts": () => `<div class="wp-block-latest-posts"></div>`,
  "core/query": () => `<div class="wp-block-latest-posts"></div>`,
  "core/separator": () => "<hr/>",
};
/** Dynamic blocks that are site chrome or meta, not content. */
const CHROME =
  /^core\/(?:navigation|site-title|site-logo|site-tagline|template-part|post-title|post-date|post-author|post-featured-image|post-terms|post-navigation-link|comments|comment-template|loginout|search|archives|categories|tag-cloud|page-list|rss|calendar|query-pagination|read-more|avatar|spacer|more|nextpage)/;

/** Raw `post_content` (WXR) → rendered-style HTML. */
export function wpRawToHtml(raw: string, ctx: WpContentContext): string {
  if (!raw.trim()) return "";
  let t = raw;
  if (/<!--\s*wp:/.test(t)) {
    const unknown = new Set<string>();
    t = t.replace(/<!--\s*wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)\s*(\{[\s\S]*?\})?\s*\/-->/g, (_, n: string, json?: string) => {
      const name = n.includes("/") ? n : `core/${n}`;
      let attrs: Record<string, unknown> = {};
      try {
        attrs = json ? (JSON.parse(json) as Record<string, unknown>) : {};
      } catch {
        attrs = {};
      }
      const dyn = DYNAMIC[name];
      if (dyn) return dyn(attrs);
      if (name === "core/block") {
        ctx.notices.push({
          kind: "unsupported-block",
          where: ctx.where,
          message: "A reusable block (synced pattern) was referenced here; recreate it or paste its content.",
        });
        return "";
      }
      if (!CHROME.test(name)) unknown.add(name);
      return "";
    });
    // Embeds keep their URL in the wrapper (the extractor reads it); drop the comments.
    t = t.replace(/<!--\s*\/?wp:[^>]*?-->/g, "");
    if (unknown.size)
      ctx.notices.push({
        kind: "unsupported-block",
        where: ctx.where,
        message: `Dynamic blocks without content in the export were left out: ${[...unknown].slice(0, 6).join(", ")}.`,
      });
    return expandShortcodes(t, ctx);
  }
  // Classic editor: bare video URLs on their own line are oEmbeds.
  t = t.replace(/^\s*(https?:\/\/\S+)\s*$/gm, (line, url: string) => (videoUrl(url) ? embedFigure(url) : line));
  return autop(expandShortcodes(t, ctx));
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
};

/** WordPress titles and excerpts are HTML-escaped (`&#8217;`, `&amp;`). */
export function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}
