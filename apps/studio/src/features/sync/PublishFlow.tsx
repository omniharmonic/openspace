import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CircleCheck,
  ExternalLink,
  TriangleAlert,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PublishSchedule } from "../../api/types";
import {
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  Segmented,
  Spinner,
  Tooltip,
  toast,
} from "../../ui";
import { useDocStore } from "../editor/model/context";
import { describeChanges } from "./changes";
import { asBody, plainError, useRoomState, useSync, useSyncSession } from "./SyncContext";
import { IDLE_PUBLISH } from "./session";
import "./sync.css";

const PUBLISHERS = new Set(["owner", "designer", "editor"]);
const DESIGNERS = new Set(["owner", "designer"]);

/** The person's role on this site (from the site, else the room). */
export function useRole(): string {
  const { site } = useSync();
  const roomRole = useRoomState((s) => s.you?.role);
  return site.role ?? roomRole ?? "owner";
}

export const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

const pad = (x: number) => String(x).padStart(2, "0");

function defaultSlot(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: "09:00" };
}

const keys = {
  published: (id: string) => ["published-document", id] as const,
  schedules: (id: string) => ["schedules", id] as const,
};

function PublishDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { hub, site, client, session, store } = useSync();
  const queryClient = useQueryClient();
  const role = useRole();
  const draft = useDocStore((s) => s.doc);
  const status = useRoomState((s) => s.status);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [slot, setSlot] = useState(defaultSlot);
  const [busy, setBusy] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const published = useQuery({
    queryKey: keys.published(site.id),
    queryFn: () => hub.getDocument(site.id, { ref: "published" }),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const schedules = useQuery({
    queryKey: keys.schedules(site.id),
    queryFn: () => hub.listSchedules(site.id),
    enabled: open,
    retry: false,
  });
  const changes = useMemo(
    () => (published.data ? describeChanges(published.data.document, draft) : null),
    [published.data, draft],
  );
  const pendingSchedules = (schedules.data ?? []).filter((s) => s.status === "pending");
  const offline = status !== "online";

  const close = () => {
    setMode("now");
    setTimeError(null);
    onOpenChange(false);
  };

  const publishNow = async () => {
    setBusy(true);
    try {
      if (!(await client.whenSynced(10_000))) {
        toast({
          tone: "danger",
          title: "Your latest changes haven’t reached OpenSpace yet",
          description: "They’re saved on this device. Publish again once you’re back online.",
        });
        return;
      }
      const r = await hub.publish(site.id);
      void queryClient.invalidateQueries({ queryKey: ["versions", site.id] });
      if (!r.publish) {
        session.setState({
          publish: {
            ...IDLE_PUBLISH,
            phase: "publishing",
            summary: "Finishing setting up your site",
          },
        });
      } else if (r.publish.status === "no_changes") {
        toast({
          title: "Everything is already live",
          description: "There’s nothing new to publish.",
        });
      } else {
        const p = session.getState().publish;
        if (p.sha !== r.publish.sha || p.phase === "idle")
          session.setState({
            publish: {
              ...IDLE_PUBLISH,
              phase: "publishing",
              sha: r.publish.sha ?? null,
              summary: r.publish.summary ?? changes?.sentence ?? null,
            },
          });
      }
      close();
    } catch (err) {
      toast({
        tone: "danger",
        title: "Couldn’t publish",
        description: plainError(err, "Try again in a moment."),
      });
    } finally {
      setBusy(false);
    }
  };

  const schedule = async () => {
    const at = new Date(`${slot.date}T${slot.time}`);
    if (Number.isNaN(at.getTime())) return setTimeError("Pick a date and a time.");
    if (at.getTime() < Date.now() + 60_000)
      return setTimeError("Pick a time at least a minute from now.");
    setTimeError(null);
    setBusy(true);
    try {
      const sch = await hub.schedulePublish(site.id, at);
      queryClient.setQueryData<PublishSchedule[]>(keys.schedules(site.id), (old) => [
        ...(old ?? []),
        sch,
      ]);
      toast({
        tone: "success",
        title: "Publish scheduled",
        description: `Your changes go live ${formatWhen(sch.runAt)}.`,
      });
      close();
    } catch (err) {
      setTimeError(plainError(err, "That time didn’t work. Try another."));
    } finally {
      setBusy(false);
    }
  };

  const cancelSchedule = async (s: PublishSchedule) => {
    try {
      await hub.cancelSchedule(site.id, s.id);
      void schedules.refetch();
      toast({ title: "Scheduled publish cancelled" });
    } catch (err) {
      toast({
        tone: "danger",
        title: "Couldn’t cancel it",
        description: plainError(err, "Try again."),
      });
    }
  };

  const discard = () => {
    if (!published.data) return;
    const ops = describeChanges(draft, published.data.document).ops;
    // Going back to the live version is ordinary (undoable) edits.
    const r = store.getState().commit(
      // `diff(draft → published)` reverts every unpublished change.
      ops.length ? ops.map(asBody) : [],
      { label: "Discard changes" },
    );
    setConfirmDiscard(false);
    if (!r.ok) {
      toast({
        tone: "danger",
        title: "Couldn’t discard the changes",
        description: r.errors[0]?.message,
      });
      return;
    }
    close();
    toast({
      title: "Changes discarded",
      description: "The draft matches your live site again.",
      action: { label: "Undo", onClick: () => store.getState().undo() },
    });
  };

  const canSchedule = mode === "later" && !busy;
  const empty = changes?.empty ?? false;

  return (
    <>
      <Dialog
        open={open && !confirmDiscard}
        onOpenChange={(o) => (o ? onOpenChange(true) : close())}
        title="Publish changes"
        width={460}
        footer={
          <div className="st-publish__foot">
            {DESIGNERS.has(role) && !empty && changes && (
              <Button
                variant="ghost"
                size="sm"
                className="st-publish__discard"
                onClick={() => setConfirmDiscard(true)}
              >
                Discard changes…
              </Button>
            )}
            <span className="st-publish__spacer" />
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            {mode === "now" ? (
              <Button
                variant="primary"
                onClick={publishNow}
                disabled={busy || offline || empty || !changes}
              >
                {busy ? "Publishing…" : "Publish now"}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={schedule}
                disabled={!canSchedule || offline || empty}
              >
                {busy ? "Scheduling…" : "Schedule"}
              </Button>
            )}
          </div>
        }
      >
        <div className="st-publish">
          <section className="st-publish__summary" aria-label="What changes">
            {published.isPending ? (
              <p className="st-publish__muted">
                <Spinner size={12} /> Comparing with your live site…
              </p>
            ) : published.isError ? (
              <p className="st-publish__muted">Couldn’t compare with your live site right now.</p>
            ) : empty ? (
              <p>
                <strong>Everything is already live.</strong> Edit something to publish it.
              </p>
            ) : (
              <>
                <ul className="st-publish__lines">
                  {changes?.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                {changes?.sentence && <p className="st-publish__muted">{changes.sentence}</p>}
              </>
            )}
          </section>
          {offline && (
            <p className="st-publish__warn" role="status">
              You’re offline. Your changes are saved on this device; publish when you’re back
              online.
            </p>
          )}
          <Segmented<"now" | "later">
            aria-label="When to publish"
            size="sm"
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "now", label: "Now" },
              { value: "later", label: "Schedule" },
            ]}
          />
          {mode === "later" && (
            <div className="st-publish__schedule">
              <div className="st-publish__slot">
                <Field label="Date">
                  <Input
                    type="date"
                    value={slot.date}
                    onChange={(e) => setSlot((s) => ({ ...s, date: e.target.value }))}
                  />
                </Field>
                <Field label="Time" error={timeError ?? undefined}>
                  <Input
                    type="time"
                    value={slot.time}
                    onChange={(e) => setSlot((s) => ({ ...s, time: e.target.value }))}
                  />
                </Field>
              </div>
              <p className="st-publish__muted">
                Uses your time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Everything
                in the draft at that time goes live.
              </p>
            </div>
          )}
          {pendingSchedules.length > 0 && (
            <ul className="st-publish__scheduled" aria-label="Scheduled publishes">
              {pendingSchedules.map((s) => (
                <li key={s.id}>
                  <CalendarClock aria-hidden="true" />
                  <span>Publishes {formatWhen(s.runAt)}</span>
                  <Button size="sm" variant="ghost" onClick={() => void cancelSchedule(s)}>
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
      <Dialog
        open={open && confirmDiscard}
        onOpenChange={(o) => !o && setConfirmDiscard(false)}
        title="Discard unpublished changes?"
        description="The draft goes back to what’s live on your site now. You can undo this right after."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={discard}>
              Discard changes
            </Button>
          </>
        }
      />
    </>
  );
}

/** Publish button in the editor's top bar. */
export function PublishButton() {
  const role = useRole();
  const phase = useSyncSession((s) => s.publish.phase);
  const [open, setOpen] = useState(false);
  if (!PUBLISHERS.has(role))
    return (
      <Tooltip content="Your drafts are published after an editor reviews them">
        <Button variant="primary" size="sm" disabled focusableWhenDisabled>
          Publish
        </Button>
      </Tooltip>
    );
  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={phase === "publishing"}
        focusableWhenDisabled
      >
        {phase === "publishing" ? "Publishing…" : "Publish"}
      </Button>
      <PublishDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** How long the "Live" pill stays up. */
export const LIVE_PILL_MS = 20_000;

const FIX_COPY: Record<string, string> = {
  revert:
    "Went back to the last version that worked. Your changes are still in the draft, so you can correct them and publish again.",
  retry: "Trying again.",
  enable_pages: "Turned your site’s hosting back on and trying again.",
};

/** Publishing progress: Publishing… → Live (with link) or Couldn’t publish (+ Fix it for me). */
export function PublishPill() {
  const { hub, site, session } = useSync();
  const publish = useSyncSession((s) => s.publish);
  const [fixing, setFixing] = useState(false);
  // "Live" fades after a while; failures stay until fixed or dismissed.
  useEffect(() => {
    if (publish.phase !== "live") return;
    const t = setTimeout(() => {
      if (session.getState().publish.phase === "live") session.setState({ publish: IDLE_PUBLISH });
    }, LIVE_PILL_MS);
    return () => clearTimeout(t);
  }, [publish.phase, session]);
  if (publish.phase === "idle") return null;
  const dismiss = () => session.setState({ publish: IDLE_PUBLISH });
  const fix = async () => {
    setFixing(true);
    try {
      const r = await hub.fixLastPublish(site.id);
      session.setState({
        publish: { ...IDLE_PUBLISH, phase: "publishing", sha: r.sha, summary: "Fixing your site" },
      });
      toast({ title: "On it", description: FIX_COPY[r.fix] ?? "Fixing it now." });
    } catch (err) {
      toast({
        tone: "danger",
        title: "Couldn’t fix it automatically",
        description: plainError(err, "Try publishing again."),
      });
    } finally {
      setFixing(false);
    }
  };
  return (
    <div className="st-pill" data-phase={publish.phase} role="status" aria-live="polite">
      {publish.phase === "publishing" && (
        <>
          <Spinner size={12} />
          <span className="st-pill__title">Publishing…</span>
          {publish.summary && <span className="st-pill__detail">{publish.summary}</span>}
        </>
      )}
      {publish.phase === "live" && (
        <>
          <CircleCheck aria-hidden="true" className="st-pill__icon" />
          <span className="st-pill__title">Live</span>
          {publish.url && (
            <a className="st-pill__link" href={publish.url} target="_blank" rel="noreferrer">
              {publish.url.replace(/^https?:\/\//, "")}
              <ExternalLink aria-hidden="true" />
            </a>
          )}
          <IconButton label="Dismiss" icon={<X />} size="sm" tooltip={false} onClick={dismiss} />
        </>
      )}
      {publish.phase === "failed" && (
        <>
          <TriangleAlert aria-hidden="true" className="st-pill__icon" />
          <span className="st-pill__title">Couldn’t publish</span>
          <span className="st-pill__detail">
            {publish.error?.title}
            {publish.error?.message ? `. ${publish.error.message}` : ""}
          </span>
          {publish.error?.fix && (
            <Button
              size="sm"
              variant="primary"
              icon={<WandSparkles />}
              onClick={fix}
              disabled={fixing}
            >
              {fixing ? "Fixing…" : "Fix it for me"}
            </Button>
          )}
          <IconButton label="Dismiss" icon={<X />} size="sm" tooltip={false} onClick={dismiss} />
        </>
      )}
    </div>
  );
}
