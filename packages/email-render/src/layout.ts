import type { Block, Site, Styles } from "@openspace/schema";
import { type ResolveLink, renderBlocks } from "./blocks";
import { EmailRenderError, type EmailWarning } from "./diag";
import { esc, oneLine, safeUrl } from "./escape";
import { buildEmailTheme, darkCss, darkCssOutlook } from "./theme";

export const EMAIL_WIDTH = 600;
const GUTTER = 32;

export interface RenderEmailInput {
  blocks: readonly Block[];
  styles?: Styles;
  site?: Pick<Site, "title" | "tagline" | "logo" | "social" | "locale"> | Site;
  /** Inbox preview text (hidden in the body). */
  preheader?: string;
  /**
   * Footer unsubscribe link (omit for transactional mail). A usable http(s) URL, or
   * `{ mergeTag }` for an ESP placeholder such as `{{unsubscribe}}` emitted verbatim in the href.
   * An unusable value throws `EmailRenderError`.
   */
  unsubscribeUrl?: string | { mergeTag: string };
  /** Absolute URL of the web version; adds a "View in browser" link at the top. Throws if unusable. */
  viewInBrowserUrl?: string;
  /** Public site origin; relative links and `media/...` images resolve against it. */
  baseUrl?: string;
  /** Document `<title>`; defaults to the site title. */
  title?: string;
  /** Extra footer note (e.g. why the recipient got this mail). Plain text. */
  footerNote?: string;
  /** Postal address lines for the footer (required for commercial mail in many jurisdictions). */
  postalAddress?: string | readonly string[];
  /** Resolves page / item / anchor links to absolute URLs; unresolved ones are dropped with a warning. */
  resolveLink?: ResolveLink;
}

export interface RenderedEmail {
  html: string;
  text: string;
  /** Skipped blocks/fields, dropped links, theme fallbacks and substituted colors. */
  warnings: EmailWarning[];
}

export function renderEmail(input: RenderEmailInput): RenderedEmail {
  return renderWith(input, false);
}

