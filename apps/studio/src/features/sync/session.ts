import type { SiteDocument } from "@openspace/schema";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { PublishError } from "./protocol";

/** One AI agent session seen in this editor ("Claude is editing Home…" → Accept / Undo all). */
export interface AgentRun {
  sessionId: string;
  actor: string;
  name: string;
  /** Changes received from it. */
  changes: number;
  /** Pages it touched (ids, in order). */
  pages: string[];
  /** Still working (present in the room). */
  active: boolean;
  /** "What it's doing", from the room's presence. */
  activity: string | null;
  /** Accepted or undone: no banner any more. */
  resolved: boolean;
}

export type PublishPhase = "idle" | "publishing" | "live" | "failed";

export interface PublishPillState {
  phase: PublishPhase;
  summary: string | null;
  url: string | null;
  error: PublishError | null;
  /** The version being published. */
  sha: string | null;
}

export interface SyncSessionState {
  agents: AgentRun[];
  publish: PublishPillState;
}

export type SyncSessionStore = StoreApi<SyncSessionState>;

export const IDLE_PUBLISH: PublishPillState = {
  phase: "idle",
  summary: null,
  url: null,
  error: null,
  sha: null,
};

export function createSyncSession(): SyncSessionStore {
  return createStore<SyncSessionState>(() => ({ agents: [], publish: IDLE_PUBLISH }));
}

/** `agent:<sessionId>` → sessionId. */
export function agentSessionId(actor: string): string | null {
  return actor.startsWith("agent:") ? actor.slice("agent:".length) || null : null;
}

/** "Home", "Home and About", "Home, About and 2 other pages". */
export function pageList(doc: SiteDocument, ids: readonly string[]): string {
  const names = ids
    .map((id) => doc.pages[id as keyof SiteDocument["pages"]]?.title)
    .filter((t): t is string => Boolean(t));
  if (names.length === 0) return "your site";
  if (names.length === 1) return names[0] as string;
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} other pages`;
}
