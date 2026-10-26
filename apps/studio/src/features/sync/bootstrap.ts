import type { Op } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { useQuery } from "@tanstack/react-query";
import { useHub } from "../../api/context";
import { type HubApi, HubError, type Site } from "../../api/types";
import { useConfig } from "../../app/config";
import { type DraftCache, type DraftRecord, defaultDraftCache, draftKey, TAB_ID } from "./cache";
import { foldOps } from "./RoomClient";

/** Where the editor starts: the room's document at `seq` plus this device's unsaved edits. */
export interface DraftBootstrap {
  /** What the editor shows: `confirmed` + `pending`. */
  doc: SiteDocument;
  confirmed: SiteDocument;
  seq: number;
  head: string | null;
  pending: Op[];
  /** The seq each recovered edit was made on (sent with it, so the room applies its rules). */
  pendingBase: Record<string, number>;
  /** Opened from this device's copy because OpenSpace couldn't be reached. */
  offline: boolean;
  /** The site as last seen (for opening offline). */
  site?: Site;
}

const isNetworkError = (err: unknown) =>
  (err instanceof HubError && (err.status === 0 || err.status >= 500)) || err instanceof TypeError;

/** Who is editing, from which tab: device records are scoped to the person and the tab. */
export interface DraftOwner {
  userId: string;
  tabId: string;
}

/**
 * Merge every record this person has for the site (one per tab). The oldest base wins (pending
 * edits were made against it or later), pending edits are concatenated in time order and
 * de-duplicated by id; edits the room already has come back in `hello` and are confirmed by id.
 */
function mergeRecords(records: DraftRecord[]): DraftRecord | undefined {
  if (records.length === 0) return undefined;
  const withPending = records.filter((r) => r.pending.length);
  const pool = withPending.length ? withPending : records;
  const base = withPending.length
    ? pool.reduce((a, b) => (b.seq < a.seq ? b : a))
    : pool.reduce((a, b) => (b.seq > a.seq ? b : a));
  const seen = new Set<string>();
  const pending: Op[] = [];
  const pendingBase: Record<string, number> = {};
  for (const r of withPending)
    for (const o of r.pending) pendingBase[o.id] ??= r.pendingBase?.[o.id] ?? r.seq;
  for (const op of withPending
    .flatMap((r) => r.pending.map((o, i) => ({ o, i, at: r.savedAt })))
    .sort((a, b) => a.o.ts - b.o.ts || a.at - b.at || a.i - b.i)
    .map((x) => x.o)) {
    if (seen.has(op.id)) continue;
    seen.add(op.id);
    pending.push(op);
  }
  const site = records.reduce<DraftRecord | undefined>(
    (a, b) => (b.site && (!a?.site || b.savedAt > a.savedAt) ? b : a),
    undefined,
  )?.site;
  return { ...base, pending, pendingBase, ...(site ? { site } : {}) };
}

/**
 * Edits saved on this device but not yet confirmed win: start from the cached document and
 * its seq, so connecting replays what happened since and rebases them. Otherwise start from
 * the room's latest document, falling back to the device copy when the Hub is unreachable.
 *
 * Records left by other tabs (closed, crashed or still open) are adopted: the merged record
 * is written under this tab's key first, then the others are removed, so nothing is lost even
 * if this tab closes right away. A still-open tab rewrites its own record on its next change;
 * its ops may then be sent twice, which the room acknowledges as duplicates.
 */
export async function loadDraft(
  hub: HubApi,
  cache: DraftCache,
  siteId: string,
  owner: DraftOwner,
): Promise<DraftBootstrap> {
  let records: DraftRecord[] = [];
  try {
    records = await cache.list(owner.userId, siteId);
  } catch {
    records = [];
  }
  const cached = mergeRecords(records);
  const adopt = async () => {
    if (!cached) return;
    const key = draftKey(owner.userId, siteId, owner.tabId);
    try {
      await cache.put({ ...cached, key, tabId: owner.tabId, userId: owner.userId, siteId });
      for (const r of records) if (r.key !== key) await cache.deleteIfUnchanged(r.key, r.savedAt);
    } catch {
      // Storage blocked: the other records stay where they are.
    }
  };
  const fromCache = async (offline: boolean): Promise<DraftBootstrap> => {
    const c = cached as DraftRecord;
    await adopt();
    // Every pending edit is kept, even ones that don't apply to this base yet (made by a tab
    // on a newer base): they apply once connecting replays the room's history.
    const { doc } = foldOps(c.doc, c.pending);
    return {
      doc,
      confirmed: c.doc,
      seq: c.seq,
      head: c.head,
      pending: c.pending,
      pendingBase: c.pendingBase ?? {},
      offline,
      ...(c.site ? { site: c.site } : {}),
    };
  };
  if (cached?.pending.length) return fromCache(false);
  try {
    const r = await hub.getRoomDocument(siteId);
    // Nothing unsaved anywhere: other tabs' leftover copies go (one record per page load would
    // otherwise pile up). This tab writes its own copy once it starts.
    try {
      for (const rec of records)
        if (rec.tabId !== owner.tabId && rec.pending.length === 0)
          await cache.deleteIfUnchanged(rec.key, rec.savedAt);
    } catch {
      // Storage blocked: nothing to clean.
    }
    return {
      doc: r.document,
      confirmed: r.document,
      seq: r.seq,
      head: r.head,
      pending: [],
      pendingBase: {},
      offline: false,
    };
  } catch (err) {
    if (cached && isNetworkError(err)) return fromCache(true);
    throw err;
  }
}

export function useDraftCache(): DraftCache {
  return useConfig().draftCache ?? defaultDraftCache();
}

/** Loads the editor's starting point once per editing session. */
export function useDraftBootstrap(
  siteId: string | undefined,
  userId: string | undefined,
  enabled: boolean,
) {
  const hub = useHub();
  const cache = useDraftCache();
  const tabId = useConfig().tabId ?? TAB_ID;
  return useQuery({
    queryKey: ["draft", siteId ?? "", userId ?? ""],
    queryFn: () => loadDraft(hub, cache, siteId as string, { userId: userId as string, tabId }),
    enabled: Boolean(siteId) && Boolean(userId) && enabled,
    // After loading, the editor store and room client own the document.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  });
}