const MERGE_TAG_RE = /^[A-Za-z0-9{}%$_[\]|:.*#!-]{3,200}$/;

function unsubscribeTarget(
  v: RenderEmailInput["unsubscribeUrl"],
  baseUrl: string | undefined,
): string | null {
  if (v === undefined) return null;
  if (typeof v === "object") {
    if (!v || !MERGE_TAG_RE.test(v.mergeTag ?? "")) {
      throw new EmailRenderError("unsubscribeUrl.mergeTag is not a valid merge tag");
    }
    return v.mergeTag;
  }
  const u = safeUrl(v, baseUrl);
  if (!u || u.startsWith("mailto:")) {
    throw new EmailRenderError("unsubscribeUrl must be an absolute http(s) URL (or { mergeTag })");
  }
  return u;
}

/** @internal `allowRaw` lets templates inject pre-escaped `os-internal/html` blocks. */
export function renderWith(input: RenderEmailInput, allowRaw: boolean): RenderedEmail {
  const { theme, warnings } = buildEmailTheme(input.styles);
  const { baseUrl } = input;
  const site = input.site;
  const siteTitle = oneLine(site?.title);
  const rawLang = (site?.locale as { lang?: unknown } | undefined)?.lang;
  const lang =
    typeof rawLang === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(rawLang)
      ? rawLang
      : "en";
  const body = renderBlocks(input.blocks, {
    theme,
    baseUrl,
    site,
    width: EMAIL_WIDTH - GUTTER * 2,
    allowRaw,
    resolveLink: input.resolveLink,
    warn: (code, message, path) => warnings.push({ code, message, path }),
  });

  const unsub = unsubscribeTarget(input.unsubscribeUrl, baseUrl);
  const browser =
    input.viewInBrowserUrl === undefined ? null : safeUrl(input.viewInBrowserUrl, baseUrl);
  if (input.viewInBrowserUrl !== undefined && (!browser || browser.startsWith("mailto:"))) {
    throw new EmailRenderError("viewInBrowserUrl must be an absolute http(s) URL");
  }
  const address = (
    typeof input.postalAddress === "string"
      ? [input.postalAddress]
      : [...(input.postalAddress ?? [])]
  )
    .map(oneLine)
    .filter(Boolean);
  const L = theme.light;
  const muted = `font-family:${theme.bodyFont};font-size:13px;line-height:20px;color:${L.muted};`;

  const logoSrc = site?.logo ? safeUrl(site.logo.src, baseUrl) : null;
  const header = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="${esc(site?.logo?.alt || siteTitle)}" width="${Math.min(site?.logo?.width ?? 140, 240)}" style="display:block;border:0;height:auto;max-width:240px;margin:0 auto;">`
    : siteTitle
      ? `<span class="os-heading" style="font-family:${theme.headingFont};font-size:22px;line-height:28px;font-weight:700;color:${L.heading};">${esc(siteTitle)}</span>`
      : "";

  const preheader = oneLine(input.preheader);
  const pre = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    : "";

  const footerLines: string[] = [];
  if (input.footerNote) footerLines.push(esc(oneLine(input.footerNote)));
  if (siteTitle) footerLines.push(`Sent by ${esc(siteTitle)}`);
  if (address.length) footerLines.push(address.map(esc).join(" &middot; "));
  if (address.length) footerLines.push(address.map(esc).join(" &middot; "));
  const unsubHtml = unsub
    ? `<a class="os-link" href="${esc(unsub)}" style="color:${L.link};text-decoration:underline;">Unsubscribe</a>`
    : "";
  const browserHtml = browser
    ? `<a class="os-link" href="${esc(browser)}" style="color:${L.link};text-decoration:underline;">View in browser</a>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="${esc(lang)}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(oneLine(input.title) || siteTitle || "Email")}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
${theme.fontsUrl ? `<!--[if !mso]><!--><link href="${esc(theme.fontsUrl)}" rel="stylesheet" type="text/css"><!--<![endif]-->` : ""}
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}
img{-ms-interpolation-mode:bicubic}
a{word-break:break-word}
@media only screen and (max-width:620px){
.os-container{width:100% !important}
.os-pad{padding-left:20px !important;padding-right:20px !important}
.os-col{display:block !important;width:100% !important;padding-left:0 !important;padding-bottom:8px !important}
}
@media (prefers-color-scheme:dark){
${darkCss(theme)}
}
${darkCssOutlook(theme)}
</style>
</head>
<body class="os-surface" style="margin:0;padding:0;background-color:${L.surface};">
${pre}
<table role="presentation" class="os-surface" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${L.surface};"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="${EMAIL_WIDTH}" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
${browserHtml ? `<table role="presentation" class="os-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${EMAIL_WIDTH}px;"><tr><td align="center" style="padding:0 0 12px 0;"><span class="os-muted" style="${muted}">${browserHtml}</span></td></tr></table>` : ""}
<table role="presentation" class="os-container os-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${EMAIL_WIDTH}px;width:100%;background-color:${L.background};border-radius:${theme.radius}px;">
${header ? `<tr><td class="os-pad" align="center" style="padding:28px ${GUTTER}px 8px ${GUTTER}px;">${header}</td></tr>` : ""}
<tr><td class="os-pad" style="padding:24px ${GUTTER}px 8px ${GUTTER}px;font-family:${theme.bodyFont};color:${L.text};">
${body.html}
</td></tr>
<tr><td class="os-pad os-rule" style="padding:20px ${GUTTER}px 28px ${GUTTER}px;border-top:1px solid ${L.border};" align="center">
${footerLines.map((l) => `<p class="os-muted" style="margin:0 0 6px 0;${muted}text-align:center;">${l}</p>`).join("\n")}
${unsubHtml ? `<p class="os-muted" style="margin:0;${muted}text-align:center;">${unsubHtml}</p>` : ""}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>
`;

  const text = [
    browser ? `View in browser: ${browser}` : "",
    siteTitle ? siteTitle.toUpperCase() : "",
    body.text,
    [
      "--",
      input.footerNote ? oneLine(input.footerNote) : "",
      siteTitle ? `Sent by ${siteTitle}` : "",
      address.join(", "),
      unsub ? `Unsubscribe: ${unsub}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  ]
    .filter((s) => s !== "")
    .join("\n\n")
    .concat("\n");

  return { html, text, warnings };
}

/**
 * RFC 8058 one-click unsubscribe headers for the message (set them on the outgoing mail).
 * `url` must be https; `mailto` optionally adds a fallback address.
 */
export function unsubscribeHeaders(
  url: string,
  opts: { mailto?: string } = {},
): { "List-Unsubscribe": string; "List-Unsubscribe-Post": string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new EmailRenderError("unsubscribeHeaders: url must be an absolute https URL");
  }
  if (u.protocol !== "https:" || /[<>\s]/.test(url)) {
    throw new EmailRenderError("unsubscribeHeaders: url must be an absolute https URL");
  }
  const parts = [`<${u.toString()}>`];
  if (opts.mailto !== undefined) {
    const m = opts.mailto.replace(/^mailto:/i, "");
    if (!/^[^\s@<>,"?]+@[^\s@<>,"?]+$/.test(m)) {
      throw new EmailRenderError("unsubscribeHeaders: mailto is not a valid address");
    }
    parts.push(`<mailto:${m}>`);
  }
  return {
    "List-Unsubscribe": parts.join(", "),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
