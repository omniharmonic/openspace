import { Lock, MoreHorizontal, Plus, UserPlus, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type Member,
  type MemberTier,
  type TierInput,
  useCommerceActions,
  useCommerceSettings,
  useMemberActions,
  useMembers,
  useTiers,
} from "../../api";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Menu,
  Segmented,
  Select,
  Skeleton,
  Tabs,
  TextArea,
  toast,
} from "../../ui";
import { CURRENCIES } from "../collections/fields";
import { useDocStore } from "../editor/model/context";
import { can, useManageUi } from "../site-mgmt/manage-ui";
import { ago, date, money, moneyInput, number, parseMoney } from "../workspace/format";
import {
  ConfirmDialog,
  errorMessage,
  SearchField,
  SwitchRow,
  useDebounced,
  WsHeader,
} from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";

const fail = (title: string) => (err: unknown) =>
  toast({ tone: "danger", title, description: errorMessage(err) });

/** Members: people with accounts on the site, paid tiers, and which pages are members-only. */
export function MembersView({ site }: AreaProps) {
  const [tab, setTab] = useState<"people" | "tiers" | "pages">("people");
  return (
    <div className="st-ws-stack">
      <WsHeader
        title="Members"
        description="People who sign in to your site with a link sent to their email. Give them free or paid tiers, and keep some pages for members only."
      />
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          {
            value: "people",
            label: "People",
            content: <People siteId={site.id} canRemove={can(site, "designer")} />,
          },
          {
            value: "tiers",
            label: "Tiers",
            content: <Tiers siteId={site.id} canEdit={can(site, "designer")} />,
          },
          {
            value: "pages",
            label: "Members-only pages",
            content: <GatedPages siteId={site.id} canEdit={can(site, "designer")} />,
          },
        ]}
      />
    </div>
  );
}

