/**
 * `openspace check` (arch §7.1, GC12): everything that must be true before a site is published.
 * Pure over the files in a checkout — no network, no Astro — so it runs in CI in seconds.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import {
  findBrokenLinks,
  isMediaPath,
  LinkTargets,
  type MediaMeta,
  type SiteDocument,
  SiteDocumentSchema,
  scanForSecrets,
} from "@omniharmonic/openspace-schema";
import {
  COLLECTION_CONFIG_FILE,
  COLLECTIONS_DIR,
  CONFIG_FILE,
  ITEM_EXT,
  loadSite,
  MEDIA_FILE,
  PAGES_DIR,
  SITE_FILE,
  SiteContentError,
  STYLES_FILE,
} from "@omniharmonic/openspace-site-kit/content";

export type Severity = "error" | "warning";
export type CheckRule =
  | "schema"
  | "block"
  | "link"
  | "redirect"
  | "image"
  | "media"
  | "size"
  | "secret"
  | "gating";

export interface Finding {
  severity: Severity;
  rule: CheckRule;
  /** Repo-relative file the finding is in. */
  file: string;
  /** Location inside the file's JSON value (dot path), when known. */
  path?: string;
  /** 1-based line, when known (secrets). */
  line?: number;
  message: string;
}

export interface Budgets {
  /** `media/` total at which a warning is shown (arch §5.6: 600 MB). */
  mediaWarnBytes: number;
  /** `media/` total above which the check fails (900 MB). */
  mediaFailBytes: number;
  /** Longest image edge in px (the upload pipeline's cap). */
  maxImageEdge: number;
  /** GitHub rejects single files over 100 MB. */
  maxFileBytes: number;
}

const MB = 1024 * 1024;
export const DEFAULT_BUDGETS: Budgets = {
  mediaWarnBytes: 600 * MB,
  mediaFailBytes: 900 * MB,
  maxImageEdge: 2400,
  maxFileBytes: 100 * MB,
};

export interface CheckOptions {
  budgets?: Partial<Budgets>;
}

export interface CheckReport {
  ok: boolean;
  errors: number;
  warnings: number;
  findings: Finding[];
  stats: {
    pages: number;
    items: number;
    mediaFiles: number;
    mediaBytes: number;
    filesScanned: number;
  };
}

async function listFiles(root: string, dir: string, includeDot = false): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!includeDot && e.name.startsWith(".")) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await listFiles(root, rel, includeDot)));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

const dotPath = (path: readonly (string | number | symbol)[]) =>
  path.map((p) => String(p)).join(".");

/** Repo file a `SiteDocument` path lives in. */
function fileForDocPath(
  path: readonly (string | number | symbol)[],
  pageFiles: Record<string, string>,
): string {
  const [head, a, b] = path.map((p) => String(p));
  switch (head) {
    case "config":
      return CONFIG_FILE;
    case "site":
      return SITE_FILE;
    case "styles":
      return STYLES_FILE;
    case "media":
      return MEDIA_FILE;
    case "pages":
      return (a && pageFiles[a]) || PAGES_DIR;
    case "collections":
      return b === undefined
        ? `${COLLECTIONS_DIR}/${a}`
        : `${COLLECTIONS_DIR}/${a}/${b}${ITEM_EXT}`;
    case "collectionConfigs":
      return `${COLLECTIONS_DIR}/${a}/${COLLECTION_CONFIG_FILE}`;
    default:
      return "content";
  }
}

/** How many leading doc-path segments name the file (the rest is the path inside it). */
function fileDepth(path: readonly (string | number | symbol)[]): number {
  switch (String(path[0])) {
    case "pages":
    case "media":
    case "collectionConfigs":
      return 2;
    case "collections":
      return 3;
    default:
      return 1;
  }
}

