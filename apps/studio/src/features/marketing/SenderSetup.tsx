import { ArrowLeft, Check, Copy, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { type SenderProvider, type SenderView, useSenderActions, useSenders } from "../../api";
import type { Site } from "../../api/types";
import { Badge, Button, cx, EmptyState, Field, Input, Skeleton, toast } from "../../ui";
import { can } from "../site-mgmt/manage-ui";
import { ago } from "../workspace/format";
import { workspacePath } from "../workspace/routes";
import { ConfirmDialog, copyText, errorMessage, WsHeader } from "../workspace/ui";

interface ProviderInfo {
  id: Exclude<SenderProvider, "dev">;
  name: string;
  blurb: string;
  signup: string;
  fields: Array<{ key: string; label: string; hint?: string; secret?: boolean }>;
  needsSelector: boolean;
  note?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "resend",
    name: "Resend",
    blurb: "Simple and friendly. A free plan covers small lists.",
    signup: "https://resend.com/signup",
    fields: [
      {
        key: "apiKey",
        label: "API key",
        hint: "Resend → API Keys → Create (sending access).",
        secret: true,
      },
      {
        key: "webhookSecret",
        label: "Webhook signing secret (optional)",
        hint: "Lets us remove bounced addresses automatically.",
        secret: true,
      },
    ],
    needsSelector: false,
  },
  {
    id: "postmark",
    name: "Postmark",
    blurb: "Excellent delivery. Uses a separate stream for newsletters.",
    signup: "https://account.postmarkapp.com/sign_up",
    fields: [
      {
        key: "serverToken",
        label: "Server token",
        hint: "Postmark → your server → API Tokens.",
        secret: true,
      },
    ],
    needsSelector: true,
  },
  {
    id: "ses",
    name: "Amazon SES",
    blurb: "Lowest cost for big lists. More setup.",
    signup: "https://console.aws.amazon.com/ses/",
    fields: [
      { key: "accessKeyId", label: "Access key ID" },
      { key: "secretAccessKey", label: "Secret access key", secret: true },
      { key: "region", label: "Region", hint: "For example us-east-1." },
    ],
    needsSelector: true,
  },
  {
    id: "cloudflare",
    name: "Cloudflare Email",
    blurb: "Good for receipts and notices from your own Cloudflare account.",
    signup: "https://dash.cloudflare.com/",
    fields: [
      {
        key: "accountId",
        label: "Account ID",
        hint: "32 letters and numbers, on your Cloudflare overview page.",
      },
      { key: "apiToken", label: "API token", secret: true },
    ],
    needsSelector: true,
    note: "Cloudflare describes this service for one-to-one messages rather than newsletters, so check its terms for large lists.",
  },
];

const STATUS = {
  verified: { label: "Ready to send", tone: "live" },
  unverified: { label: "Not checked yet", tone: "neutral" },
  failed: { label: "Needs DNS records", tone: "pending" },
} as const;

/**
 * Sending setup: emails go out through the owner's own provider and domain. Connect a provider,
 * add the DNS records it shows, and check them here (SPF, DKIM, DMARC).
 */
