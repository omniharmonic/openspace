/**
 * The pieces of a hosted import that don't talk to GitHub: what the person pasted (an address
 * or a GitHub repository), a name for the new site, and the repository's first files — the
 * starter shell, a placeholder page ("We're moving your site here") that publishes cleanly
 * while the import runs, and the import workflow with its request.
 */
import {
  CURRENT_SCHEMA_VERSION,
  newId,
  type Page,
  type SiteDocument,
  type SiteId,
  type Styles,
} from "@omniharmonic/openspace-schema";
import { type ImportRequest, importFiles } from "../templates/import-workflow";
import { STARTER_SITE_FILES } from "../templates/starter-files";
import { siteDocumentToFiles } from "./site-files";

export interface ImportSource {
  kind: "url" | "github";
  /** What the importer is given: a normalized https address, or `owner/name`. */
  source: string;
  /** For people: `maya-yoga.com`, `life-culture/powerwith`. */
  label: string;
  /** The GitHub repository, when the source is one (or a github.io site). */
  github?: { owner: string; repo: string; pagesUrl?: string };
}

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/** Hosts that are never someone's public website. */
function privateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(?:127|10|0)\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(h) ||
    h === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(h) ||
    !h.includes(".")
  );
}

export class ImportSourceError extends Error {}

/** Read what the person pasted: a web address, a github.io site or a GitHub repository. */
export function parseImportSource(input: string): ImportSource {
  const s = input.trim();
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(s);
  if (ssh) return github(ssh[1] as string, ssh[2] as string);
  const short = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/.exec(s);
  if (short && NAME.test(short[1] as string) && REPO.test(short[2] as string))
    return github(short[1] as string, short[2] as string);
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw new ImportSourceError(
      "That doesn't look like a web address. Try something like www.example.com.",
    );
  }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    throw new ImportSourceError("Use the site's web address, starting with https://.");
  if (u.username || u.password)
    throw new ImportSourceError("Leave out any user name or password in the address.");
  if (privateHost(u.hostname))
    throw new ImportSourceError(
      "That address isn't a public website. Use the address people visit.",
    );
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "github.com" || host === "www.github.com") {
    const [owner, repo] = parts;
    if (owner && repo && NAME.test(owner) && REPO.test(repo.replace(/\.git$/, "")))
      return github(owner, repo.replace(/\.git$/, ""));
    throw new ImportSourceError("Use the repository's address, like github.com/you/your-site.");
  }
  const pages = /^([a-z0-9-]+)\.github\.io$/.exec(host);
  if (pages) {
    const owner = pages[1] as string;
    const first = parts[0];
    const repo =
      first && REPO.test(first) && !/\.[a-z0-9]{2,5}$/i.test(first) ? first : `${owner}.github.io`;
    const pagesUrl =
      repo === `${owner}.github.io` ? `https://${host}/` : `https://${host}/${repo}/`;
    return {
      kind: "url",
      source: pagesUrl,
      label: `${host}${repo === first ? `/${repo}` : ""}`,
      github: { owner, repo, pagesUrl },
    };
  }
  u.protocol = "https:";
  u.hash = "";
  return { kind: "url", source: u.toString(), label: host.replace(/^www\./, "") };
}

function github(owner: string, repo: string): ImportSource {
  return {
    kind: "github",
    source: `${owner}/${repo}`,
    label: `${owner}/${repo}`,
    github: { owner, repo },
  };
}

/** A friendly default name: `maya-yoga.com` → "Maya Yoga", `life-culture/powerwith` → "Powerwith". */
export function guessSiteName(src: ImportSource): string {
  let base: string;
  if (src.github && (src.kind === "github" || src.github.pagesUrl)) {
    base = src.github.repo.replace(/\.github\.io$/i, "");
    if (!base || base.toLowerCase() === src.github.owner.toLowerCase()) base = src.github.owner;
  } else {
    const host = new URL(src.source).hostname.replace(/^www\./, "");
    const platform =
      /\.(?:squarespace\.com|wixsite\.com|webflow\.io|wordpress\.com|carrd\.co|framer\.(?:website|app|ai)|weebly\.com|ghost\.io)$/i;
    base = platform.test(host)
      ? (host.split(".")[0] as string)
      : host.split(".").slice(0, -1).join(" ");
  }
  const words = base
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return (words.join(" ") || "My site").slice(0, 80);
}

