import { Check, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useSite } from "../../api";
import type { TemplateLook, TemplateSummary } from "../../api/types";
import { useConfig } from "../../app/config";
import { Wordmark } from "../../app/Wordmark";
import { Button, cx, Spinner } from "../../ui";
import { SiteSketch } from "../templates/SiteSketch";
import "./BuildingProgress.css";
import type { SiteDraft } from "./draft";

export function displayUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export interface BuildingProgressProps {
  siteId: string;
  template: TemplateSummary;
  look: TemplateLook;
  draft: SiteDraft;
  onDone: () => void;
  onRetry: () => void;
  retrying?: boolean;
}

/**
 * "Building your site…" — the one orchestrated moment in onboarding.
 * Steps advance on a gentle clock, the page sketch assembles alongside, and
 * the last step waits for the Hub to report the site live.
 */
export function BuildingProgress({ siteId, template, look, draft, onDone, onRetry, retrying }: BuildingProgressProps) {
  const { timing } = useConfig();
  const navigate = useNavigate();
  const site = useSite(siteId, { pollMs: timing.pollMs });
  const status = site.data?.status;
  const [step, setStep] = useState(0);

  const steps = [
    `Copying the ${template.name} template`,
    `Adding ${draft.name}${draft.tagline ? " and your tagline" : ""}`,
    "Setting up your web address",
    "Publishing the first version",
  ];
  const finished = step >= steps.length;

  useEffect(() => {
    if (status === "failed") return;
    if (step < steps.length - 1) {
      const t = setTimeout(() => setStep((s) => s + 1), timing.stepMs);
      return () => clearTimeout(t);
    }
    if (step === steps.length - 1 && status === "live") {
      const t = setTimeout(() => setStep(steps.length), Math.round(timing.stepMs / 2));
      return () => clearTimeout(t);
    }
    if (finished) {
      const t = setTimeout(() => {
        onDone();
        navigate(`/sites/${siteId}?welcome=1`, { replace: true });
      }, timing.settleMs);
      return () => clearTimeout(t);
    }
  }, [step, status, finished, steps.length, timing, navigate, siteId, onDone]);

  const failed = status === "failed" || site.isError;
  const url = site.data?.url;

  return (
    <div className="st-building">
      <div className="st-building__copy">
        <Wordmark to="/sites" />
        {failed ? (
          <>
            <h1 className="st-building__title">{draft.name} isn’t online yet</h1>
            <p className="st-building__lede">
              Publishing the first version didn’t finish. Your details are saved, so trying again takes a minute.
            </p>
            <div className="st-building__actions">
              <Button variant="primary" onClick={onRetry} loading={retrying}>
                Try again
              </Button>
              <Button variant="ghost" onClick={() => navigate("/sites")}>
                Go to your sites
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="st-building__title" aria-live="polite">
              {finished ? "Your site is live" : "Building your site…"}
            </h1>
            <p className="st-building__lede">
              {finished
                ? "Opening the editor…"
                : "This usually takes about a minute. Keep this tab open and we’ll open the editor when it’s ready."}
            </p>
          </>
        )}
        <ol className="st-building__steps" aria-label="Progress">
          {steps.map((label, i) => {
            const state = failed && i >= step ? (i === step ? "failed" : "todo") : i < step ? "done" : i === step ? "active" : "todo";
            return (
              <li key={label} className={cx("st-building__step", `st-building__step--${state}`)} aria-current={state === "active" ? "step" : undefined}>
                <span className="st-building__marker" aria-hidden="true">
                  {state === "done" ? <Check /> : state === "active" ? <Spinner size={12} /> : null}
                </span>
                <span>{label}</span>
                <span className="st-visually-hidden">
                  {state === "done" ? " (done)" : state === "active" ? " (in progress)" : state === "failed" ? " (didn’t finish)" : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="st-building__stage" aria-hidden="true">
        <div className={cx("st-building__browser", finished && "st-building__browser--live")}>
          <div className="st-building__bar">
            <span className="st-building__dots">
              <i />
              <i />
              <i />
            </span>
            <span className={cx("st-building__address", step >= 2 && url && "st-building__address--shown")}>
              <Lock />
              <span>{url ? displayUrl(url) : ""}</span>
            </span>
            {finished && <span className="st-building__live">Live</span>}
          </div>
          <SiteSketch
            styles={look.styles}
            name={draft.name}
            tagline={draft.tagline}
            logo={draft.logo}
            accent={draft.brandColor}
            reveal={failed ? step : Math.min(step + 1, 4)}
          />
        </div>
      </div>
    </div>
  );
}
