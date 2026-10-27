import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Eye, RotateCcw } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { SiteVersion, Snapshot } from "../../api/types";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  Sheet,
  Skeleton,
  Tabs,
  Tooltip,
  toast,
} from "../../ui";
import { formatWhen, useRole } from "./PublishFlow";
import { plainError, useSync } from "./SyncContext";
import { IDLE_PUBLISH } from "./session";
import "./sync.css";

const DESIGNERS = new Set(["owner", "designer"]);

/**
 * Whether the Hub can show an earlier version (`/s/:id/?version=<sha>`). Until it can, only
 * the live version gets a Preview button; flip this when the Hub honours `?version=`.
 */
export const VERSION_PREVIEWS = false;
const EDITORS = new Set(["owner", "designer", "editor"]);

/** A friendly name for a snapshot (automatic ones are named by what they protect). */
export function snapshotLabel(s: Snapshot): string {
  if (s.name.startsWith("agent-")) return "Before an AI session";
  if (s.name.startsWith("before-rollback-")) return "Before a rollback";
  return s.name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function VersionBadges({ v }: { v: SiteVersion }) {
  return (
    <span className="st-history__badges">
      {v.current && (
        <Badge tone="live" dot>
          Live now
        </Badge>
      )}
      {v.status === "failure" && <Badge tone="danger">Couldn’t publish</Badge>}
      {(v.status === "queued" || v.status === "in_progress") && (
        <Badge tone="pending" dot pulse>
          Publishing
        </Badge>
      )}
      {v.kind === "rollback" && <Badge>Rollback</Badge>}
      {v.kind === "revert" && <Badge>Fixed automatically</Badge>}
      {v.kind === "setup" && <Badge>First version</Badge>}
    </span>
  );
}

function Versions() {
  const { hub, site, session } = useSync();
  const queryClient = useQueryClient();
  const role = useRole();
  const versions = useQuery({
    queryKey: ["versions", site.id],
    queryFn: () => hub.listVersions(site.id),
    staleTime: 0,
  });
  const [target, setTarget] = useState<SiteVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const canRollback = DESIGNERS.has(role);

  const rollback = async () => {
    if (!target) return;
    setBusy(true);
    setFailure(null);
    try {
      const r = await hub.rollback(site.id, target.sha);
      session.setState({
        publish: { ...IDLE_PUBLISH, phase: "publishing", sha: r.sha, summary: r.summary },
      });
      toast({
        tone: "success",
        title: "Rolling back",
        description: r.snapshot
          ? "Your unpublished changes were saved as a snapshot first."
          : "Your site is going back to that version.",
      });
      const locked = r.pagesWithoutPassword ?? [];
      if (locked.length)
        toast({
          tone: "danger",
          title:
            locked.length === 1
              ? `Set a password for “${locked[0]?.title}”`
              : `Set passwords for ${locked.length} protected pages`,
          description: `${locked.map((p) => `“${p.title}”`).join(", ")} ${
            locked.length === 1 ? "is" : "are"
          } password-protected in this version but ${
            locked.length === 1 ? "has" : "have"
          } no password, so nobody can open ${
            locked.length === 1 ? "it" : "them"
          }. Set one in Page settings.`,
        });
      setTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["versions", site.id] });
      void queryClient.invalidateQueries({ queryKey: ["snapshots", site.id] });
    } catch (err) {
      const message = plainError(err, "Try again in a moment.");
      // Said in the dialog too: a toast behind an open dialog is easy to miss.
      setFailure(message);
      toast({ tone: "danger", title: "Couldn’t roll back", description: message });
    } finally {
      setBusy(false);
    }
  };

  if (versions.isPending)
    return (
      <div className="st-history__loading" role="status" aria-label="Loading versions">
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  if (versions.isError)
    return (
      <EmptyState
        size="sm"
        title="Couldn’t load your versions"
        description={plainError(versions.error, "Try again in a moment.")}
        action={
          <Button size="sm" onClick={() => void versions.refetch()}>
            Try again
          </Button>
        }
      />
    );
  return (
    <>
      <ol className="st-history__list" aria-label="Published versions">
        {versions.data.map((v) => (
          <li key={v.sha} className="st-history__item" data-current={v.current || undefined}>
            <div className="st-history__main">
              <p className="st-history__summary">{v.summary || "Published changes"}</p>
              <p className="st-history__meta">
                <time dateTime={v.date}>{formatWhen(v.date)}</time>
                {v.author ? ` · ${v.author}` : ""}
              </p>
              <VersionBadges v={v} />
            </div>
            <div className="st-history__actions">
              {v.current || VERSION_PREVIEWS ? (
                <Tooltip content="Open this version in a new tab">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Eye />}
                    aria-label={`Preview the version from ${formatWhen(v.date)}`}
                    onClick={() =>
                      window.open(hub.versionPreviewUrl(site.id, v.sha), "_blank", "noopener")
                    }
                  >
                    Preview
                  </Button>
                </Tooltip>
              ) : (
                <span className="st-history__unavailable">Preview not available yet</span>
              )}
              {!v.current && v.status !== "failure" && v.restorable !== false && canRollback && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RotateCcw />}
                  aria-label={`Roll back to the version from ${formatWhen(v.date)}`}
                  onClick={() => setTarget(v)}
                >
                  Roll back
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {!canRollback && (
        <p className="st-history__note">
          Designers and owners can roll the live site back to any version.
        </p>
      )}
      <Dialog
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) {
            setTarget(null);
            setFailure(null);
          }
        }}
        title="Roll back to this version?"
        description={
          target
            ? `Your live site goes back to “${target.summary || "Published changes"}” from ${formatWhen(target.date)}. Unpublished changes in the editor are saved as a snapshot first, and nothing is lost: you can return to any version later.`
            : undefined
        }
        footer={
          <>
            {failure && (
              <p className="st-history__failure" role="alert">
                Couldn’t roll back: {failure}
              </p>
            )}
            <Button variant="secondary" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={rollback} disabled={busy}>
              {busy ? "Rolling back…" : "Roll back"}
            </Button>
          </>
        }
      />
    </>
  );
}

