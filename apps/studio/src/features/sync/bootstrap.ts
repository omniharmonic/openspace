import type { Op } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { useQuery } from "@tanstack/react-query";
import { useHub } from "../../api/context";
import { type HubApi, HubError, type Site } from "../../api/types";
import { useConfig } from "../../app/config";
import { type DraftCache, defaultDraftCache } from "./cache";
import { foldOps } from "./RoomClient";

/** Where the editor starts: the room's document at `seq` plus this device's unsaved edits. */
export interface DraftBootstrap {
  /** What the editor shows: `confirmed` + `pending`. */
  doc: SiteDocument;
  confirmed: SiteDocument;
  seq: number;
  head: string | null;
  pending: Op[];
  /** Opened from this device's copy because OpenSpace couldn't be reached. */
  offline: boolean;
  /** The site as last seen (for opening offline). */
  site?: Site;
}

const isNetworkError = (err: unknown) =>
  (err instanceof HubError && (err.status === 0 || err.status >= 500)) || err instanceof TypeError;

/**
 * Edits saved on this device but not yet confirmed win: start from the cached document and
 * its seq, so connecting replays what happened since and rebases them. Otherwise start from
 * the room's latest document, falling back to the device copy when the Hub is unreachable.
 */
export async function loadDraft(
  hub: HubApi,
  cache: DraftCache,
  siteId: string,
): Promise<DraftBootstrap> {
  let cached: Awaited<ReturnType<DraftCache["get"]>>;
  try {
    cached = await cache.get(siteId);
  } catch {
    cached = undefined;
  }
  const fromCache = (offline: boolean): DraftBootstrap => {
    const c = cached as NonNullable<typeof cached>;
    const { doc, kept } = foldOps(c.doc, c.pending);
    return {
      doc,
      confirmed: c.doc,
      seq: c.seq,
      head: c.head,
      pending: kept,
      offline,
      ...(c.site ? { site: c.site } : {}),
    };
  };
  if (cached?.pending.length) return fromCache(false);
  try {
    const r = await hub.getRoomDocument(siteId);
    return {
      doc: r.document,
      confirmed: r.document,
      seq: r.seq,
      head: r.head,
      pending: [],
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
export function useDraftBootstrap(siteId: string | undefined, enabled: boolean) {
  const hub = useHub();
  const cache = useDraftCache();
  return useQuery({
    queryKey: ["draft", siteId ?? ""],
    queryFn: () => loadDraft(hub, cache, siteId as string),
    enabled: Boolean(siteId) && enabled,
    // After loading, the editor store and room client own the document.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  });
}
