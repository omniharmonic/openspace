import type { CollectionItem, SiteDocument } from "@openspace/schema";
import { stringify as stringifyYaml } from "yaml";
import type { Licenses, TemplateMeta } from "./define";

/**
 * The repository files of a site document, exactly as site-kit's `writeSiteDocument` writes
 * them (arch §2.1), as a pure function so the Hub can copy a template without a filesystem.
 * A test checks this against `writeSiteDocument` byte for byte.
 */

export const formatJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const pageFileFor = (slug: string) => (slug === "" ? "home.json" : `${slug}.json`);

function itemFile(item: Pick<CollectionItem, "frontmatter" | "body">): string {
  const clean = JSON.parse(JSON.stringify(item.frontmatter)) as Record<string, unknown>;
  const yaml = stringifyYaml(clean, { lineWidth: 0 });
  return `---\n${yaml}---\n${item.body ? `\n${item.body}` : ""}`;
}

/** Site repository files (content + `openspace.json`) for a document. */
export function documentFiles(doc: SiteDocument): Record<string, string> {
  const files: Record<string, string> = {
    "openspace.json": formatJson(doc.config),
    "content/site.json": formatJson(doc.site),
    "content/styles.json": formatJson(doc.styles),
  };
  if (Object.keys(doc.media).length) files["content/media.json"] = formatJson(doc.media);
  for (const page of Object.values(doc.pages))
    files[`content/pages/${pageFileFor(page.slug)}`] = formatJson(page);
  const names = new Set([
    ...Object.keys(doc.collections),
    ...Object.keys(doc.collectionConfigs ?? {}),
  ]);
  for (const name of [...names].sort()) {
    const dir = `content/collections/${name}`;
    const cfg = doc.collectionConfigs?.[name];
    if (cfg) files[`${dir}/_collection.json`] = formatJson(cfg);
    for (const item of Object.values(doc.collections[name] ?? {}))
      files[`${dir}/${item.slug}.mdoc`] = itemFile(item);
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

/** `template.json`: gallery metadata, with each look's Site Styles choices. */
export function templateJson(meta: TemplateMeta): string {
  return formatJson({
    $schema: "https://schema.openspace.dev/v1/template.json",
    id: meta.id,
    name: meta.name,
    description: meta.description,
    persona: meta.persona,
    mood: meta.mood,
    version: meta.version,
    tags: meta.tags,
    sample: meta.sample,
    thumbnailPage: meta.thumbnailPage,
    looks: meta.looks.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      choices: l.styles.choices,
      ...(l.styles.overrides ? { overrides: l.styles.overrides } : {}),
    })),
    pages: meta.pages,
  });
}

/** Every file a template folder holds: the site files, `media/LICENSES.json`, `template.json`. */
export function templateFolderFiles(
  doc: SiteDocument,
  meta: TemplateMeta,
  licenses: Licenses,
): Record<string, string> {
  return {
    ...documentFiles(doc),
    "media/LICENSES.json": formatJson(licenses),
    "template.json": templateJson(meta),
  };
}
