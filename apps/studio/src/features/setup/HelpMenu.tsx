import {
  ArrowUpRight,
  BookOpen,
  Bot,
  LifeBuoy,
  ListChecks,
  Map as MapIcon,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useRetryPublish } from "../../api";
import type { Site } from "../../api/types";
import { Button, IconButton, Popover, toast } from "../../ui";
import { can } from "../site-mgmt/manage-ui";
import { progress } from "./checklist";
import { useSetupChecklist } from "./FinishSetup";
import { replayTour } from "./FirstRunTour";
import "./setup.css";

const DOCS = "https://docs.openspace.host/getting-started/";

/**
 * "Need a hand?" — what to do next, in context: a site still being set up, one whose latest
 * publish needs attention, or the next step of Finish setting up; plus the tour, Claude and the
 * guide.
 */
export function HelpMenu({ site, side = "right" }: { site: Site; side?: "right" | "bottom" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { items } = useSetupChecklist(site);
  const retry = useRetryPublish();
  const next = items.find((i) => i.status === "todo");
  const p = progress(items);
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  let now: { title: string; body: string; action?: { label: string; run: () => void } };
  if (site.status === "building")
    now = {
      title: "Your site is being set up",
      body: "It usually takes a minute or two. This page updates by itself — you don't need to do anything.",
    };
  else if (site.status === "failed" && site.import?.state === "failed")
    now = {
      title: "The move didn't finish",
      body: "Your current site is untouched. Try the move again — it picks up from the start.",
      action: { label: "Try the move again", run: () => go(`/move/${site.import?.id}`) },
    };
  else if (site.status === "failed")
    now = {
      title: "Your latest publish needs attention",
      body:
        site.statusDetail ??
        "The last publish didn't finish. Your live site still shows the version before it.",
      action: {
        label: "Try publishing again",
        run: () =>
          retry.mutate(site.id, {
            onSuccess: () => toast({ title: "Publishing again", description: "About a minute." }),
          }),
      },
    };
  else if (next && can(site, "designer"))
    now = {
      title: `Next: ${next.title}`,
      body: next.why,
      action: { label: "Show me how", run: () => go(`/sites/${site.id}/settings/setup`) },
    };
  else
    now = {
      title: p.total && p.left === 0 ? "You're all set" : "Edit anything you see",
      body: "Click any words or photo on the page to change them, then press Publish to put your changes online.",
    };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side={side}
      align="end"
      width={300}
      className="st-help"
      trigger={<IconButton label="Need a hand?" icon={<LifeBuoy />} tooltipSide="right" />}
    >
      <div className="st-help__now">
        <h3>{now.title}</h3>
        <p>{now.body}</p>
        {now.action && (
          <Button
            size="sm"
            variant="primary"
            onClick={now.action.run}
            icon={site.status === "failed" ? <RotateCcw /> : undefined}
          >
            {now.action.label}
          </Button>
        )}
      </div>
      <ul className="st-help__list">
        {can(site, "designer") && (
          <li>
            <button type="button" onClick={() => go(`/sites/${site.id}/settings/setup`)}>
              <ListChecks aria-hidden="true" /> Finish setting up
              {p.left > 0 && <span className="st-help__count">{p.left} left</span>}
            </button>
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              replayTour();
            }}
          >
            <MapIcon aria-hidden="true" /> Take the tour again
          </button>
        </li>
        <li>
          <button type="button" onClick={() => go(`/sites/${site.id}/settings/ai`)}>
            <Bot aria-hidden="true" /> Ask Claude to help with your site
          </button>
        </li>
        <li>
          <a href={DOCS} target="_blank" rel="noreferrer">
            <BookOpen aria-hidden="true" /> Read the short guide <ArrowUpRight aria-hidden="true" />
          </a>
        </li>
      </ul>
    </Popover>
  );
}