function Snapshots() {
  const { hub, site } = useSync();
  const role = useRole();
  const queryClient = useQueryClient();
  const snapshots = useQuery({
    queryKey: ["snapshots", site.id],
    queryFn: () => hub.listSnapshots(site.id),
    staleTime: 0,
  });
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<Snapshot | null>(null);
  const [restoring, setRestoring] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await hub.createSnapshot(site.id, name.trim());
      setName("");
      toast({
        tone: "success",
        title: "Snapshot saved",
        description: "You can bring the draft back to it any time.",
      });
      void queryClient.invalidateQueries({ queryKey: ["snapshots", site.id] });
    } catch (err) {
      toast({
        tone: "danger",
        title: "Couldn’t save the snapshot",
        description: plainError(err, "Try again."),
      });
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    if (!target) return;
    setRestoring(true);
    try {
      const r = await hub.restoreSnapshot(site.id, target.name);
      toast({
        tone: r.failed ? "neutral" : "success",
        title: r.failed ? "Snapshot partly restored" : "Snapshot restored",
        description: r.failed
          ? `${r.applied} change${r.applied === 1 ? "" : "s"} applied; ${r.failed} couldn’t be, because ${r.failed === 1 ? "that part has" : "those parts have"} changed too much since. Publish when you’re happy with the draft.`
          : r.applied === 0
            ? "The draft already matched it."
            : `${r.applied} change${r.applied === 1 ? "" : "s"} applied to the draft. Publish to make them live.`,
      });
      setTarget(null);
    } catch (err) {
      toast({
        tone: "danger",
        title: "Couldn’t restore it",
        description: plainError(err, "Try again."),
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      {EDITORS.has(role) && (
        <form className="st-history__form" onSubmit={create}>
          <Input
            aria-label="Snapshot name"
            placeholder="Name this moment, e.g. Spring launch"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" size="sm" icon={<Bookmark />} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save snapshot"}
          </Button>
        </form>
      )}
      {snapshots.isPending ? (
        <div className="st-history__loading" role="status" aria-label="Loading snapshots">
          <Skeleton height={36} />
        </div>
      ) : snapshots.isError ? (
        <EmptyState
          size="sm"
          title="Couldn’t load snapshots"
          description={plainError(snapshots.error, "Try again in a moment.")}
        />
      ) : snapshots.data.length === 0 ? (
        <EmptyState
          size="sm"
          title="No snapshots yet"
          description="Save one before a big change. OpenSpace also saves one automatically before AI sessions and rollbacks."
        />
      ) : (
        <ul className="st-history__list" aria-label="Snapshots">
          {snapshots.data.map((s) => (
            <li key={s.tag} className="st-history__item">
              <div className="st-history__main">
                <p className="st-history__summary">{snapshotLabel(s)}</p>
                <p className="st-history__meta">
                  {s.date ? <time dateTime={s.date}>{formatWhen(s.date)}</time> : "Saved earlier"}
                  {s.automatic ? " · Saved automatically" : ""}
                </p>
              </div>
              {DESIGNERS.has(role) && (
                <div className="st-history__actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Restore ${snapshotLabel(s)}`}
                    onClick={() => setTarget(s)}
                  >
                    Restore
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Restore this snapshot?"
        description="The draft changes to match the snapshot. Your live site stays as it is until you publish."
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={restore} disabled={restoring}>
              {restoring ? "Restoring…" : "Restore"}
            </Button>
          </>
        }
      />
    </>
  );
}

/** History: published versions (preview, roll back) and named snapshots. */
export function HistorySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="History"
      side="right"
      className="st-history"
    >
      <Tabs
        aria-label="History"
        items={[
          { value: "versions", label: "Published", content: <Versions /> },
          { value: "snapshots", label: "Snapshots", content: <Snapshots /> },
        ]}
      />
    </Sheet>
  );
}
