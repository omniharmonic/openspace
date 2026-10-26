import type { Block, Site } from "@openspace/schema";
import type { Warn } from "./diag";
import { esc, safeUrl } from "./escape";
import { type RtCtx, richTextHtml, richTextPlain } from "./richtext";

export type ResolveLink = (link: Record<string, unknown>) => string | undefined | null;

export interface BlockCtx extends RtCtx {
  site?: Pick<Site, "title" | "social">;
  /** Available content width in px (600 minus gutters, or a column's share). */
  width: number;
  warn: Warn;
  /** Resolves page / item / anchor links to absolute URLs. */
  resolveLink?: ResolveLink;
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

/** Resolve a schema `Link` (or a plain href string) to an absolute safe URL, or null (with a warning). */
export function linkHref(link: unknown, c: BlockCtx, path: string): string | null {
  if (link === undefined || link === null || link === "") return null;
  if (typeof link === "string") {
    const u = safeUrl(link, c.baseUrl);
    if (!u) c.warn("unresolved-link", `Link "${link}" is not a safe absolute URL.`, path);
    return u;
  }
  if (!isObj(link)) return null;
  let url: string | null = null;
  switch (link.type) {
    case "url":
      url = safeUrl(link.url, c.baseUrl);
      break;
    case "email": {
      const email = str(link.email);
      if (/^[^\s@<>"]+@[^\s@<>"]+$/.test(email)) {
        const subject = str(link.subject);
        url = `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
      }
      break;
    }
    case "file":
      url = safeUrl(link.src, c.baseUrl);
      break;
    case "phone":
      c.warn("unsupported-link", "Phone links are not allowed in email.", path);
      return null;
    default: {
      const resolved = c.resolveLink?.(link);
      url = resolved ? safeUrl(resolved, c.baseUrl) : null;
      if (!url) {
        c.warn(
          "unresolved-link",
          `${String(link.type)} link needs resolveLink() to produce an absolute URL.`,
          path,
        );
      }
    }
  }
  if (!url) c.warn("unresolved-link", "Link could not be resolved to a safe URL.", path);
  return url;
}

const align = (v: unknown): "left" | "center" | "right" => {
  const a = isObj(v) ? v.d : v;
  return a === "center" ? "center" : a === "end" || a === "right" ? "right" : "left";
};

function mediaSrc(v: unknown): string {
  if (typeof v === "string") return v;
  if (isObj(v)) return str(v.src) || str(v.url);
  return "";
}

function renderText(f: Fields, c: BlockCtx, a: RenderArgs): Rendered {
  const doc = f.content ?? f.text ?? f.body;
  return {
    html: richTextHtml(doc, c, { align: a.align }),
    text: richTextPlain(doc, c),
  };
}

function renderHeading(f: Fields, c: BlockCtx, a: RenderArgs): Rendered {
  const level = [1, 2, 3, 4].includes(Number(f.level)) ? Number(f.level) : 2;
  const t = (str(f.text) || str(f.heading)).trim();
  if (!t) return { html: "", text: "" };
  const doc = {
    type: "doc",
    content: [{ type: "heading", attrs: { level }, content: [{ type: "text", text: t }] }],
  };
  return { html: richTextHtml(doc, c, { align: a.align }), text: t.toUpperCase() };
}

function renderImage(f: Fields, c: BlockCtx, a: RenderArgs): Rendered {
  const img = f.image ?? f.src;
  const src = safeUrl(mediaSrc(img), c.baseUrl);
  if (!src) {
    c.warn("invalid-field", "Image has no usable src.", `${a.path}.image`);
    return { html: "", text: "" };
  }
  const alt = isObj(img) ? str(img.alt) : str(f.alt);
  const href = linkHref(f.link, c, `${a.path}.link`);
  // Never upscale: cap at the image's intrinsic width when known.
  const natural =
    isObj(img) && typeof img.width === "number" ? img.width : Number.POSITIVE_INFINITY;
  const w = Math.max(1, Math.round(Math.min(c.width, natural)));
  const radius = c.theme.radius;
  const wrapAlign = a.align === "left" ? "left" : a.align;
  let tag = `<img src="${esc(src)}" width="${w}" alt="${esc(alt)}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:${radius}px;-ms-interpolation-mode:bicubic;">`;
  if (href) tag = `<a href="${esc(href)}" style="text-decoration:none;">${tag}</a>`;
  const caption = str(f.caption);
  const cap = caption
    ? `<p class="os-muted" style="margin:8px 0 0 0;font-family:${c.theme.bodyFont};font-size:13px;line-height:20px;color:${c.theme.light.muted};text-align:${wrapAlign};">${esc(caption)}</p>`
    : "";
  const inner = `<table role="presentation" align="${wrapAlign}" width="${w}" cellpadding="0" cellspacing="0" border="0" style="width:${w}px;max-width:100%;"><tr><td>${tag}${cap}</td></tr></table>`;
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;"><tr><td align="${wrapAlign}">${inner}</td></tr></table>`,
    text: [alt ? `[Image: ${alt}]` : "[Image]", caption, href ?? ""].filter(Boolean).join("\n"),
  };
}

type ButtonRole = "primary" | "secondary" | "tertiary";

function oneButton(
  t: BlockCtx["theme"],
  text: string,
  href: string,
  role: ButtonRole,
  full: boolean,
): string {
  const radius = t.buttonRadius;
  if (role === "tertiary") {
    return `<a class="os-link" href="${esc(href)}" target="_blank" style="display:inline-block;padding:12px 4px;font-family:${t.bodyFont};font-size:16px;line-height:20px;font-weight:700;color:${t.light.link};text-decoration:underline;">${esc(text)}</a>`;
  }
  const outline = role === "secondary";
  const bg = outline ? "transparent" : t.light.accent;
  const color = outline ? t.light.link : t.light.accentText;
  const tdCls = outline ? "os-outline" : "os-btn";
  const aCls = outline ? "os-link" : "os-btn-text";
  const bgAttr = outline ? "" : `bgcolor="${t.light.accent}" `;
  return `<table role="presentation" ${full ? 'width="100%" ' : ""}cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;${full ? "width:100%;" : ""}"><tr><td class="${tdCls}" align="center" ${bgAttr}style="border-radius:${radius}px;background-color:${bg};border:2px solid ${t.light.accent};mso-padding-alt:12px 28px;"><a class="${aCls}" href="${esc(href)}" target="_blank" style="display:${full ? "block" : "inline-block"};padding:12px 28px;font-family:${t.bodyFont};font-size:16px;line-height:20px;font-weight:700;color:${color};text-decoration:none;border-radius:${radius}px;">${esc(text)}</a></td></tr></table>`;
}

function renderButton(f: Fields, c: BlockCtx, a: RenderArgs, variant?: string): Rendered {
  const t = c.theme;
  const text = str(f.label) || str(f.text);
  const href = linkHref(f.link ?? f.href ?? f.url, c, `${a.path}.link`);
  if (!text || !href) {
    if (text) c.warn("invalid-field", "Button skipped: no usable link.", a.path);
    return { html: "", text: "" };
  }
  const full = variant === "full-width";
  const role: ButtonRole =
    f.role === "secondary" || f.role === "tertiary"
      ? f.role
      : f.variant === "secondary" || f.variant === "outline"
        ? "secondary"
        : "primary";
  const second: ButtonRole = role === "primary" ? "secondary" : "tertiary";
  const items = [{ label: text, href, role }];
  const text2 = str(f.secondaryLabel);
  if (text2 && f.secondaryLink) {
    const href2 = linkHref(f.secondaryLink, c, `${a.path}.secondaryLink`);
    if (href2) items.push({ label: text2, href: href2, role: second });
  }
  const cells = items
    .map(
      (it, i) =>
        `<td style="${i > 0 ? "padding-left:12px;" : ""}">${oneButton(t, it.label, it.href, it.role, full && items.length === 1)}</td>`,
    )
    .join("");
  const note = str(f.note);
  const noteHtml = note
    ? `<p class="os-muted" style="margin:8px 0 0 0;font-family:${t.bodyFont};font-size:13px;line-height:20px;color:${t.light.muted};text-align:${a.align};">${esc(note)}</p>`
    : "";
  const row = `<table role="presentation" ${full ? 'width="100%" ' : ""}cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;"><tr><td align="${a.align}">${row}${noteHtml}</td></tr></table>`,
    text: [...items.map((it) => `${it.label}: ${it.href}`), note].filter(Boolean).join("\n"),
  };
}

function renderLine(f: Fields, c: BlockCtx, variant: string | undefined, path: string): Rendered {
  const t = c.theme;
  for (const k of ["thickness", "length"] as const) {
    const ok = k === "thickness" ? ["hairline", "regular", "bold"] : ["full", "half", "short"];
    if (f[k] !== undefined && !ok.includes(String(f[k]))) {
      c.warn(
        "invalid-field",
        `Unknown line ${k} "${String(f[k])}"; using default.`,
        `${path}.${k}`,
      );
    }
  }
  if (str(f.color) && !c.theme.colors[str(f.color)]) {
    c.warn("invalid-field", `Unknown line color "${str(f.color)}"; using border.`, `${path}.color`);
  }
  const px = f.thickness === "bold" ? 4 : f.thickness === "regular" ? 2 : 1;
  const key = str(f.color);
  const given = key ? t.colors[key] : undefined;
  const color = given ?? t.light.border;
  const pct = f.length === "short" ? 12 : f.length === "half" ? 50 : 100;
  const style = variant === "dashed" || variant === "dotted" ? variant : "solid";
  // Dark mode re-colors only the default border color; custom palette colors stay as chosen.
  const cls = given && key !== "border" ? "" : ' class="os-hr os-rule"';
  const inner =
    style === "solid"
      ? `<td${cls} height="${px}" style="height:${px}px;font-size:1px;line-height:${px}px;background-color:${color};">&nbsp;</td>`
      : `<td${cls} height="${px}" style="height:${px}px;font-size:1px;line-height:${px}px;border-top:${px}px ${style} ${color};">&nbsp;</td>`;
  return {
    html: `<table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;width:${pct}%;"><tr>${inner}</tr></table>`,
    text: "----------------------------------------",
  };
}

// Pixel sizes for the spacing tokens (email has no fluid scale).
const SPACER_PX: Record<string, number> = {
  none: 0,
  "3xs": 4,
  "2xs": 8,
  xs: 12,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
  "2xl": 64,
  "3xl": 96,
};

function renderSpacer(f: Fields, c: BlockCtx, path: string): Rendered {
  const raw = f.height ?? f.size;
  let px = 32;
  if (typeof raw === "number" && Number.isFinite(raw)) px = raw;
  else if (typeof raw === "string" && raw in SPACER_PX) px = SPACER_PX[raw] as number;
  else if (raw !== undefined)
    c.warn(
      "invalid-field",
      `Unknown spacer height "${String(raw)}"; using 32px.`,
      `${path}.height`,
    );
  const h = Math.max(0, Math.min(200, Math.round(px)));
  if (h === 0) return { html: "", text: "" };
  return {
    html: `<div style="height:${h}px;line-height:${h}px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</div>`,
    text: "",
  };
}

function renderQuote(f: Fields, c: BlockCtx, a: RenderArgs): Rendered {
  const t = c.theme;
  const doc = f.quote ?? f.content ?? f.text;
  const body = richTextHtml(doc, c, { size: 20, line: 30, display: true });
  const name = str(f.attribution) || str(f.name) || str(f.author);
  const source = str(f.source) || str(f.role);
  const who =
    name || source
      ? `<p class="os-muted" style="margin:0;font-family:${t.bodyFont};font-size:14px;line-height:20px;color:${t.light.muted};">${name ? `<strong>${esc(name)}</strong>` : ""}${name && source ? " &middot; " : ""}${source ? `<em>${esc(source)}</em>` : ""}</p>`
      : "";
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><td class="os-outline" style="padding:4px 0 4px 20px;border-left:4px solid ${t.light.accent};text-align:${a.align};">${body}${who}</td></tr></table>`,
    text: [
      `"${richTextPlain(doc, c)}"`,
      name || source ? `-- ${[name, source].filter(Boolean).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function renderSocial(f: Fields, c: BlockCtx, a: RenderArgs): Rendered {
  const custom = Array.isArray(f.profiles) ? f.profiles : Array.isArray(f.links) ? f.links : [];
  const raw = f.source === "custom" ? custom : (c.site?.social ?? []);
  const items: { name: string; href: string }[] = [];
  for (const p of raw) {
    if (!isObj(p)) continue;
    const href = safeUrl(p.url ?? p.href, c.baseUrl);
    if (href) items.push({ name: str(p.label) || label(str(p.network)), href });
    else c.warn("unresolved-link", "Social profile URL unusable; skipped.", `${a.path}.profiles`);
  }
  if (items.length === 0) return { html: "", text: "" };
  const heading = str(f.label);
  const links = items
    .map(
      (i) =>
        `<a class="os-link" href="${esc(i.href)}" style="color:${c.theme.light.link};text-decoration:none;font-weight:600;">${esc(i.name)}</a>`,
    )
    .join(
      ` <span class="os-muted" style="color:${c.theme.light.muted};">&nbsp;&middot;&nbsp;</span> `,
    );
  const head = heading
    ? `<p class="os-muted" style="margin:0 0 6px 0;font-family:${c.theme.bodyFont};font-size:13px;line-height:20px;color:${c.theme.light.muted};text-align:${a.align};">${esc(heading)}</p>`
    : "";
  return {
    html: `${head}<p style="margin:0 0 16px 0;font-family:${c.theme.bodyFont};font-size:14px;line-height:22px;text-align:${a.align};">${links}</p>`,
    text: [heading, ...items.map((i) => `${i.name}: ${i.href}`)].filter(Boolean).join("\n"),
  };
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function renderColumns(f: Fields, c: BlockCtx, a: RenderArgs): Rendered {
  // Real shape: items [{image, heading, body, link, linkLabel}] + columns "2"|"3"|"4".
  // Legacy/tolerant shape: columns = Block[][].
  let cells: Block[][] = [];
  const itemsRaw = Array.isArray(f.items) ? f.items : null;
  if (itemsRaw) {
    cells = itemsRaw.filter(isObj).map((it, i) => {
      const mk = (type: string, fields: Fields): Block => ({
        id: `blk_col${i}${type}` as Block["id"],
        type,
        v: 1,
        fields,
      });
      const out: Block[] = [];
      if (it.image) out.push(mk("image", { image: it.image }));
      if (str(it.heading)) out.push(mk("heading", { text: it.heading, level: 3 }));
      if (it.body) out.push(mk("text", { content: it.body }));
      if (it.link && str(it.linkLabel)) {
        out.push(mk("button", { label: it.linkLabel, link: it.link, role: "tertiary" }));
      }
      return out;
    });
  } else if (Array.isArray(f.columns)) {
    cells = f.columns.map((col) =>
      Array.isArray(col)
        ? (col as Block[])
        : isObj(col) && Array.isArray(col.blocks)
          ? (col.blocks as Block[])
          : [],
    );
  }
  if (cells.length === 0) return { html: "", text: "" };
  const requested = Number.parseInt(str(f.columns), 10);
  // 4 columns would be ~120px wide; fall back to 2 per row.
  const perRow = Math.min(
    cells.length,
    requested === 4 ? 2 : Number.isFinite(requested) && requested >= 2 ? requested : 2,
    3,
  );
  const gutter = 24;
  const colW = Math.floor((c.width - gutter * (perRow - 1)) / perRow);
  const texts: string[] = [];
  const chunks = chunk(cells, perRow);
  const rows = chunks.map((row, ri) => {
    const lastRow = ri === chunks.length - 1;
    const tds = row
      .map((blocks, i) => {
        const r = renderBlocks(
          blocks,
          { ...c, width: colW },
          `${a.path}.items[${ri * perRow + i}]`,
        );
        if (r.text) texts.push(r.text);
        return `<td class="os-col" width="${colW}" valign="top" style="width:${colW}px;${i > 0 ? `padding-left:${gutter}px;` : ""}${lastRow ? "" : "padding-bottom:16px;"}">${r.html}</td>`;
      })
      .join("");
    return `<tr>${tds}</tr>`;
  });
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table>`,
    text: texts.join("\n\n"),
  };
}

interface RenderArgs {
  path: string;
  align: "left" | "center" | "right";
}

function renderOne(block: Block, c: BlockCtx, path: string): Rendered {
  const f = (isObj(block.fields) ? block.fields : {}) as Fields;
  const style = block.style as { align?: unknown } | undefined;
  const args: RenderArgs = { path, align: align(f.align ?? style?.align) };
  switch (block.type) {
    case "text":
      return renderText(f, c, args);
    case "heading":
      return renderHeading(f, c, args);
    case "image":
      return renderImage(f, c, args);
    case "button":
      return renderButton(f, c, args, block.variant);
    case "line":
    case "divider":
      return renderLine(f, c, block.variant, path);
    case "spacer":
      return renderSpacer(f, c, path);
    case "quote":
      return renderQuote(f, c, args);
    case "columns":
      return renderColumns(f, c, args);
    case "social-links":
    case "social":
      return renderSocial(f, c, args);
    case "os-internal/html":
      return c.allowRaw ? { html: str(f.html), text: str(f.text) } : { html: "", text: "" };
    default:
      c.warn("unknown-block", `Block type "${block.type}" has no email renderer; skipped.`, path);
      return { html: "", text: "" };
  }
}

/** Render a block list to stacked email HTML and plain text. */
export function renderBlocks(blocks: readonly Block[], c: BlockCtx, path = "blocks"): Rendered {
  const parts = blocks.map((b, i) => renderOne(b, c, `${path}[${i}]`)).filter((r) => r.html);
  return {
    html: parts.map((p) => p.html).join("\n"),
    text: parts
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n\n"),
  };
}
