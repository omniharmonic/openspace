/**
 * `openspace check --phone`: the Phone check on a real browser. Every page is rendered by the
 * site's own renderer (the local preview server), laid out as a phone at 360 and 390 px in
 * Playwright, and measured by the Phone check's probe; the findings become plain-language issues
 * next to the static phone rules. `--fix` applies every phone fix ("Fix everything for phones")
 * to the content files and measures again.
 *
 * Playwright is optional: without it the static rules still run and the report says how to
 * add the browser check.
 */
import {
  fixForPhones,
  type Issue,
  PHONE_WIDTHS,
  type PhoneProbeResult,
  phoneCheck,
  phoneIssuesFromProbe,
  sortIssues,
} from "@omniharmonic/openspace-lint";
import type { Page, SiteDocument } from "@omniharmonic/openspace-schema";
import { loadSiteDocument, writeSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { startPreviewServer } from "./mcp/preview-server";
import { createScreenshotter, loadPlaywright, type Screenshotter } from "./mcp/screenshot";

export interface PhonePageReport {
  page: string;
  title: string;
  path: string;
  issues: Issue[];
}

export interface PhoneReport {
  /** Measured in a browser (false: static rules only). */
  rendered: boolean;
  /** Why the browser check didn't run, in plain language. */
  note?: string;
  /** Site-wide and per-page issues (static + rendered), worst first. */
  issues: Issue[];
  pages: PhonePageReport[];
  counts: { error: number; warning: number; info: number };
  /** Fixes applied with `fix`. */
  fixed: Array<{ id: string; label: string }>;
  /** Content files written by `fix`. */
  written: string[];
}

export interface PhoneCheckOptions {
  /** Measure in a browser (default true; falls back to static rules without Playwright). */
  rendered?: boolean;
  /** Apply every phone fix to the content files, then check again. */
  fix?: boolean;
  /** Limit to these page ids or slugs. */
  pages?: string[];
  widths?: readonly number[];
  /** A screenshotter (tests inject one); otherwise Playwright is loaded. */
  screenshotter?: Screenshotter;
  now?: number;
}

const pathOf = (p: Page) => (p.slug ? `/${p.slug}/` : "/");

async function measureSite(
  root: string,
  load: () => Promise<SiteDocument>,
  doc: SiteDocument,
  shooter: Screenshotter,
  pages: Page[],
  widths: readonly number[],
  now: number,
): Promise<Map<string, Issue[]>> {
  const server = await startPreviewServer(root, load);
  const out = new Map<string, Issue[]>();
  try {
    for (const page of pages) {
      const results: PhoneProbeResult[] = [];
      for (const w of widths)
        results.push(await shooter.measure(`${server.url}${pathOf(page)}?os_mode=production`, w));
      out.set(page.id, phoneIssuesFromProbe(doc, page.id, results, { now, actor: "phone-check" }));
    }
  } finally {
    await server.close();
  }
  return out;
}

export async function runPhoneCheck(
  root: string,
  opts: PhoneCheckOptions = {},
): Promise<PhoneReport> {
  const now = opts.now ?? Date.now();
  const widths = opts.widths ?? PHONE_WIDTHS;
  let doc = await loadSiteDocument(root);
  const pick = (d: SiteDocument) =>
    Object.values(d.pages).filter(
      (p) => !opts.pages?.length || opts.pages.includes(p.id) || opts.pages.includes(p.slug),
    );

  let shooter = opts.screenshotter;
  let note: string | undefined;
  let owned = false;
  if (!shooter && opts.rendered !== false) {
    const pw = await loadPlaywright();
    if ("error" in pw)
      note =
        "The browser check needs Playwright: run `npm i -D playwright && npx playwright install chromium` in the site folder. Only the rules that don't need a browser ran.";
    else {
      shooter = createScreenshotter(pw.chromium);
      owned = true;
    }
  }

  let current = doc;
  const load = async () => current;
  const measure = async () =>
    shooter && opts.rendered !== false
      ? measureSite(root, load, current, shooter, pick(current), widths, now).catch((e) => {
          note = `The browser check couldn't run: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`;
          return new Map<string, Issue[]>();
        })
      : new Map<string, Issue[]>();

  try {
    let rendered = await measure();
    const fixed: PhoneReport["fixed"] = [];
    const written: string[] = [];
    if (opts.fix) {
      const r = fixForPhones(doc, {
        now,
        actor: "phone-check",
        rendered: [...rendered.values()].flat(),
      });
      if (r.ops.length) {
        doc = r.doc;
        current = doc;
        const w = await writeSiteDocument(root, doc);
        written.push(...w.written);
        fixed.push(...r.fixed);
        rendered = await measure();
      }
    }
    const statics = phoneCheck(doc, undefined, { now, actor: "phone-check" });
    const pages: PhonePageReport[] = pick(doc).map((p) => ({
      page: p.id,
      title: p.title,
      path: pathOf(p),
      issues: sortIssues([
        ...statics.filter((i) => i.page === p.id),
        ...(rendered.get(p.id) ?? []).filter((i) => i.page === p.id),
      ]),
    }));
    const elsewhere = [
      ...statics.filter((i) => !i.page || !doc.pages[i.page as Page["id"]]),
      // Footer findings repeat on every page: report each once.
      ...dedupe([...rendered.values()].flat().filter((i) => i.page === "footer")),
    ];
    const issues = sortIssues([...elsewhere, ...pages.flatMap((p) => p.issues)]);
    const counts = { error: 0, warning: 0, info: 0 };
    for (const i of issues) counts[i.severity]++;
    return {
      rendered: !!shooter && opts.rendered !== false && !note,
      ...(note ? { note } : {}),
      issues,
      pages,
      counts,
      fixed,
      written,
    };
  } finally {
    if (owned) await shooter?.close();
  }
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.rule}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The report in plain language, page by page. */
export function formatPhoneReport(
  r: PhoneReport,
  paint: (code: number, s: string) => string,
): string {
  const lines: string[] = [];
  lines.push(paint(1, r.rendered ? "Phone check (measured at 360 and 390 px)" : "Phone check"));
  if (r.note) lines.push(paint(33, r.note));
  if (r.fixed.length) {
    lines.push(
      paint(32, `Fixed for phones: ${r.fixed.length} change${r.fixed.length === 1 ? "" : "s"}.`),
    );
    for (const f of uniqueLabels(r.fixed)) lines.push(`  ✓ ${f}`);
  }
  const groups = new Map<string, Issue[]>();
  for (const i of r.issues) {
    const page = r.pages.find((p) => p.page === i.page);
    const key = page
      ? `${page.title} (${page.path})`
      : i.page === "footer"
        ? "Footer"
        : "Whole site";
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  for (const [where, list] of groups) {
    lines.push("", paint(1, where));
    for (const i of list) {
      const sev =
        i.severity === "error"
          ? paint(31, "error  ")
          : i.severity === "warning"
            ? paint(33, "warning")
            : "info   ";
      lines.push(`  ${sev} ${i.message}`);
      lines.push(`          ${i.autofix ? `Fix for phones: ${i.autofix.label}.` : i.fix}`);
    }
  }
  const { error, warning, info } = r.counts;
  lines.push("");
  lines.push(
    error + warning === 0
      ? paint(
          32,
          `Looks great on phones${info ? ` (${info} suggestion${info === 1 ? "" : "s"})` : ""}.`,
        )
      : `${error} error${error === 1 ? "" : "s"}, ${warning} warning${warning === 1 ? "" : "s"} on phones.${r.issues.some((i) => i.autofix) && !r.fixed.length ? " Run `openspace check --phone --fix` to fix what can be fixed automatically." : ""}`,
  );
  return lines.join("\n");
}

function uniqueLabels(fixed: PhoneReport["fixed"]): string[] {
  const counts = new Map<string, number>();
  for (const f of fixed) counts.set(f.label, (counts.get(f.label) ?? 0) + 1);
  return [...counts].map(([l, n]) => (n > 1 ? `${l} (${n}×)` : l));
}
