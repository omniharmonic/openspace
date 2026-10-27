import {
  ArrowRightLeft,
  ArrowUpRight,
  Bot,
  Copy,
  Ellipsis,
  Inbox,
  LayoutGrid,
  PenLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Rows3,
  Sparkles,
  Trash2,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import {
  useDeleteSite,
  useRetryImport,
  useRetryPublish,
  useSession,
  useSetupInfo,
  useSites,
  useTemplates,
  useTransferSite,
} from "../../api";
import { importInProgress } from "../../api/import-types";
import { needsGitHub, type Site, type TemplateSummary } from "../../api/types";
import { AppHeader } from "../../app/AppHeader";
import { LoadError } from "../../app/Connection";
import { useConfig } from "../../app/config";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  type MenuEntry,
  Segmented,
  Skeleton,
  Spinner,
  toast,
  useRegisterCommands,
} from "../../ui";
import { displayUrl } from "../onboarding/BuildingProgress";
import { readAcknowledged } from "../setup/checklist";
import { TemplateRender } from "../templates/TemplateRender";
import "../setup/setup.css";
import "./Dashboard.css";

/**
 * "Finish setting up" on a live site's card (owners and designers) while the importer's list or a
 * domain is still open. The full list (with what the content needs) opens in the editor.
 */
function SetupLink({ site }: { site: Site }) {
  const navigate = useNavigate();
  const canSetUp = site.role === "owner" || site.role === "designer";
  const setup = useSetupInfo(site.id, canSetUp && site.status === "live");
  if (!canSetUp || site.status !== "live" || !setup.data) return null;
  const ack = readAcknowledged(site.id);
  const left =
    (setup.data.imported?.items ?? []).filter(
      (i) => !i.done && !ack.includes(i.kind) && !ack.includes(`import:${i.id}`),
    ).length + (site.domain || ack.includes("domain") ? 0 : 1);
  if (left === 0) return null;
  return (
    <button
      type="button"
      className="st-setup-chip"
      onClick={() => navigate(`/sites/${site.id}/settings/setup`)}
    >
      <span className="st-setup-chip__ring" aria-hidden="true" />
      Finish setting up
    </button>
  );
}

type View = "cards" | "gardener";

export function StatusBadge({
  status,
  github,
}: {
  status: Site["status"];
  github?: Site["github"];
}) {
  if (github && github.access !== "ok")
    return (
      <Badge tone="pending" dot>
        {status === "live" ? "Reconnect GitHub" : "One more step"}
      </Badge>
    );
  if (status === "live")
    return (
      <Badge tone="live" dot>
        Live
      </Badge>
    );
  if (status === "building")
    return (
      <Badge tone="pending" dot pulse>
        Setting up
      </Badge>
    );
  return (
    <Badge tone="danger" dot>
      Needs attention
    </Badge>
  );
}

function inboxLabel(n: number) {
  return n === 1 ? "1 new entry" : `${n} new entries`;
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast({ tone: "success", title: "Link copied", description: displayUrl(url) });
  } catch {
    toast({ tone: "danger", title: "Couldn’t copy the link", description: url });
  }
}

function siteMenu(
  site: Site,
  actions: { open: () => void; transfer: () => void; remove: () => void; retry: () => void },
  myLogin?: string,
): MenuEntry[] {
  const items: MenuEntry[] = [
    { label: "Open editor", icon: <PenLine />, onSelect: actions.open },
    {
      label: "View live site",
      icon: <ArrowUpRight />,
      disabled: site.status !== "live",
      onSelect: () => window.open(site.url, "_blank", "noopener"),
    },
    { label: "Copy link", icon: <Copy />, onSelect: () => void copyLink(site.url) },
  ];
  if (site.status === "failed") {
    items.push({
      label: moveFailed(site) ? "Try the move again" : "Try publishing again",
      icon: <RotateCcw />,
      onSelect: actions.retry,
    });
  }
  if (site.owner === myLogin) {
    items.push(
      { type: "separator" },
      { label: "Transfer ownership…", icon: <ArrowRightLeft />, onSelect: actions.transfer },
      { label: "Delete site…", icon: <Trash2 />, danger: true, onSelect: actions.remove },
    );
  }
  return items;
}

