import { blocksRegistry } from "@openspace/blocks";
import type { CollectionItem } from "@openspace/schema";
import { itemPage } from "@openspace/site-kit/pages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, MessageSquareReply } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { type Approval, manageKeys, useApprovals, useHub } from "../../api";
import { HubError } from "../../api/types";
import { Badge, Button, Dialog, EmptyState, Segmented, TextArea, toast } from "../../ui";
import { useDocStore } from "../editor/model/context";
import { can } from "../site-mgmt/manage-ui";
import { ago } from "../workspace/format";
import { workspacePath } from "../workspace/routes";
import { errorMessage, RowButton, WsHeader } from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";
import { diffLines, fieldChanges } from "./diff";
import { collectionInfo } from "./kinds";
import { PreviewFrame } from "./PreviewFrame";
import "./collections.css";

const STATUS_TONE = { pending: "pending", approved: "live", rejected: "danger" } as const;
const STATUS_LABEL = { pending: "Waiting", approved: "Approved", rejected: "Sent back" } as const;

/**
 * Contributor submissions: editors and up review a diff of what changed (against what's live)
 * and approve or send it back with a note. Contributors see their own submissions here.
 */
export function ApprovalsView({ site }: AreaProps) {
  const editor = can(site, "editor");
  const approvals = useApprovals(site.id);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [selected, setSelected] = useState<string | null>(null);
  const list = (approvals.data ?? [])
    .filter((a) => filter === "all" || a.status === "pending")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const current = list.find((a) => a.id === selected) ?? (editor ? list[0] : undefined);

  return (
    <div className="st-ws-stack">
      <WsHeader
        title={editor ? "Approvals" : "My submissions"}
        description={
          editor
            ? "Contributors write drafts. Review what changed, then approve it for the site or send it back with a note."
            : "Drafts you've sent for review, and any notes from your editors."
        }
        actions={
          <Segmented
            size="sm"
            aria-label="Show"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: "pending", label: "Waiting" },
              { value: "all", label: "All" },
            ]}
          />
        }
      />
      {approvals.isPending ? null : list.length === 0 ? (
        <div className="st-ws-panel">
          <EmptyState
            className="st-ws-empty"
            icon={<CheckCheck />}
            title={filter === "pending" ? "Nothing waiting for review" : "No submissions yet"}
            description={
              editor
                ? "When a contributor submits a post or event, it shows up here for you to check before it goes on the site. Invite contributors from Settings → People."
                : "Write a post or event and choose “Submit for review”. It appears here until an editor approves it."
            }
          />
        </div>
      ) : (
        <div className="st-ws-split">
          <div className="st-ws-panel">
            <ul className="st-ws-list" aria-label="Submissions">
              {list.map((a) => (
                <li key={a.id}>
                  <RowButton selected={current?.id === a.id} onClick={() => setSelected(a.id)}>
                    <span className="st-ws-row__main">
                      <span className="st-ws-row__title">{a.title}</span>
                      <span className="st-ws-row__meta">
                        {a.submittedBy.name ?? a.submittedBy.login} · {ago(a.updatedAt)}
                      </span>
                    </span>
                    <span className="st-ws-row__side">
                      <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                    </span>
                  </RowButton>
                </li>
              ))}
            </ul>
          </div>
          {current && (
            <Review key={current.id} siteId={site.id} approval={current} canDecide={editor} />
          )}
        </div>
      )}
    </div>
  );
}

