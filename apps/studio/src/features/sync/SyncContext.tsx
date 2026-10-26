import type { Op, OpBody } from "@openspace/ops";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import { useHub } from "../../api/context";
import { queryKeys } from "../../api/queries";
import { type HubApi, HubError, type Site } from "../../api/types";
import { useConfig } from "../../app/config";
import { toast } from "../../ui/toast-store";
import type { EditorStore } from "../editor/model/store";
import type { DraftBootstrap } from "./bootstrap";
import { useDraftCache } from "./bootstrap";
import { TAB_ID } from "./cache";
import { MockDemo } from "./MockDemo";
import { pageOf } from "./ops-meta";
import { RoomClient, type RoomSyncState, type SyncTarget } from "./RoomClient";
import {
  type AgentRun,
  agentSessionId,
  createSyncSession,
  type PublishPillState,
  type SyncSessionState,
  type SyncSessionStore,
} from "./session";

/** The editor store as the room client's sync target. */
export function storeTarget(store: EditorStore): SyncTarget {
  return {
    getDoc: () => store.getState().doc,
    onLocalOps: (listener) => store.getState().onLocalOps((ops) => listener(ops)),
    beforeExternalChange: (ops) => store.getState().settleTextEditing(ops),
    setDocument: (doc, opts) => store.getState().syncDocument(doc, opts),
  };
}

interface SyncContextValue {
  client: RoomClient;
  session: SyncSessionStore;
  store: EditorStore;
  site: Site;
  hub: HubApi;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const v = useContext(SyncContext);
  if (!v) throw new Error("useSync must be used inside <SyncProvider>");
  return v;
}

/** Subscribe to the room connection state. */
export function useRoomState<T>(selector: (s: RoomSyncState) => T): T {
  return useStore(useSync().client.state, selector);
}

/** Subscribe to this editing session's agent / publish state. */
export function useSyncSession<T>(selector: (s: SyncSessionState) => T): T {
  return useStore(useSync().session, selector);
}

/** Creates the room client for an editing session and runs it while mounted. */
export function useRoomClient(
  site: Site,
  store: EditorStore,
  boot: DraftBootstrap,
  userId: string,
  enabled = true,
): RoomClient {
  const hub = useHub();
  const config = useConfig();
  const cache = useDraftCache();
  const tabId = config.tabId ?? TAB_ID;
  const [client] = useState(
    () =>
      new RoomClient({
        siteId: site.id,
        target: storeTarget(store),
        connect: (since) => hub.connectRoom(site.id, since),
        fetchDocument: () => hub.getRoomDocument(site.id),
        initial: { doc: boot.confirmed, seq: boot.seq, head: boot.head, pending: boot.pending },
        cache,
        owner: { userId, tabId },
        probeAuth: async () => {
          try {
            return Boolean((await hub.getSession()).user);
          } catch (err) {
            // Can't tell (offline): not a sign-in problem.
            if (err instanceof HubError && err.status === 401) return false;
            throw err;
          }
        },
        site,
        timing: config.sync,
      }),
  );
  useEffect(() => {
    if (!enabled) return;
    client.start();
    return () => client.stop();
  }, [client, enabled]);
  useEffect(() => client.setSite(site), [client, site]);
  return client;
}

/** Copy for a failure while talking to the Hub. */
export function plainError(err: unknown, fallback: string): string {
  if (err instanceof HubError) return err.message || fallback;
  return fallback;
}

/** Strip id/actor/ts so an op can be committed again as a fresh local edit. */
export function asBody(op: Op): OpBody {
  const { id: _i, actor: _a, ts: _t, ...body } = op;
  return body as OpBody;
}

function patchPublish(session: SyncSessionStore, p: Partial<PublishPillState>) {
  session.setState((s) => ({ publish: { ...s.publish, ...p } }));
}

function updateRun(session: SyncSessionStore, sessionId: string, fn: (r: AgentRun) => AgentRun) {
  session.setState((s) => ({
    agents: s.agents.map((r) => (r.sessionId === sessionId ? fn(r) : r)),
  }));
}

