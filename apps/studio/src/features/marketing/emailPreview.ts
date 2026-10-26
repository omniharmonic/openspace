import { renderEmail } from "@openspace/email-render";
import type { Block, SiteDocument } from "@openspace/schema";

/** Blocks an email can carry (what @openspace/email-render knows how to draw). */
export const EMAIL_BLOCKS = [
  "text",
  "heading",
  "image",
  "button",
  "quote",
  "columns",
  "line",
  "divider",
  "spacer",
  "social-links",
] as const;

export interface EmailPreview {
  html: string;
  text: string;
  warnings: string[];
}

/**
 * Render a campaign in the browser with the same renderer the Hub sends with, for the live
 * desktop / phone / dark previews. The unsubscribe link stays a placeholder the Hub fills in.
 */
export function previewEmail(
  doc: Pick<SiteDocument, "site" | "styles">,
  input: { blocks: readonly Block[]; preheader?: string | null; subject: string; baseUrl: string },
): EmailPreview {
  try {
    const r = renderEmail({
      blocks: input.blocks,
      styles: doc.styles,
      site: doc.site,
      preheader: input.preheader ?? undefined,
      title: input.subject,
      baseUrl: input.baseUrl,
      unsubscribeUrl: { mergeTag: "{{os_unsubscribe}}" },
      footerNote: "You are receiving this because you subscribed to our newsletter.",
    });
    return { html: r.html, text: r.text, warnings: r.warnings.map((w) => w.message) };
  } catch (err) {
    return {
      html: `<!doctype html><p style="font-family:system-ui;padding:24px">This email can't be shown yet: ${String((err as Error).message).replace(/[<&]/g, "")}</p>`,
      text: "",
      warnings: [(err as Error).message],
    };
  }
}

/** Force the email's dark-mode styles on (for the "Dark" preview) regardless of the OS setting. */
export function forceDark(html: string): string {
  return html
    .replace(/@media\s*\(prefers-color-scheme:\s*dark\)/g, "@media all")
    .replace(/<head>/i, '<head><meta name="color-scheme" content="dark">');
}

/** Disable links inside the preview (it's a picture of the email, not a browser). */
export function inertLinks(html: string): string {
  return html.replace(
    /<head>/i,
    '<head><base target="_blank"><style>a{pointer-events:none}</style>',
  );
}
