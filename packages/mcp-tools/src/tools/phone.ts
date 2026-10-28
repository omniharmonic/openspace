import {
  fixForPhones,
  type Issue,
  PHONE_WIDTHS,
  type PhoneProbeResult,
  phoneCheck,
  phoneIssuesFromProbe,
  sortIssues,
} from "@omniharmonic/openspace-lint";
import type { Op, OpBody } from "@omniharmonic/openspace-ops";
import type { Page, SiteDocument } from "@omniharmonic/openspace-schema";
import { z } from "zod";
import { resolvePage, type ToolContext } from "../context";
import { renderPreviewHtml } from "../render";
import { defineTool, siteArg } from "../tool";

/**
 * The Phone check for Claude: `phone_check` (static rules + a real browser at 360 and 390 px
 * where the store can measure) and `fix_for_phones` ("Fix everything for phones"). Before any
 * publish Claude runs the phone check and fixes what it finds, so nobody ever gets a site that
 * only works on a laptop.
 */

/** Pages measured per call (each page is two browser layouts). */
export const PHONE_PAGE_LIMIT = 12;

const stripMeta = (op: Op): OpBody => {
  const { id: _i, actor: _a, ts: _t, ...body } = op;
  return body as OpBody;
};

interface Measured {
  issues: Issue[];
  rendered: boolean;
  note?: string;
  measuredPages: string[];
}

async function measure(
  ctx: ToolContext,
  siteId: string,
  doc: SiteDocument,
  pages: Page[],
  wantRendered: boolean,
): Promise<Measured> {
  const now = ctx.now();
  const statics = phoneCheck(doc, pages.length === 1 ? pages[0]?.id : undefined, {
    actor: "phone-check",
    now,
  });
  const store = ctx.store;
  if (!wantRendered || !store.capabilities.canMeasurePhone || !store.measurePhone)
    return {
      issues: statics,
      rendered: false,
      measuredPages: [],
      ...(wantRendered
        ? {
            note: store.capabilities.publishNote?.includes("git")
              ? "Only the rules that don't need a browser ran. For the full phone check install Playwright next to the CLI (npm i -D playwright && npx playwright install chromium) and restart the MCP server."
              : "Only the rules that don't need a browser ran here; screenshot the page on mobile to look it over.",
          }
        : {}),
    };
  const measured = pages.slice(0, PHONE_PAGE_LIMIT);
  const rendered: Issue[] = [];
  let note: string | undefined;
  for (const page of measured) {
    const html = renderPreviewHtml(doc, page.id, { production: true });
    const results: PhoneProbeResult[] = [];
    try {
      for (const width of PHONE_WIDTHS)
        results.push(await store.measurePhone(siteId, { pageId: page.id, width, html }));
    } catch (e) {
      note = `The browser check stopped at “${page.title}”: ${e instanceof Error ? e.message : String(e)}`;
      break;
    }
    rendered.push(...phoneIssuesFromProbe(doc, page.id, results, { actor: "phone-check", now }));
  }
  if (!note && pages.length > measured.length)
    note = `Measured the first ${measured.length} of ${pages.length} pages; run phone_check with page for the others.`;
  // Footer findings repeat on every page: keep one of each.
  const seen = new Set<string>();
  const deduped = rendered.filter((i) => {
    if (i.page !== "footer") return true;
    const key = `${i.rule}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    issues: sortIssues([...statics, ...deduped]),
    rendered: true,
    measuredPages: measured.map((p) => p.id),
    ...(note ? { note } : {}),
  };
}

const pagesFor = (doc: SiteDocument, page?: string) =>
  page ? [resolvePage(doc, page).page as Page] : Object.values(doc.pages);

const describe = (i: Issue) => ({
  id: i.id,
  rule: i.rule,
  severity: i.severity,
  ...(i.page ? { page: i.page } : {}),
  ...(i.section ? { section: i.section } : {}),
  ...(i.block ? { block: i.block } : {}),
  message: i.message,
  fix: i.fix,
  autofix: i.autofix?.label ?? null,
});

const counts = (issues: Issue[]) => {
  const c = { error: 0, warning: 0, info: 0 };
  for (const i of issues) c[i.severity]++;
  return c;
};

export const phoneCheckTool = defineTool({
  name: "phone_check",
  title: "Phone check",
  description:
    "Check how the site works on phones: the rules that need no browser (sections not laid out for phones, columns squeezed side by side, padding that empties the screen, heading words too long for a phone line, tall photo sections, fixed widths in custom CSS) plus, where a browser is available, a real phone layout at 360 and 390 px (sideways scrolling, cut-off or overlapping text, text too small, buttons too small to tap, text over photos, the main button below the first screen). Run it before every publish; fix with fix_for_phones. Aim for zero errors and warnings.",
  input: z.object({
    site: siteArg,
    page: z.string().optional().describe("Page id/slug/title (default: every page)."),
    rendered: z
      .boolean()
      .optional()
      .describe("Measure in a real browser when available (default true)."),
  }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const r = await measure(ctx, siteId, doc, pagesFor(doc, input.page), input.rendered !== false);
    const c = counts(r.issues);
    return {
      data: {
        rendered: r.rendered,
        ...(r.note ? { note: r.note } : {}),
        counts: c,
        issues: r.issues.map(describe),
        next:
          c.error + c.warning === 0
            ? "Looks great on phones."
            : r.issues.some((i) => i.autofix)
              ? "Run fix_for_phones to fix everything that can be fixed automatically, then phone_check again; handle the rest by editing."
              : "Edit the content as each fix says, then run phone_check again.",
      },
    };
  },
});

export const fixForPhonesTool = defineTool({
  name: "fix_for_phones",
  title: "Fix everything for phones",
  description:
    "Apply every automatic phone fix in one change (phone-only settings: phone layouts in reading order, words first in heroes, stacked columns, lighter phone padding, shorter photo sections, smaller phone heading sizes, stronger photo overlays). Desktop stays as designed. Re-measures and returns what's left.",
  input: z.object({
    site: siteArg,
    page: z.string().optional().describe("Limit to a page (default: every page)."),
  }),
  annotations: {},
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    let doc = await ctx.doc(siteId);
    const pages = pagesFor(doc, input.page);
    const before = await measure(ctx, siteId, doc, pages, true);
    const r = fixForPhones(doc, {
      ...(input.page ? { pageId: pages[0]?.id } : {}),
      actor: "phone-check",
      now: ctx.now(),
      rendered: before.issues,
    });
    if (r.ops.length) {
      const applied = await ctx.apply(siteId, r.ops.map(stripMeta));
      doc = applied.doc;
    }
    const after = await measure(ctx, siteId, doc, pagesFor(doc, input.page), true);
    const labels = new Map<string, number>();
    for (const f of r.fixed) labels.set(f.label, (labels.get(f.label) ?? 0) + 1);
    return {
      data: {
        fixed: [...labels].map(([label, n]) => (n > 1 ? `${label} (${n}×)` : label)),
        rendered: after.rendered,
        remaining: counts(after.issues),
        issues: after.issues.filter((i) => i.severity !== "info").map(describe),
        next:
          after.issues.filter((i) => i.severity !== "info").length === 0
            ? "Looks great on phones."
            : "These need an edit (no automatic fix): follow each fix, then run phone_check again.",
      },
    };
  },
});

export const phoneTools = [phoneCheckTool, fixForPhonesTool];
