import type { Block } from "@openspace/schema";
import { ArrowLeft, CalendarClock, Send, TestTube2, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  type CampaignSegment,
  type CampaignView,
  useCampaignActions,
  useSegmentCount,
  useSenders,
} from "../../api";
import type { Site } from "../../api/types";
import { HubError } from "../../api/types";
import { Badge, Button, Dialog, Field, Input, Popover, Segmented, toast } from "../../ui";
import { BodyEditor } from "../collections/BodyEditor";
import { fromInputDateTime, toInputDateTime } from "../collections/itemOps";
import { useDocStore } from "../editor/model/context";
import { can } from "../site-mgmt/manage-ui";
import { dateTime, number } from "../workspace/format";
import { workspacePath } from "../workspace/routes";
import { ConfirmDialog, errorMessage, SwitchRow, TagInput } from "../workspace/ui";
import { EmailPreviewPane } from "./EmailPreviewPane";
import { EMAIL_BLOCKS } from "./emailPreview";

interface Draft {
  subject: string;
  preheader: string;
  blocks: Block[];
  segment: CampaignSegment | null;
  trackOpens: boolean;
}

const toDraft = (c: CampaignView): Draft => ({
  subject: c.subject,
  preheader: c.preheader ?? "",
  blocks: c.body.blocks,
  segment: c.segment,
  trackOpens: c.trackOpens,
});

