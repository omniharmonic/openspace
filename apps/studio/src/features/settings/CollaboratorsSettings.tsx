import type { SiteDocument } from "@openspace/schema";
import { Check, Copy, Lock, Mail, UserPlus, X } from "lucide-react";
import { useState } from "react";
import {
  type Collaborator,
  type CollaboratorRole,
  useApprovals,
  useCollaboratorActions,
  useCollaborators,
} from "../../api";
import type { Site, SiteRole } from "../../api/types";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  TextArea,
  toast,
} from "../../ui";
import { useDocStore } from "../editor/model/context";
import { can } from "../site-mgmt/manage-ui";

export const ROLE_INFO: Record<SiteRole, { name: string; does: string }> = {
  owner: { name: "Owner", does: "Everything, including hosting, transfer and deleting the site." },
  designer: {
    name: "Designer",
    does: "Everything on the site: pages, layout, styles and settings.",
  },
  editor: { name: "Editor", does: "Words, images and pages — but not layout or styles." },
  contributor: {
    name: "Contributor",
    does: "Writes blog posts and events as drafts for approval.",
  },
};

const ROLE_OPTIONS = (["designer", "editor", "contributor"] as const).map((r) => ({
  value: r,
  label: ROLE_INFO[r].name,
}));

/** Every section on the site, grouped by page, for the locks picker. */
function sectionsByPage(doc: SiteDocument) {
  return [
    ...Object.values(doc.pages).map((p) => ({
      id: p.id,
      title: p.title,
      sections: p.sections.map((s, i) => ({ id: s.id, label: s.label ?? `Section ${i + 1}` })),
    })),
    { id: "footer", title: "Footer", sections: [{ id: doc.site.footer.id, label: "Footer" }] },
  ];
}

