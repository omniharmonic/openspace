import { Download, Inbox, Mail, MailOpen, Settings2, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  type Submission,
  useForms,
  useHub,
  useInboxActions,
  useServiceSettings,
  useSubmissions,
  useUpdateServiceSettings,
} from "../../api";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Skeleton,
  toast,
} from "../../ui";
import { saveFile } from "../settings/ExportSettings";
import { can } from "../site-mgmt/manage-ui";
import { ago, dateTime, humanize } from "../workspace/format";
import { ConfirmDialog, errorMessage, SearchField, useDebounced, WsHeader } from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";
import "./inbox.css";

function firstText(s: Submission): { who: string; preview: string } {
  const d = s.data;
  const str = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "");
  const who = str(d.name) || str(d.first_name) || str(d.email) || "Someone";
  const longest = Object.entries(d)
    .filter(([k]) => !["name", "email", "first_name", "phone"].includes(k))
    .map(([, v]) => str(v))
    .sort((a, b) => b.length - a.length)[0];
  return { who, preview: longest || str(d.email) };
}

const emailIn = (s: Submission) => {
  const v = s.data.email;
  const e = Array.isArray(v) ? v[0] : v;
  return typeof e === "string" && /^[^\s@]+@[^\s@]+$/.test(e) ? e : null;
};

