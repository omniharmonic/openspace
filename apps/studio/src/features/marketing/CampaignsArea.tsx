import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import type { Block } from "@omniharmonic/openspace-schema";
import { ArrowLeft, Gauge, Mail, Plus, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import {
  type CampaignStats,
  type CampaignView,
  useCampaign,
  useCampaignActions,
  useCampaignLimits,
  useCampaigns,
  useSenders,
  useSubscribers,
} from "../../api";
import type { Site } from "../../api/types";
import { Badge, type BadgeTone, Button, EmptyState, Skeleton, toast } from "../../ui";
import { freshBlock } from "../collections/markdoc";
import { useDocStore } from "../editor/model/context";
import { can } from "../site-mgmt/manage-ui";
import { dateTime, number, percent } from "../workspace/format";
import { workspacePath } from "../workspace/routes";
import { errorMessage, Stat, WsHeader } from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";
import { CampaignComposer } from "./CampaignComposer";
import { EmailPreviewPane } from "./EmailPreviewPane";
import { SenderSetup } from "./SenderSetup";
import "./marketing.css";

const STATUS: Record<CampaignView["status"], { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "accent" },
  sending: { label: "Sending", tone: "pending" },
  sent: { label: "Sent", tone: "live" },
  failed: { label: "Didn't send", tone: "danger" },
  canceled: { label: "Canceled", tone: "neutral" },
};

/** A friendly first draft so the composer never opens blank. */
function starterBlocks(siteName: string): Block[] {
  const reg = blocksRegistry();
  const heading = reg.get("heading")
    ? [freshBlock("heading", { text: `News from ${siteName}` })]
    : [];
  return [
    ...heading,
    freshBlock("text", {
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello! Here's what's new this month." }],
          },
        ],
      },
    }),
  ];
}

/** `/campaigns`, `/campaigns/new`, `/campaigns/sender`, `/campaigns/:id`. */
export function CampaignsArea({ site, route }: AreaProps) {
  const [id] = route.rest;
  if (id === "sender") return <SenderSetup site={site} />;
  if (id === "new") return <NewCampaign site={site} />;
  if (id) return <CampaignScreen key={id} site={site} campaignId={id} />;
  return <CampaignList site={site} />;
}

function NewCampaign({ site }: { site: Site }) {
  const navigate = useNavigate();
  const actions = useCampaignActions(site.id);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    actions.create.mutate(
      {
        subject: `News from ${site.name}`,
        body: { blocks: starterBlocks(site.name) },
        segment: { tags: [], match: "any" },
      },
      {
        onSuccess: (c) => navigate(workspacePath(site.id, "campaigns", c.id), { replace: true }),
        onError: (err) => {
          toast({
            tone: "danger",
            title: "Couldn't start an email",
            description: errorMessage(err),
          });
          navigate(workspacePath(site.id, "campaigns"), { replace: true });
        },
      },
    );
  }, [actions.create, navigate, site.id, site.name]);
  return <Skeleton height={200} />;
}