function LocksDialog({
  person,
  onClose,
  onSave,
}: {
  person: Collaborator;
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const doc = useDocStore((s) => s.doc);
  const [locked, setLocked] = useState(new Set(person.lockedSections));
  const groups = sectionsByPage(doc);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Lock sections for ${person.name ?? person.login}`}
      description="They can still change the words and images in locked sections, but not the layout, order or styles."
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave([...locked])}>
            Save locks
          </Button>
        </>
      }
    >
      <div className="st-locks">
        {groups.map((g) => (
          <fieldset key={g.id} className="st-fieldset">
            <legend>{g.title}</legend>
            {g.sections.map((s) => (
              <label key={s.id} className="st-check">
                <input
                  type="checkbox"
                  checked={locked.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(locked);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setLocked(next);
                  }}
                />
                {s.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </Dialog>
  );
}

/** People: invite by email or GitHub username, roles, section locks, and contributor approvals. */
export function CollaboratorsSettings({ site }: { site: Site }) {
  const list = useCollaborators(site.id);
  const manage = can(site, "designer");
  const approvals = useApprovals(site.id, can(site, "editor"));
  const actions = useCollaboratorActions(site.id);
  const [who, setWho] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("editor");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [locksFor, setLocksFor] = useState<Collaborator | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; title: string } | null>(null);
  const [note, setNote] = useState("");
  // "@name" is a GitHub username; "name@domain" an email address.
  const isEmail = /^[^@\s]+@/.test(who.trim());
  const value = who.trim().replace(/^@/, "");
  const valid = isEmail
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    : /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value);

  const invite = () =>
    actions.invite.mutate(isEmail ? { email: value, role } : { login: value, role }, {
      onSuccess: (res) => {
        setWho("");
        setInviteLink(res.acceptUrl);
        toast({
          tone: "success",
          title: "Invitation sent",
          description: isEmail ? `We emailed ${value}.` : `${value} will see it when they sign in.`,
        });
      },
      onError: (err) =>
        toast({ tone: "danger", title: "Couldn’t invite", description: err.message }),
    });

  const pending = approvals.data?.filter((a) => a.status === "pending") ?? [];

  return (
    <div className="st-settings__stack">
      {manage && (
        <section className="st-card" aria-labelledby="ppl-invite">
          <h3 id="ppl-invite" className="st-card__title">
            Invite someone
          </h3>
          <form
            className="st-invite"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) invite();
            }}
          >
            <Field
              label="Email or GitHub username"
              error={who && !valid ? "Enter an email address or a GitHub username." : undefined}
            >
              <Input
                value={who}
                prefix={isEmail ? <Mail aria-hidden="true" /> : "@"}
                placeholder="alex@example.com"
                autoCapitalize="none"
                onChange={(e) => setWho(e.target.value)}
              />
            </Field>
            <Field label="Role">
              <Select<CollaboratorRole>
                aria-label="Role"
                value={role}
                onValueChange={setRole}
                options={ROLE_OPTIONS}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              icon={<UserPlus />}
              disabled={!valid}
              loading={actions.invite.isPending}
            >
              Invite
            </Button>
          </form>
          <p className="st-muted-note">
            {ROLE_INFO[role].does} People without a GitHub account are guided through making one.
          </p>
          {inviteLink && (
            <div className="st-callout st-callout--live" role="status">
              <Check aria-hidden="true" />
              <div>
                You can also send them this link: <code className="st-code">{inviteLink}</code>{" "}
                <button
                  type="button"
                  className="st-linklike"
                  onClick={() => {
                    void navigator.clipboard?.writeText(inviteLink);
                    toast({ title: "Invitation link copied" });
                  }}
                >
                  <Copy aria-hidden="true" width={12} height={12} /> Copy
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="st-card" aria-labelledby="ppl-list">
        <h3 id="ppl-list" className="st-card__title">
          People on this site
        </h3>
        {list.isPending ? (
          <Spinner size={14} label="Loading people" />
        ) : (
          <ul className="st-people">
            {list.data?.collaborators.map((c) => (
              <li key={c.userId} className="st-person">
                <Avatar
                  person={{ id: c.userId, name: c.name ?? c.login, avatarUrl: c.avatarUrl }}
                  size={28}
                />
                <div className="st-person__who">
                  <strong>{c.name ?? c.login}</strong>
                  <span className="st-muted-note">@{c.login}</span>
                </div>
                {c.lockedSections.length > 0 && (
                  <Badge title="Locked sections">
                    <Lock aria-hidden="true" width={11} height={11} /> {c.lockedSections.length}{" "}
                    locked
                  </Badge>
                )}
                {manage && c.role !== "owner" ? (
                  <div className="st-person__actions">
                    <Select<CollaboratorRole>
                      aria-label={`Role for ${c.name ?? c.login}`}
                      size="sm"
                      value={c.role as CollaboratorRole}
                      onValueChange={(r) => actions.update.mutate({ userId: c.userId, role: r })}
                      options={ROLE_OPTIONS}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Lock />}
                      onClick={() => setLocksFor(c)}
                    >
                      Locks
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${c.name ?? c.login}`}
                      icon={<X />}
                      onClick={() =>
                        actions.remove.mutate(c.userId, {
                          onSuccess: () => toast({ title: `${c.name ?? c.login} removed` }),
                        })
                      }
                    />
                  </div>
                ) : (
                  <Badge tone={c.role === "owner" ? "accent" : "neutral"}>
                    {ROLE_INFO[c.role].name}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
        {manage && (list.data?.invitations.length ?? 0) > 0 && (
          <>
            <h4 className="st-subhead">Waiting to accept</h4>
            <ul className="st-people">
              {list.data?.invitations.map((inv) => (
                <li key={inv.id} className="st-person">
                  <span className="st-person__pending" aria-hidden="true">
                    <Mail />
                  </span>
                  <div className="st-person__who">
                    <strong>{inv.email ?? `@${inv.login}`}</strong>
                    <span className="st-muted-note">
                      {ROLE_INFO[inv.role].name} · expires{" "}
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => actions.revoke.mutate(inv.id)}>
                    Cancel invitation
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        <dl className="st-roles">
          {(Object.keys(ROLE_INFO) as SiteRole[]).map((r) => (
            <div key={r}>
              <dt>{ROLE_INFO[r].name}</dt>
              <dd>{ROLE_INFO[r].does}</dd>
            </div>
          ))}
        </dl>
      </section>

      {can(site, "editor") && (
        <section className="st-card" aria-labelledby="ppl-approvals">
          <h3 id="ppl-approvals" className="st-card__title">
            Waiting for approval{" "}
            {pending.length > 0 && <Badge tone="pending">{pending.length}</Badge>}
          </h3>
          {approvals.isPending ? (
            <Spinner size={14} label="Loading" />
          ) : pending.length === 0 ? (
            <EmptyState
              size="sm"
              title="Nothing to review"
              description="Drafts from contributors appear here."
            />
          ) : (
            <ul className="st-people">
              {pending.map((a) => (
                <li key={a.id} className="st-person">
                  <div className="st-person__who">
                    <strong>{a.title}</strong>
                    <span className="st-muted-note">
                      {a.collection} · by {a.submittedBy.name ?? a.submittedBy.login} ·{" "}
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="st-person__actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRejecting({ id: a.id, title: a.title })}
                    >
                      Send back
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        actions.decide.mutate(
                          { id: a.id, decision: "approve" },
                          {
                            onSuccess: () =>
                              toast({ tone: "success", title: `“${a.title}” approved` }),
                          },
                        )
                      }
                    >
                      Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {locksFor && (
        <LocksDialog
          person={locksFor}
          onClose={() => setLocksFor(null)}
          onSave={(ids) =>
            actions.update.mutate(
              { userId: locksFor.userId, lockedSections: ids },
              {
                onSuccess: () => {
                  setLocksFor(null);
                  toast({ tone: "success", title: "Locks saved" });
                },
              },
            )
          }
        />
      )}
      <Dialog
        open={Boolean(rejecting)}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Send back “${rejecting?.title ?? ""}”?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!rejecting) return;
                actions.decide.mutate({
                  id: rejecting.id,
                  decision: "reject",
                  note: note.trim() || undefined,
                });
                setRejecting(null);
                setNote("");
              }}
            >
              Send back
            </Button>
          </>
        }
      >
        <Field label="Note for the writer" aside="Optional">
          <TextArea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-autofocus
          />
        </Field>
      </Dialog>
    </div>
  );
}
