import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useSetupInfo } from "../../api";
import type { Site } from "../../api/types";
import { Button, Dialog, toast } from "../../ui";
import { displayUrl } from "../onboarding/BuildingProgress";
import { formatDollars, yearlySaving } from "./savings";
import "./setup.css";

const KEY = (siteId: string) => `openspace.tour.${siteId}`;

/** Has this browser shown the tour for the site (or can't remember)? */
export function tourSeen(siteId: string): boolean {
  return seen(siteId);
}

function seen(siteId: string): boolean {
  try {
    return localStorage.getItem(KEY(siteId)) === "1";
  } catch {
    return true;
  }
}
function markSeen(siteId: string) {
  try {
    localStorage.setItem(KEY(siteId), "1");
  } catch {
    // ignore
  }
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast({ tone: "success", title: "Link copied", description: displayUrl(url) });
  } catch {
    toast({ tone: "danger", title: "Couldn’t copy the link", description: url });
  }
}

/** Ask the tour to open again (the "Need a hand?" menu). */
export function replayTour() {
  window.dispatchEvent(new Event("openspace:tour"));
}

interface Stop {
  title: string;
  body: string;
}

const STOPS: Stop[] = [
  {
    title: "This is your site",
    body: "Click any words or photo on the page to change them. Everything saves as you go — there's no Save button to forget.",
  },
  {
    title: "Publish when you're ready",
    body: "Your changes stay private until you press Publish. About a minute later they're on your live site, and you can always go back to an earlier version.",
  },
  {
    title: "Finish setting up, whenever you like",
    body: "Your own domain, a shop, donations, member pages — each is a short guided step in Finish setting up, at the top of the editor. None of it is urgent.",
  },
];

/**
 * A four-stop welcome the first time someone opens a new (or newly moved) site: how editing,
 * publishing and Finish setting up work, ending on what matters — the site is live, it's theirs,
 * and what leaving their old platform saves them.
 */
export function FirstRunTour({ site }: { site: Site }) {
  const [params] = useSearchParams();
  const setup = useSetupInfo(site.id, site.status === "live");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (site.status !== "live" || seen(site.id)) return;
    // Right after the site is made (or moved in): Studio lands here with ?welcome=1.
    if (params.get("welcome") === "1" || params.get("tour") === "1") {
      setStep(0);
      setOpen(true);
    }
  }, [site.id, site.status, params]);

  useEffect(() => {
    const again = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("openspace:tour", again);
    return () => window.removeEventListener("openspace:tour", again);
  }, []);

  const close = () => {
    markSeen(site.id);
    setOpen(false);
  };
  const last = step === STOPS.length;
  const from = setup.data?.imported?.from ?? null;
  const saving = yearlySaving(
    from,
    (setup.data?.imported?.items ?? []).some((i) => i.kind === "store"),
  );
  const stop = STOPS[step];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={last ? "Your site is live — and it's yours." : (stop?.title ?? "")}
      width={460}
      className={last ? "st-tour st-tour--last" : "st-tour"}
      footer={
        <>
          <span className="st-tour__dots">
            <span className="st-visually-hidden">
              Step {step + 1} of {STOPS.length + 1}
            </span>
            {[...STOPS, null].map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions
              <span key={i} aria-hidden="true" className={i === step ? "is-on" : undefined} />
            ))}
          </span>
          {last ? (
            <>
              <Button variant="ghost" onClick={() => void copyLink(site.url)}>
                Copy link
              </Button>
              <Button variant="primary" onClick={close}>
                Start editing
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Skip
              </Button>
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            </>
          )}
        </>
      }
    >
      {last ? (
        <div className="st-tour__end">
          {saving !== null ? (
            <p className="st-tour__save">
              You'll save about <strong>{formatDollars(saving)}</strong> a year
              {from ? ` compared with ${from}` : ""}.
            </p>
          ) : (
            <p className="st-tour__save">No monthly fee. No lock-in.</p>
          )}
          <p>
            It's online at{" "}
            <a href={site.url} target="_blank" rel="noreferrer">
              {displayUrl(site.url)}
            </a>
            , and every file of it lives in your own GitHub account — you can take it anywhere, any
            time.
          </p>
        </div>
      ) : (
        <p className="st-tour__body">{stop?.body}</p>
      )}
    </Dialog>
  );
}