const IMAGE_EXT_RE = /\.(?:jpe?g|png|gif|webp|avif|svg)$/i;
const MEDIA_REF_RE = /(?<![\w/.:-])media\/[A-Za-z0-9_\-./]+\.[A-Za-z0-9]+/g;
export async function runCheck(root: string, options: CheckOptions = {}): Promise<CheckReport> {
  const budgets: Budgets = { ...DEFAULT_BUDGETS, ...options.budgets };
  const findings: Finding[] = [];
  const add = (f: Finding) => {
    const key = `${f.severity}|${f.rule}|${f.file}|${f.path ?? ""}|${f.line ?? ""}|${f.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };
  const seen = new Set<string>();
  const stats: CheckReport["stats"] = {
    pages: 0,
    items: 0,
    mediaFiles: 0,
    mediaBytes: 0,
    filesScanned: 0,
  };

  // --- load + schema ------------------------------------------------------------------------
  let doc: SiteDocument | undefined;
  let pageFiles: Record<string, string> = {};
  try {
    const loaded = await loadSite(root, { validate: false });
    doc = loaded.doc;
    pageFiles = loaded.pageFiles;
  } catch (e) {
    if (e instanceof SiteContentError) {
      for (const i of e.issues)
        add({
          severity: "error",
          rule: "schema",
          file: i.file,
          path: dotPath(i.path) || undefined,
          message: i.message,
        });
    } else {
      add({ severity: "error", rule: "schema", file: CONFIG_FILE, message: (e as Error).message });
    }
  }

  if (doc) {
    stats.pages = Object.keys(doc.pages).length;
    stats.items = Object.values(doc.collections).reduce((n, c) => n + Object.keys(c).length, 0);
    const parsed = SiteDocumentSchema.safeParse(doc);
    if (!parsed.success) {
      for (const i of parsed.error.issues)
        add({
          severity: "error",
          rule: "schema",
          file: fileForDocPath(i.path, pageFiles),
          path: dotPath(i.path.slice(fileDepth(i.path))) || undefined,
          message: i.message,
        });
    }
    for (const issue of blocksRegistry().validateDocument(doc))
      add({
        severity: "error",
        rule: "block",
        file: fileForDocPath(issue.path, pageFiles),
        path: dotPath(issue.path.slice(fileDepth(issue.path))) || undefined,
        message: issue.message,
      });
  }

  // --- media folder ---------------------------------------------------------------------------
  const mediaOnDisk = new Map<string, number>();
  for (const rel of await listFiles(root, "media")) {
    const bytes = (await stat(join(root, rel))).size;
    mediaOnDisk.set(rel, bytes);
    stats.mediaBytes += bytes;
    if (bytes > budgets.maxFileBytes)
      add({
        severity: "error",
        rule: "size",
        file: rel,
        message: `File is ${fmtBytes(bytes)}; GitHub rejects files over ${fmtBytes(budgets.maxFileBytes)}. Host large video elsewhere (the Cloudflare target can use R2).`,
      });
  }
  stats.mediaFiles = mediaOnDisk.size;
  if (stats.mediaBytes > budgets.mediaFailBytes) {
    add({
      severity: "error",
      rule: "size",
      file: "media/",
      message: `media/ is ${fmtBytes(stats.mediaBytes)}, over the ${fmtBytes(budgets.mediaFailBytes)} limit (GitHub Pages publishes at most 1 GB). Remove unused files or move video/large files to the Cloudflare target's R2.`,
    });
  } else if (stats.mediaBytes >= budgets.mediaWarnBytes) {
    add({
      severity: "warning",
      rule: "size",
      file: "media/",
      message: `media/ is ${fmtBytes(stats.mediaBytes)} of ${fmtBytes(budgets.mediaFailBytes)}; getting close to the limit.`,
    });
  }

  // --- references (links, redirects, images) ------------------------------------------------
  if (doc) checkReferences(doc, pageFiles, mediaOnDisk, budgets, add);

  // --- secrets over config + content/** ---------------------------------------------------------
  const textFiles = [CONFIG_FILE, ...(await listFiles(root, "content", true))];
  for (const rel of textFiles) {
    let text: string;
    try {
      const buf = await readFile(join(root, rel));
      if (buf.includes(0)) continue; // binary
      text = buf.toString("utf8");
    } catch {
      continue;
    }
    stats.filesScanned++;
    for (const s of scanForSecrets(text))
      add({
        severity: "error",
        rule: "secret",
        file: rel,
        line: s.line,
        message: `${s.description} found (${s.preview}). Remove it from content and rotate the credential; secrets belong in repository or Worker secrets.`,
      });
  }

  // Only pages can be gated: collection items carry no access flags in the schema.
  // --- gated content in a public repo ---------------------------------------------------------
  // Members-only / password pages are stubs in the repository (`contentRef`, no sections); their
  // content lives in the Hub and reaches only the Cloudflare Worker's private storage.
  for (const page of doc ? Object.values(doc.pages) : []) {
    const gated =
      page.access?.password ||
      page.access?.members ||
      page.slug === "members" ||
      page.slug.startsWith("members/");
    if (!gated) continue;
    const kinds =
      [page.access?.password && "password", page.access?.members && "members-only"]
        .filter(Boolean)
        .join(" and ") || "members-only";
    const file = pageFiles[page.id] ?? PAGES_DIR;
    // A warning, not an error: template samples and hand-made sites may carry it on purpose,
    // and the Hub never commits it (it seals gated pages into stubs).
    if (page.sections.length)
      add({
        severity: "warning",
        rule: "gating",
        file,
        path: "sections",
        message: `Page "${page.title}" is ${kinds}, but its content is in the site's files, which anyone can read. Edit it in Studio (the Hub keeps gated content out of the files); the published site serves only content the Hub holds.`,
      });
    else if (doc?.config.deploy.target === "github-pages")
      add({
        severity: "warning",
        rule: "gating",
        file,
        path: "access",
        message: `Page "${page.title}" is ${kinds}: until you switch on members and password pages (Studio → Finish setting up), visitors don't see it and the rest of the site publishes as usual.`,
      });
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  return { ok: errors === 0, errors, warnings, findings, stats };
}

