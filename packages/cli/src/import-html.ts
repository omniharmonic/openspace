/**
 * `openspace import html <file|folder|zip|url> [dir]`: a page Claude (or anyone) made — a single
 * HTML file, an artifact export, a folder or zip of HTML/CSS/images, or a page's address — into a
 * new (or existing) OpenSpace site folder whose sections are designer components with editable
 * fields. With `--compare`, the result is checked against the original in a browser.
 */

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { CHECKLIST_FILE, REPORT_FILE } from "@omniharmonic/openspace-import";
import {
  bundleFromFiles,
  bundleFromUrl,
  bundleFromZip,
  type HtmlBundle,
  type HtmlImportResult,
  importHtmlBundle,
  isZip,
  mimeOf,
} from "@omniharmonic/openspace-import/html-bundle";
import { CURRENT_SCHEMA_VERSION, newId, type SiteConfig } from "@omniharmonic/openspace-schema";
import { writeSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { writeAgentsMd } from "./agents";
import { type CheckReport, runCheck } from "./check";
import { loadRasterizer } from "./import";
import { CliError, type Io } from "./io";
import { loadResizer } from "./mcp";
import { loadPlaywright } from "./mcp/screenshot";
import { deployUrlFor, isEmptyDir, slugify, writeShell } from "./new";
import { assertGitHubPagesStart } from "./wow-first";

export interface ImportHtmlOptions {
  intoExisting?: boolean;
  summary?: string;
  repo?: string;
  url?: string;
  domain?: string;
  title?: string;
  hub?: string;
  target?: string;
  /** Which page of a folder/zip to start from. */
  entry?: string;
  /** Render pages styled by a script (Tailwind CDN…) in a browser first (Playwright). */
  render?: boolean;
  fetch?: typeof fetch;
  now?: Date;
}

export interface ImportHtmlResult {
  dir: string;
  bundle: HtmlBundle;
  result: HtmlImportResult;
  check: CheckReport;
}

const ASSET_RE =
  /(?:src|href|poster|data-src)\s*=\s*["']([^"'#?]+)|srcset\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')?#]+)/gi;

/** A single HTML file with the local files it refers to (not the whole folder it sits in). */
async function bundleFromHtmlFile(path: string): Promise<HtmlBundle> {
  const root = dirname(path);
  const html = await readFile(path, "utf8");
  const files: Record<string, Uint8Array | string> = { [basename(path)]: html };
  const queue: Array<{ text: string; from: string }> = [{ text: html, from: basename(path) }];
  let total = 0;
  while (queue.length) {
    const { text, from } = queue.shift() as { text: string; from: string };
    for (const m of text.matchAll(ASSET_RE)) {
      const refs = m[2]
        ? m[2].split(",").map((s) => s.trim().split(/\s+/)[0] ?? "")
        : [m[1] ?? m[3] ?? ""];
      for (const ref of refs) {
        if (!ref || /^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue;
        const rel = relative(
          root,
          resolve(root, dirname(from), decodeURIComponent(ref.replace(/^\//, ""))),
        );
        if (rel.startsWith("..") || files[rel] !== undefined) continue;
        try {
          const s = await stat(join(root, rel));
          if (!s.isFile()) continue;
          total += s.size;
          if (total > 60 * 1024 * 1024) continue;
          const bytes = new Uint8Array(await readFile(join(root, rel)));
          files[rel] = bytes;
          if (/\.(?:css|html?)$/i.test(rel))
            queue.push({ text: new TextDecoder().decode(bytes), from: rel });
        } catch {
          // Not a local file.
        }
      }
    }
  }
  return bundleFromFiles(files, { entry: basename(path), label: basename(path) });
}

async function readFolder(dir: string): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  let total = 0;
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        const s = await stat(p);
        total += s.size;
        if (total > 60 * 1024 * 1024)
          throw new CliError("That folder holds more than 60 MB. Point at the site's own folder.");
        out[relative(dir, p)] = new Uint8Array(await readFile(p));
      }
    }
  };
  await walk(dir);
  return out;
}

/** Read what the person pointed at into a bundle. */
export async function readHtmlSource(
  io: Io,
  source: string,
  opts: { entry?: string; fetch?: typeof fetch } = {},
): Promise<HtmlBundle> {
  if (/^https?:\/\//i.test(source)) return bundleFromUrl(source, (opts.fetch ?? fetch) as never);
  const path = resolve(io.cwd, source);
  let s: Awaited<ReturnType<typeof stat>>;
  try {
    s = await stat(path);
  } catch {
    throw new CliError(
      `Can't find ${source}. Give an .html file, a folder, a .zip or a web address.`,
    );
  }
  if (s.isDirectory())
    return bundleFromFiles(await readFolder(path), {
      label: basename(path),
      ...(opts.entry ? { entry: opts.entry } : {}),
    });
  const bytes = new Uint8Array(await readFile(path));
  if (isZip(bytes)) return bundleFromZip(bytes, basename(path));
  if (
    /\.html?$/i.test(path) ||
    /<html|<body|<!doctype/i.test(new TextDecoder().decode(bytes.slice(0, 2000)))
  )
    return bundleFromHtmlFile(path);
  throw new CliError(`${basename(path)} isn't an HTML page or a zip.`);
}

/** Render a page styled by a script in a browser: its HTML and every CSS rule it ends up with. */
async function playwrightRender(): Promise<
  ((html: string, url: string) => Promise<{ html: string; css: string } | undefined>) | undefined
> {
  const pw = await loadPlaywright();
  if ("error" in pw) return undefined;
  return async (html) => {
    const browser = await pw.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page
        .setContent(html, { waitUntil: "networkidle", timeout: 45_000 })
        .catch(() => undefined);
      await page.waitForTimeout(500);
      return (await page.evaluate(`(() => {
        let css = "";
        for (const s of document.styleSheets) {
          try { for (const r of s.cssRules) css += r.cssText + "\\n"; } catch {}
        }
        for (const el of document.querySelectorAll("script")) el.remove();
        return { html: "<!doctype html>" + document.documentElement.outerHTML, css };
      })()`)) as { html: string; css: string };
    } finally {
      await browser.close().catch(() => undefined);
    }
  };
}

async function existingConfig(dir: string): Promise<SiteConfig> {
  try {
    return JSON.parse(await readFile(join(dir, "openspace.json"), "utf8")) as SiteConfig;
  } catch {
    throw new CliError(
      `${dir} isn't an OpenSpace site folder (no openspace.json). Leave out --into-existing to create a new one.`,
    );
  }
}

export async function runImportHtml(
  io: Io,
  source: string,
  dirArg: string | undefined,
  opts: ImportHtmlOptions = {},
): Promise<ImportHtmlResult> {
  assertGitHubPagesStart(opts.target);
  const bundle = await readHtmlSource(io, source, {
    ...(opts.entry ? { entry: opts.entry } : {}),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  const fallbackName = slugify(
    basename(source)
      .replace(/\.(?:html?|zip)$/i, "")
      .replace(/^index$/i, "") ||
      bundle.label.replace(/\.(?:html?|zip)$/i, "") ||
      "my-site",
  );
  const dir = resolve(io.cwd, dirArg ?? fallbackName);
  const existing = opts.intoExisting ? await existingConfig(dir) : undefined;
  if (!existing && !(await isEmptyDir(dir)))
    throw new CliError(`${dir} already exists and is not empty. Choose a new folder.`);
  const slug = slugify(basename(dir));
  const config: SiteConfig = existing ?? {
    $schema: "https://schema.openspace.host/v1/site-config.json",
    siteId: newId("st"),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    template: { id: "starter", version: "1.0.0" },
    hub: opts.hub ?? "https://hub.openspace.host",
    deploy: {
      target: "github-pages",
      url: deployUrlFor({ ...opts, target: "github-pages" }, slug),
      customDomain: opts.domain ?? null,
    },
    features: { forms: true, newsletter: false, analytics: false, search: true },
  };
  const render = opts.render === false || opts.fetch ? undefined : await playwrightRender();
  const result = await importHtmlBundle(bundle, {
    config,
    fetch: (opts.fetch ?? fetch) as never,
    ...(opts.fetch ? {} : { resize: await loadResizer(), rasterizeSvg: await loadRasterizer() }),
    ...(opts.title ? { title: opts.title } : {}),
    ...(opts.now ? { now: opts.now } : {}),
    ...(render ? { render } : {}),
    onProgress: (m) => io.err(`  ${m}`),
  }).catch((e: Error) => {
    throw new CliError(e.message);
  });
  if (existing) {
    await rm(join(dir, "content"), { recursive: true, force: true });
    await rm(join(dir, "media"), { recursive: true, force: true });
    if (!(await readFile(join(dir, "package.json"), "utf8").catch(() => "")))
      await writeShell(dir, "github-pages", slug);
  } else {
    await mkdir(dir, { recursive: true });
    await writeShell(dir, "github-pages", slug);
  }
  for (const [path, bytes] of result.files) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), bytes);
  }
  await writeSiteDocument(dir, result.doc);
  await writeFile(join(dir, REPORT_FILE), result.report);
  await mkdir(dirname(join(dir, CHECKLIST_FILE)), { recursive: true });
  await writeFile(join(dir, CHECKLIST_FILE), `${JSON.stringify(result.checklist, null, 2)}\n`);
  await writeAgentsMd(dir, result.doc.site.title);
  const check = await runCheck(dir);
  const r = { dir, bundle, result, check };
  if (opts.summary) {
    const path = resolve(io.cwd, opts.summary);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(htmlImportCounts(r), null, 2)}\n`);
  }
  return r;
}

export function htmlImportCounts(r: ImportHtmlResult) {
  return {
    title: r.result.doc.site.title,
    platform: "html",
    pages: Object.keys(r.result.doc.pages).length,
    items: 0,
    media: r.result.files.size,
    redirects: 0,
    components: r.result.components.length,
    attention: r.result.build.notices.length,
    setup: r.result.checklist.items.length,
    check: { ok: r.check.ok, errors: r.check.errors, warnings: r.check.warnings },
  };
}

export function importHtmlSummary(r: ImportHtmlResult): string[] {
  const { result, check, dir } = r;
  const fields = result.components.reduce((n, c) => n + c.fields, 0);
  return [
    `Imported ${result.doc.site.title} (${r.bundle.label}) into ${dir}:`,
    `  ${Object.keys(result.doc.pages).length} page(s); ${result.components.length} section(s) keep their own design as designer components with ${fields} editable fields; ${result.presets.length} used OpenSpace section designs; ${result.files.size} media files.`,
    `  openspace check: ${check.ok ? "OK" : "FAILED"} — ${check.errors} error(s), ${check.warnings} warning(s).`,
    `  See ${join(dir, REPORT_FILE)}.`,
  ];
}

/**
 * Serve a bundle over http (for `--compare`): `/` is the entry page, `/<slug>/` the other pages,
 * and asset paths are looked up the way the importer resolves them.
 */
export async function serveBundle(
  bundle: HtmlBundle,
): Promise<{ url: string; close(): Promise<void> }> {
  const pageFor = new Map<string, string>([["", bundle.entry]]);
  for (const p of bundle.files.keys())
    if (/\.html?$/i.test(p) && p !== bundle.entry)
      pageFor.set(p.replace(/(?:^|\/)index\.html?$/i, "").replace(/\.html?$/i, ""), p);
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split(/[?#]/)[0] ?? "/").replace(
      /^\/+|\/+$/g,
      "",
    );
    const page = pageFor.get(path);
    const segs = path.split("/");
    let file = page;
    for (let i = 0; !file && i < segs.length; i++) {
      const c = segs.slice(i).join("/");
      if (bundle.files.has(c)) file = c;
    }
    const bytes = file ? bundle.files.get(file) : undefined;
    if (!bytes || !file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": mimeOf(file) }).end(Buffer.from(bytes));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export const HTML_EXTENSIONS = [".html", ".htm", ".zip"];
export const isHtmlSource = (s: string) => HTML_EXTENSIONS.includes(extname(s).toLowerCase());
