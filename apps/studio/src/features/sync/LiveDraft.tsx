import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Eye, FileClock, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Dialog, IconButton, Menu, type MenuEntry, toast } from "../../ui";
import { describeChanges } from "./changes";
import { asBody, plainError, useRoomState, useSync, useSyncSession } from "./SyncContext";
import "./sync.css";

/**
 * The draft against the live site.
 *
 * Studio edits a draft; the live site is the last published version. Claude Code, the CLI or an
 * edit on GitHub can publish without going through the draft, so a draft started earlier can
 * be older than what's live. The Hub brings a draft with no changes of its own up to date by
 * itself; a draft with changes shows "Your live site changed" here, so the person chooses —
 * and publishing that draft over the newer live site always asks first.
 */

const DESIGNERS = new Set(["owner", "designer"]);

export const liveStatusKey = (siteId: string) => ["live-status", siteId] as const;

/** How often the live site is checked while editing (also on focus and after each save). */
const LIVE_POLL_MS = 60_000;

/** The person's role on this site (from the site, else the room); unknown is least privilege. */
function useRoleName(): string {
  const { site } = useSync();
  const roomRole = useRoomState((s) => s.you?.role);
  return site.role ?? roomRole ?? "contributor";
}

/** Can this person put the whole draft back to the live version? (The Hub's rule too.) */
export function useCanGoBackToLive(): boolean {
  return DESIGNERS.has(useRoleName());
}

/** `GET …/room/live`, refreshed on focus, every minute, and after the draft is saved or published. */
export function useLiveStatus() {
  const { hub, site, client } = useSync();
  const queryClient = useQueryClient();
  const status = useRoomState((s) => s.status);
  const query = useQuery({
    queryKey: liveStatusKey(site.id),
    queryFn: () => hub.getLiveStatus(site.id),
    enabled: status === "online",
    staleTime: 10_000,
    refetchInterval: LIVE_POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: liveStatusKey(site.id) });
    const offEvents = client.on((e) => {
      if (e.type === "published" || e.type === "reload") refresh();
      if (e.type === "build" && e.notice.state === "success") refresh();
    });
    // The draft was saved to the Hub ("flushed"): what's unpublished may have changed.
    const offState = client.state.subscribe((s, prev) => {
      if (s.lastSavedAt !== prev.lastSavedAt) refresh();
    });
    return () => {
      offEvents();
      offState();
    };
  }, [client, queryClient, site.id]);
  return query;
}

/**
 * The live site's notice, unless it was already answered here for this live version.
 * `null` while unknown or when nothing changed.
 */
export function useLiveChanged(): { liveSha: string | null } | null {
  const { data } = useLiveStatus();
  const answered = useSyncSession((s) => s.liveAnswered);
  if (!data?.liveChanged) return null;
  if (answered && answered === data.liveSha) return null;
  return { liveSha: data.liveSha };
}

/** True when the editor has changes that aren't live yet (as far as Studio knows). */
export function useHasUnpublishedChanges(): boolean {
  const { data } = useLiveStatus();
  const pending = useRoomState((s) => s.pending);
  return pending > 0 || data?.draftHasChanges === true;
}

/**
 * Put the draft back to exactly what's live, as ordinary edits: undoable (a toast offers Undo),
 * and everyone editing sees it. Returns false when it couldn't.
 */
export function useGoBackToLive(): { run: () => Promise<boolean>; busy: boolean } {
  const { hub, site, store, session } = useSync();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const live = await hub.getDocument(site.id, { ref: "published" });
      const draft = store.getState().doc;
      // `diff(draft → live)` reverts every unpublished change.
      const ops = describeChanges(draft, live.document).ops;
      if (ops.length) {
        const r = store.getState().commit(ops.map(asBody), { label: "Use the live version" });
        if (!r.ok) {
          toast({
            tone: "danger",
            title: "Couldn’t go back to the live version",
            description: r.errors[0]?.message,
          });
          return false;
        }
      }
      const liveSha = queryClient.getQueryData<{ liveSha: string | null }>(
        liveStatusKey(site.id),
      )?.liveSha;
      session.setState({ liveAnswered: liveSha ?? live.head ?? null });
      toast({
        title: "Showing your live site",
        description: ops.length
          ? "The draft matches what’s live now. Your unpublished changes are gone."
          : "The draft already matched what’s live.",
        ...(ops.length
          ? { action: { label: "Undo", onClick: () => store.getState().undo() } }
          : {}),
      });
      return true;
    } catch (err) {
      toast({
        tone: "danger",
        title: "Couldn’t go back to the live version",
        description: plainError(err, "Try again in a moment."),
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

/** Address of the live site with the version in it, so no cached copy is shown. */
function liveAddress(url: string, sha: string | null | undefined): string {
  if (!sha) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("v", sha.slice(0, 7));
    return u.toString();
  } catch {
    return url;
  }
}

/** Opens the live site in a new tab. */
export function useOpenLiveSite(): (() => void) | null {
  const { site } = useSync();
  const { data } = useLiveStatus();
  if (!site.url) return null;
  return () => window.open(liveAddress(site.url, data?.liveSha), "_blank", "noopener");
}

/** "Go back to the live version?" — the confirmation shared by the menu and the banner. */
export function GoBackToLiveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run, busy } = useGoBackToLive();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Go back to the live version?"
      description="The editor will show exactly what’s on your live site now. Your unpublished changes are removed; you can undo this right after."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep editing
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              if (await run()) onOpenChange(false);
            }}
          >
            {busy ? "Going back…" : "Use the live version"}
          </Button>
        </>
      }
    />
  );
}

