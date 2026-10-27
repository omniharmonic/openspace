/**
 * DEV_MODE emulation of the import workflow (DevGitHubAccess runs it when the Hub dispatches
 * `openspace-import.yml`): instead of running the CLI, it commits a small, valid imported site
 * named after the address — two pages, a report with something to look at, a setup checklist —
 * reports progress the way the real run does, and starts the publish. An address containing
 * `fail.` fails the run in "Bringing pages across", so the error path can be exercised too.
 */
import { newId, type Page, type SiteConfig } from "@omniharmonic/openspace-schema";
import { updateImport } from "../db/imports";
import type { DevWorkflowRunner } from "../github/dev";
import {
  IMPORT_HELPER_PATH,
  IMPORT_REQUEST_PATH,
  IMPORT_WORKFLOW_PATH,
  type ImportRequest,
} from "../templates/import-workflow";
import { guessSiteName, parseImportSource, placeholderDocument } from "./import-site";
import { siteDocumentToFiles } from "./site-files";

const text = (t: string, level?: 1 | 2) => ({
  type: "doc",
  content: [
    level
      ? { type: "heading", attrs: { level }, content: [{ type: "text", text: t }] }
      : { type: "paragraph", content: [{ type: "text", text: t }] },
  ],
});

function section(blocks: string[][]) {
  return {
    id: newId("sec"),
    layout: { mode: "stack", columns: { d: [12] } },
    style: { colorTheme: "light", padding: { d: "lg" } },
    blocks: blocks.map(([t, level]) => ({
      id: newId("blk"),
      type: "text",
      v: 1,
      fields: { content: text(t as string, level ? (Number(level) as 1 | 2) : undefined) },
    })),
  };
}

export function devImportRunner(db: D1Database): DevWorkflowRunner {
  return async (gh, repo, input) => {
    const head = await gh.getRef(repo, input.ref);
    const raw = head ? await gh.readFile(repo, IMPORT_REQUEST_PATH, head) : null;
    const cfgText = head ? await gh.readFile(repo, "openspace.json", head) : null;
    if (!head || !raw || !cfgText)
      return { conclusion: "failure", failedStep: "Reading your site", failedLog: "No request." };
    const req = JSON.parse(raw) as ImportRequest;
    const config = JSON.parse(cfgText) as SiteConfig;
    const progress = (phase: string, counts?: object) =>
      updateImport(
        db,
        req.id,
        {
          state: "running",
          phase: phase as never,
          ...(counts ? { counts_json: JSON.stringify(counts) } : {}),
        },
        Date.now(),
      );
    await progress("reading");
    await progress("importing");
    if (/fail\./i.test(req.source))
      return {
        conclusion: "failure",
        failedStep: "Bringing pages across",
        failedLog: `Error: Couldn't read ${req.source}. Check the address and that the site is public.`,
      };
    let label = req.source;
    let title = "Imported site";
    try {
      const src = parseImportSource(req.source);
      label = src.label;
      title = guessSiteName(src);
    } catch {
      // keep the defaults
    }
    const doc = placeholderDocument({
      siteId: config.siteId,
      name: title,
      hubUrl: config.hub,
      deployUrl: config.deploy.url,
      sourceLabel: label,
    });
    doc.config = config;
    const home = Object.values(doc.pages)[0] as Page;
    home.seo = { title: null, description: `Welcome to ${title}.` } as Page["seo"];
    home.sections = [
      section([
        [`Welcome to ${title}`, "1"],
        [`This page came across from ${label} (an emulated import in development mode).`],
      ]),
    ] as unknown as Page["sections"];
    const aboutId = newId("pg") as Page["id"];
    doc.pages[aboutId] = {
      $schema: "https://schema.openspace.host/v1/page.json",
      id: aboutId,
      title: "About",
      slug: "about",
      seo: { title: null, description: `About ${title}.` },
      sections: [section([["About us", "1"], [`${title} has been around for years.`]])],
    } as unknown as Page;
    doc.site.nav = [
      { type: "page", page: home.id, label: "Home" },
      { type: "page", page: aboutId, label: "About" },
    ] as typeof doc.site.nav;
    const counts = { pages: 2, items: 0, media: 0, redirects: 1, title, platform: "generic" };
    await progress("imported", counts);
    const report = [
      `# Import report: ${title}`,
      "",
      `Imported from ${req.source} (development emulation).`,
      "",
      "## Summary",
      "",
      "- **2** pages, **0** collection items in 0 collection(s)",
      "",
      "## Needs attention",
      "",
      "### Forms and newsletter",
      "",
      `- Newsletter signup recreated. Subscribers are not moved: export your list from ${label} and import it here. _(/)_`,
      "",
      "### Links",
      "",
      "- 1 link was still a placeholder; its button was left out until you add the real address. _(site)_",
      "",
      "## Next steps",
      "",
      "1. Look around in Studio.",
      "",
    ].join("\n");
    const checklist = {
      version: 1,
      source: "import",
      from: label,
      items: [
        {
          id: "newsletter",
          kind: "newsletter",
          title: "Bring your newsletter subscribers",
          detail: `Sign-up forms came across, but subscribers stay with ${label}. Export them there and import them here.`,
          status: "todo",
        },
      ],
    };
    await progress("checking");
    await progress("saving");
    const files = siteDocumentToFiles(doc);
    const existing = await gh.readFiles(repo, head, { prefix: "content/pages/", textOnly: true });
    const changes = [
      ...Object.entries(files).map(([path, content]) => ({ path, content })),
      { path: "IMPORT-REPORT.md", content: report },
      { path: "content/setup-checklist.json", content: `${JSON.stringify(checklist, null, 2)}\n` },
      { path: IMPORT_REQUEST_PATH, content: null },
      ...Object.keys(existing)
        .filter((p) => !(p in files))
        .map((path) => ({ path, content: null })),
    ];
    if (req.mode === "convert")
      for (const p of Object.keys(await gh.readFiles(repo, head, { textOnly: false })))
        if (
          !(p in files) &&
          !(req.keep ?? []).includes(p) &&
          !/^(?:\.github\/|README|LICEN|CNAME$|\.gitignore$)/.test(p) &&
          p !== IMPORT_HELPER_PATH &&
          p !== IMPORT_WORKFLOW_PATH &&
          !changes.some((c) => c.path === p)
        )
          changes.push({ path: p, content: null });
    const commit = await gh.commitFiles(repo, {
      branch: input.ref,
      files: changes,
      message:
        req.mode === "convert"
          ? "Make this site editable in OpenSpace"
          : `Move ${req.source} into OpenSpace`,
      author: { name: "OpenSpace" },
    });
    await progress("saved");
    if (req.mode === "url") {
      await gh.dispatchWorkflow(repo, { workflow: "publish.yml", ref: "main" });
      await progress("publishing");
    }
    void commit;
    return { conclusion: "success" };
  };
}
