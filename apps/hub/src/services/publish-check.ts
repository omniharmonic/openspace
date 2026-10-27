import { type PublishProblem, publishCheck } from "@omniharmonic/openspace-lint";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { HttpError } from "../lib/errors";

/**
 * The publish gate (arch §5.4): before the draft goes to `main`, check it the way the site's
 * publish run (`openspace check`) will — the document's shape and internal links — and
 * refuse with what to fix instead of letting the run fail after the fact. Warnings (text links
 * that lead nowhere, members-only pages on GitHub Pages) never block.
 */
export function assertPublishable(doc: SiteDocument): { warnings: PublishProblem[] } {
  // Links and the document's shape block; block field differences are left to the site's own
  // check (its pinned block library is the authority on them).
  const r = publishCheck(doc, { blocks: "warning" });
  if (r.ok) return { warnings: r.warnings };
  throw new HttpError(422, "publish_blocked", publishBlockedMessage(r.errors), {
    problems: r.errors,
  });
}

/** "A button on Home links to /book, which isn't a page on your site. …" */
export function publishBlockedMessage(errors: readonly PublishProblem[]): string {
  const shown = errors.slice(0, 3).map((e) => e.message);
  const more = errors.length - shown.length;
  const links = errors.every((e) => e.rule === "link");
  const what = links
    ? errors.length === 1
      ? "Point that link at a page that exists (the Design check can pick one), then publish again."
      : "Point those links at pages that exist (the Design check can pick them), then publish again."
    : "Fix it in the editor, then publish again.";
  return [...shown, ...(more > 0 ? [`…and ${more} more.`] : []), what].join(" ");
}