function TransferDialog({ site, onClose }: { site: Site | null; onClose: () => void }) {
  const transfer = useTransferSite();
  const [to, setTo] = useState("");
  const [confirm, setConfirm] = useState("");
  const ready = to.trim().length > 0 && confirm.trim() === site?.name;

  /** Every way out (Cancel, Esc, overlay, ×, success) clears the form and the last error. */
  const close = () => {
    setTo("");
    setConfirm("");
    transfer.reset();
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!site || !ready) return;
    transfer.mutate(
      { id: site.id, to: to.trim() },
      {
        onSuccess: (res) => {
          toast({
            tone: "success",
            title:
              res.status === "complete"
                ? `${site.name} now belongs to ${res.site.owner}`
                : `Transfer sent to ${to.trim()}`,
            description:
              res.status === "complete"
                ? "You’re still on the site as a designer."
                : "It completes when they accept the invitation.",
          });
          close();
        },
      },
    );
  };

  return (
    <Dialog
      open={Boolean(site)}
      onOpenChange={(open) => !open && close()}
      title={`Transfer ${site?.name ?? "site"}`}
      description="The site and its files move to the new owner’s GitHub account. You stay on as a designer so you can keep helping, and they can remove you any time."
      width={460}
    >
      <form className="st-transfer" onSubmit={submit}>
        <Field label="New owner" hint="Their GitHub username or email address.">
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="client-username"
            data-autofocus
          />
        </Field>
        <Field label={`Type “${site?.name ?? ""}” to confirm`}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
        {transfer.error && (
          <p className="st-transfer__error" role="alert">
            {transfer.error.message}
          </p>
        )}
        <div className="st-transfer__actions">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!ready} loading={transfer.isPending}>
            Transfer ownership
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ site, onClose }: { site: Site | null; onClose: () => void }) {
  const remove = useDeleteSite();
  const [confirm, setConfirm] = useState("");
  const ready = Boolean(site) && confirm.trim() === site?.name;

  const close = () => {
    setConfirm("");
    remove.reset();
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!site || !ready) return;
    remove.mutate(
      { id: site.id, confirmName: confirm.trim() },
      {
        onSuccess: () => {
          toast({
            tone: "success",
            title: `Deleted ${site.name}`,
            description: "Its form entries and subscribers can be exported for 30 days.",
          });
          close();
        },
      },
    );
  };

  return (
    <Dialog
      open={Boolean(site)}
      onOpenChange={(open) => !open && close()}
      title={`Delete ${site?.name ?? "site"}?`}
      description="The site goes offline. Its files are archived in your GitHub account, not erased. Form entries, subscribers and other data kept by OpenSpace stay available to export for 30 days, then they’re permanently removed."
      width={460}
    >
      <form className="st-transfer" onSubmit={submit}>
        <Field label={`Type “${site?.name ?? ""}” to confirm`}>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            data-autofocus
          />
        </Field>
        {remove.error && (
          <p className="st-transfer__error" role="alert">
            {remove.error.message}
          </p>
        )}
        <div className="st-transfer__actions">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!ready} loading={remove.isPending}>
            Delete site
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SiteCard({
  site,
  template,
  menu,
  onRetry,
  retrying,
}: {
  site: Site;
  template: TemplateSummary | undefined;
  menu: MenuEntry[];
  onRetry: () => void;
  retrying: boolean;
}) {
  const look = template?.looks.find((l) => l.id === site.look) ?? template?.looks[0];
  const moving = site.import && importInProgress(site.import.state) ? site.import : null;
  const failedMove = moveFailed(site);
  const href = moving
    ? `/move/${moving.id}`
    : failedMove
      ? `/move/${failedMove}`
      : `/sites/${site.id}`;
  return (
    <article className="st-sitecard" aria-labelledby={`site-${site.id}`}>
      <Link to={href} className="st-sitecard__preview" tabIndex={-1} aria-hidden="true">
        {look && template ? (
          <TemplateRender
            template={template}
            look={look}
            aspect={9 / 16}
            title={`Preview of ${site.name}`}
            personalize={{ name: site.name, tagline: site.tagline ?? undefined }}
          />
        ) : (
          <div className="st-sitecard__blank" />
        )}
      </Link>
      <div className="st-sitecard__body">
        <div className="st-sitecard__row">
          <h2 id={`site-${site.id}`} className="st-sitecard__name">
            <Link to={href}>{site.name}</Link>
          </h2>
          <Menu
            align="end"
            label={`${site.name} actions`}
            items={menu}
            trigger={
              <IconButton
                label={`More actions for ${site.name}`}
                icon={<Ellipsis />}
                size="sm"
                tooltip={false}
              />
            }
          />
        </div>
        <a className="st-sitecard__url" href={site.url} target="_blank" rel="noreferrer">
          {displayUrl(site.url)}
        </a>
        <div className="st-sitecard__meta">
          {moving ? (
            <Badge tone="accent">
              <ArrowRightLeft size={11} aria-hidden="true" />
              {moving.state === "review" ? "Waiting for your approval" : "Moving in…"}
            </Badge>
          ) : (
            <StatusBadge status={site.status} github={site.github} />
          )}
          {site.inboxCount > 0 && (
            <Badge tone="accent">
              <Inbox size={11} aria-hidden="true" />
              {inboxLabel(site.inboxCount)}
            </Badge>
          )}
          {site.updateAvailable && (
            <Badge tone="neutral">
              <RefreshCw size={11} aria-hidden="true" />
              Update ready
            </Badge>
          )}
        </div>
        {!needsGitHub(site) && <SetupLink site={site} />}
        {needsGitHub(site) ? (
          <div className="st-sitecard__problem">
            <p className="st-sitecard__note">{failedNote(site)}</p>
            {site.github?.access !== "requested" &&
            site.github?.connectUrl &&
            (site.role ?? "owner") === "owner" ? (
              <a
                className="st-button st-button--secondary st-button--sm"
                href={site.github.connectUrl}
              >
                {site.status === "live" ? "Reconnect GitHub" : "Connect GitHub"}
              </a>
            ) : (
              <Button size="sm" icon={<RotateCcw />} onClick={onRetry} loading={retrying}>
                Try again
              </Button>
            )}
          </div>
        ) : (
          site.status === "failed" && (
            <div className="st-sitecard__problem">
              <p className="st-sitecard__note">{failedNote(site)}</p>
              <Button size="sm" icon={<RotateCcw />} onClick={onRetry} loading={retrying}>
                Try again
              </Button>
            </div>
          )
        )}
      </div>
    </article>
  );
}

