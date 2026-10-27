import type { Redirect } from "@omniharmonic/openspace-schema";
import {
  ArrowUpRight,
  Bot,
  Check,
  Clock,
  ExternalLink,
  Globe,
  HandHeart,
  Inbox,
  Lock,
  Mail,
  PenLine,
  Sparkles,
  Store,
  TrendingUp,
  UserRound,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  useCapabilities,
  useCommerceSettings,
  useEmailUnavailable,
  useMcpGrants,
  useSetupInfo,
} from "../../api";
import type { Site } from "../../api/types";
import { Button, cx, Dialog, Field, Input, Spinner, toast } from "../../ui";
import { useDocStore } from "../editor/model/context";
import { useSiteUpdate } from "../site-chrome/controls";
import { CloudflareConnect } from "./CloudflareConnect";
import {
  buildChecklist,
  progress,
  readAcknowledged,
  SETUP_EVENT,
  type SetupItem,
  type WizardId,
  writeAcknowledged,
} from "./checklist";
import { PaymentsConnect } from "./PaymentsConnect";
import { formatDollars, yearlySaving } from "./savings";
import "../settings/settings.css";
import "./setup.css";

const ICONS: Record<WizardId, ReactNode> = {
  shop: <Store />,
  donations: <HandHeart />,
  members: <UserRound />,
  passwords: <Lock />,
  domain: <Globe />,
  forms: <Inbox />,
  newsletter: <Mail />,
  analytics: <TrendingUp />,
  personalize: <PenLine />,
  ai: <Bot />,
  info: <Wrench />,
};

const DONE_TOAST: Partial<Record<WizardId, string>> = {
  shop: "Your shop is open",
  donations: "Donations are on",
  members: "Member sign-in is on",
  passwords: "Password pages are on",
  domain: "Your domain is connected",
};

function minutes(n: number) {
  return n <= 1 ? "About a minute" : `About ${n} minutes`;
}

/** The checklist for a site, with live inputs (doc, setup file, payments, hosting). */
export function useSetupChecklist(site: Site) {
  const doc = useDocStore((s) => s.doc);
  const setup = useSetupInfo(site.id);
  const caps = useCapabilities();
  const commerce = useCommerceSettings(site.id, caps.payments.configured);
  const grants = useMcpGrants();
  const [acknowledged, setAck] = useState(() => readAcknowledged(site.id));
  // Steps ticked elsewhere (the editor's first edit, another copy of the list) show at once.
  useEffect(() => {
    const onTick = (e: Event) => {
      if ((e as CustomEvent<{ siteId: string }>).detail?.siteId === site.id)
        setAck(readAcknowledged(site.id));
    };
    window.addEventListener(SETUP_EVENT, onTick);
    return () => window.removeEventListener(SETUP_EVENT, onTick);
  }, [site.id]);
  const aiConnected = (grants.data ?? []).some((g) => g.sites.some((s) => s.id === site.id));
  const items = useMemo(
    () =>
      buildChecklist({
        doc,
        site,
        setup: setup.data,
        paymentsReady: commerce.data?.payments.ready === true,
        acknowledged,
        aiConnected,
      }),
    [doc, site, setup.data, commerce.data, acknowledged, aiConnected],
  );
  const acknowledge = (id: string) => {
    const next = [...acknowledged, id];
    writeAcknowledged(site.id, next);
    setAck(next);
  };
  return { items, setup, acknowledge, loading: setup.isPending };
}

/** Celebrate each step the moment it's finished (not the ones already done on arrival). */
function useCelebrations(items: SetupItem[]) {
  const before = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const prev = before.current;
    before.current = new Map(items.map((i) => [i.id, i.status]));
    if (!prev) return;
    for (const i of items)
      if (i.status === "done" && prev.has(i.id) && prev.get(i.id) !== "done")
        toast({
          tone: "celebrate",
          title: DONE_TOAST[i.wizard] ?? `Done: ${i.title}`,
          description: "One less thing to think about.",
        });
  }, [items]);
}

