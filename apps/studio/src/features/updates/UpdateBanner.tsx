import { ArrowUpCircle, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import {
  type KitUpdate,
  pendingUpdate,
  useApplyUpdate,
  useDismissUpdate,
  useSiteUpdates,
} from "../../api";
import { HubError, type Site } from "../../api/types";
import { Badge, Button, Dialog, IconButton, Spinner, toast } from "../../ui";
import "./updates.css";

/** Plain words for a failed update (the Hub's raw error is never shown). */
export const UPDATE_FAILED =
  "The update didn’t finish, and your site wasn’t changed. Try again in a moment.";

const DESIGNERS = new Set(["owner", "designer"]);
const READERS = new Set(["owner", "designer", "editor"]);

/** Plain-language summary of an update's first notes. */
export function updateHeadline(u: KitUpdate): string {
  const notes = u.changelog.flatMap((e) => e.notes);
  return notes[0] ?? u.title;
}

function UpdateDialog({
  site,
  update,
  open,
  onOpenChange,
}: {
  site: Site;
  update: KitUpdate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const apply = useApplyUpdate(site.id);
  const dismiss = useDismissUpdate(site.id);
  const canApply = DESIGNERS.has(site.role ?? "");
  const busy = apply.isPending || dismiss.isPending;
  const failed = update.status === "failed" || apply.isError;
  // Never show the Hub's raw failure text (it can be a host's merge error): a HubError carries
  // a message written for people; anything else gets plain words.
  const error =
    apply.error instanceof HubError && apply.error.status !== 0
      ? apply.error.message
      : UPDATE_FAILED;

  const doApply = () =>
    apply.mutate(update.id, {
      onSuccess: (u) => {
        onOpenChange(false);
        toast({
          tone: "success",
          title: `Updated to OpenSpace ${u.to}`,
          description:
            "Your site is being republished with the new version. Your words, photos and pages didn’t change.",
        });
      },
    });
  const doDismiss = () =>
    dismiss.mutate(update.id, {
      onSuccess: () => {
        onOpenChange(false);
        toast({ title: "Update skipped", description: "You’ll hear about the next one." });
      },
      onError: (err) =>
        toast({ tone: "danger", title: "Couldn’t skip the update", description: err.message }),
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={`Update to OpenSpace ${update.to}`}
      description={`Your site is on ${update.from}. Updates improve how your site looks and works; your words, photos and pages stay as they are.`}
      width={560}
      footer={
        <div className="st-upd__foot">
          {canApply && (
            <Button variant="ghost" size="sm" onClick={doDismiss} disabled={busy}>
              Skip this update
            </Button>
          )}
          <span className="st-upd__spacer" />
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Not now
          </Button>
          {canApply && (
            <Button variant="primary" onClick={doApply} disabled={busy}>
              {apply.isPending ? "Updating…" : failed ? "Try again" : "Update now"}
            </Button>
          )}
        </div>
      }
    >
      <div className="st-upd">
        <section aria-label="What’s new" className="st-upd__log">
          {update.changelog.map((entry) => (
            <div key={entry.version} className="st-upd__version">
              <h3 className="st-upd__vtitle">
                {entry.version}
                {entry.security && (
                  <Badge tone="danger">
                    <ShieldCheck aria-hidden="true" /> Security fix
                  </Badge>
                )}
              </h3>
              <ul>
                {entry.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section aria-label="Preview" className="st-upd__preview">
          {update.previewUrl ? (
            <div className="st-upd__frame">
              <iframe
                src={update.previewUrl}
                title={`Your site with OpenSpace ${update.to}`}
                sandbox="allow-scripts"
                loading="lazy"
              />
            </div>
          ) : (
            <p className="st-upd__muted">
              There’s no live preview for this update, so here’s what changes. If anything looks off
              afterwards, History takes your site back to how it was.
            </p>
          )}
        </section>
        {apply.isPending && (
          <p className="st-upd__status" role="status">
            <Spinner size={12} /> Updating your site…
          </p>
        )}
        {failed && !apply.isPending && (
          <p className="st-upd__error" role="alert">
            {error}
          </p>
        )}
        {!canApply && (
          <p className="st-upd__muted">Ask an owner or designer of this site to update it.</p>
        )}
      </div>
    </Dialog>
  );
}

/** "Update available" banner over the canvas, with the changelog, preview and apply. */
export function UpdateBanner({ site }: { site: Site }) {
  const enabled = READERS.has(site.role ?? "") && site.status !== "building";
  const updates = useSiteUpdates(site.id, { enabled });
  const [hidden, setHidden] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const update = pendingUpdate(updates.data);
  if (!enabled || !update) return null;
  return (
    <>
      {hidden !== update.id && (
        <div className="st-upd-banner" role="status" data-security={update.security || undefined}>
          <ArrowUpCircle aria-hidden="true" className="st-upd-banner__icon" />
          <span className="st-upd-banner__text">
            <strong>
              {update.status === "failed"
                ? "The last update didn’t finish"
                : `OpenSpace ${update.to} is ready`}
            </strong>
            <span className="st-upd-banner__detail">{updateHeadline(update)}</span>
          </span>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            See what’s new
          </Button>
          <IconButton
            size="sm"
            label="Hide for now"
            icon={<X />}
            tooltip={false}
            onClick={() => setHidden(update.id)}
          />
        </div>
      )}
      <UpdateDialog site={site} update={update} open={open} onOpenChange={setOpen} />
    </>
  );
}