type Add = (f: Finding) => void;

function checkReferences(
  doc: SiteDocument,
  pageFiles: Record<string, string>,
  mediaOnDisk: Map<string, number>,
  budgets: Budgets,
  add: Add,
): void {
  const resolver = new LinkTargets(doc);
  const reportedImages = new Set<string>();

  const checkImage = (ref: string, file: string, path: string) => {
    if (!isMediaPath(ref)) return;
    if (!mediaOnDisk.has(ref))
      add({
        severity: "error",
        rule: "image",
        file,
        path: path || undefined,
        message: `Image ${ref} does not exist in media/`,
      });
    const meta: MediaMeta | undefined = doc.media[ref];
    if (!meta && mediaOnDisk.has(ref) && !reportedImages.has(ref)) {
      reportedImages.add(ref);
      const isImage = IMAGE_EXT_RE.test(ref);
      add({
        severity: isImage ? "error" : "warning",
        rule: "media",
        file: MEDIA_FILE,
        message: isImage
          ? `${ref} is used but has no entry in content/media.json (images need their width, height and alt text recorded)`
          : `${ref} is used but has no entry in content/media.json (its type and size are recorded there)`,
      });
    }
  };

  const walk = (value: unknown, file: string, path: (string | number)[]): void => {
    if (typeof value === "string") {
      const here = dotPath(path);
      for (const m of value.matchAll(MEDIA_REF_RE)) checkImage(m[0], file, here);
      return;
    }
    if (Array.isArray(value)) {
      for (const [i, v] of value.entries()) walk(v, file, [...path, i]);
      return;
    }
    if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) walk(v, file, [...path, k]);
  };

  // Links: the same rules Studio's Design check and the Hub's publish gate use.
  for (const l of findBrokenLinks(doc))
    add({
      severity: l.severity,
      rule: "link",
      file:
        l.scope.kind === "site"
          ? SITE_FILE
          : l.scope.kind === "page"
            ? (pageFiles[l.scope.page] ?? PAGES_DIR)
            : `${COLLECTIONS_DIR}/${l.scope.collection}/${l.scope.slug}${ITEM_EXT}`,
      path: dotPath(l.path) || undefined,
      message: l.message,
    });

  walk(doc.site, SITE_FILE, []);
  for (const page of Object.values(doc.pages)) walk(page, pageFiles[page.id] ?? PAGES_DIR, []);
  for (const [name, items] of Object.entries(doc.collections))
    for (const item of Object.values(items))
      walk(item, `${COLLECTIONS_DIR}/${name}/${item.slug}${ITEM_EXT}`, []);

  // Redirects.
  (doc.site.redirects ?? []).forEach((r, i) => {
    const at = `redirects.${i}`;
    if (/^https?:/.test(r.to)) return;
    const from = r.from.replace(/^\/+|\/+$/g, "");
    const to = r.to.replace(/^\/+|\/+$/g, "");
    if (from === to)
      add({
        severity: "error",
        rule: "redirect",
        file: SITE_FILE,
        path: at,
        message: `Redirect ${r.from} points at itself`,
      });
    else if (!resolver.pathResolves(r.to))
      add({
        severity: "error",
        rule: "redirect",
        file: SITE_FILE,
        path: `${at}.to`,
        message: `Redirect ${r.from} → ${r.to}: the destination does not lead to any page`,
      });
    if (resolver.slugs.has(from))
      add({
        severity: "warning",
        rule: "redirect",
        file: SITE_FILE,
        path: `${at}.from`,
        message: `Redirect from ${r.from} is shadowed by a page with the same address and will not be used`,
      });
  });

  // media.json: every entry should have its file; images must respect the long-edge budget.
  for (const [path, meta] of Object.entries(doc.media)) {
    if (!mediaOnDisk.has(path))
      add({
        severity: "warning",
        rule: "media",
        file: MEDIA_FILE,
        path,
        message: `Listed in media.json but ${path} is missing from media/`,
      });
    if (meta.kind === "image" && meta.width && meta.height) {
      const edge = Math.max(meta.width, meta.height);
      if (edge > budgets.maxImageEdge)
        add({
          severity: "error",
          rule: "size",
          file: MEDIA_FILE,
          path,
          message: `${path} is ${meta.width}×${meta.height}px; the longest edge may be at most ${budgets.maxImageEdge}px. Resize it before committing.`,
        });
    }
  }
}