/** Write an email: subject, who gets it, blocks, live preview; test, schedule or send. */
export function CampaignComposer({
  site,
  campaign,
  tags,
}: {
  site: Site;
  campaign: CampaignView;
  /** Subscriber tags to offer for the segment. */
  tags: string[];
}) {
  const navigate = useNavigate();
  const doc = useDocStore((s) => s.doc);
  const actions = useCampaignActions(site.id);
  const designer = can(site, "designer");
  const senders = useSenders(site.id, designer);
  const sender = senders.data?.find((s) => s.id === campaign.senderId) ?? senders.data?.[0];
  const [draft, setDraft] = useState<Draft>(() => toDraft(campaign));
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState(() =>
    toInputDateTime(new Date(Date.now() + 86_400_000).toISOString()),
  );
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<HubError | null>(null);
  const segment = draft.segment ?? { tags: [], match: "any" as const };
  const count = useSegmentCount(site.id, segment);
  const editable = campaign.status === "draft";

  // Autosave a moment after typing stops.
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: autosaves when the draft changes; the mutation object is stable enough
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!editable) return;
    const t = setTimeout(() => {
      actions.update.mutate(
        {
          id: campaign.id,
          patch: {
            subject: draft.subject,
            preheader: draft.preheader || undefined,
            body: { blocks: draft.blocks },
            segment: draft.segment?.tags.length ? draft.segment : null,
            trackOpens: draft.trackOpens,
          },
        },
        { onSuccess: () => setSavedAt(Date.now()) },
      );
    }, 900);
    return () => clearTimeout(t);
  }, [draft]);

  const flush = () =>
    actions.update.mutateAsync({
      id: campaign.id,
      patch: {
        subject: draft.subject,
        preheader: draft.preheader || undefined,
        body: { blocks: draft.blocks },
        segment: draft.segment?.tags.length ? draft.segment : null,
        trackOpens: draft.trackOpens,
      },
    });

  const fail = (err: unknown) => {
    if (
      err instanceof HubError &&
      ["sender_required", "sender_unverified", "empty_campaign"].includes(err.code)
    )
      setProblem(err);
    else toast({ tone: "danger", title: "Couldn't do that", description: errorMessage(err) });
  };

  const send = async () => {
    try {
      await flush();
      await actions.send.mutateAsync(campaign.id);
      toast({
        tone: "success",
        title: "Sending",
        description: `On its way to ${number(count.data ?? 0)} people.`,
      });
      setConfirmSend(false);
    } catch (err) {
      setConfirmSend(false);
      fail(err);
    }
  };

  const schedule = async () => {
    const iso = fromInputDateTime(when);
    if (!iso) return;
    try {
      await flush();
      await actions.schedule.mutateAsync({ id: campaign.id, sendAt: iso });
      toast({ tone: "success", title: "Scheduled", description: `Sends ${dateTime(iso)}.` });
      setScheduling(false);
    } catch (err) {
      fail(err);
    }
  };

  const fromName = sender?.fromName ?? doc.site.title;
  const audience = useMemo(
    () =>
      segment.tags.length
        ? `Subscribers tagged ${segment.tags.join(segment.match === "all" ? " and " : " or ")}`
        : "All subscribers",
    [segment],
  );

  return (
    <div className="st-campaign">
      <div className="st-item__top">
        <button
          type="button"
          className="st-ws-back"
          onClick={() => navigate(workspacePath(site.id, "campaigns"))}
        >
          <ArrowLeft aria-hidden="true" /> Email campaigns
        </button>
        {campaign.status === "scheduled" ? (
          <Badge tone="accent" dot>
            Sends {dateTime(campaign.sendAt)}
          </Badge>
        ) : (
          <Badge>Draft</Badge>
        )}
        <span className="st-item__dirty st-campaign__saved" aria-live="polite">
          {actions.update.isPending ? "Saving…" : savedAt ? "Saved" : ""}
        </span>
        <span className="st-ws-toolbar__spacer" />
        {campaign.status === "scheduled" ? (
          designer && (
            <Button onClick={() => actions.unschedule.mutate(campaign.id, { onError: fail })}>
              Unschedule to edit
            </Button>
          )
        ) : (
          <>
            <TestSend siteId={site.id} campaignId={campaign.id} beforeSend={flush} onError={fail} />
            {designer && (
              <>
                <Button icon={<CalendarClock />} onClick={() => setScheduling(true)}>
                  Schedule
                </Button>
                <Button variant="primary" icon={<Send />} onClick={() => setConfirmSend(true)}>
                  Send now
                </Button>
              </>
            )}
          </>
        )}
      </div>

      {problem && (
        <div className="st-callout st-callout--danger" role="alert">
          <Send aria-hidden="true" />
          <span>
            {problem.message}{" "}
            {problem.code !== "empty_campaign" && (
              <button
                type="button"
                className="st-linklike"
                onClick={() => navigate(workspacePath(site.id, "campaigns", "sender"))}
              >
                Set up sending
              </button>
            )}
          </span>
        </div>
      )}
      {!designer && (
        <p className="st-ws-hint">
          You can write and test this email. The owner or a designer sends it.
        </p>
      )}

      <div className="st-campaign__layout">
        <div className="st-campaign__compose">
          <div className="st-item__card">
            <Field label="Subject">
              <Input
                value={draft.subject}
                disabled={!editable}
                maxLength={200}
                placeholder="What's this email about?"
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              />
            </Field>
            <Field label="Preview text" hint="Shown after the subject in most inboxes.">
              <Input
                value={draft.preheader}
                disabled={!editable}
                maxLength={150}
                onChange={(e) => setDraft({ ...draft, preheader: e.target.value })}
              />
            </Field>
            <Field
              label="Send to"
              hint={`${audience}: ${count.data === undefined ? "…" : number(count.data)} people`}
            >
              <div className="st-campaign__segment">
                <Users aria-hidden="true" className="st-inline-icon" />
                <TagInput
                  label="Only subscribers tagged"
                  placeholder="Everyone (or type a tag)"
                  value={segment.tags}
                  suggestions={tags}
                  onChange={(t) =>
                    editable && setDraft({ ...draft, segment: { ...segment, tags: t } })
                  }
                />
                {segment.tags.length > 1 && (
                  <Segmented
                    size="sm"
                    aria-label="Match"
                    value={segment.match}
                    onValueChange={(match) =>
                      setDraft({ ...draft, segment: { ...segment, match } })
                    }
                    options={[
                      { value: "any", label: "Any tag" },
                      { value: "all", label: "All tags" },
                    ]}
                  />
                )}
              </div>
            </Field>
            <SwitchRow
              label={<>Count opens</>}
              hint={
                <>Off by default: it adds a tracking pixel. Clicks on links are always counted.</>
              }
              checked={draft.trackOpens}
              disabled={!editable}
              onCheckedChange={(trackOpens) => setDraft({ ...draft, trackOpens })}
            />
          </div>
          {editable ? (
            <BodyEditor
              label="Email body"
              types={EMAIL_BLOCKS}
              blocks={draft.blocks}
              onChange={(blocks) => setDraft({ ...draft, blocks })}
            />
          ) : (
            <p className="st-ws-hint">Unschedule it to change the words.</p>
          )}
          {editable && (
            <Button variant="ghost" icon={<Trash2 />} onClick={() => setDeleting(true)}>
              Delete draft
            </Button>
          )}
        </div>
        <EmailPreviewPane
          blocks={draft.blocks}
          subject={draft.subject}
          preheader={draft.preheader || null}
          baseUrl={site.url}
          fromName={fromName}
        />
      </div>

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        tone="primary"
        title={`Send to ${count.data === undefined ? "your subscribers" : `${number(count.data)} people`}?`}
        description={`${audience}. Emails can't be unsent.`}
        confirmLabel="Send now"
        busy={actions.send.isPending}
        onConfirm={() => void send()}
      />
      <Dialog
        open={scheduling}
        onOpenChange={setScheduling}
        title="Schedule this email"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setScheduling(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={actions.schedule.isPending}
              onClick={() => void schedule()}
            >
              Schedule
            </Button>
          </>
        }
      >
        <Field label="Send at" hint="Your local time.">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </Dialog>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this draft?"
        confirmLabel="Delete"
        onConfirm={() =>
          actions.remove.mutate(campaign.id, {
            onSuccess: () => navigate(workspacePath(site.id, "campaigns")),
            onError: fail,
          })
        }
      />
    </div>
  );
}

function TestSend({
  siteId,
  campaignId,
  beforeSend,
  onError,
}: {
  siteId: string;
  campaignId: string;
  beforeSend: () => Promise<unknown>;
  onError: (err: unknown) => void;
}) {
  const actions = useCampaignActions(siteId);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      title="Send yourself a test"
      width={300}
      trigger={<Button icon={<TestTube2 />}>Send a test</Button>}
    >
      <form
        className="st-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await beforeSend();
            await actions.test.mutateAsync({ id: campaignId, to: to.trim() });
            toast({ tone: "success", title: "Test sent", description: `Check ${to.trim()}.` });
            setOpen(false);
          } catch (err) {
            onError(err);
          }
        }}
      >
        <Input
          type="email"
          aria-label="Test address"
          placeholder="you@example.com"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button variant="primary" type="submit" loading={actions.test.isPending}>
          Send test
        </Button>
      </form>
    </Popover>
  );
}
