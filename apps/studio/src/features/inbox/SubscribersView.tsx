import { Download, MoreHorizontal, Tag, Upload, Users } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type Subscriber,
  type SubscriberImportResult,
  type SubscriberStatus,
  useHub,
  useSubscriberActions,
  useSubscribers,
} from "../../api";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Menu,
  Select,
  Skeleton,
  TextArea,
  toast,
} from "../../ui";
import { saveFile } from "../settings/ExportSettings";
import { can } from "../site-mgmt/manage-ui";
import { date, number } from "../workspace/format";
import {
  ConfirmDialog,
  errorMessage,
  SearchField,
  Stat,
  TagInput,
  useDebounced,
  WsHeader,
} from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";
import "./inbox.css";

const STATUS: Record<SubscriberStatus, { label: string; tone: "live" | "pending" | "neutral" }> = {
  confirmed: { label: "Subscribed", tone: "live" },
  pending: { label: "Waiting to confirm", tone: "pending" },
  unsubscribed: { label: "Unsubscribed", tone: "neutral" },
};

/** The newsletter list: who's on it, tags, import and export. */
export function SubscribersView({ site }: AreaProps) {
  const hub = useHub();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SubscriberStatus | "">("");
  const [tag, setTag] = useState("");
  const [limit, setLimit] = useState(50);
  const query = useDebounced(q);
  const list = useSubscribers(site.id, {
    q: query || undefined,
    status: status || undefined,
    tag: tag || undefined,
    limit,
  });
  const actions = useSubscriberActions(site.id);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [tagging, setTagging] = useState<null | { ids: string[]; mode: "add" | "remove" }>(null);
  const [editing, setEditing] = useState<Subscriber | null>(null);
  const [deleting, setDeleting] = useState<Subscriber | null>(null);
  const subs = list.data?.subscribers ?? [];
  const counts = list.data?.counts;
  const allTags = useMemo(() => [...new Set(subs.flatMap((s) => s.tags))].sort(), [subs]);
  const designer = can(site, "designer");

  const exportCsv = async () => {
    try {
      const f = await hub.downloadExport(site.id, "subscribers");
      saveFile(f.blob, f.filename);
    } catch (err) {
      toast({ tone: "danger", title: "Couldn't download", description: errorMessage(err) });
    }
  };

  const empty = counts?.total === 0;

  return (
    <div className="st-ws-stack">
      <WsHeader
        title="Subscribers"
        description="People who signed up for your newsletter. They confirm by email before they're added, and can leave with one click."
        actions={
          <>
            <Button icon={<Download />} onClick={exportCsv} disabled={empty}>
              Export CSV
            </Button>
            {designer && (
              <Button icon={<Upload />} onClick={() => setImporting(true)}>
                Import
              </Button>
            )}
          </>
        }
      />
      {counts && !empty && (
        <div className="st-stats">
          <Stat label="Subscribed" value={number(counts.confirmed)} />
          <Stat label="Waiting to confirm" value={number(counts.pending)} />
          <Stat label="Unsubscribed" value={number(counts.unsubscribed)} />
        </div>
      )}
      {empty ? (
        <div className="st-ws-panel">
          <EmptyState
            className="st-ws-empty"
            icon={<Users />}
            title="No subscribers yet"
            description="Add a Newsletter section to your home page or blog. People who sign up show up here, ready for your first email campaign."
            action={
              designer ? (
                <Button onClick={() => setImporting(true)}>Import a list</Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="st-ws-toolbar">
            <SearchField value={q} onChange={setQ} label="Search subscribers" />
            <Select
              size="sm"
              value={status || "__all"}
              onValueChange={(v) => setStatus(v === "__all" ? "" : (v as SubscriberStatus))}
              options={[
                { value: "__all", label: "Everyone" },
                { value: "confirmed", label: "Subscribed" },
                { value: "pending", label: "Waiting to confirm" },
                { value: "unsubscribed", label: "Unsubscribed" },
              ]}
            />
            <Select
              size="sm"
              value={tag || "__all"}
              onValueChange={(v) => setTag(v === "__all" ? "" : v)}
              options={[
                { value: "__all", label: "Any tag" },
                ...allTags.map((t) => ({ value: t, label: t })),
              ]}
            />
            <span className="st-ws-toolbar__spacer" />
            {checked.size > 0 && (
              <>
                <span className="st-ws-hint">{checked.size} selected</span>
                <Button
                  size="sm"
                  icon={<Tag />}
                  onClick={() => setTagging({ ids: [...checked], mode: "add" })}
                >
                  Add tags
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTagging({ ids: [...checked], mode: "remove" })}
                >
                  Remove tags
                </Button>
              </>
            )}
          </div>
          <div className="st-ws-panel st-ws-scroll">
            {list.isPending ? (
              <div className="st-ws-section">
                <Skeleton height={14} />
                <Skeleton height={14} width="60%" />
              </div>
            ) : subs.length === 0 ? (
              <EmptyState
                className="st-ws-empty"
                size="sm"
                title="Nobody matches"
                description="Try another word or filter."
              />
            ) : (
              <table className="st-ws-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={subs.every((s) => checked.has(s.id))}
                        onChange={(e) =>
                          setChecked(e.target.checked ? new Set(subs.map((s) => s.id)) : new Set())
                        }
                      />
                    </th>
                    <th>Email</th>
                    <th className="st-hide-sm">Name</th>
                    <th>Tags</th>
                    <th className="st-hide-sm">Status</th>
                    <th className="st-hide-sm">Joined</th>
                    <th>
                      <span className="st-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.email}`}
                          checked={checked.has(s.id)}
                          onChange={(e) => {
                            const next = new Set(checked);
                            if (e.target.checked) next.add(s.id);
                            else next.delete(s.id);
                            setChecked(next);
                          }}
                        />
                      </td>
                      <td className="st-sub__email">{s.email}</td>
                      <td className="st-hide-sm">{s.firstName ?? ""}</td>
                      <td>
                        <span className="st-chips">
                          {s.tags.map((t) => (
                            <span key={t} className="st-chip">
                              {t}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="st-hide-sm">
                        <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                      </td>
                      <td className="st-hide-sm">{date(s.createdAt)}</td>
                      <td className="is-num">
                        <Menu
                          align="end"
                          label={`${s.email} options`}
                          trigger={
                            <button
                              type="button"
                              className="st-icon-only"
                              aria-label={`${s.email} options`}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </button>
                          }
                          items={[
                            { label: "Edit tags", onSelect: () => setEditing(s) },
                            ...(s.status !== "unsubscribed"
                              ? [
                                  {
                                    label: "Unsubscribe",
                                    onSelect: () =>
                                      actions.update.mutate({
                                        id: s.id,
                                        patch: { status: "unsubscribed" },
                                      }),
                                  },
                                ]
                              : []),
                            { type: "separator" as const },
                            { label: "Delete", danger: true, onSelect: () => setDeleting(s) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {list.data?.nextCursor && limit < 200 && (
              <div className="st-ws-more">
                <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 50)}>
                  Show more
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <ImportDialog siteId={site.id} open={importing} onOpenChange={setImporting} />
      <TagsDialog
        title={tagging?.mode === "remove" ? "Remove tags" : "Add tags"}
        open={tagging !== null}
        suggestions={allTags}
        initial={[]}
        onOpenChange={(o) => !o && setTagging(null)}
        onSave={(tags) => {
          if (!tagging) return;
          actions.tag.mutate(
            { ids: tagging.ids, ...(tagging.mode === "add" ? { add: tags } : { remove: tags }) },
            {
              onSuccess: (r) =>
                toast({ tone: "success", title: `Updated ${r.changed} subscribers` }),
            },
          );
          setTagging(null);
          setChecked(new Set());
        }}
      />
      <TagsDialog
        title={`Tags for ${editing?.email ?? ""}`}
        open={editing !== null}
        suggestions={allTags}
        initial={editing?.tags ?? []}
        onOpenChange={(o) => !o && setEditing(null)}
        onSave={(tags) => {
          if (editing) actions.update.mutate({ id: editing.id, patch: { tags } });
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.email ?? ""}?`}
        description="Their details are removed for good. To stop emailing someone but keep the record, unsubscribe them instead."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) actions.remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function TagsDialog({
  title,
  open,
  onOpenChange,
  initial,
  suggestions,
  onSave,
}: {
  title: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: string[];
  suggestions: string[];
  onSave: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setTags(initial);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(tags)}>
            Save
          </Button>
        </>
      }
    >
      <TagInput label="Tags" value={tags} onChange={setTags} suggestions={suggestions} />
    </Dialog>
  );
}

function ImportDialog({
  siteId,
  open,
  onOpenChange,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const actions = useSubscriberActions(siteId);
  const [csv, setCsv] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<SubscriberImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setCsv("");
    setTags([]);
    setConsent(false);
    setResult(null);
    setError(null);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title="Import subscribers"
      description="A spreadsheet saved as CSV with an “email” column. “first_name” and “tags” columns are optional."
      width={540}
      footer={
        result ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!csv.trim() || !consent}
              loading={actions.importCsv.isPending}
              onClick={() => {
                setError(null);
                actions.importCsv.mutate(
                  { csv, tags: tags.length ? tags : undefined },
                  { onSuccess: setResult, onError: (err) => setError(errorMessage(err)) },
                );
              }}
            >
              Import
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="st-form">
          <p>
            Added {result.added}, updated {result.updated}
            {result.skipped.length ? `, skipped ${result.skipped.length}` : ""}.
          </p>
          {result.skipped.length > 0 && (
            <ul className="st-import__skipped">
              {result.skipped.slice(0, 20).map((s) => (
                <li key={`${s.row}-${s.email}`}>
                  Row {s.row} {s.email ? `(${s.email})` : ""}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="st-form">
          <label className="st-btnlink">
            <input
              type="file"
              accept=".csv,text/csv"
              className="st-sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
              }}
            />
            Choose a CSV file
          </label>
          <Field label="Or paste it here">
            <TextArea
              rows={6}
              value={csv}
              placeholder={"email,first_name,tags\nana@example.com,Ana,retreats"}
              onChange={(e) => setCsv(e.target.value)}
            />
          </Field>
          <Field label="Tag everyone in this import">
            <TagInput label="Import tags" value={tags} onChange={setTags} />
          </Field>
          <label className="st-ws-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Everyone on this list agreed to get emails from me.
          </label>
          <p className="st-ws-hint">People who unsubscribed before are never added back.</p>
          {error && (
            <p className="st-ws-hint" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