/** The id of a move (into a new site) that didn't finish: its card offers to try the move again. */
export function moveFailed(site: Pick<Site, "import">): string | null {
  return site.import?.state === "failed" && site.import.kind !== "convert" ? site.import.id : null;
}

/**
 * Why a site shows as failed, in plain words. The Hub's own detail wins; otherwise don't claim
 * it never went live (a site can be live with only its latest publish failing).
 */
export function failedNote(site: Pick<Site, "statusDetail">): string {
  return site.statusDetail?.trim() || "The latest publish didn’t finish.";
}

function GardenerTable({
  sites,
  menuFor,
  myLogin,
}: {
  sites: Site[];
  menuFor: (s: Site) => MenuEntry[];
  myLogin?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="st-table-wrap">
      <table className="st-table">
        <thead>
          <tr>
            <th scope="col">Site</th>
            <th scope="col">Status</th>
            <th scope="col" className="st-table__num">
              Inbox
            </th>
            <th scope="col">Updates</th>
            <th scope="col">Owner</th>
            <th scope="col">
              <span className="st-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.id} onDoubleClick={() => navigate(`/sites/${s.id}`)}>
              <td>
                <Link to={`/sites/${s.id}`} className="st-table__name">
                  {s.name}
                </Link>
                <span className="st-table__url">{displayUrl(s.url)}</span>
              </td>
              <td>
                <StatusBadge status={s.status} github={s.github} />
              </td>
              <td className="st-table__num">
                {s.inboxCount > 0 ? (
                  <Badge tone="accent">{s.inboxCount}</Badge>
                ) : (
                  <span className="st-table__muted">0</span>
                )}
              </td>
              <td>
                {s.updateAvailable ? (
                  <Badge>Update ready</Badge>
                ) : (
                  <span className="st-table__muted">Up to date</span>
                )}
              </td>
              <td>
                <span className="st-table__owner">{s.owner === myLogin ? "You" : s.owner}</span>
                {s.role && s.owner !== myLogin && (
                  <span className="st-table__url">
                    You’re {s.role === "editor" ? "an editor" : `a ${s.role}`}
                  </span>
                )}
              </td>
              <td className="st-table__actions">
                <Menu
                  align="end"
                  label={`${s.name} actions`}
                  items={menuFor(s)}
                  trigger={
                    <IconButton
                      label={`More actions for ${s.name}`}
                      icon={<Ellipsis />}
                      size="sm"
                      tooltip={false}
                    />
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What came back from GitHub's install page (`/sites?github=…`), said once, in plain words. */
const GITHUB_OUTCOMES: Record<
  string,
  { tone?: "success" | "danger"; title: string; text: string }
> = {
  connected: {
    tone: "success",
    title: "GitHub is connected",
    text: "Your sites can be saved and published.",
  },
  cancelled: {
    title: "The GitHub step wasn’t finished",
    text: "No problem. If a site still needs it, its card shows Connect GitHub — choose it to try again.",
  },
  requested: {
    title: "Request sent",
    text: "Your organization’s owner needs to approve OpenSpace on GitHub. We’ll carry on once they do.",
  },
  repo_access: {
    title: "One more permission",
    text: "OpenSpace can only see some of your repositories. The site’s card shows how to give it access.",
  },
  not_yours: {
    tone: "danger",
    title: "That GitHub permission belongs to a different account",
    text: "Sign in to GitHub as yourself and try again.",
  },
  error: {
    tone: "danger",
    title: "We couldn’t check with GitHub just now",
    text: "Wait a moment, then try again.",
  },
};

function useGitHubOutcome() {
  const [params, setParams] = useSearchParams();
  const outcome = params.get("github");
  useEffect(() => {
    if (!outcome) return;
    const o = GITHUB_OUTCOMES[outcome];
    if (o) toast({ ...(o.tone ? { tone: o.tone } : {}), title: o.title, description: o.text });
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete("github");
        return next;
      },
      { replace: true },
    );
  }, [outcome, setParams]);
}

const VIEW_KEY = "openspace.dashboard.view";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "gardener" ? "gardener" : "cards";
  } catch {
    return "cards";
  }
}

