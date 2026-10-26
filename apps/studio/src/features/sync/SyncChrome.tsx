import { Check, CloudOff, Sparkles } from "lucide-react";
import { useState } from "react";
import { AvatarStack, Button, Spinner, Tooltip, toast } from "../../ui";
import { useDocStore } from "../editor/model/context";
import { plainError, useRoomState, useSync, useSyncSession } from "./SyncContext";
import { type AgentRun, pageList } from "./session";
import "./sync.css";

/** "Saved" / "Saving…" / "Offline" next to the site status. */
export function SyncStatus() {
  const status = useRoomState((s) => s.status);
  const pending = useRoomState((s) => s.pending);
  const offline = status !== "online";
  const label =
    status === "online"
      ? pending > 0
        ? "Saving…"
        : "Saved"
      : status === "connecting"
        ? "Connecting…"
        : pending > 0
          ? "Saved on this device"
          : "Offline";
  const tip =
    status === "online"
      ? pending > 0
        ? "Saving your changes to the draft."
        : "All changes saved. Visitors see them after you publish."
      : "Changes are saved on this device and sync when you’re back online.";
  return (
    <Tooltip content={tip}>
      <output
        className="st-sync"
        data-state={offline ? "offline" : pending > 0 ? "saving" : "saved"}
        aria-live="polite"
      >
        {offline && status !== "connecting" ? (
          <CloudOff aria-hidden="true" />
        ) : pending > 0 || status === "connecting" ? (
          <Spinner size={11} />
        ) : (
          <Check aria-hidden="true" />
        )}
        <span>{label}</span>
      </output>
    </Tooltip>
  );
}

/** Everyone editing now (people, one avatar each; this person first). */
export function PresenceAvatars({
  self,
}: {
  self: { id: string; name: string; avatarUrl: string | null };
}) {
  const members = useRoomState((s) => s.members);
  const people = [{ id: self.id, name: `${self.name} (you)`, avatarUrl: self.avatarUrl }];
  const seen = new Set([self.id]);
  for (const m of members) {
    if (m.kind !== "human" || seen.has(m.userId)) continue;
    seen.add(m.userId);
    people.push({ id: m.userId, name: m.name, avatarUrl: null });
  }
  const others = people.length - 1;
  return (
    <AvatarStack
      people={people}
      size={22}
      label={
        others ? `Editing now: you and ${others} other${others === 1 ? "" : "s"}` : "Editing now"
      }
    />
  );
}

/** "Claude is editing Home…" while an agent works on the draft. */
export function AgentActivity() {
  const agents = useSyncSession((s) => s.agents);
  const first = agents.find((a) => a.active && a.activity);
  if (!first) return null;
  return (
    <output className="st-agent-live" aria-live="polite">
      <Sparkles aria-hidden="true" />
      <span>{first.activity}</span>
    </output>
  );
}

function AgentBanner({ run }: { run: AgentRun }) {
  const { hub, site, session } = useSync();
  const doc = useDocStore((s) => s.doc);
  const [busy, setBusy] = useState(false);
  const resolve = () =>
    session.setState((s) => ({
      agents: s.agents.map((r) => (r.sessionId === run.sessionId ? { ...r, resolved: true } : r)),
    }));
  const undo = async () => {
    setBusy(true);
    try {
      const r = await hub.undoAgentSession(site.id, run.sessionId);
      resolve();
      toast({
        tone: "success",
        title: `Undid ${r.reverted} change${r.reverted === 1 ? "" : "s"} by ${run.name}`,
        description: r.skipped
          ? `${r.skipped} change${r.skipped === 1 ? " was" : "s were"} kept because someone edited the same thing afterwards.`
          : undefined,
      });
    } catch (err) {
      toast({
        tone: "danger",
        title: "Couldn’t undo those changes",
        description: plainError(err, "Try again in a moment."),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="st-banner st-banner--agent" aria-label={`Changes by ${run.name}`}>
      <Sparkles aria-hidden="true" className="st-banner__icon" />
      <p className="st-banner__text">
        <strong>
          {run.name} made {run.changes} change{run.changes === 1 ? "" : "s"}
        </strong>{" "}
        to {pageList(doc, run.pages)}. Keep them?
      </p>
      <div className="st-banner__actions">
        <Button size="sm" variant="ghost" onClick={undo} disabled={busy}>
          {busy ? "Undoing…" : "Undo all"}
        </Button>
        <Button size="sm" variant="primary" onClick={resolve} disabled={busy}>
          Accept
        </Button>
      </div>
    </section>
  );
}

/** Top-of-canvas banners: working offline, and agent sessions waiting for Accept / Undo all. */
export function SyncBanners() {
  const { client } = useSync();
  const hubDown = useRoomState((s) => s.hubDown);
  const agents = useSyncSession((s) => s.agents);
  const runs = agents.filter((a) => !a.active && !a.resolved && a.changes > 0);
  if (!hubDown && runs.length === 0) return null;
  return (
    <div className="st-banners">
      {hubDown && (
        <section className="st-banner st-banner--offline" role="status" aria-label="Offline">
          <CloudOff aria-hidden="true" className="st-banner__icon" />
          <p className="st-banner__text">
            <strong>Changes are saved on this device.</strong> OpenSpace can’t be reached right now;
            your edits will sync as soon as it’s back.
          </p>
          <div className="st-banner__actions">
            <Button size="sm" variant="ghost" onClick={() => client.reconnectNow()}>
              Try again
            </Button>
          </div>
        </section>
      )}
      {runs.map((r) => (
        <AgentBanner key={r.sessionId} run={r} />
      ))}
    </div>
  );
}
