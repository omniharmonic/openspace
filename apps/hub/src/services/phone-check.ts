/**
 * The Phone check on the Hub (Studio's publish dialog, the remote MCP `phone_check`): each draft
 * page is laid out as a phone at 360 and 390 px by Cloudflare Browser Rendering and measured with
 * the Phone check's probe, then turned into plain-language issues with fixes.
 *
 * Kept affordable and bounded:
 * - results are cached in KV by a hash of the page as published (its rendered HTML) and the
 *   width, so only pages that changed since the last check are measured again;
 * - at most {@link PHONE_PAGES_PER_RUN} pages are measured per run (the rest report the static
 *   rules and say so), and every measured page is charged to the person's screenshot limits;
 * - without a browser (DEV_MODE uses a placeholder that measures nothing; no binding) the
 *   static rules still run and the result says the browser check didn't.
 */
import {
  type Issue,
  PHONE_WIDTHS,
  type PhoneProbeResult,
  phoneCheck,
  phoneIssuesFromProbe,
  sortIssues,
} from "@omniharmonic/openspace-lint";
import type { Page, SiteDocument } from "@omniharmonic/openspace-schema";
import { requireHmacKey } from "../public-env";
import type { Services } from "./index";
import { chargeScreenshots, signShotToken } from "./screenshots";

/** Pages measured in one run (two phone widths each). */
export const PHONE_PAGES_PER_RUN = 10;
/** How long a measurement stays valid for unchanged HTML. */
export const PHONE_CACHE_TTL_SEC = 14 * 24 * 60 * 60;
const CACHE_PREFIX = "phone/v1/";

export interface PhoneCheckResult {
  /** At least one page was measured in a real browser (or came from that cache). */
  rendered: boolean;
  issues: Issue[];
  /** Pages measured now, and pages answered from the cache. */
  measured: number;
  cached: number;
  note?: string;
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const pathOf = (p: Page) => (p.slug ? `/${p.slug}/` : "/");

/** Measure one page at the phone widths, from the cache when its HTML is unchanged. */
export async function measurePagePhone(
  services: Services,
  opts: { siteId: string; userId: string; pagePath: string; html: string },
): Promise<{ results: PhoneProbeResult[]; cached: boolean }> {
  const backend = services.screenshots;
  if (!backend) throw new Error("No browser for the phone check.");
  const hash = await sha256(opts.html);
  const cache = services.pub.cache;
  const results: PhoneProbeResult[] = [];
  const missing: number[] = [];
  for (const width of PHONE_WIDTHS) {
    const hit = cache ? await cache.get(`${CACHE_PREFIX}${hash}/${width}`, "json") : null;
    if (hit) results.push(hit as PhoneProbeResult);
    else missing.push(width);
  }
  if (!missing.length) return { results, cached: true };
  await chargeScreenshots(services.pub.rateLimit, {
    userId: opts.userId,
    siteId: opts.siteId,
    count: 1,
  });
  const token = await signShotToken(
    requireHmacKey(services.pub.config),
    opts.siteId,
    services.now(),
  );
  const target = new URL(
    `${services.config.hubUrl}/p/${opts.siteId}/${opts.pagePath.replace(/^\/+/, "")}`,
  );
  target.searchParams.set("os_shot", token);
  const measured = await backend.measure(
    missing.map((width) => ({ url: target.toString(), width })),
  );
  for (const r of measured) {
    results.push(r);
    if (cache && backend.kind === "browser")
      await cache
        .put(`${CACHE_PREFIX}${hash}/${r.width}`, JSON.stringify(r), {
          expirationTtl: PHONE_CACHE_TTL_SEC,
        })
        .catch(() => undefined);
  }
  return { results: results.sort((a, b) => a.width - b.width), cached: false };
}

/** The Phone check over a site's draft (or the given pages). */
export async function phoneCheckDraft(
  services: Services,
  opts: { siteId: string; userId: string; doc: SiteDocument; pages?: string[] },
): Promise<PhoneCheckResult> {
  const { doc } = opts;
  const now = services.now();
  const pages = Object.values(doc.pages).filter(
    (p) => !opts.pages?.length || opts.pages.includes(p.id) || opts.pages.includes(p.slug),
  );
  const statics = phoneCheck(doc, pages.length === 1 ? pages[0]?.id : undefined, {
    actor: "phone-check",
    now,
  });
  const backend = services.screenshots;
  if (!backend)
    return {
      rendered: false,
      issues: statics,
      measured: 0,
      cached: 0,
      note: "The browser part of the phone check isn't available on this Hub; the other phone rules ran.",
    };
  const rendered: Issue[] = [];
  let measured = 0;
  let cached = 0;
  let note: string | undefined;
  for (const page of pages) {
    const html = await services.renderer.renderPage({
      doc,
      path: pathOf(page),
      mode: "draft",
      basePath: `/p/${opts.siteId}`,
      hubUrl: services.config.hubUrl,
      now: new Date(now),
    });
    if (html === null) continue;
    // Unchanged pages come from the cache for free; changed ones count against the run's budget.
    if (measured >= PHONE_PAGES_PER_RUN) {
      note = `Measured ${measured} changed pages this time; check again for the rest.`;
      break;
    }
    try {
      const r = await measurePagePhone(services, {
        siteId: opts.siteId,
        userId: opts.userId,
        pagePath: pathOf(page),
        html,
      });
      if (r.cached) cached++;
      else measured++;
      rendered.push(
        ...phoneIssuesFromProbe(doc, page.id, r.results, { actor: "phone-check", now }),
      );
    } catch (e) {
      note = `The browser phone check stopped at “${page.title}”: ${e instanceof Error ? e.message : String(e)}`;
      break;
    }
  }
  const seen = new Set<string>();
  const deduped = rendered.filter((i) => {
    if (i.page !== "footer") return true;
    const key = `${i.rule}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    rendered: backend.kind === "browser" && measured + cached > 0,
    issues: sortIssues([...statics, ...deduped]),
    measured,
    cached,
    ...(backend.kind === "stub"
      ? { note: "Development Hub: the browser part of the phone check is a placeholder here." }
      : note
        ? { note }
        : {}),
  };
}