/**
 * Studio → Finish setting up (`/sites/:id/settings/setup`): what's left after the site went live,
 * each with why it matters, how long it takes and a guided helper that does the work.
 */
export function FinishSetup({ site }: { site: Site }) {
  const { items, setup, acknowledge, loading } = useSetupChecklist(site);
  const [open, setOpen] = useState<SetupItem | null>(null);
  useCelebrations(items);
  const p = progress(items);
  const from = setup.data?.imported?.from ?? null;
  const sells = items.some((i) => i.kind === "store");
  const saving = yearlySaving(from, sells);
  const everLive = setup.data?.everLive ?? site.status === "live";

  if (loading) return <Spinner size={16} label="Working out what's left" />;

  return (
    <div className="st-setup">
      <header className="st-setup-head">
        <div
          className="st-setup-meter"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={p.total}
          aria-valuenow={p.done}
          style={{ "--p": p.total ? p.done / p.total : 1 } as React.CSSProperties}
        >
          <span className="st-num">
            {p.done}/{p.total}
          </span>
        </div>
        <div>
          <p className="st-setup-lede">
            {!everLive
              ? "Your site is being published right now. These steps open up as soon as it's live."
              : p.left === 0
                ? "Everything's set up. Your site is complete — and it's yours."
                : from
                  ? `Your site moved from ${from} and it's live. A few things work a little differently here; each one takes a few minutes, whenever you're ready.`
                  : "Your site is live. These make it complete — do them whenever you like; none of them is urgent."}
          </p>
          {saving !== null && (
            <p className="st-setup-saving">
              <Sparkles aria-hidden="true" /> Leaving {from} saves you about{" "}
              <strong>{formatDollars(saving)} a year</strong>.
            </p>
          )}
        </div>
      </header>

      <ul className="st-setup-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={cx("st-setup-item", `is-${item.status}`)}
            data-testid={`setup-${item.id}`}
          >
            <span className="st-setup-item__icon" aria-hidden="true">
              {item.status === "done" ? <Check /> : ICONS[item.wizard]}
            </span>
            <div className="st-setup-item__body">
              <h3 className="st-setup-item__title">{item.title}</h3>
              <p className="st-setup-item__why">{item.why}</p>
              <p className="st-setup-item__meta">
                {item.status !== "done" && (
                  <span>
                    <Clock aria-hidden="true" /> {minutes(item.minutes)}
                  </span>
                )}
                {item.count !== null && item.kind === "store" && (
                  <span>{item.count === 1 ? "1 product" : `${item.count} products`}</span>
                )}
                {item.source === "import" && from && <span>From your {from} site</span>}
              </p>
            </div>
            <div className="st-setup-item__action">
              {item.status === "done" ? (
                <span className="st-setup-item__done">Done</span>
              ) : item.status === "later" ? (
                <span className="st-setup-item__later">Once your site is live</span>
              ) : (
                <Button
                  size="sm"
                  variant={
                    item === items.find((i) => i.status === "todo") ? "primary" : "secondary"
                  }
                  onClick={() => setOpen(item)}
                >
                  Start
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <SetupWizard
        site={site}
        item={open}
        onClose={() => setOpen(null)}
        onAcknowledge={(id) => {
          acknowledge(id);
          setOpen(null);
        }}
      />
    </div>
  );
}

// --- wizards ---------------------------------------------------------------------------------

const ELSEWHERE: Record<"shop" | "donations", { path: string; label: string; hint: string }> = {
  shop: {
    path: "/shop-elsewhere",
    label: "Your current shop's address",
    hint: "For example your old Squarespace or Etsy shop. Your site's “opening soon” notes link there until checkout is ready.",
  },
  donations: {
    path: "/give-elsewhere",
    label: "Your current donation page",
    hint: "For example a PayPal, Open Collective or GoFundMe page. Your site's “opening soon” notes link there until online giving is ready.",
  },
};

/** "Point visitors to your current shop" — a site redirect the opening-soon notes read. */
function Elsewhere({ kind }: { kind: "shop" | "donations" }) {
  const copy = ELSEWHERE[kind];
  const stored = useDocStore((s) => s.doc.site.redirects);
  const update = useSiteUpdate();
  const current = stored?.find((r) => r.from.replace(/\/+$/, "") === copy.path);
  const [url, setUrl] = useState(current?.to ?? "");
  const valid = /^https:\/\/[^\s]+\.[^\s]+$/i.test(url.trim());
  const save = () => {
    const rest = (stored ?? []).filter((r) => r.from.replace(/\/+$/, "") !== copy.path);
    const next: Redirect[] = url.trim()
      ? [...rest, { from: copy.path, to: url.trim(), status: 302 }]
      : rest;
    update(
      "Linked to the current shop",
      next.length ? { set: { redirects: next } } : { unset: ["redirects"] },
    );
    toast({
      tone: "success",
      title: url.trim() ? "Linked" : "Link removed",
      description: "It shows on your live site the next time you publish.",
    });
  };
  return (
    <form
      className="st-setup-elsewhere"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid || !url.trim()) save();
      }}
    >
      <Field
        label={copy.label}
        hint={copy.hint}
        error={url && !valid ? "Paste the whole address, starting with https://" : undefined}
      >
        <Input
          value={url}
          inputMode="url"
          placeholder="https://"
          prefix={<ExternalLink aria-hidden="true" />}
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <Button type="submit" size="sm" disabled={Boolean(url) && !valid}>
        {current ? "Update link" : "Save link"}
      </Button>
    </form>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="st-setup-step" aria-label={title}>
      <h3 className="st-setup-step__title">
        <span className="st-setup-step__n" aria-hidden="true">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

const WIZARD_TITLE: Record<WizardId, string> = {
  shop: "Open your shop",
  donations: "Take donations online",
  members: "Turn on member sign-in",
  passwords: "Turn on password pages",
  domain: "Use your own domain",
  forms: "Your form messages",
  newsletter: "Newsletter sign-ups",
  analytics: "Your visitor stats",
  personalize: "Make it yours",
  ai: "Connect your AI",
  info: "From your old site",
};

const WIZARD_LEDE: Record<WizardId, string> = {
  shop: "Two short steps: a free Cloudflare account runs your checkout, and Stripe pays you. Your site stays online and unchanged the whole time.",
  donations:
    "Two short steps: a free Cloudflare account runs the giving form, and Stripe pays you. Your site stays online the whole time.",
  members:
    "Member sign-in runs on a free Cloudflare account of your own. One short step; your site stays online the whole time.",
  passwords:
    "Password pages run on a free Cloudflare account of your own. One short step; your site stays online the whole time.",
  domain:
    "Your site already has a free address. Connecting a domain you own (like yourname.com) takes about 15 minutes, most of it waiting.",
  forms:
    "Every message people send through your site's forms is kept in your Inbox, ready to read, reply to or download.",
  newsletter:
    "People who sign up are kept in Subscribers. You can write and send updates to them from Studio.",
  analytics:
    "OpenSpace counts visits privately, without cookies — so there's no cookie banner to add and nothing to set up.",
  personalize:
    "Your site starts with sample words and pictures. Swap in your own — it ticks itself off as soon as you change something.",
  ai: "Claude can write, edit and check your site for you. Connecting it takes a few minutes, with nothing to install.",
  info: "",
};

export function SetupWizard({
  site,
  item,
  onClose,
  onAcknowledge,
}: {
  site: Site;
  item: SetupItem | null;
  onClose: () => void;
  onAcknowledge: (id: string) => void;
}) {
  const navigate = useNavigate();
  const noEmail = useEmailUnavailable();
  const go = (path: string) => {
    onClose();
    navigate(path);
  };
  const w = item?.wizard ?? "info";
  const gotIt = item && (
    <Button variant="primary" onClick={() => onAcknowledge(item.id)}>
      Got it — mark as done
    </Button>
  );
  let body: ReactNode = null;
  let footer: ReactNode = (
    <Button variant="ghost" onClick={onClose}>
      Close
    </Button>
  );
  switch (w) {
    case "shop":
    case "donations":
      body = (
        <>
          <Step n={1} title="Your own Cloudflare account (free)">
            <CloudflareConnect site={site} />
          </Step>
          <Step n={2} title="Get paid with Stripe">
            <PaymentsConnect site={site} />
          </Step>
          {item?.status !== "done" && (
            <details className="st-setup-later">
              <summary>
                {w === "shop"
                  ? "Not ready yet? Send shoppers to your current shop meanwhile"
                  : "Not ready yet? Send supporters to your current donation page meanwhile"}
              </summary>
              <Elsewhere kind={w} />
            </details>
          )}
        </>
      );
      break;
    case "members":
      body = (
        <>
          <Step n={1} title="Your own Cloudflare account (free)">
            <CloudflareConnect site={site} />
          </Step>
          {noEmail && (
            <p className="st-setup-note">
              Members sign in with a link sent by email. This OpenSpace server can't send email yet;
              sign-in links start working the moment it can — nothing else for you to do.
            </p>
          )}
        </>
      );
      break;
    case "passwords":
      body = <CloudflareConnect site={site} />;
      break;
    case "domain":
      body = (
        <ul className="st-setup-bullets">
          <li>You'll need a domain you own — or you can buy one in the next step.</li>
          <li>
            We show you exactly what to copy into your domain company's website, with pictures for
            the common ones.
          </li>
          <li>Your site keeps working at its current address while the new one connects.</li>
        </ul>
      );
      footer = (
        <>
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
          <Button
            variant="primary"
            icon={<Globe />}
            onClick={() => go(`/sites/${site.id}/settings/domains`)}
          >
            Open the domain helper
          </Button>
        </>
      );
      break;
    case "personalize":
      body = (
        <ul className="st-setup-bullets">
          <li>Click the headline (or any words) on your page and type.</li>
          <li>Click the main photo, then choose Replace to use one of yours.</li>
          <li>Press Publish when you're happy — your changes go online in about a minute.</li>
        </ul>
      );
      footer = (
        <>
          <Button variant="ghost" onClick={() => go(`/sites/${site.id}`)}>
            Open the editor
          </Button>
          {gotIt}
        </>
      );
      break;
    case "ai":
      footer = (
        <>
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
          <Button variant="primary" icon={<Bot />} onClick={() => go("/connect")}>
            Connect your AI
          </Button>
        </>
      );
      break;
    case "forms":
    case "newsletter":
    case "analytics": {
      const dest =
        w === "forms"
          ? { path: "inbox", label: "Open your Inbox" }
          : w === "newsletter"
            ? { path: "subscribers", label: "Open Subscribers" }
            : { path: "analytics", label: "Open visitor stats" };
      body =
        w === "forms" && noEmail ? (
          <p className="st-setup-note">
            Email alerts for new messages start once this OpenSpace server can send email. Until
            then, the Inbox badge shows when something new arrives.
          </p>
        ) : null;
      footer = (
        <>
          <Button variant="ghost" onClick={() => go(`/sites/${site.id}/${dest.path}`)}>
            {dest.label} <ArrowUpRight aria-hidden="true" />
          </Button>
          {gotIt}
        </>
      );
      break;
    }
    default:
      body = item ? (
        <>
          <p>{item.why}</p>
          {item.where.length > 0 && (
            <p className="st-setup-aside">
              Where: {item.where.slice(0, 5).join(", ")}
              {item.where.length > 5 ? ` and ${item.where.length - 5} more` : ""}
            </p>
          )}
          <p className="st-setup-aside">
            Not sure what to do? Ask Claude: “Help me with ‘{item.title}’ on my site.”
          </p>
        </>
      ) : null;
      footer = (
        <>
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
          {gotIt}
        </>
      );
  }
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(o) => !o && onClose()}
      title={item?.wizard === "info" ? item.title : WIZARD_TITLE[w]}
      description={WIZARD_LEDE[w] || undefined}
      width={560}
      className="st-setup-dialog"
      footer={footer}
    >
      <div className="st-setup-wizard">{body}</div>
    </Dialog>
  );
}
