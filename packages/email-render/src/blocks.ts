import type { Block, Site } from "@openspace/schema";
import { esc, safeUrl } from "./escape";
import { type RtCtx, richTextHtml, richTextPlain } from "./richtext";

export interface BlockCtx extends RtCtx {
  site?: Pick<Site, "title" | "social">;
  /** Available content width in px (600 minus gutters, or a column's share). */
  width: number;
  /** Internal: honour pre-escaped `os-internal/html` blocks (templates only). */
  allowRaw?: boolean;
}

export interface Rendered {
  html: string;
  text: string;
}

const NETWORK_LABEL: Record<string, string> = {
  x: "X",
  github: "GitHub",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  soundcloud: "SoundCloud",
  tripadvisor: "Tripadvisor",
  email: "Email",
  website: "Website",
};

const label = (n: string) =>
  NETWORK_LABEL[n] ?? (n ? n.charAt(0).toUpperCase() + n.slice(1) : "Link");

type Fields = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const isObj = (v: unknown): v is Fields => typeof v === "object" && v !== null && !Array.isArray(v);

/** Resolve a schema `Link` object (or a plain href string) to an absolute URL, or null. */
export function linkHref(link: unknown, baseUrl?: string): string | null {
  if (typeof link === "string") return safeUrl(link, baseUrl);
  if (!isObj(link)) return null;
  switch (link.type) {
    case "url":
      return safeUrl(link.url, baseUrl);
    case "email": {
      const email = str(link.email);
      if (!/^[^\s@<>"]+@[^\s@<>"]+$/.test(email)) return null;
      const subject = str(link.subject);
      return `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
    }
    case "file":
      return safeUrl(link.src, baseUrl);
    default:
      // page / item / anchor links need the site's route table; not resolvable here.
      return safeUrl(link.href ?? link.url, baseUrl);
  }
}

function mediaSrc(v: unknown): string {
  if (typeof v === "string") return v;
  if (isObj(v)) return str(v.src) || str(v.url);
  return "";
}

function renderText(f: Fields, c: BlockCtx): Rendered {
  const doc = f.content ?? f.text ?? f.body;
  const align = f.align === "center" || f.align === "right" ? f.align : "left";
  return {
    html: richTextHtml(doc, c, { align }),
    text: richTextPlain(doc, c),
  };
}

function renderHeading(f: Fields, c: BlockCtx): Rendered {
  const level = [1, 2, 3, 4].includes(Number(f.level)) ? Number(f.level) : 2;
  const t = str(f.text) || str(f.heading);
  const doc = {
    type: "doc",
    content: [{ type: "heading", attrs: { level }, content: [{ type: "text", text: t }] }],
  };
  return { html: richTextHtml(doc, c), text: t.toUpperCase() };
}

function renderImage(f: Fields, c: BlockCtx): Rendered {
  const src = safeUrl(mediaSrc(f.src ?? f.image), c.baseUrl);
  if (!src) return { html: "", text: "" };
  const alt = str(f.alt);
  const href = linkHref(f.link, c.baseUrl);
  const w = Math.round(c.width);
  const radius = c.theme.radius;
  let img = `<img src="${esc(src)}" width="${w}" alt="${esc(alt)}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:${radius}px;-ms-interpolation-mode:bicubic;">`;
  if (href) img = `<a href="${esc(href)}" style="text-decoration:none;">${img}</a>`;
  const caption = str(f.caption);
  const cap = caption
    ? `<p class="os-muted" style="margin:8px 0 0 0;font-family:${c.theme.bodyFont};font-size:13px;line-height:20px;color:${c.theme.light.muted};">${esc(caption)}</p>`
    : "";
  return {
    html: `<div style="margin:0 0 16px 0;">${img}${cap}</div>`,
    text: [alt ? `[Image: ${alt}]` : "[Image]", caption, href ?? ""].filter(Boolean).join("\n"),
  };
}

function renderButton(f: Fields, c: BlockCtx): Rendered {
  const text = str(f.label) || str(f.text);
  const href = linkHref(f.link ?? f.href ?? f.url, c.baseUrl);
  if (!text || !href) return { html: "", text: "" };
  const t = c.theme;
  const outline = f.variant === "secondary" || f.variant === "outline";
  const align = f.align === "center" ? "center" : f.align === "right" ? "right" : "left";
  const bg = outline ? "transparent" : t.light.accent;
  const color = outline ? t.light.link : t.light.accentText;
  const radius = t.buttonRadius;
  const tdCls = outline ? "os-outline" : "os-btn";
  const aCls = outline ? "os-link" : "os-btn-text";
  const html = `<table role="presentation" align="${align}" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border-collapse:separate;"><tr><td class="${tdCls}" align="center" ${outline ? "" : `bgcolor="${t.light.accent}" `} style="border-radius:${radius}px;background-color:${bg};border:2px solid ${t.light.accent};mso-padding-alt:12px 28px;"><a class="${aCls}" href="${esc(href)}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:${t.bodyFont};font-size:16px;line-height:20px;font-weight:700;color:${color};text-decoration:none;border-radius:${radius}px;">${esc(text)}</a></td></tr></table>`;
  return { html, text: `${text}: ${href}` };
}

function renderLine(_f: Fields, c: BlockCtx): Rendered {
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr><td class="os-hr" height="1" style="height:1px;font-size:1px;line-height:1px;background-color:${c.theme.light.border};border-top:0;">&nbsp;</td></tr></table>`,
    text: "----------------------------------------",
  };
}

const SPACER_SIZES: Record<string, number> = { xs: 8, sm: 16, md: 32, lg: 48, xl: 72 };

function renderSpacer(f: Fields): Rendered {
  const raw = f.size ?? f.height;
  const px =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw in SPACER_SIZES
        ? (SPACER_SIZES[raw] as number)
        : 32;
  const h = Math.max(4, Math.min(200, Math.round(px)));
  return {
    html: `<div style="height:${h}px;line-height:${h}px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</div>`,
    text: "",
  };
}

function renderQuote(f: Fields, c: BlockCtx): Rendered {
  const t = c.theme;
  const doc = f.quote ?? f.content ?? f.text;
  const body = richTextHtml(doc, c, { size: 20, line: 30 }).replace(
    /font-family:[^;]+;/g,
    `font-family:${t.headingFont};font-style:italic;`,
  );
  const name = str(f.name) || str(f.author);
  const role = str(f.role);
  const who = name
    ? `<p class="os-muted" style="margin:0;font-family:${t.bodyFont};font-size:14px;line-height:20px;color:${t.light.muted};"><strong>${esc(name)}</strong>${role ? ` &middot; ${esc(role)}` : ""}</p>`
    : "";
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><td class="os-rule" style="padding:4px 0 4px 20px;border-left:4px solid ${t.light.accent};">${body}${who}</td></tr></table>`,
    text: [`"${richTextPlain(doc, c)}"`, name ? `-- ${name}${role ? `, ${role}` : ""}` : ""]
      .filter(Boolean)
      .join("\n"),
  };
}

function renderSocial(f: Fields, c: BlockCtx): Rendered {
  const raw = Array.isArray(f.profiles)
    ? f.profiles
    : Array.isArray(f.links)
      ? f.links
      : (c.site?.social ?? []);
  const items: { name: string; href: string }[] = [];
  for (const p of raw) {
    if (!isObj(p)) continue;
    const href = safeUrl(p.url ?? p.href, c.baseUrl);
    if (href) items.push({ name: str(p.label) || label(str(p.network)), href });
  }
  if (items.length === 0) return { html: "", text: "" };
  const align = f.align === "left" || f.align === "right" ? f.align : "center";
  const links = items
    .map(
      (i) =>
        `<a class="os-link" href="${esc(i.href)}" style="color:${c.theme.light.link};text-decoration:none;font-weight:600;">${esc(i.name)}</a>`,
    )
    .join(
      ` <span class="os-muted" style="color:${c.theme.light.muted};">&nbsp;&middot;&nbsp;</span> `,
    );
  return {
    html: `<p style="margin:0 0 16px 0;font-family:${c.theme.bodyFont};font-size:14px;line-height:22px;text-align:${align};">${links}</p>`,
    text: items.map((i) => `${i.name}: ${i.href}`).join("\n"),
  };
}

function renderColumns(f: Fields, c: BlockCtx): Rendered {
  const raw = Array.isArray(f.columns) ? f.columns : Array.isArray(f.children) ? f.children : [];
  const cols: Block[][] = raw
    .slice(0, 2)
    .map((col) =>
      Array.isArray(col)
        ? (col as Block[])
        : isObj(col) && Array.isArray(col.blocks)
          ? (col.blocks as Block[])
          : [],
    );
  if (cols.length === 0) return { html: "", text: "" };
  const gutter = 24;
  const colW = Math.floor((c.width - gutter) / cols.length);
  const cells = cols.map((blocks) => {
    const r = renderBlocks(blocks, { ...c, width: colW });
    return r;
  });
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells
    .map(
      (r, i) =>
        `<td class="os-col" width="${colW}" valign="top" style="width:${colW}px;${i > 0 ? `padding-left:${gutter}px;` : ""}">${r.html}</td>`,
    )
    .join("")}</tr></table>`;
  return {
    html,
    text: cells
      .map((r) => r.text)
      .filter(Boolean)
      .join("\n\n"),
  };
}

function renderOne(block: Block, c: BlockCtx): Rendered {
  const f = (isObj(block.fields) ? block.fields : {}) as Fields;
  switch (block.type) {
    case "text":
      return renderText(f, c);
    case "heading":
      return renderHeading(f, c);
    case "image":
      return renderImage(f, c);
    case "button":
      return renderButton(f, c);
    case "line":
    case "divider":
      return renderLine(f, c);
    case "spacer":
      return renderSpacer(f);
    case "quote":
      return renderQuote(f, c);
    case "columns":
      return renderColumns(f, c);
    case "os-internal/html":
      return c.allowRaw ? { html: str(f.html), text: str(f.text) } : { html: "", text: "" };
    case "social-links":
    case "social":
      return renderSocial(f, c);
    default:
      return { html: "", text: "" };
  }
}

/** Render a block list to stacked email HTML (a sequence of divs/tables) and plain text. */
export function renderBlocks(blocks: readonly Block[], c: BlockCtx): Rendered {
  const parts = blocks.map((b) => renderOne(b, c)).filter((r) => r.html);
  return {
    html: parts.map((p) => p.html).join("\n"),
    text: parts
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n\n"),
  };
}