function People({ siteId, canRemove }: { siteId: string; canRemove: boolean }) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState<"" | "active" | "blocked">("");
  const query = useDebounced(q);
  const members = useMembers(siteId, {
    q: query || undefined,
    tier: tier || undefined,
    status: status || undefined,
  });
  const tiers = useTiers(siteId);
  const actions = useMemberActions(siteId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const tierName = (id: string | null) =>
    id ? (tiers.data?.find((t) => t.id === id)?.name ?? "Unknown tier") : "Free";
  const list = members.data?.members ?? [];

  return (
    <div className="st-ws-stack">
      <div className="st-ws-toolbar">
        <SearchField value={q} onChange={setQ} label="Search members" />
        <Select
          size="sm"
          value={tier || "__all"}
          onValueChange={(v) => setTier(v === "__all" ? "" : v)}
          options={[
            { value: "__all", label: "All tiers" },
            { value: "free", label: "Free" },
            ...(tiers.data ?? []).map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        <Segmented
          size="sm"
          aria-label="Status"
          value={status || "all"}
          onValueChange={(v) => setStatus(v === "all" ? "" : (v as "active" | "blocked"))}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "blocked", label: "Blocked" },
          ]}
        />
        <span className="st-ws-toolbar__spacer" />
        <Button variant="primary" icon={<UserPlus />} onClick={() => setAdding(true)}>
          Add member
        </Button>
      </div>
      <div className="st-ws-panel st-ws-scroll">
        {members.isPending ? (
          <div className="st-ws-section">
            <Skeleton height={14} />
            <Skeleton height={14} width="60%" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            className="st-ws-empty"
            icon={<UserRound />}
            title={q || tier || status ? "Nobody matches" : "No members yet"}
            description={
              q || tier || status
                ? "Try another word or filter."
                : "Add a Member sign-in section to a page, or make a page members-only. People who sign in appear here."
            }
          />
        ) : (
          <table className="st-ws-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Tier</th>
                <th className="st-hide-sm">Joined</th>
                <th className="st-hide-sm">Last signed in</th>
                <th>
                  <span className="st-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="st-ws-row__main">
                      <span className="st-ws-row__title">{m.name ?? m.email}</span>
                      {m.name && <span className="st-ws-row__meta">{m.email}</span>}
                    </div>
                  </td>
                  <td>
                    <span className="st-ws-actions">
                      {tierName(m.tier)}
                      {m.paid && <Badge tone="live">Paying</Badge>}
                      {m.status === "blocked" && <Badge tone="danger">Blocked</Badge>}
                    </span>
                  </td>
                  <td className="st-hide-sm">{date(m.createdAt)}</td>
                  <td className="st-hide-sm">{m.lastLoginAt ? ago(m.lastLoginAt) : "Never"}</td>
                  <td className="is-num">
                    <Menu
                      align="end"
                      label={`${m.email} options`}
                      trigger={
                        <button
                          type="button"
                          className="st-icon-only"
                          aria-label={`${m.email} options`}
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </button>
                      }
                      items={[
                        { type: "label" as const, label: "Move to tier" },
                        {
                          label: "Free",
                          onSelect: () =>
                            actions.update.mutate(
                              { id: m.id, patch: { tier: null } },
                              { onError: fail("Couldn't change tier") },
                            ),
                        },
                        ...(tiers.data ?? []).map((t) => ({
                          label: t.name,
                          onSelect: () =>
                            actions.update.mutate(
                              { id: m.id, patch: { tier: t.id } },
                              { onError: fail("Couldn't change tier") },
                            ),
                        })),
                        { type: "separator" as const },
                        m.status === "blocked"
                          ? {
                              label: "Unblock",
                              onSelect: () =>
                                actions.update.mutate({ id: m.id, patch: { status: "active" } }),
                            }
                          : {
                              label: "Block sign-in",
                              onSelect: () =>
                                actions.update.mutate(
                                  { id: m.id, patch: { status: "blocked" } },
                                  {
                                    onSuccess: () =>
                                      toast({
                                        tone: "success",
                                        title: "Blocked",
                                        description: `${m.email} can't sign in.`,
                                      }),
                                  },
                                ),
                            },
                        ...(canRemove
                          ? [{ label: "Remove", danger: true, onSelect: () => setRemoving(m) }]
                          : []),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {members.data && list.length > 0 && (
        <p className="st-ws-hint">{number(members.data.total)} members</p>
      )}
      <AddMemberDialog
        siteId={siteId}
        open={adding}
        onOpenChange={setAdding}
        tiers={tiers.data ?? []}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.email ?? ""}?`}
        description="Their account is deleted. A paid subscription is not cancelled here; do that in Stripe."
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) actions.remove.mutate(removing.id, { onError: fail("Couldn't remove") });
          setRemoving(null);
        }}
      />
    </div>
  );
}

function AddMemberDialog({
  siteId,
  open,
  onOpenChange,
  tiers,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tiers: MemberTier[];
}) {
  const actions = useMemberActions(siteId);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("free");
  const [invite, setInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a member"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={actions.add.isPending}
            disabled={!email.trim()}
            onClick={() => {
              setError(null);
              actions.add.mutate(
                {
                  email: email.trim(),
                  name: name.trim() || undefined,
                  tier: tier === "free" ? null : tier,
                  invite,
                },
                {
                  onSuccess: (r) => {
                    toast({
                      tone: "success",
                      title: "Member added",
                      description: r.invited
                        ? `We emailed ${r.member.email} a sign-in link.`
                        : r.member.email,
                    });
                    setEmail("");
                    setName("");
                    onOpenChange(false);
                  },
                  onError: (err) => setError(errorMessage(err)),
                },
              );
            }}
          >
            Add member
          </Button>
        </>
      }
    >
      <div className="st-form">
        <Field label="Email" error={error ?? undefined}>
          <Input type="email" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Name (optional)">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="Tier"
          hint="Adding someone to a paid tier here gives access without charging them."
        >
          <Select
            value={tier}
            onValueChange={setTier}
            options={[
              { value: "free", label: "Free" },
              ...tiers.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </Field>
        <SwitchRow
          label={<>Email them a sign-in link</>}
          checked={invite}
          onCheckedChange={setInvite}
        />
      </div>
    </Dialog>
  );
}

function Tiers({ siteId, canEdit }: { siteId: string; canEdit: boolean }) {
  const tiers = useTiers(siteId);
  const actions = useMemberActions(siteId);
  const [editing, setEditing] = useState<MemberTier | "new" | null>(null);
  const [deleting, setDeleting] = useState<MemberTier | null>(null);
  return (
    <div className="st-ws-stack">
      <div className="st-ws-toolbar">
        <p className="st-ws-hint">
          Everyone who signs in is a free member. Paid tiers are billed monthly or yearly through
          Stripe.
        </p>
        <span className="st-ws-toolbar__spacer" />
        {canEdit && (
          <Button variant="primary" icon={<Plus />} onClick={() => setEditing("new")}>
            New tier
          </Button>
        )}
      </div>
      {tiers.isPending ? (
        <Skeleton height={80} />
      ) : (
        <div className="st-ws-grid">
          {(tiers.data ?? []).map((t) => (
            <section key={t.id} className="st-item__card" aria-label={t.name}>
              <div className="st-ws-section__head">
                <h3>{t.name}</h3>
                {!t.active && <Badge>Hidden</Badge>}
              </div>
              <p className="st-tier__price">
                {t.price
                  ? `${money(t.price.amount, t.price.currency)} / ${t.price.interval}`
                  : "Free"}
              </p>
              {t.description && <p className="st-ws-hint">{t.description}</p>}
              <p className="st-ws-hint">{number(t.members)} members</p>
              {canEdit && (
                <div className="st-ws-actions">
                  <Button size="sm" onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(t)}>
                    Delete
                  </Button>
                </div>
              )}
            </section>
          ))}
          {(tiers.data ?? []).length === 0 && (
            <EmptyState
              icon={<Lock />}
              title="No paid tiers"
              description="Create a tier like “Supporters, $5 a month” to offer extra pages or content to paying members."
            />
          )}
        </div>
      )}
      {editing && (
        <TierDialog
          tier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          busy={actions.createTier.isPending || actions.updateTier.isPending}
          onSave={(input) => {
            const done = {
              onSuccess: () => setEditing(null),
              onError: fail("Couldn't save the tier"),
            };
            if (editing === "new") actions.createTier.mutate(input, done);
            else actions.updateTier.mutate({ id: editing.id, input }, done);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}?`}
        description="Tiers with members can't be deleted. Move them to another tier, or hide the tier instead."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting)
            actions.deleteTier.mutate(deleting.id, { onError: fail("Couldn't delete the tier") });
          setDeleting(null);
        }}
      />
    </div>
  );
}