function Review({
  siteId,
  approval,
  canDecide,
}: {
  siteId: string;
  approval: Approval;
  canDecide: boolean;
}) {
  const hub = useHub();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const doc = useDocStore((s) => s.doc);
  const draft = doc.collections[approval.collection]?.[approval.slug];
  const info = collectionInfo(doc, approval.collection);
  const live = useQuery({
    queryKey: ["published-document", siteId],
    queryFn: () => hub.getDocument(siteId, { ref: "published" }),
    staleTime: 30_000,
  });
  const before: CollectionItem | undefined =
    live.data?.document.collections[approval.collection]?.[approval.slug];
  const [view, setView] = useState<"changes" | "preview">("changes");
  const [sendBack, setSendBack] = useState(false);
  const [note, setNote] = useState("");

  const decide = useMutation({
    mutationFn: (d: { decision: "approve" | "reject"; note?: string }) =>
      hub.decideApproval(siteId, approval.id, d.decision, d.note, approval.contentHash),
    onSuccess: (_r, d) => {
      void qc.invalidateQueries({ queryKey: manageKeys.approvals(siteId) });
      toast({
        tone: "success",
        title: d.decision === "approve" ? "Approved" : "Sent back",
        description:
          d.decision === "approve"
            ? `“${approval.title}” is on your site the next time you publish.`
            : `${approval.submittedBy.name ?? approval.submittedBy.login} will see your note.`,
      });
      setSendBack(false);
    },
    onError: (err) => {
      if (err instanceof HubError && err.code === "changed_since_review") {
        void qc.invalidateQueries({ queryKey: manageKeys.approvals(siteId) });
        toast({
          tone: "danger",
          title: "It changed while you were reviewing",
          description: err.message,
        });
      } else
        toast({
          tone: "danger",
          title: "Couldn't save your decision",
          description: errorMessage(err),
        });
    },
  });

  const changes = useMemo(() => (draft ? fieldChanges(before, draft) : []), [before, draft]);
  const body = useMemo(
    () => (draft ? diffLines(before?.body ?? "", draft.body) : []),
    [before, draft],
  );
  const page = useMemo(() => {
    if (!draft || view !== "preview") return null;
    try {
      return itemPage({ doc, registry: blocksRegistry() }, approval.collection, draft);
    } catch {
      return null;
    }
  }, [draft, view, doc, approval.collection]);

  return (
    <section className="st-ws-panel st-review" aria-label={`Review ${approval.title}`}>
      <div className="st-ws-section">
        <div className="st-ws-section__head">
          <div>
            <h3 className="st-ws-section__title">{approval.title}</h3>
            <p className="st-ws-section__desc">
              {info?.label ?? approval.collection} · from{" "}
              {approval.submittedBy.name ?? approval.submittedBy.login} ·{" "}
              {before ? "changes to a live item" : "new"}
            </p>
          </div>
          <Segmented
            size="sm"
            aria-label="Review view"
            value={view}
            onValueChange={setView}
            options={[
              { value: "changes", label: "What changed" },
              { value: "preview", label: "Preview" },
            ]}
          />
        </div>
        {approval.note && (
          <div className="st-callout">
            <MessageSquareReply aria-hidden="true" />
            <span>
              <strong>Note:</strong> {approval.note}
            </span>
          </div>
        )}
        {!draft ? (
          <p className="st-ws-hint">This draft was deleted.</p>
        ) : view === "preview" ? (
          <div className="st-review__preview">
            <PreviewFrame doc={doc} page={page} title={`Preview of ${approval.title}`} />
          </div>
        ) : (
          <>
            {changes.length > 0 && (
              <table className="st-ws-table st-review__fields">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>{before ? "Now on the site" : ""}</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td className="st-diff-old">{before ? c.before : ""}</td>
                      <td className="st-diff-new">{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <section className="st-diff" aria-label="Body changes">
              {body.map((l, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are positional
                <div key={i} className={`st-diff__line is-${l.kind}`}>
                  <span aria-hidden="true">
                    {l.kind === "add" ? "+" : l.kind === "remove" ? "−" : " "}
                  </span>
                  <span className="st-sr-only">
                    {l.kind === "add" ? "Added: " : l.kind === "remove" ? "Removed: " : ""}
                  </span>
                  {l.text || " "}
                </div>
              ))}
            </section>
          </>
        )}
        <div className="st-ws-actions">
          {draft && (
            <Button
              variant="ghost"
              onClick={() =>
                navigate(workspacePath(siteId, "content", approval.collection, approval.slug))
              }
            >
              Open in the editor
            </Button>
          )}
          <span className="st-ws-toolbar__spacer" />
          {canDecide && approval.status === "pending" && draft && (
            <>
              <Button icon={<MessageSquareReply />} onClick={() => setSendBack(true)}>
                Send back
              </Button>
              <Button
                variant="primary"
                icon={<Check />}
                loading={decide.isPending && decide.variables?.decision === "approve"}
                onClick={() => decide.mutate({ decision: "approve" })}
              >
                Approve
              </Button>
            </>
          )}
        </div>
      </div>
      <Dialog
        open={sendBack}
        onOpenChange={setSendBack}
        title="Send it back with a note"
        description="Say what to change. They'll see it next to their draft."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSendBack(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={decide.isPending}
              onClick={() => decide.mutate({ decision: "reject", note: note.trim() || undefined })}
            >
              Send back
            </Button>
          </>
        }
      >
        <TextArea
          aria-label="Note"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
      </Dialog>
    </section>
  );
}
