import { diff, type Op, stats, summarize } from "@omniharmonic/openspace-ops";
import type { SiteDocument } from "@omniharmonic/openspace-schema";

/** What publishing would change, in plain words ("3 pages edited", "2 images added"). */
export interface ChangeSummary {
  lines: string[];
  /** One sentence, e.g. "Edited Home and About; added 2 images". */
  sentence: string;
  /** Nothing to publish. */
  empty: boolean;
  ops: Op[];
}

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function describeChanges(published: SiteDocument, draft: SiteDocument): ChangeSummary {
  const ops = diff(published, draft);
  if (ops.length === 0) return { lines: [], sentence: "", empty: true, ops };
  const s = stats(ops, published);
  const lines: string[] = [];
  if (s.pagesEdited.length) lines.push(`${n(s.pagesEdited.length, "page")} edited`);
  if (s.pagesCreated.length) lines.push(`${n(s.pagesCreated.length, "page")} added`);
  if (s.pagesDeleted.length) lines.push(`${n(s.pagesDeleted.length, "page")} removed`);
  if (s.footerEdited) lines.push("Footer edited");
  if (s.imagesAdded) lines.push(`${n(s.imagesAdded, "image")} added`);
  if (s.imagesRemoved) lines.push(`${n(s.imagesRemoved, "image")} removed`);
  if (s.filesAdded) lines.push(`${n(s.filesAdded, "file")} added`);
  if (s.stylesChanged.length) lines.push(`Changed ${s.stylesChanged.join(", ")}`);
  if (s.navChanged) lines.push("Navigation updated");
  if (s.siteSettingsChanged) lines.push("Site settings updated");
  if (s.itemsSaved) lines.push(`${n(s.itemsSaved, "post or item", "posts or items")} saved`);
  if (s.itemsDeleted) lines.push(`${n(s.itemsDeleted, "post or item", "posts or items")} deleted`);
  if (lines.length === 0) lines.push(n(ops.length, "change"));
  const sentence = summarize(ops, published);
  return { lines, sentence, empty: false, ops };
}