function TierDialog({
  tier,
  onClose,
  onSave,
  busy,
}: {
  tier: MemberTier | null;
  onClose: () => void;
  onSave: (input: TierInput) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(tier?.name ?? "");
  const [description, setDescription] = useState(tier?.description ?? "");
  const [paid, setPaid] = useState(Boolean(tier?.price));
  const [currency, setCurrency] = useState(tier?.price?.currency ?? "USD");
  const [amount, setAmount] = useState(
    moneyInput(tier?.price?.amount ?? 500, tier?.price?.currency ?? "USD"),
  );
  const [interval, setBilling] = useState<"month" | "year">(tier?.price?.interval ?? "month");
  const [active, setActive] = useState(tier?.active ?? true);
  const minor = parseMoney(amount, currency);
  const priceError = paid && (minor === null || minor < 50) ? "At least 0.50" : undefined;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={tier ? `Edit ${tier.name}` : "New tier"}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim() || Boolean(priceError)}
            onClick={() =>
              onSave({
                name: name.trim(),
                description: description.trim() || null,
                price: paid && minor !== null ? { amount: minor, currency, interval } : null,
                active,
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="st-form">
        <Field label="Name">
          <Input value={name} autoFocus maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="What members get">
          <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <SwitchRow label={<>Paid</>} checked={paid} onCheckedChange={setPaid} />
        {paid && (
          <div className="st-ws-cols st-ws-cols--3">
            <Field label="Price" error={priceError}>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Currency">
              <Select
                value={currency}
                onValueChange={setCurrency}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <Field label="Billed">
              <Select
                value={interval}
                onValueChange={(v) => setBilling(v as "month" | "year")}
                options={[
                  { value: "month", label: "Monthly" },
                  { value: "year", label: "Yearly" },
                ]}
              />
            </Field>
          </div>
        )}
        <SwitchRow
          label={<>Open for new members</>}
          hint={<>Turn off to stop new sign-ups but keep current members.</>}
          checked={active}
          onCheckedChange={setActive}
        />
      </div>
    </Dialog>
  );
}

function GatedPages({ siteId, canEdit }: { siteId: string; canEdit: boolean }) {
  const pages = useDocStore((s) => s.doc.pages);
  const gated = useMemo(
    () => Object.values(pages).filter((p) => p.access?.members || p.slug.startsWith("members/")),
    [pages],
  );
  const others = useMemo(
    () => Object.values(pages).filter((p) => !gated.includes(p) && p.slug !== "404"),
    [pages, gated],
  );
  const settings = useCommerceSettings(siteId);
  const commerce = useCommerceActions(siteId);
  const policy = settings.data?.settings.membersSignup ?? "open";
  return (
    <div className="st-ws-stack">
      <section className="st-ws-panel" aria-labelledby="gp-policy">
        <div className="st-ws-section">
          <h3 id="gp-policy" className="st-ws-section__title">
            Who can become a member
          </h3>
          <Segmented
            aria-label="Who can join"
            value={policy}
            onValueChange={(membersSignup) =>
              canEdit &&
              commerce.update.mutate({ membersSignup }, { onError: fail("Couldn't save") })
            }
            options={[
              { value: "open", label: "Anyone can join for free" },
              { value: "invite", label: "Only people I add" },
            ]}
          />
          <p className="st-ws-section__desc">
            {policy === "open"
              ? "Anyone who signs in with their email becomes a free member."
              : "Only people on your member list get sign-in links. Everyone else sees the same message, so nobody can check who's a member."}
          </p>
        </div>
      </section>
      <section className="st-ws-panel" aria-labelledby="gp-pages">
        <div className="st-ws-section">
          <h3 id="gp-pages" className="st-ws-section__title">
            Members-only pages
          </h3>
          <p className="st-ws-section__desc">
            Members-only pages need the Cloudflare hosting option. Change a page's access in its
            page settings.
          </p>
          {gated.length === 0 ? (
            <p className="st-ws-hint">No pages are members-only yet.</p>
          ) : (
            <ul className="st-ws-list">
              {gated.map((p) => (
                <li key={p.id} className="st-gated">
                  <span>
                    <Lock aria-hidden="true" className="st-inline-icon" /> {p.title}{" "}
                    <span className="st-ws-hint">/{p.slug}</span>
                  </span>
                  <Button size="sm" onClick={() => useManageUi.getState().openPageSettings(p.id)}>
                    Page settings
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {canEdit && others.length > 0 && (
            <Select
              size="sm"
              value={undefined}
              placeholder="Make another page members-only…"
              onValueChange={(id) => useManageUi.getState().openPageSettings(id)}
              options={others.map((p) => ({ value: p.id, label: p.title }))}
            />
          )}
        </div>
      </section>
    </div>
  );
}