export function Dashboard() {
  const session = useSession();
  const user = session.data?.user;
  const { timing } = useConfig();
  const sites = useSites({ enabled: Boolean(user), pollMs: timing.pollMs * 2 });
  const templates = useTemplates();
  const navigate = useNavigate();
  useGitHubOutcome();
  const [view, setViewState] = useState<View>(readView);
  const [transferring, setTransferring] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState<Site | null>(null);
  const retry = useRetryPublish();
  const retryMove = useRetryImport();
  const retryPublish = (s: Site) => {
    // A move that didn't finish is retried as a move (not by publishing its placeholder page).
    const failedMove = moveFailed(s);
    if (failedMove)
      return retryMove.mutate(failedMove, {
        onSuccess: () => navigate(`/move/${failedMove}`),
        onError: (err) =>
          toast({
            tone: "danger",
            title: "The move couldn’t start again",
            description: err.message,
          }),
      });
    return retry.mutate(s.id, {
      onSuccess: () =>
        toast({
          title: `Publishing ${s.name} again`,
          description: "This usually takes about a minute.",
        }),
      onError: (err) =>
        toast({
          tone: "danger",
          title: `${s.name} couldn’t be published`,
          description: err.message,
        }),
    });
  };
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  };

  const templateById = useMemo(
    () => new Map((templates.data ?? []).map((t) => [t.id, t])),
    [templates.data],
  );
  const menuFor = (s: Site) =>
    siteMenu(
      s,
      {
        open: () => navigate(`/sites/${s.id}`),
        transfer: () => setTransferring(s),
        remove: () => setDeleting(s),
        retry: () => retryPublish(s),
      },
      user?.login,
    );

  useRegisterCommands("dashboard", [
    {
      id: "new-site",
      label: "New site",
      group: "Sites",
      icon: <Plus />,
      run: () => navigate("/templates"),
    },
    {
      id: "move-site",
      label: "Move an existing site",
      group: "Sites",
      icon: <ArrowRightLeft />,
      run: () => navigate("/move"),
    },
    {
      id: "view-cards",
      label: "Show sites as cards",
      group: "View",
      icon: <LayoutGrid />,
      run: () => setView("cards"),
    },
    {
      id: "view-gardener",
      label: "Show Site Gardener table",
      group: "View",
      icon: <Rows3 />,
      run: () => setView("gardener"),
    },
    ...(sites.data ?? []).map((s) => ({
      id: `open-${s.id}`,
      label: `Open ${s.name}`,
      group: "Sites",
      icon: <PenLine />,
      run: () => navigate(`/sites/${s.id}`),
    })),
  ]);

  if (session.isPending) {
    return (
      <div className="st-center">
        <Spinner size={18} label="Loading" />
      </div>
    );
  }
  if (!user) return <Navigate to="/signin?next=/sites" replace />;

  const list = sites.data ?? [];
  const totals = {
    inbox: list.reduce((n, s) => n + s.inboxCount, 0),
    updates: list.filter((s) => s.updateAvailable).length,
    attention: list.filter((s) => s.status === "failed").length,
  };

  return (
    <div className="st-page">
      <AppHeader />
      <main className="st-dash">
        <div className="st-dash__head">
          <div>
            <h1 className="st-dash__title">Your sites</h1>
            {list.length > 0 && (
              <p className="st-dash__summary">
                <span>{list.length === 1 ? "1 site" : `${list.length} sites`}</span>
                {totals.inbox > 0 && <span>{inboxLabel(totals.inbox)}</span>}
                {totals.updates > 0 && (
                  <span>
                    {totals.updates === 1 ? "1 update ready" : `${totals.updates} updates ready`}
                  </span>
                )}
                {totals.attention > 0 && (
                  <span className="st-dash__warn">
                    {totals.attention === 1
                      ? "1 needs attention"
                      : `${totals.attention} need attention`}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="st-dash__tools">
            {list.length > 0 && (
              <Segmented<View>
                aria-label="Layout"
                value={view}
                onValueChange={setView}
                options={[
                  { value: "cards", label: <LayoutGrid />, ariaLabel: "Cards" },
                  { value: "gardener", label: <Rows3 />, ariaLabel: "Site Gardener table" },
                ]}
              />
            )}
            <Button variant="secondary" icon={<ArrowRightLeft />} onClick={() => navigate("/move")}>
              Move a site
            </Button>
            <Button variant="secondary" icon={<Sparkles />} onClick={() => navigate("/start")}>
              Start with Claude
            </Button>
            <Button variant="primary" icon={<Plus />} onClick={() => navigate("/templates")}>
              New site
            </Button>
          </div>
        </div>

        {sites.isPending ? (
          <div className="st-dash__grid" role="status" aria-busy="true" aria-label="Loading sites">
            {[0, 1, 2].map((i) => (
              <div key={i} className="st-sitecard">
                <Skeleton height="auto" className="st-sitecard__skeleton" />
                <div className="st-sitecard__body">
                  <Skeleton width="50%" height={14} />
                  <Skeleton width="70%" height={10} />
                </div>
              </div>
            ))}
          </div>
        ) : sites.isError ? (
          <LoadError
            title="Your sites didn’t load"
            error={sites.error}
            onRetry={() => void sites.refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<LayoutGrid />}
            title="Make your first site"
            description="Pick a template, add your name, and it’s online in a few minutes. Or tell Claude about your idea and bring your brand — or a page Claude made you — and it designs the site with you. Already have a site? Move it here."
            action={
              <div className="st-dash__empty-actions">
                <Button variant="primary" onClick={() => navigate("/templates")}>
                  Browse templates
                </Button>
                <Button variant="secondary" icon={<Sparkles />} onClick={() => navigate("/start")}>
                  Start with Claude
                </Button>
                <Button
                  variant="secondary"
                  icon={<ArrowRightLeft />}
                  onClick={() => navigate("/move")}
                >
                  Move my existing site
                </Button>
                <Button variant="secondary" icon={<Bot />} onClick={() => navigate("/connect")}>
                  Connect your AI
                </Button>
              </div>
            }
          />
        ) : view === "cards" ? (
          <div className="st-dash__grid">
            {list.map((s) => (
              <SiteCard
                key={s.id}
                site={s}
                template={templateById.get(s.template)}
                menu={menuFor(s)}
                onRetry={() => retryPublish(s)}
                retrying={
                  (retry.isPending && retry.variables === s.id) ||
                  (retryMove.isPending && retryMove.variables === s.import?.id)
                }
              />
            ))}
          </div>
        ) : (
          <GardenerTable sites={list} menuFor={menuFor} myLogin={user.login} />
        )}
      </main>
      <TransferDialog site={transferring} onClose={() => setTransferring(null)} />
      <DeleteDialog site={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
