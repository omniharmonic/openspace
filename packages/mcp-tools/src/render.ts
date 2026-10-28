/**
 * Preview HTML through the one renderer (ADR-3): a whole page, or a single section rendered as a
 * page of its own (header and footer included so it is styled exactly as on the site), or just
 * the section's markup (`fragment`).
 */
import { blocksStyleTag, registerAll } from "@omniharmonic/openspace-blocks";
import { renderPageHtml } from "@omniharmonic/openspace-renderer";
import type { Page, SiteDocument } from "@omniharmonic/openspace-schema";
import { ToolError } from "./errors";

let registered = false;

export interface PreviewOptions {
  /** Render only this section (as a one-section page). */
  sectionId?: string;
  /** Return only the inner HTML of `<main>` instead of a full document. */
  fragment?: boolean;
  basePath?: string;
  /** Behaviors URL; previews without a server can't run behaviors (static markup only). */
  behaviorsUrl?: string;
  /** Render exactly as published (no editor-only notes), e.g. for the Phone check. */
  production?: boolean;
}

export function renderPreviewHtml(
  doc: SiteDocument,
  pageId: string,
  opts: PreviewOptions = {},
): string {
  if (!registered) {
    registerAll();
    registered = true;
  }
  const page = doc.pages[pageId as Page["id"]];
  if (!page) throw new ToolError(`No page ${pageId}.`, "not_found");
  let target: Page | string = pageId;
  if (opts.sectionId) {
    const section = page.sections.find((s) => s.id === opts.sectionId);
    if (!section)
      throw new ToolError(
        `No section ${opts.sectionId} on ${pageId}. Sections: ${page.sections.map((s) => s.id).join(", ")}.`,
        "not_found",
      );
    target = { ...page, sections: [{ ...section, hidden: false }] };
  }
  const html = renderPageHtml({
    doc,
    pageId: target,
    mode: opts.production ? "production" : "preview",
    basePath: opts.basePath ?? "",
    behaviorsUrl: opts.behaviorsUrl,
    extraHead: blocksStyleTag(),
  });
  if (!opts.fragment) return html;
  const m = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html);
  return (m?.[1] ?? html).trim();
}
