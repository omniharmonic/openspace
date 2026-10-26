import type { Block, NavItem, Page, Section, SiteDocument } from "@openspace/schema";

/**
 * Page rendering seam for the Hub's dev preview (`/s/:siteId/*`, `/p/:siteId/*`, `/t/:id/*`).
 *
 * ADR-3 says `@openspace/renderer` is the only way pages become HTML. It is being built in
 * parallel (Task 5), so the Hub depends on this interface; `PlaceholderRenderer` is a stand-in
 * that lists each page's sections and blocks. When the renderer lands, an adapter calling
 * `renderPageHtml` (and serving its behavior modules) replaces it in `services/index.ts`.
 */
export type RenderMode = "published" | "draft" | "template";

export interface RenderPageInput {
  doc: SiteDocument;
  page: Page;
  mode: RenderMode;
  /** URL prefix the site is served under, e.g. `/s/st_x5x6fppn3c` (no trailing slash). */
  basePath: string;
  /** Where behavior modules are served from, e.g. `/_os/behaviors`. */
  behaviorsBase: string;
}

export interface PageRenderer {
  renderPage(input: RenderPageInput): Promise<string>;
  /** Source of a `data-os-behavior` module (served at `/_os/behaviors/<name>.js`), if any. */
  behavior(name: string): Promise<string | null>;
}

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c] as string);

/** Plain text of a ProseMirror-style rich text value. */
export function richTextToPlain(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  const inner = (n.content ?? []).map(richTextToPlain);
  return n.type === "doc" || n.type === "bulletList" || n.type === "orderedList"
    ? inner.join("\n")
    : inner.join("");
}

function pageHref(doc: SiteDocument, basePath: string, pageId: string): string {
  const page = doc.pages[pageId as keyof typeof doc.pages];
  return `${basePath}/${page?.slug ?? ""}`;
}

function navHtml(doc: SiteDocument, basePath: string): string {
  const item = (it: NavItem): string => {
    if (it.hidden) return "";
    switch (it.type) {
      case "page": {
        const label = it.label ?? doc.pages[it.page]?.title ?? "Page";
        return `<li><a href="${escapeHtml(pageHref(doc, basePath, it.page))}">${escapeHtml(label)}</a></li>`;
      }
      case "link":
        return `<li><a href="${escapeHtml(it.href)}">${escapeHtml(it.label)}</a></li>`;
      case "collection":
        return `<li><a href="${escapeHtml(`${basePath}/${it.collection}`)}">${escapeHtml(it.label)}</a></li>`;
      case "button":
        return `<li><span class="btn">${escapeHtml(it.label)}</span></li>`;
      case "folder":
        return `<li>${escapeHtml(it.label)}<ul>${it.items.map(item).join("")}</ul></li>`;
    }
  };
  return `<nav aria-label="Main"><ul>${doc.site.nav.map(item).join("")}</ul></nav>`;
}

function blockHtml(block: Block): string {
  const f = block.fields as Record<string, unknown>;
  switch (block.type) {
    case "text": {
      const content = f.content as {
        content?: Array<{ type?: string; attrs?: { level?: number } }>;
      };
      return (content?.content ?? [])
        .map((node) => {
          const text = escapeHtml(richTextToPlain(node));
          if (node.type === "heading") {
            const level = Math.min(Math.max(node.attrs?.level ?? 2, 1), 6);
            return `<h${level}>${text}</h${level}>`;
          }
          return `<p>${text}</p>`;
        })
        .join("");
    }
    case "button":
      return `<p><span class="btn">${escapeHtml(String(f.label ?? "Button"))}</span></p>`;
    case "image": {
      const img = f.image as
        | { src?: string; alt?: string; width?: number; height?: number }
        | undefined;
      if (img?.src?.startsWith("https://"))
        return `<img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt ?? "")}"${img.width ? ` width="${img.width}"` : ""}${img.height ? ` height="${img.height}"` : ""} loading="lazy">`;
      return `<p class="muted">[image: ${escapeHtml(img?.alt ?? "")}]</p>`;
    }
    default:
      return `<p class="muted">[${escapeHtml(block.type)} block]</p>`;
  }
}

function sectionHtml(section: Section): string {
  const theme = section.style.colorTheme ?? "light";
  return `<section data-os-section="${section.id}" data-theme="${theme}"${section.anchor ? ` id="${escapeHtml(section.anchor)}"` : ""}>${section.blocks.map((b) => `<div data-os-block="${b.id}" data-type="${escapeHtml(b.type)}">${blockHtml(b)}</div>`).join("")}</section>`;
}

export class PlaceholderRenderer implements PageRenderer {
  async renderPage({ doc, page, mode, basePath }: RenderPageInput): Promise<string> {
    const title = doc.site.seo?.titleTemplate
      ? doc.site.seo.titleTemplate.replace("%s", page.title)
      : `${page.title} — ${doc.site.title}`;
    const brand = doc.styles.choices.palette.brand;
    const banner =
      mode === "draft"
        ? `<div class="banner">Draft preview — not yet published</div>`
        : mode === "template"
          ? `<div class="banner">Template preview</div>`
          : "";
    return `<!doctype html>
<html lang="${escapeHtml(doc.site.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${page.seo?.description ? `<meta name="description" content="${escapeHtml(page.seo.description)}">` : ""}
<meta name="generator" content="OpenSpace Hub placeholder renderer">
<style>
:root{--os-brand:${escapeHtml(brand)}}
body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#1d1d1f;background:#fff}
header,footer,section{padding:32px max(16px,calc((100vw - 960px)/2))}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e5e5}
nav ul{display:flex;gap:16px;list-style:none;margin:0;padding:0}
a{color:var(--os-brand)}
section[data-theme^=dark]{background:#1d1d1f;color:#f5f5f7}
section[data-theme=light-accent]{background:#f5f3ee}
img{max-width:100%;height:auto;border-radius:8px}
.btn{display:inline-block;padding:8px 16px;border-radius:999px;background:var(--os-brand);color:#fff}
.muted{color:#6e6e73}
.banner{background:#fff4c2;padding:8px 16px;font-size:13px;text-align:center}
footer{background:#1d1d1f;color:#f5f5f7}
</style>
</head>
<body>
${banner}
<header><strong>${escapeHtml(doc.site.title)}</strong>${navHtml(doc, basePath)}</header>
<main data-os-page="${page.id}">
${page.sections.map(sectionHtml).join("\n")}
</main>
<footer data-os-section="${doc.site.footer.id}">${doc.site.footer.blocks.map(blockHtml).join("")}</footer>
</body>
</html>`;
  }

  async behavior(_name: string): Promise<string | null> {
    return null;
  }
}
