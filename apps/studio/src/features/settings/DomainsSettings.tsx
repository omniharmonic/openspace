import {
  ArrowUpRight,
  Check,
  CircleCheck,
  CircleDashed,
  Cloud,
  Copy,
  Globe,
  Lock,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  type DnsRecord,
  type DomainLookup,
  type DomainView,
  type RegistrarGuide,
  useDomain,
  useDomainActions,
  useRegistrars,
} from "../../api";
import type { Site } from "../../api/types";
import { useConfig } from "../../app/config";
import { Badge, Button, cx, Field, IconButton, Input, Spinner, toast } from "../../ui";
import { RegistrarDiagram } from "./RegistrarDiagram";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ tone: "success", title: `${what} copied`, description: text });
  } catch {
    toast({ tone: "danger", title: "Couldn’t copy", description: text });
  }
}

/** The DNS records to add, with copy buttons, written the way this registrar expects. */
export function RecordsTable({
  records,
  guide,
}: {
  records: DnsRecord[];
  guide?: RegistrarGuide | null;
}) {
  const host = (r: DnsRecord) => (r.host === "@" ? guide?.hostApex || "@" : r.host);
  return (
    <div className="st-records">
      <table className="st-table">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Host / Name</th>
            <th scope="col">Value / Points to</th>
            <th scope="col">
              <span className="st-visually-hidden">Copy</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={`${r.type}-${r.name}-${r.value}`} className={cx(r.optional && "is-optional")}>
              <td>
                <Badge>{r.type}</Badge>
              </td>
              <td className="st-code">{host(r) || <em>(leave empty)</em>}</td>
              <td className="st-code st-records__value">
                {r.value}
                {r.optional && <span className="st-records__opt">Optional</span>}
              </td>
              <td>
                <IconButton
                  label={`Copy ${r.value}`}
                  icon={<Copy />}
                  size="sm"
                  onClick={() => void copy(r.value, "Value")}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Guide({
  guide,
  lookup,
  records,
}: {
  guide: RegistrarGuide;
  lookup?: DomainLookup | null;
  records: DnsRecord[];
}) {
  const known = guide.id !== "other";
  return (
    <div className="st-guide">
      <div className="st-guide__head">
        <span className="st-guide__logo" aria-hidden="true">
          {/* A known registrar gets its initial; "your domain provider" gets a globe, not a "Y". */}
          {known ? guide.name.charAt(0).toUpperCase() : <Globe width={16} height={16} />}
        </span>
        <div>
          <p className="st-guide__title">
            {known ? (
              <>
                Your domain's settings are at <strong>{guide.name}</strong>
              </>
            ) : (
              <>Add these records where you bought your domain</>
            )}
          </p>
          {lookup?.registrar && known && lookup.registrar !== guide.name && (
            <p className="st-muted-note">
              Registered with {lookup.registrar}; its settings are managed at {guide.name}.
            </p>
          )}
        </div>
        {guide.dnsUrl && (
          <a className="st-btnlink" href={guide.dnsUrl} target="_blank" rel="noreferrer">
            Open {guide.name} <ArrowUpRight aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="st-guide__body">
        <RegistrarDiagram guide={guide} records={records} />
        <ol className="st-steps">
          {guide.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
      {guide.watchOut.length > 0 && (
        <div className="st-callout st-callout--pending" role="note">
          <TriangleAlert aria-hidden="true" />
          <ul className="st-guide__watch">
            {guide.watchOut.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Checklist({ view }: { view: DomainView }) {
  return (
    <ul className="st-checklist-dns" aria-live="polite">
      {view.checklist.map((c) => (
        <li key={c.id} className={cx(c.ok && "is-ok")}>
          {c.ok ? (
            <CircleCheck aria-hidden="true" />
          ) : (
            <CircleDashed aria-hidden="true" className="st-spin-slow" />
          )}
          <div>
            <span>{c.label}</span>
            {!c.ok && c.hint && <span className="st-checklist-dns__hint">{c.hint}</span>}
            {!c.ok && c.found.length > 0 && c.id !== "https" && (
              <span className="st-checklist-dns__hint">Found: {c.found.join(", ")}</span>
            )}
          </div>
          <span className="st-visually-hidden">{c.ok ? "done" : "waiting"}</span>
        </li>
      ))}
    </ul>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "not yet";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} seconds ago`;
  return `${Math.round(s / 60)} min ago`;
}

/**
 * Custom domain wizard (FR-50/51): find where the domain is managed, show the exact records with
 * registrar-specific steps, then watch DNS until it's right and HTTPS is on.
 */
export function DomainsSettings({ site }: { site: Site }) {
  const navigate = useNavigate();
  const { timing } = useConfig();
  // The Hub suggests re-checking every 15 s; test configs run the clock faster.
  const pollMs = timing.pollMs >= 1000 ? 15_000 : timing.pollMs * 5;
  const domain = useDomain(site.id, { pollMs });
  const actions = useDomainActions(site.id);
  const registrars = useRegistrars();
  const [input, setInput] = useState("");
  const [lookup, setLookup] = useState<DomainLookup | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (site.deployTarget === "cloudflare") {
    return (
      <div className="st-settings__stack">
        <div className="st-callout st-callout--accent" role="note">
          <Cloud aria-hidden="true" />
          <div>
            <strong>Your site is hosted on Cloudflare.</strong> Connect your domain in your
            Cloudflare dashboard: the domain's DNS needs to be on Cloudflare (add it as a site there
            and switch its nameservers). Then open Workers &amp; Pages → your site → Settings →
            Domains &amp; Routes → Add → Custom domain, and enter the main domain or a subdomain
            such as blog.yourdomain.com. Cloudflare adds the DNS records itself — you don't add A or
            CNAME records by hand.
          </div>
        </div>
        <a
          className="st-btnlink"
          href="https://dash.cloudflare.com/"
          target="_blank"
          rel="noreferrer"
        >
          Open Cloudflare <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    );
  }

  if (domain.isPending) return <Spinner size={16} label="Loading your domain" />;

  const view = domain.data;
  if (view) {
    const guide = registrars.data?.find((g) => g.name === view.registrar) ?? null;
    const active = view.status === "active";
    return (
      <div className="st-settings__stack">
        <div className="st-card">
          <div className="st-card__head">
            <div>
              <p className="st-domain__name">
                <Globe aria-hidden="true" /> {view.hostname}
              </p>
              <p className="st-card__desc">{view.message}</p>
            </div>
            {active ? (
              <Badge tone="live" dot>
                Connected
              </Badge>
            ) : view.status === "failed" ? (
              <Badge tone="danger" dot>
                Didn't connect
              </Badge>
            ) : (
              <Badge tone="pending" dot pulse>
                {view.status === "verifying" ? "Securing" : "Waiting for records"}
              </Badge>
            )}
          </div>
          <Checklist view={view} />
          {active ? (
            <div className="st-callout st-callout--live" role="status">
              <Lock aria-hidden="true" />
              <div>
                <strong>Secure and live.</strong> Visitors reach your site at{" "}
                <a href={`https://${view.hostname}/`} target="_blank" rel="noreferrer">
                  https://{view.hostname}
                </a>
                {view.hostname === view.apex
                  ? `, and www.${view.apex} sends them there too.`
                  : view.hostname === `www.${view.apex}`
                    ? `, and ${view.apex} sends them there too.`
                    : "."}
              </div>
            </div>
          ) : (
            <div className="st-row-actions st-row-actions--start">
              <span className="st-muted-note" aria-live="polite">
                {view.status === "failed"
                  ? "We stopped checking. Fix the records below, then check again."
                  : `Checked ${timeAgo(view.checkedAt)} · we check every 15 seconds. Changes can take up to an hour.`}
              </span>
              <Button
                size="sm"
                icon={<RefreshCw />}
                loading={actions.check.isPending}
                onClick={() => actions.check.mutate()}
              >
                {view.status === "failed" ? "Check again" : "Check now"}
              </Button>
            </div>
          )}
        </div>
        {!active && (
          <div className="st-card">
            {guide && <Guide guide={guide} records={view.records} />}
            <RecordsTable records={view.records} guide={guide} />
          </div>
        )}
        <div className="st-row-actions st-row-actions--start">
          {confirmRemove ? (
            <>
              <span className="st-media-warn">
                Your site goes back to {site.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}{" "}
                after the next publish.
              </span>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                Keep it
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={actions.remove.isPending}
                onClick={() =>
                  actions.remove.mutate(undefined, {
                    onSuccess: () => {
                      setConfirmRemove(false);
                      toast({ title: "Domain removed" });
                    },
                  })
                }
              >
                Remove domain
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
              Remove {view.hostname}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // No domain yet: step 1 (enter it), step 2 (records + guide), then connect.
  return (
    <div className="st-settings__stack">
      <p className="st-settings__lede">
        Use a domain you own, like <strong>mayayoga.com</strong>. We'll show you exactly what to
        change where you bought it, and turn on HTTPS for you. Both the plain domain and its www
        version will work.
      </p>
      <ol className="st-wizard">
        <li className={cx("st-wizard__step", lookup && "is-done")}>
          <h3>{lookup ? <Check aria-hidden="true" /> : <span>1</span>} Your domain</h3>
          <form
            className="st-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              actions.lookup.mutate(input, { onSuccess: setLookup });
            }}
          >
            <Field label="Domain" error={actions.lookup.error?.message}>
              <Input
                value={input}
                placeholder="mayayoga.com"
                inputMode="url"
                autoCapitalize="none"
                onChange={(e) => {
                  setInput(e.target.value);
                  setLookup(null);
                }}
              />
            </Field>
            <Button
              type="submit"
              variant={lookup ? "secondary" : "primary"}
              disabled={!input.trim()}
              loading={actions.lookup.isPending}
            >
              {lookup ? "Look up again" : "Continue"}
            </Button>
          </form>
          <p className="st-muted-note">
            Don't have one yet? Domains cost about $10–15 a year at providers like Cloudflare,
            Porkbun or Namecheap.
          </p>
        </li>
        {lookup && (
          <li className="st-wizard__step">
            <h3>
              <span>2</span> Add these records
            </h3>
            <Guide guide={lookup.guide} lookup={lookup} records={lookup.records} />
            <RecordsTable records={lookup.records} guide={lookup.guide} />
          </li>
        )}
        {lookup && (
          <li className="st-wizard__step">
            <h3>
              <span>3</span> Connect
            </h3>
            <p className="st-muted-note">
              Once you've saved the records, connect the domain. We'll keep checking and switch on
              HTTPS as soon as everything points here.
            </p>
            <div className="st-row-actions st-row-actions--start">
              <Button
                variant="primary"
                loading={actions.connect.isPending}
                onClick={() =>
                  actions.connect.mutate(lookup.hostname, {
                    onSuccess: () =>
                      document
                        .querySelector(".st-settings__body")
                        ?.scrollTo?.({ top: 0, behavior: "smooth" }),
                    onError: (err) =>
                      toast({
                        tone: "danger",
                        title: "Couldn’t connect the domain",
                        description: err.message,
                      }),
                  })
                }
              >
                I've added the records — connect {lookup.hostname}
              </Button>
            </div>
          </li>
        )}
      </ol>
      <button
        type="button"
        className="st-linklike"
        onClick={() => navigate(`/sites/${site.id}/settings/home`)}
      >
        Where does my site live?
      </button>
    </div>
  );
}
