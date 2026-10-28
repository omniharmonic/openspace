import { blocksRegistry, presetSection } from "@omniharmonic/openspace-blocks";
import {
  fixForPhones,
  type Issue,
  isPhoneIssue,
  type PhoneProbeResult,
  phoneIssuesFromProbe,
} from "@omniharmonic/openspace-lint";
import { type Op, type OpBody, transformForRole, validate } from "@omniharmonic/openspace-ops";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { create } from "zustand";

/**
 * Studio's half of the Phone check: what the phone preview measured (the probe runs inside the
 * canvas when it is laid out as a phone), what the Hub measured for the publish dialog, and
 * "Fix everything for phones". The static phone rules come with the Design check itself.
 */

export interface PhoneMeasurement {
  /** The document the measurement is for (results go stale on the next edit). */
  doc: SiteDocument;
  pageId: string;
  issues: Issue[];
  /** Where it came from: Studio's own phone preview, or the Hub's browser. */
  source: "preview" | "hub";
  at: number;
}

interface PhoneState {
  /** Latest measurement per page. */
  pages: Record<string, PhoneMeasurement>;
  measuring: boolean;
  set: (m: PhoneMeasurement) => void;
  setMeasuring: (v: boolean) => void;
  reset: () => void;
}

export const usePhoneCheck = create<PhoneState>((set) => ({
  pages: {},
  measuring: false,
  set: (m) => set((s) => ({ pages: { ...s.pages, [m.pageId]: m } })),
  setMeasuring: (measuring) => set({ measuring }),
  reset: () => set({ pages: {}, measuring: false }),
}));

/** Record a probe result for a page (Studio's phone preview measures one width at a time). */
export function recordPhoneProbe(
  doc: SiteDocument,
  pageId: string,
  results: PhoneProbeResult[],
  source: PhoneMeasurement["source"] = "preview",
  now = Date.now(),
): PhoneMeasurement {
  const m: PhoneMeasurement = {
    doc,
    pageId,
    issues: phoneIssuesFromProbe(doc, pageId, results, { actor: "phone-check", now }),
    source,
    at: now,
  };
  usePhoneCheck.getState().set(m);
  return m;
}

/** Measured phone issues that are still current for `doc` (every page, footer once). */
export function measuredPhoneIssues(doc: SiteDocument, pageId?: string): Issue[] {
  const pages = usePhoneCheck.getState().pages;
  const out: Issue[] = [];
  const seen = new Set<string>();
  for (const m of Object.values(pages)) {
    if (m.doc !== doc || (pageId && m.pageId !== pageId)) continue;
    for (const i of m.issues) {
      const key = i.page === "footer" ? `${i.rule}|${i.message}` : i.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(i);
    }
  }
  return out;
}

const asBody = (op: Op): OpBody => {
  const { id: _i, actor: _a, ts: _t, ...body } = op;
  return body as OpBody;
};

/** Locked section ids (editors may only change words and pictures there). */
function locked(doc: SiteDocument): string[] {
  const ids: string[] = [];
  for (const p of Object.values(doc.pages))
    for (const s of p.sections) if (s.locked) ids.push(s.id);
  if (doc.site.footer.locked) ids.push(doc.site.footer.id);
  return ids;
}

export interface PhoneFixPlan {
  bodies: OpBody[];
  labels: string[];
  /** Issues left that need a person. */
  remaining: Issue[];
}

/**
 * "Fix everything for phones": every phone fix the person's role allows — the static rules'
 * (recomputed after each) and what the preview measured — as one undoable change. Desktop is
 * never touched (every fix is a phone-only setting).
 */
export function planPhoneFixes(
  doc: SiteDocument,
  role: string,
  measured: readonly Issue[] = measuredPhoneIssues(doc),
  now = Date.now(),
): PhoneFixPlan {
  const registry = blocksRegistry();
  const lockedIds = locked(doc);
  const r = fixForPhones(doc, {
    now,
    actor: "phone-check",
    rendered: measured,
    validateOp: (d, op) => {
      const allowed = transformForRole(
        op,
        role as Parameters<typeof transformForRole>[1],
        lockedIds,
        {
          doc: d,
          registry,
          presetSection,
        },
      );
      if (!allowed.allowed) return null;
      const v = validate(d, allowed.op, { registry, trusted: true });
      return v.ok ? v.doc : null;
    },
  });
  const labels = [...new Set(r.fixed.map((f) => f.label))];
  return { bodies: r.ops.map(asBody), labels, remaining: r.remaining.filter(isPhoneIssue) };
}

/** How many phone problems (errors + warnings) are known for this document. */
export function phoneAttention(issues: readonly Issue[]): number {
  return issues.filter((i) => isPhoneIssue(i) && i.severity !== "info").length;
}

const versions = new WeakMap<SiteDocument, number>();
let nextVersion = 1;
/** A number that changes whenever the document does (documents are immutable). */
export function docVersion(doc: SiteDocument): number {
  let v = versions.get(doc);
  if (!v) {
    v = nextVersion++;
    versions.set(doc, v);
  }
  return v;
}

/** Share a Hub phone check with the panel and the phone preview (per page). */
export function recordHubPhoneCheck(doc: SiteDocument, issues: readonly Issue[], now = Date.now()) {
  const byPage = new Map<string, Issue[]>();
  for (const i of issues)
    if (isPhoneIssue(i) && i.page) {
      const list = byPage.get(i.page) ?? [];
      list.push(i);
      byPage.set(i.page, list);
    }
  for (const [pageId, list] of byPage)
    usePhoneCheck.getState().set({ doc, pageId, issues: list, source: "hub", at: now });
}