export function fmtBytes(n: number): string {
  if (n >= 1024 * MB) return `${(n / (1024 * MB)).toFixed(1)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/** Plain-text report grouped by file. */
export function formatReport(
  report: CheckReport,
  paint: (code: number, s: string) => string,
): string {
  const lines: string[] = [];
  const byFile = new Map<string, Finding[]>();
  for (const f of report.findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
  for (const file of [...byFile.keys()].sort()) {
    lines.push(paint(1, file));
    for (const f of byFile.get(file) ?? []) {
      const where = [f.path, f.line !== undefined ? `line ${f.line}` : undefined]
        .filter(Boolean)
        .join(", ");
      const sev = f.severity === "error" ? paint(31, "error  ") : paint(33, "warning");
      lines.push(`  ${sev} ${f.rule.padEnd(8)} ${where ? `${where}: ` : ""}${f.message}`);
    }
    lines.push("");
  }
  const s = report.stats;
  lines.push(
    `Checked ${s.pages} pages, ${s.items} collection items, ${s.mediaFiles} media files (${fmtBytes(s.mediaBytes)}), ${s.filesScanned} files scanned for secrets.`,
  );
  lines.push(
    report.ok
      ? `OK: ${report.warnings} warning${report.warnings === 1 ? "" : "s"}, no errors.`
      : `FAILED: ${report.errors} error${report.errors === 1 ? "" : "s"}, ${report.warnings} warning${report.warnings === 1 ? "" : "s"}.`,
  );
  return lines.join("\n");
}

/** GitHub Actions workflow commands, so errors show up on the PR. */
export function githubAnnotations(report: CheckReport): string[] {
  const esc = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  return report.findings.map((f) => {
    const level = f.severity === "error" ? "error" : "warning";
    const loc = `file=${esc(f.file)}${f.line !== undefined ? `,line=${f.line}` : ""}`;
    return `::${level} ${loc},title=${f.rule}::${esc(f.message)}`;
  });
}