/**
 * "Your live site changed": the live site has work this draft doesn't include (Claude or someone
 * published from somewhere else) and the draft has its own changes. The safe choice comes first.
 */
export function LiveChangedBanner({ standalone = false }: { standalone?: boolean }) {
  const { session } = useSync();
  const changed = useLiveChanged();
  const canGoBack = useCanGoBackToLive();
  const openLive = useOpenLiveSite();
  const [confirm, setConfirm] = useState(false);
  if (!changed) return null;
  const keep = () => session.setState({ liveAnswered: changed.liveSha });
  const banner = (
    <section
      className="st-banner st-banner--live"
      role="alert"
      aria-label="Your live site changed"
      data-testid="live-changed"
    >
      <TriangleAlert aria-hidden="true" className="st-banner__icon" />
      <p className="st-banner__text">
        <strong>Your live site has newer changes.</strong> Someone published (maybe Claude) after
        this draft was started, so the editor isn’t showing them. Publishing this draft would
        replace them.
      </p>
      <div className="st-banner__actions">
        {openLive && (
          <Button size="sm" variant="ghost" icon={<ExternalLink />} onClick={openLive}>
            View live site
          </Button>
        )}
        {canGoBack ? (
          <>
            <Button size="sm" variant="ghost" onClick={keep}>
              Keep my draft
            </Button>
            <Button size="sm" variant="primary" onClick={() => setConfirm(true)}>
              Use the live version
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={keep}>
            Got it
          </Button>
        )}
      </div>
      <GoBackToLiveDialog open={confirm} onOpenChange={setConfirm} />
    </section>
  );
  // On its own (no other banner showing) it brings the banner stack's layout with it.
  return standalone ? <div className="st-banners">{banner}</div> : banner;
}

/**
 * "Unpublished changes ▾" in the top bar: see the live site, preview the draft, or go back to
 * the live version (undoable). Hidden while everything in the editor is live. `compact` is the
 * phone's icon-only version.
 */
export function DraftMenu({
  compact = false,
  labelClassName,
}: {
  compact?: boolean;
  /** Class for the label (e.g. hidden on narrow screens, leaving the icon). */
  labelClassName?: string;
}) {
  const { hub, site } = useSync();
  const unpublished = useHasUnpublishedChanges();
  const canGoBack = useCanGoBackToLive();
  const openLive = useOpenLiveSite();
  const [confirm, setConfirm] = useState(false);
  if (!unpublished) return null;
  const items: MenuEntry[] = [{ type: "label", label: "The editor shows your draft" }];
  if (openLive) items.push({ label: "View live site", icon: <ExternalLink />, onSelect: openLive });
  items.push({
    label: "Preview this draft",
    icon: <Eye />,
    onSelect: () => window.open(hub.draftPreviewUrl(site.id), "_blank", "noopener"),
  });
  if (canGoBack)
    items.push(
      { type: "separator" },
      {
        label: "Go back to the live version…",
        icon: <RotateCcw />,
        danger: true,
        onSelect: () => setConfirm(true),
      },
    );
  const label = "Unpublished changes";
  return (
    <>
      <Menu
        label="Draft and live site"
        align="end"
        items={items}
        trigger={
          compact ? (
            <IconButton
              label={label}
              icon={<FileClock />}
              tooltip={false}
              className="st-draft-menu st-draft-menu--compact"
            />
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="st-draft-menu"
              icon={<FileClock />}
              trailing={<ChevronDown />}
              aria-label={label}
            >
              <span className={labelClassName}>{label}</span>
            </Button>
          )
        }
      />
      <GoBackToLiveDialog open={confirm} onOpenChange={setConfirm} />
    </>
  );
}