const doc = (text: string, level?: 1 | 2) => ({
  type: "doc",
  content: [
    level
      ? { type: "heading", attrs: { level }, content: [{ type: "text", text }] }
      : { type: "paragraph", content: [{ type: "text", text }] },
  ],
});

/** A calm default look; the import replaces it with the old site's. */
const PLACEHOLDER_STYLES: Styles = {
  $schema: "https://schema.openspace.host/v1/styles.json",
  choices: {
    palette: {
      brand: "oklch(0.45 0.05 250)",
      neutral: "warm",
      contrast: "standard",
      source: "curated",
    },
    pairing: "fraunces-hanken",
    density: "comfortable",
    shape: "soft",
    buttons: "solid",
    motion: "subtle",
    imageTreatment: "none",
  },
} as Styles;

/** The page the new address shows for the minute or two before the import lands. */
export function placeholderDocument(input: {
  siteId: string;
  name: string;
  hubUrl: string;
  deployUrl: string;
  sourceLabel: string;
}): SiteDocument {
  const home = newId("pg") as Page["id"];
  const page = {
    $schema: "https://schema.openspace.host/v1/page.json",
    id: home,
    title: "Home",
    slug: "",
    seo: { title: null, description: `${input.name} is moving here.`, noindex: true },
    sections: [
      {
        id: newId("sec"),
        layout: { mode: "stack", columns: { d: [12] }, align: "center", width: "narrow" },
        style: { colorTheme: "light", padding: { d: "xl", m: "lg" }, minHeight: { d: "70vh" } },
        blocks: [
          { id: newId("blk"), type: "text", v: 1, fields: { content: doc(input.name, 1) } },
          {
            id: newId("blk"),
            type: "text",
            v: 1,
            fields: {
              content: doc(
                `We're moving this site here from ${input.sourceLabel}. It will be ready in a few minutes.`,
              ),
            },
          },
        ],
      },
    ],
  } as unknown as Page;
  return {
    config: {
      $schema: "https://schema.openspace.host/v1/site-config.json",
      siteId: input.siteId as SiteId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      template: { id: "import", version: "1.0.0" },
      hub: input.hubUrl,
      deploy: { target: "github-pages", url: input.deployUrl, customDomain: null },
      features: { forms: true, newsletter: false, analytics: false, search: true },
    },
    site: {
      $schema: "https://schema.openspace.host/v1/site.json",
      title: input.name.slice(0, 120),
      nav: [{ type: "page", page: home, label: "Home" }],
      header: {
        variant: "classic-left",
        sticky: false,
        transparentOnHero: false,
        mobileMenu: "slide",
      },
      footer: {
        id: newId("sec"),
        layout: { mode: "stack", columns: { d: [12] }, align: "center" },
        style: { colorTheme: "light", padding: { d: "md" } },
        blocks: [{ id: newId("blk"), type: "text", v: 1, fields: { content: doc(input.name) } }],
      },
      locale: "en",
    },
    styles: PLACEHOLDER_STYLES,
    pages: { [home]: page },
    collections: {},
    media: {},
  } as unknown as SiteDocument;
}

/** The shell (GitHub Pages), with the package named after the repository. */
export function shellFiles(repoName: string): Record<string, string> {
  const files: Record<string, string> = { ...STARTER_SITE_FILES };
  try {
    const pkg = JSON.parse(files["package.json"] ?? "{}") as Record<string, unknown>;
    pkg.name =
      repoName
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .slice(0, 100) || "openspace-site";
    files["package.json"] = `${JSON.stringify(pkg, null, 2)}\n`;
  } catch {
    // keep the starter's
  }
  return files;
}

/** A new site's first files: the shell, the placeholder document and the import request. */
export function newImportFiles(input: {
  siteId: string;
  name: string;
  repoName: string;
  hubUrl: string;
  deployUrl: string;
  sourceLabel: string;
  request: ImportRequest;
}): Record<string, string> {
  return {
    ...shellFiles(input.repoName),
    ...siteDocumentToFiles(placeholderDocument(input)),
    ...importFiles(input.request),
  };
}