/** Room events → toasts, agent runs, publishing progress; editor page/selection → presence. */
function SyncEffects() {
  const { client, session, store, site } = useSync();
  const queryClient = useQueryClient();

  useEffect(() => {
    const restore = (op: Op) => {
      const r = store.getState().commit([asBody(op)], { label: "Restore version" });
      if (!r.ok)
        toast({
          tone: "danger",
          title: "That version can’t be restored",
          description: "It no longer fits the page.",
        });
    };
    const ensureRun = (actor: string, name: string): string | null => {
      const sid = agentSessionId(actor);
      if (!sid) return null;
      if (!session.getState().agents.some((r) => r.sessionId === sid))
        session.setState((s) => ({
          agents: [
            ...s.agents,
            {
              sessionId: sid,
              actor,
              name,
              changes: 0,
              pages: [],
              active: true,
              activity: null,
              resolved: false,
            },
          ],
        }));
      return sid;
    };
    const offEvents = client.on((e) => {
      switch (e.type) {
        case "conflict": {
          const n = e.notice;
          toast({
            id: `conflict-${n.opId}`,
            title: n.message,
            description:
              n.reason === "concurrent-edit"
                ? n.winner === "you"
                  ? "Your version was kept."
                  : "Their version was kept."
                : undefined,
            duration: 10_000,
            ...(n.restore
              ? {
                  action: {
                    label: "Restore other version",
                    onClick: () => restore(n.restore as Op),
                  },
                }
              : {}),
          });
          return;
        }
        case "rejected":
          // The room's reason is for logs; people get a plain explanation.
          if (e.code === "forbidden")
            toast({
              tone: "danger",
              title: "You can’t change that here",
              description: "Your role on this site doesn’t allow this change, so it was undone.",
            });
          else if (e.code === "invalid")
            toast({
              tone: "danger",
              title: "That change couldn’t be saved",
              description: "It didn’t fit this part of the site, so it was undone.",
            });
          return;
        case "remote": {
          const { logged } = e;
          if (logged.kind !== "agent") return;
          const member = client.state.getState().members.find((m) => m.actor === logged.actor);
          const sid = ensureRun(logged.actor, member?.name ?? "Claude");
          if (!sid) return;
          const page = pageOf(logged.op);
          updateRun(session, sid, (r) => ({
            ...r,
            changes: r.changes + 1,
            pages: page && !r.pages.includes(page) ? [...r.pages, page] : r.pages,
            resolved: false,
          }));
          return;
        }
        case "reload":
          if (e.reason !== "stale" && e.reason !== "resync")
            toast({
              title: "Updated to the latest version",
              description: "Someone changed the whole draft, so the editor reloaded it.",
            });
          return;
        case "published": {
          const p = session.getState().publish;
          if (p.sha === e.sha && p.phase !== "idle") return;
          patchPublish(session, {
            phase: "publishing",
            sha: e.sha,
            summary: e.summary,
            error: null,
            url: null,
          });
          return;
        }
        case "build": {
          const n = e.notice;
          const p = session.getState().publish;
          if (
            p.sha &&
            p.sha !== n.sha &&
            p.phase === "publishing" &&
            n.state !== "success" &&
            n.state !== "failure"
          )
            return;
          if (n.state === "queued" || n.state === "in_progress")
            patchPublish(session, {
              phase: "publishing",
              sha: n.sha,
              summary: n.summary ?? p.summary,
              error: null,
            });
          else if (n.state === "success") {
            patchPublish(session, {
              phase: "live",
              sha: n.sha,
              url: n.url ?? site.url,
              error: null,
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.site(site.id) });
          } else {
            patchPublish(session, {
              phase: "failed",
              sha: n.sha,
              error: n.error ?? {
                code: "publish_failed",
                title: "Couldn’t publish",
                message: "Something went wrong while publishing.",
                fix: null,
              },
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.site(site.id) });
          }
          return;
        }
      }
    });

    // Agents come and go through presence: "Claude is editing Home…" while present.
    const syncAgents = (s: RoomSyncState) => {
      const present = s.members.filter((m) => m.kind === "agent");
      for (const m of present) {
        const sid = ensureRun(m.actor, m.name);
        if (sid)
          updateRun(session, sid, (r) => ({
            ...r,
            active: true,
            activity: m.activity ?? null,
            name: m.name,
          }));
      }
      const actors = new Set(present.map((m) => m.actor));
      for (const r of session.getState().agents)
        if (r.active && !actors.has(r.actor))
          updateRun(session, r.sessionId, (x) => ({ ...x, active: false, activity: null }));
    };
    const offMembers = client.state.subscribe((s, prev) => {
      if (s.members !== prev.members) syncAgents(s);
      if (s.removed && !prev.removed)
        toast({
          tone: "danger",
          title: "You no longer have access to this site",
          description: s.removed,
          duration: Number.POSITIVE_INFINITY,
        });
    });

    // Tell the room what this person is looking at.
    const sendPresence = () => {
      const st = store.getState();
      client.setPresence(
        st.pageId,
        st.selection.map((i) => i.id),
      );
    };
    sendPresence();
    const offStore = store.subscribe((st, prev) => {
      if (st.pageId !== prev.pageId || st.selection !== prev.selection) sendPresence();
    });
    return () => {
      offEvents();
      offMembers();
      offStore();
    };
  }, [client, session, store, site, queryClient]);
  return null;
}

export function SyncProvider({
  client,
  store,
  site,
  children,
}: {
  client: RoomClient;
  store: EditorStore;
  site: Site;
  children: ReactNode;
}) {
  const hub = useHub();
  const [session] = useState(createSyncSession);
  return (
    <SyncContext.Provider value={{ client, session, store, site, hub }}>
      <SyncEffects />
      {import.meta.env.DEV && <MockDemo />}
      {children}
    </SyncContext.Provider>
  );
}