export function SenderSetup({ site }: { site: Site }) {
  const navigate = useNavigate();
  const owner = can(site, "owner");
  const senders = useSenders(site.id);
  const actions = useSenderActions(site.id);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<SenderView | null>(null);
  const list = (senders.data ?? []).filter((s) => s.provider !== "dev" || s.status === "verified");

  return (
    <div className="st-ws-stack">
      <button
        type="button"
        className="st-ws-back"
        onClick={() => navigate(workspacePath(site.id, "campaigns"))}
      >
        <ArrowLeft aria-hidden="true" /> Email campaigns
      </button>
      <WsHeader
        title="Sending setup"
        description="Your emails go out through your own email provider and come from your own address. That keeps them out of spam folders and keeps your list yours."
        actions={
          owner && !adding ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Connect a provider
            </Button>
          ) : undefined
        }
      />
      {!owner && <p className="st-ws-hint">Only the site owner can connect a provider.</p>}
      {adding && <ConnectWizard siteId={site.id} onDone={() => setAdding(false)} />}
      {senders.isPending ? (
        <Skeleton height={80} />
      ) : list.length === 0 && !adding ? (
        <div className="st-ws-panel">
          <EmptyState
            className="st-ws-empty"
            icon={<ShieldCheck />}
            title="No sender connected"
            description="Pick a provider (Resend is the easiest), paste its key, and add two or three DNS records where your domain is managed. We check them for you."
            action={
              owner ? (
                <Button variant="primary" onClick={() => setAdding(true)}>
                  Connect a provider
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        list.map((s) => (
          <SenderCard
            key={s.id}
            sender={s}
            canRemove={owner}
            verifying={actions.verify.isPending && actions.verify.variables === s.id}
            onVerify={() =>
              actions.verify.mutate(s.id, {
                onSuccess: (v) =>
                  toast(
                    v.status === "verified"
                      ? {
                          tone: "success",
                          title: "All set",
                          description: `${v.fromEmail} is ready to send.`,
                        }
                      : {
                          tone: "danger",
                          title: "Not quite yet",
                          description:
                            "Some records aren't there yet. DNS changes can take an hour.",
                        },
                  ),
                onError: (err) =>
                  toast({
                    tone: "danger",
                    title: "Couldn't check",
                    description: errorMessage(err),
                  }),
              })
            }
            onRemove={() => setRemoving(s)}
          />
        ))
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Disconnect ${removing?.fromEmail ?? ""}?`}
        description="Emails can't be sent until you connect a sender again. Your keys are deleted."
        confirmLabel="Disconnect"
        onConfirm={() => {
          if (removing)
            actions.remove.mutate(removing.id, {
              onError: (err) =>
                toast({
                  tone: "danger",
                  title: "Couldn't disconnect",
                  description: errorMessage(err),
                }),
            });
          setRemoving(null);
        }}
      />
    </div>
  );
}

function SenderCard({
  sender,
  canRemove,
  verifying,
  onVerify,
  onRemove,
}: {
  sender: SenderView;
  canRemove: boolean;
  verifying: boolean;
  onVerify: () => void;
  onRemove: () => void;
}) {
  const st = STATUS[sender.status];
  const provider = PROVIDERS.find((p) => p.id === sender.provider)?.name ?? "Test sender";
  return (
    <section className="st-ws-panel" aria-label={`Sender ${sender.fromEmail}`}>
      <div className="st-ws-section">
        <div className="st-ws-section__head">
          <div>
            <h3 className="st-ws-section__title">
              {sender.fromName ? `${sender.fromName} <${sender.fromEmail}>` : sender.fromEmail}
            </h3>
            <p className="st-ws-section__desc">
              Through {provider}
              {sender.checkedAt ? ` · checked ${ago(sender.checkedAt)}` : ""}
            </p>
          </div>
          <span className="st-ws-actions">
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
            {sender.provider !== "dev" && (
              <Button size="sm" icon={<RefreshCw />} loading={verifying} onClick={onVerify}>
                Check records
              </Button>
            )}
            {canRemove && sender.provider !== "dev" && (
              <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={onRemove}>
                Disconnect
              </Button>
            )}
          </span>
        </div>
        {sender.checks.length > 0 && <DnsChecks sender={sender} />}
        {sender.status === "unverified" && sender.provider !== "dev" && (
          <p className="st-ws-hint">
            Add the records your provider gives you, then choose “Check records”.
          </p>
        )}
      </div>
    </section>
  );
}

function DnsChecks({ sender }: { sender: SenderView }) {
  return (
    <ul className="st-dns-checks">
      {sender.checks.map((c) => (
        <li key={c.id} className={cx(c.ok && "is-ok")}>
          {c.ok ? <Check aria-label="OK" /> : <X aria-label="Missing" />}
          <div>
            <strong>{c.label}</strong>
            <span className="st-dns-checks__rec">
              TXT <code>{c.name}</code>
            </span>
            {!c.ok && (
              <span className="st-dns-checks__rec">
                Value <code>{c.expected}</code>
                <button
                  type="button"
                  className="st-linklike"
                  onClick={async () => {
                    if (await copyText(c.expected)) toast({ tone: "success", title: "Copied" });
                  }}
                >
                  <Copy aria-hidden="true" className="st-inline-icon" /> Copy
                </button>
              </span>
            )}
            {c.hint && !c.ok && <span className="st-ws-hint">{c.hint}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ConnectWizard({ siteId, onDone }: { siteId: string; onDone: () => void }) {
  const actions = useSenderActions(siteId);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [from, setFrom] = useState({ fromEmail: "", fromName: "", replyTo: "", dkimSelector: "" });
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SenderView | null>(null);

  if (created)
    return (
      <section className="st-ws-panel" aria-label="Connected">
        <div className="st-ws-section">
          <h3 className="st-ws-section__title">Connected. Two last steps:</h3>
          <ol className="st-steps">
            <li>
              <strong>Add the DNS records</strong> your provider shows for{" "}
              <code>{created.domain}</code>, then check them below.
            </li>
            {created.webhookUrl && (
              <li>
                <strong>Paste this address</strong> into your provider's webhook settings, so
                bounced and unsubscribed addresses are removed for you. It's shown only once.
                <div className="st-copyline">
                  <code>{created.webhookUrl}</code>
                  <Button
                    size="sm"
                    icon={<Copy />}
                    onClick={async () => {
                      if (await copyText(created.webhookUrl ?? ""))
                        toast({ tone: "success", title: "Copied" });
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </li>
            )}
          </ol>
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        </div>
      </section>
    );

  return (
    <section className="st-ws-panel" aria-label="Connect a provider">
      <div className="st-ws-section">
        <h3 className="st-ws-section__title">1. Choose your email provider</h3>
        <div className="st-kind-grid st-provider-grid">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={provider?.id === p.id}
              className={provider?.id === p.id ? "st-kind is-on" : "st-kind"}
              onClick={() => {
                setProvider(p);
                setCreds({});
              }}
            >
              <strong>{p.name}</strong>
              <span>{p.blurb}</span>
            </button>
          ))}
        </div>
      </div>
      {provider && (
        <form
          className="st-ws-section"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            actions.create.mutate(
              {
                provider: provider.id,
                fromEmail: from.fromEmail.trim(),
                fromName: from.fromName.trim() || undefined,
                replyTo: from.replyTo.trim() || undefined,
                dkimSelector: from.dkimSelector.trim() || undefined,
                credentials: Object.fromEntries(
                  Object.entries(creds)
                    .filter(([k, v]) => k !== "webhookSecret" && v.trim())
                    .map(([k, v]) => [k, v.trim()]),
                ),
                // The Svix signing secret is a top-level field in the Hub's contract.
                ...(creds.webhookSecret?.trim()
                  ? { webhookSecret: creds.webhookSecret.trim() }
                  : {}),
              },
              { onSuccess: setCreated, onError: (err) => setError(errorMessage(err)) },
            );
          }}
        >
          <h3 className="st-ws-section__title">2. Your address and {provider.name} keys</h3>
          <p className="st-ws-section__desc">
            No account yet?{" "}
            <a href={provider.signup} target="_blank" rel="noreferrer">
              Sign up at {provider.name}
            </a>{" "}
            and add your domain there first. Keys are stored encrypted and never shown again.
          </p>
          {provider.note && <p className="st-ws-hint">{provider.note}</p>}
          <div className="st-ws-cols">
            <Field label="Send from" hint="An address on your own domain.">
              <Input
                type="email"
                required
                placeholder="hello@yourdomain.com"
                value={from.fromEmail}
                onChange={(e) => setFrom({ ...from, fromEmail: e.target.value })}
              />
            </Field>
            <Field label="From name">
              <Input
                value={from.fromName}
                onChange={(e) => setFrom({ ...from, fromName: e.target.value })}
              />
            </Field>
            <Field label="Replies go to (optional)">
              <Input
                type="email"
                value={from.replyTo}
                onChange={(e) => setFrom({ ...from, replyTo: e.target.value })}
              />
            </Field>
            {provider.needsSelector && (
              <Field
                label="DKIM selector"
                hint="The name before ._domainkey in your provider's DKIM record."
              >
                <Input
                  value={from.dkimSelector}
                  onChange={(e) => setFrom({ ...from, dkimSelector: e.target.value })}
                />
              </Field>
            )}
          </div>
          {provider.fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <Input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={creds[f.key] ?? ""}
                onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
              />
            </Field>
          ))}
          {error && (
            <p className="st-ws-hint" role="alert">
              {error}
            </p>
          )}
          <div className="st-ws-actions">
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={actions.create.isPending}>
              Connect {provider.name}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