function CampaignList({ site }: { site: Site }) {
  const navigate = useNavigate();
  const campaigns = useCampaigns(site.id);
  const designer = can(site, "designer");
  const senders = useSenders(site.id, designer);
  const subs = useSubscribers(site.id, { limit: 1 });
  const verified = senders.data?.some((s) => s.status === "verified");
  const list = campaigns.data ?? [];
  return (
    <div className="st-ws-stack">
      <WsHeader
        title="Email campaigns"
        description="Newsletters and announcements to your subscribers, written with the same blocks as your site."
        actions={
          <>
            {designer && (
              <Button
                icon={<ShieldCheck />}
                onClick={() => navigate(workspacePath(site.id, "campaigns", "sender"))}
              >
                Sending setup
              </Button>
            )}
            <Button
              variant="primary"
              icon={<Plus />}
              onClick={() => navigate(workspacePath(site.id, "campaigns", "new"))}
            >
              New email
            </Button>
          </>
        }
      />
      {designer && senders.isSuccess && !verified && (
        <div className="st-callout st-callout--pending">
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>Connect your email sender first.</strong> Emails come from your own address, so
            they land in inboxes instead of spam.{" "}
            <button
              type="button"
              className="st-linklike"
              onClick={() => navigate(workspacePath(site.id, "campaigns", "sender"))}
            >
              Set it up
            </button>
          </span>
        </div>
      )}
      <SendingLimit siteId={site.id} />
      <div className="st-ws-panel">
        {campaigns.isPending ? (
          <div className="st-ws-section">
            <Skeleton height={14} />
            <Skeleton height={14} width="60%" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            className="st-ws-empty"
            icon={<Mail />}
            title="Write your first email"
            description={
              subs.data?.counts.confirmed
                ? `You have ${number(subs.data.counts.confirmed)} subscribers waiting to hear from you.`
                : "Add a Newsletter section to your site to collect subscribers, then send them updates from here."
            }
            action={
              <Button
                variant="primary"
                icon={<Plus />}
                onClick={() => navigate(workspacePath(site.id, "campaigns", "new"))}
              >
                New email
              </Button>
            }
          />
        ) : (
          <ul className="st-ws-list" aria-label="Emails">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="st-ws-row"
                  onClick={() => navigate(workspacePath(site.id, "campaigns", c.id))}
                >
                  <span className="st-ws-row__main">
                    <span className="st-ws-row__title">{c.subject || "Untitled email"}</span>
                    <span className="st-ws-row__meta">
                      {c.status === "sent"
                        ? `Sent ${dateTime(c.finishedAt ?? c.startedAt)} to ${number(c.recipients)} people`
                        : c.status === "scheduled"
                          ? `Sends ${dateTime(c.sendAt)}`
                          : `Edited ${dateTime(c.updatedAt)}`}
                    </span>
                  </span>
                  <span className="st-ws-row__side">
                    <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Today's sending limit (PRD §9.3: new senders start with low volume caps that grow with a clean
 * history) or, when bounces or spam reports ran high, why sending is paused.
 */
function SendingLimit({ siteId }: { siteId: string }) {
  const limits = useCampaignLimits(siteId);
  const l = limits.data;
  if (!l) return null;
  if (l.paused)
    return (
      <div className="st-callout st-callout--danger" role="alert">
        <TriangleAlert aria-hidden="true" />
        <span>{l.paused.message}</span>
      </div>
    );
  return (
    <p className="st-camp-limit">
      <Gauge aria-hidden="true" />
      <span>
        <strong>
          {number(l.remaining)} of {number(l.limit)}
        </strong>{" "}
        emails left to send today. New senders start small; the limit doubles each day you send
        without bounces or spam reports. Bigger lists keep sending the next day.
        {l.abuseEmail ? ` Every email links to ${l.abuseEmail} for reporting abuse.` : ""}
      </span>
    </p>
  );
}

function CampaignScreen({ site, campaignId }: { site: Site; campaignId: string }) {
  const q = useCampaign(site.id, campaignId);
  const subs = useSubscribers(site.id, { limit: 200 });
  const tags = useMemo(
    () => [...new Set((subs.data?.subscribers ?? []).flatMap((s) => s.tags))].sort(),
    [subs.data],
  );
  if (q.isPending) return <Skeleton height={240} />;
  if (q.isError || !q.data) return <p className="st-ws-hint">That email isn't here any more.</p>;
  const { campaign, stats } = q.data;
  if (campaign.status === "draft" || campaign.status === "scheduled")
    return <CampaignComposer site={site} campaign={campaign} tags={tags} />;
  return <CampaignReport site={site} campaign={campaign} stats={stats} />;
}

function CampaignReport({
  site,
  campaign,
  stats,
}: {
  site: Site;
  campaign: CampaignView;
  stats: CampaignStats | null;
}) {
  const navigate = useNavigate();
  const doc = useDocStore((s) => s.doc);
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
        title={campaign.subject}
        description={
          campaign.status === "sending"
            ? "Sending now. This page updates as it goes. If your daily limit is reached, the rest goes out tomorrow."
            : `Sent ${dateTime(campaign.finishedAt ?? campaign.startedAt)} to ${number(campaign.recipients)} people${
                campaign.segment?.tags.length ? ` tagged ${campaign.segment.tags.join(", ")}` : ""
              }.`
        }
        actions={<Badge tone={STATUS[campaign.status].tone}>{STATUS[campaign.status].label}</Badge>}
      />
      {campaign.error && (
        <div className="st-callout st-callout--danger">
          <Send aria-hidden="true" />
          <span>{campaign.error}</span>
        </div>
      )}
      {stats && (
        <>
          <div className="st-stats">
            <Stat
              label="Delivered"
              value={number(stats.delivered)}
              detail={`of ${number(stats.recipients)}`}
            />
            <Stat
              label="Clicked a link"
              value={number(stats.clicked)}
              detail={stats.delivered ? `${percent(stats.clickRate)} of delivered` : undefined}
            />
            <Stat
              label="Opened"
              value={stats.trackOpens ? number(stats.opened) : "—"}
              detail={
                stats.trackOpens
                  ? `${percent(stats.openRate)} of delivered`
                  : "Not counted (privacy first)"
              }
            />
            <Stat
              label="Bounced or marked spam"
              value={number(stats.bounced + stats.complained)}
              detail={stats.bounced + stats.complained ? "They won't be emailed again." : undefined}
            />
          </div>
          {stats.links.length > 0 && (
            <div className="st-ws-panel st-ws-scroll">
              <table className="st-ws-table">
                <caption className="st-sr-only">Links clicked</caption>
                <thead>
                  <tr>
                    <th>Link</th>
                    <th className="is-num">Clicks</th>
                    <th className="is-num">People</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.links.map((l) => (
                    <tr key={l.url}>
                      <td className="st-report__url">{l.url}</td>
                      <td className="is-num">{number(l.clicks)}</td>
                      <td className="is-num">{number(l.uniqueClicks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <EmailPreviewPane
        blocks={campaign.body.blocks}
        subject={campaign.subject}
        preheader={campaign.preheader}
        baseUrl={site.url}
        fromName={doc.site.title}
      />
    </div>
  );
}