/** Form entries from the site's forms: per form, search, read state, export, delete. */
export function InboxView({ site }: AreaProps) {
  const hub = useHub();
  const [params, setParams] = useSearchParams();
  const forms = useForms(site.id);
  const [form, setForm] = useState<string>(params.get("form") ?? "");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"all" | "unread" | "spam">("all");
  const [limit, setLimit] = useState(50);
  const query = useDebounced(q);
  const list = useSubmissions(site.id, {
    form: form || undefined,
    q: query || undefined,
    unread: view === "unread" || undefined,
    spam: view === "spam" || undefined,
    limit,
  });
  const actions = useInboxActions(site.id);
  const [selected, setSelected] = useState<string | null>(params.get("entry"));
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const items = list.data?.submissions ?? [];
  const current = items.find((s) => s.id === selected) ?? null;
  const designer = can(site, "designer");

  // Opening an entry marks it read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: marks an entry read once, when it is opened
  useEffect(() => {
    if (current && !current.read) actions.setRead.mutate({ id: current.id, read: true });
  }, [current?.id]);

  const pick = (id: string | null) => {
    setSelected(id);
    const next = new URLSearchParams(params);
    if (id) next.set("entry", id);
    else next.delete("entry");
    setParams(next, { replace: true });
  };

  const exportCsv = async () => {
    try {
      const file = await hub.downloadSubmissionsCsv(site.id, form || undefined);
      saveFile(file.blob, file.filename);
    } catch (err) {
      toast({ tone: "danger", title: "Couldn't download", description: errorMessage(err) });
    }
  };

  const totalUnread = forms.data?.reduce((n, f) => n + f.unread, 0) ?? 0;
  const formOptions = useMemo(
    () => [
      { value: "__all", label: `All forms${totalUnread ? ` (${totalUnread} new)` : ""}` },
      ...(forms.data ?? []).map((f) => ({
        value: f.id,
        label: `${f.name}${f.unread ? ` (${f.unread} new)` : ""}`,
      })),
    ],
    [forms.data, totalUnread],
  );

  const noForms = forms.isSuccess && forms.data.length === 0;
  const allChecked = items.length > 0 && items.every((s) => checked.has(s.id));

  return (
    <div className="st-ws-stack">
      <WsHeader
        title="Form inbox"
        description="Messages people send through the forms on your site. You also get an email for each one, unless you turn that off."
        actions={
          <>
            <Button icon={<Download />} onClick={exportCsv} disabled={noForms}>
              Export CSV
            </Button>
            <IconButton
              label="Inbox settings"
              icon={<Settings2 />}
              onClick={() => setSettingsOpen(true)}
            />
          </>
        }
      />

      {noForms ? (
        <div className="st-ws-panel">
          <EmptyState
            className="st-ws-empty"
            icon={<Inbox />}
            title="No forms on your site yet"
            description="Add a Contact or Form section to any page. Once it's published, everything people send lands here."
          />
        </div>
      ) : (
        <>
          <div className="st-ws-toolbar">
            <Select
              size="sm"
              value={form || "__all"}
              onValueChange={(v) => {
                setForm(v === "__all" ? "" : v);
                setChecked(new Set());
              }}
              options={formOptions}
            />
            <SearchField value={q} onChange={setQ} label="Search entries" />
            <Segmented
              size="sm"
              aria-label="Show"
              value={view}
              onValueChange={(v) => {
                setView(v);
                setChecked(new Set());
              }}
              options={[
                { value: "all", label: "All" },
                { value: "unread", label: "Unread" },
                { value: "spam", label: "Spam" },
              ]}
            />
            <span className="st-ws-toolbar__spacer" />
            {checked.size > 0 && (
              <>
                <span className="st-ws-hint">{checked.size} selected</span>
                <Button
                  size="sm"
                  icon={<MailOpen />}
                  onClick={() => {
                    actions.markRead.mutate({ ids: [...checked], read: true });
                    setChecked(new Set());
                  }}
                >
                  Mark read
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 />}
                  onClick={() => setConfirmDelete([...checked])}
                >
                  Delete
                </Button>
              </>
            )}
            {checked.size === 0 && (list.data?.unread ?? 0) > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => actions.markRead.mutate({ all: true, form: form || undefined })}
              >
                Mark all read
              </Button>
            )}
          </div>

          <div className="st-ws-split st-inbox">
            <div className="st-ws-panel">
              {list.isPending ? (
                <div className="st-ws-section">
                  <Skeleton height={14} />
                  <Skeleton height={14} width="70%" />
                  <Skeleton height={14} width="80%" />
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  className="st-ws-empty"
                  size="sm"
                  icon={view === "spam" ? <ShieldAlert /> : <Mail />}
                  title={
                    q
                      ? "Nothing matches"
                      : view === "spam"
                        ? "No spam"
                        : view === "unread"
                          ? "All caught up"
                          : "No entries yet"
                  }
                  description={
                    view === "spam"
                      ? "Suspicious entries are set aside here and don't count toward your monthly limit."
                      : q
                        ? "Try another word."
                        : "When someone fills in a form on your site, it shows up here."
                  }
                />
              ) : (
                <>
                  <div className="st-inbox__selectall">
                    <label className="st-ws-check">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={(e) =>
                          setChecked(e.target.checked ? new Set(items.map((s) => s.id)) : new Set())
                        }
                      />
                      Select all
                    </label>
                    <span className="st-ws-hint">
                      {list.data?.total ?? 0} {list.data?.total === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                  <ul className="st-ws-list" aria-label="Entries">
                    {items.map((s) => {
                      const t = firstText(s);
                      return (
                        <li key={s.id} className="st-inbox__item">
                          <input
                            type="checkbox"
                            aria-label={`Select entry from ${t.who}`}
                            checked={checked.has(s.id)}
                            onChange={(e) => {
                              const next = new Set(checked);
                              if (e.target.checked) next.add(s.id);
                              else next.delete(s.id);
                              setChecked(next);
                            }}
                          />
                          <button
                            type="button"
                            className={current?.id === s.id ? "st-ws-row is-selected" : "st-ws-row"}
                            aria-current={current?.id === s.id ? "true" : undefined}
                            onClick={() => pick(s.id)}
                          >
                            <span className="st-ws-row__main">
                              <span
                                className={
                                  s.read ? "st-ws-row__title" : "st-ws-row__title is-unread"
                                }
                              >
                                {!s.read && (
                                  <>
                                    <span className="st-inbox__dot" />
                                    <span className="st-sr-only">Unread: </span>
                                  </>
                                )}
                                {t.who}
                              </span>
                              <span className="st-ws-row__meta">
                                {!form && `${s.formName} · `}
                                {t.preview}
                              </span>
                            </span>
                            <span className="st-ws-row__side">{ago(s.createdAt)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {list.data?.nextCursor && limit < 200 && (
                    <div className="st-ws-more">
                      <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 50)}>
                        Show more
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="st-ws-panel">
              {current ? (
                <Entry
                  entry={current}
                  onClose={() => pick(null)}
                  onRead={(read) => actions.setRead.mutate({ id: current.id, read })}
                  onDelete={() => setConfirmDelete([current.id])}
                />
              ) : (
                <p className="st-inbox__hint">Choose an entry to read it.</p>
              )}
            </div>
          </div>
        </>
      )}

      <InboxSettingsDialog
        siteId={site.id}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        canEdit={designer}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={
          confirmDelete?.length === 1
            ? "Delete this entry?"
            : `Delete ${confirmDelete?.length} entries?`
        }
        description="They're removed for good, including from exports."
        confirmLabel="Delete"
        busy={actions.remove.isPending}
        onConfirm={() => {
          if (!confirmDelete) return;
          actions.remove.mutate(confirmDelete, {
            onSuccess: () => {
              if (current && confirmDelete.includes(current.id)) pick(null);
              setChecked(new Set());
              setConfirmDelete(null);
            },
            onError: (err) =>
              toast({ tone: "danger", title: "Couldn't delete", description: errorMessage(err) }),
          });
        }}
      />
    </div>
  );
}

function Entry({
  entry,
  onClose,
  onRead,
  onDelete,
}: {
  entry: Submission;
  onClose: () => void;
  onRead: (read: boolean) => void;
  onDelete: () => void;
}) {
  const email = emailIn(entry);
  return (
    <article className="st-ws-detail" aria-label={`Entry from ${firstText(entry).who}`}>
      <div className="st-ws-section__head">
        <div>
          <h3>{firstText(entry).who}</h3>
          <p className="st-ws-hint">
            {entry.formName} · {dateTime(entry.createdAt)}
            {entry.source ? ` · sent from ${entry.source}` : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" className="st-inbox__back" onClick={onClose}>
          Back to the list
        </Button>
      </div>
      {entry.spam && <Badge tone="danger">Marked as spam</Badge>}
      <dl className="st-ws-kv">
        {Object.entries(entry.data).map(([k, v]) => (
          <div key={k} className="st-ws-kv__row">
            <dt>{humanize(k)}</dt>
            <dd>{Array.isArray(v) ? v.join(", ") : v || "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="st-ws-actions">
        {email && (
          <Button
            variant="primary"
            icon={<Mail />}
            onClick={() =>
              window.open(`mailto:${email}?subject=${encodeURIComponent(`Re: ${entry.formName}`)}`)
            }
          >
            Reply by email
          </Button>
        )}
        <Button icon={<MailOpen />} onClick={() => onRead(!entry.read)}>
          {entry.read ? "Mark unread" : "Mark read"}
        </Button>
        <Button variant="ghost" icon={<Trash2 />} onClick={onDelete}>
          Delete
        </Button>
      </div>
      {entry.purgeAt && (
        <p className="st-ws-hint">
          Kept until {dateTime(entry.purgeAt)}, then deleted automatically.
        </p>
      )}
    </article>
  );
}

function InboxSettingsDialog({
  siteId,
  open,
  onOpenChange,
  canEdit,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canEdit: boolean;
}) {
  const settings = useServiceSettings(siteId);
  const update = useUpdateServiceSettings(siteId);
  const [email, setEmail] = useState<string | null>(null);
  const s = settings.data;
  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onError: (err) =>
        toast({ tone: "danger", title: "Couldn't save", description: errorMessage(err) }),
    });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Inbox settings"
      description={canEdit ? undefined : "Only the owner or a designer can change these."}
      width={480}
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      {!s ? (
        <Skeleton height={80} />
      ) : (
        <div className="st-form">
          <Field label="Email me about new entries">
            <Segmented
              aria-label="When to email"
              block
              value={s.notifications}
              onValueChange={(notifications) => canEdit && save({ notifications })}
              options={[
                { value: "instant", label: "Right away" },
                { value: "daily", label: "Once a day" },
                { value: "off", label: "Never" },
              ]}
            />
          </Field>
          <form
            className="st-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              save({ notifyEmail: (email ?? "").trim() || null });
            }}
          >
            <Field label="Send them to" hint="Leave empty to use your account's email.">
              <Input
                type="email"
                disabled={!canEdit}
                value={email ?? s.notifyEmail ?? ""}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={!canEdit || email === null} loading={update.isPending}>
              Save
            </Button>
          </form>
          <Field
            label="Keep entries for"
            hint="Older entries are deleted automatically, which keeps you within privacy rules."
          >
            <Select
              value={String(s.retentionMonths)}
              disabled={!canEdit}
              onValueChange={(v) => save({ retentionMonths: Number(v) })}
              options={[1, 3, 6, 12].map((m) => ({
                value: String(m),
                label: m === 12 ? "1 year" : `${m} month${m > 1 ? "s" : ""}`,
              }))}
            />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
