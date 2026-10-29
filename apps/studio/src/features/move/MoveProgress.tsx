import {
  AlertTriangle,
  Check,
  ClipboardList,
  ExternalLink,
  GitPullRequest,
  PartyPopper,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { type ImportView, useImport, useRetryImport, useSite } from "../../api";
import { LoadError } from "../../app/Connection";
import { useConfig } from "../../app/config";
import { Wordmark } from "../../app/Wordmark";
import { Button, cx, Spinner } from "../../ui";
import { displayUrl } from "../onboarding/BuildingProgress";
import { CLOSE_ENOUGH, FinishWithClaude, ROUGH_BELOW, wantsClaude } from "./FinishWithClaude";
import "./Move.css";

/** IMPORT-REPORT.md's "Needs attention", as a friendly checklist of things to look at. */
export function AttentionPanel({ groups }: { groups: ImportView["attention"] }) {
  if (!groups.length)
    return (
      <section className="st-attention" aria-labelledby="attention-title">
        <h2 id="attention-title" className="st-attention__title">
          <Check aria-hidden="true" /> Nothing needs your attention
        </h2>
        <p className="st-attention__lede">Every page, picture and link came across.</p>
      </section>
    );
  return (
    <section className="st-attention" aria-labelledby="attention-title">
      <h2 id="attention-title" className="st-attention__title">
        <AlertTriangle aria-hidden="true" /> What needs your attention
      </h2>
      <p className="st-attention__lede">
        A few things couldn’t come across exactly. Look at them when you have a moment — your site
        is already live.
      </p>
      {groups.map((g) => (
        <details key={g.title} className="st-attention__group">
          <summary>
            {g.title} <span className="st-attention__count">{g.items.length}</span>
          </summary>
          <ul>
            {g.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

/** Plain words for a 0–100 match (calibrated: 0 is "nothing like it", 90+ near-identical). */
export function matchWords(score: number): string {
  return score >= 95
    ? "Practically identical"
    : score >= 90
      ? "Very close"
      : score >= 70
        ? "Close, with differences you’ll notice"
        : score >= ROUGH_BELOW
          ? "The basics came across; the design only partly did"
          : "Rough: your words and pictures came across, but most of the design didn’t";
}

/**
 * How closely the new site matches the old one: the move measured both in a browser, tuned the
 * new one, and saved side-by-side pictures (old left, new right) of each page.
 */
export function FidelityPanel({ fidelity }: { fidelity: ImportView["fidelity"] }) {
  if (!fidelity) return null;
  const improved = fidelity.before !== undefined && fidelity.score > fidelity.before;
  return (
    <section className="st-attention st-fidelity" aria-labelledby="fidelity-title">
      <h2 id="fidelity-title" className="st-attention__title">
        {fidelity.score >= CLOSE_ENOUGH ? (
          <Check aria-hidden="true" />
        ) : (
          <AlertTriangle aria-hidden="true" />
        )}{" "}
        How close it looks: {fidelity.score}/100
      </h2>
      <p className="st-attention__lede">
        {matchWords(fidelity.score)}.{" "}
        {improved
          ? `We compared both sites page by page and fine-tuned the new one (it started at ${fidelity.before}/100).`
          : "We compared both sites page by page, on a computer and a phone."}{" "}
        Your old site is on the left, the new one on the right.
        {fidelity.withComponents !== undefined
          ? " A few sections were rebuilt as custom designs so they look as they did — you can still change every word and picture."
          : ""}
      </p>
      {fidelity.rescaledFrom !== undefined ? (
        <p className="st-attention__lede">
          This move was measured with an older, more generous method (it said{" "}
          {fidelity.rescaledFrom}/100). It’s shown here on today’s honest scale.
        </p>
      ) : null}
      {fidelity.strict !== undefined && fidelity.strict !== fidelity.score ? (
        <details className="st-fidelity__strict">
          <summary>
            Scored two ways, to be open about it: {fidelity.score}/100 with corrected measuring,{" "}
            {fidelity.strict}/100 by the stricter earlier method.
          </summary>
          <p>
            The earlier method misreads a few things — slideshow pictures waiting off screen counted
            as columns, a menu in a coloured header missed, a phone photo shown apart from its words
            counted as missing. Where that changed a page’s score:
          </p>
          <ul>
            {[...new Set(fidelity.pages.flatMap((p) => p.corrections ?? []))]
              .slice(0, 6)
              .map((c) => (
                <li key={c}>{c}</li>
              ))}
          </ul>
        </details>
      ) : null}
      <ul className="st-fidelity__pages">
        {fidelity.pages.map((p) => (
          <li
            key={`${p.path}-${p.device}`}
            className={cx("st-fidelity__page", p.device === "desktop" && "is-desktop")}
          >
            {p.image ? (
              <a href={p.image} target="_blank" rel="noreferrer">
                <img
                  src={p.image}
                  alt={`${p.path} on a ${p.device}: old site left, new site right`}
                  loading="lazy"
                />
              </a>
            ) : null}
            <span className="st-fidelity__label">
              <strong>
                {p.path === "/" ? "Home" : p.path} · {p.device === "phone" ? "phone" : "computer"}
              </strong>{" "}
              {p.before !== undefined && p.before !== p.score
                ? `${p.before} → ${p.score}`
                : p.score}
              /100
              {p.strict !== undefined && p.strict !== p.score ? ` (strict ${p.strict})` : ""}
            </span>
            {p.differs?.length ? (
              <span className="st-fidelity__differs">Still differs: {p.differs.join(", ")}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {fidelity.pages.some((p) => p.score < 75) ? (
        <p className="st-attention__lede">
          A lower score means that page looks different on that screen — nothing is lost: every word
          and picture came across. Claude can compare it with your old site and fix what differs, or
          you can adjust it yourself in the editor.
        </p>
      ) : null}
    </section>
  );
}

/**
 * An honest time estimate (wave 4: "usually takes a few minutes" for 12 minutes): how long a
 * move takes, and how long this one has been going.
 */
export function timeNote(createdAt: string, now: number): string {
  const started = Date.parse(createdAt);
  const minutes = Number.isFinite(started) ? Math.floor((now - started) / 60_000) : 0;
  if (minutes < 2)
    return "Moving a site usually takes 5 to 15 minutes, depending on how many pages it has.";
  const ago = `Started ${minutes} minute${minutes === 1 ? "" : "s"} ago.`;
  return minutes < 15
    ? `${ago} Bigger sites can take up to 15 minutes — each step shows how far it is.`
    : `${ago} This one is taking longer than most (big sites with many pictures do), but it’s still going.`;
}

/** What to set up after launch (shop, email, domain…), from the move. */
export function FinishSetup({ items }: { items: ImportView["checklist"] }) {
  if (!items.length) return null;
  return (
    <section className="st-attention" aria-labelledby="finish-title">
      <h2 id="finish-title" className="st-attention__title">
        <ClipboardList aria-hidden="true" /> Finish setting up, when you’re ready
      </h2>
      <ul className="st-finish">
        {items.map((i) => (
          <li key={i.id}>
            <strong>{i.title}</strong>
            <span>{i.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Steps({ view }: { view: ImportView }) {
  return (
    <ol className="st-building__steps st-move__steps" aria-label="Progress">
      {view.steps.map((s) => (
        <li key={s.id} className={cx("st-building__step", `st-building__step--${s.state}`)}>
          <span className="st-building__marker" aria-hidden="true">
            {s.state === "done" ? <Check /> : s.state === "active" ? <Spinner size={12} /> : null}
          </span>
          <span>
            {s.label}
            {s.detail ? <span className="st-move__detail"> · {s.detail}</span> : null}
          </span>
          <span className="st-visually-hidden">
            {s.state === "done"
              ? " (done)"
              : s.state === "active"
                ? " (in progress)"
                : s.state === "failed"
                  ? " (didn’t finish)"
                  : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The publish step is the slow one (GitHub builds the site and puts it online: 2–4 minutes,
 * longer the first time). Say what's happening as it goes, with an honest estimate, so a few
 * minutes of waiting never looks stuck.
 */
export const PUBLISH_STORY: Array<{ after: number; text: string }> = [
  // The pages are already saved by now ("Saving your pages and pictures…" was the step before).
  {
    after: 0,
    text: "Building your site: turning every page into a fast, ready-to-serve web page…",
  },
  {
    after: 90,
    text: "Putting it online at its free address. The first time takes a little longer…",
  },
  {
    after: 210,
    text: "Nearly there — GitHub is still finishing the first publish. It usually ends within 5 minutes.",
  },
];

export function publishStory(seconds: number): string {
  let text = (PUBLISH_STORY[0] as { text: string }).text;
  for (const s of PUBLISH_STORY) if (seconds >= s.after) text = s.text;
  return text;
}

function PublishingStory() {
  const started = useRef(Date.now());
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setSeconds(Math.floor((Date.now() - started.current) / 1000)),
      5000,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <div className="st-move__story">
      <p className="st-move__lede">{publishStory(seconds)}</p>
      <p className="st-move__note">
        This step usually takes 2 to 4 minutes. You can leave this page — we’ll keep going and your
        site will be waiting in <Link to="/sites">your sites</Link>.
      </p>
    </div>
  );
}

/** "Reading your site… Bringing pages across… 12 pages, 48 images… Ready to review". */
export function MoveProgress() {
  const { importId } = useParams();
  const { timing } = useConfig();
  const imp = useImport(importId, { pollMs: timing.pollMs });
  const retry = useRetryImport();
  const navigate = useNavigate();
  const view = imp.data;
  const site = useSite(view?.state === "ready" ? view.siteId : undefined);
  const siteName = site.data?.name;

  if (imp.isPending)
    return (
      <div className="st-center">
        <Spinner size={18} label="Loading" />
      </div>
    );
  if (!view)
    return (
      <div className="st-center">
        <LoadError
          title="We couldn’t load this move"
          error={imp.error}
          onRetry={() => void imp.refetch()}
        />
      </div>
    );

  const ready = view.state === "ready";
  const failed = view.state === "failed";
  const editor = `/sites/${view.siteId}?welcome=1`;
  // Not near-identical: finishing with Claude is the main next step, the editor the second.
  const claudeFirst = ready && wantsClaude(view);

  return (
    <div className="st-move">
      <header className="st-move__top">
        <Wordmark to="/sites" />
      </header>
      <main className="st-move__main st-move__main--progress">
        <section className="st-move__form" aria-live="polite">
          {ready ? (
            <div className="st-move__celebrate">
              <span className="st-move__party" aria-hidden="true">
                <PartyPopper />
              </span>
              <h1 className="st-move__title">Your site is live!</h1>
              <p className="st-move__lede">
                {view.counts
                  ? `${view.counts.pages} pages${view.counts.items ? `, ${view.counts.items} ${view.counts.items === 1 ? "item" : "items"}` : ""} and ${view.counts.media} images came across. `
                  : ""}
                It’s on free hosting, and it’s yours to edit.
              </p>
              {view.siteUrl && (
                <a className="st-move__url" href={view.siteUrl} target="_blank" rel="noreferrer">
                  {displayUrl(view.siteUrl)} <ExternalLink aria-hidden="true" />
                </a>
              )}
              {claudeFirst ? (
                <>
                  <FinishWithClaude
                    site={{ id: view.siteId, name: siteName ?? "your site" }}
                    source={view.source}
                    fidelity={view.fidelity}
                    prominent
                  />
                  <div className="st-building__actions">
                    <Button variant="secondary" onClick={() => navigate(editor)}>
                      Open the editor
                    </Button>
                  </div>
                </>
              ) : (
                <div className="st-building__actions">
                  <Button variant="primary" size="lg" onClick={() => navigate(editor)}>
                    Open it in Studio
                  </Button>
                </div>
              )}
            </div>
          ) : failed ? (
            <>
              <h1 className="st-move__title">The move didn’t finish</h1>
              <p className="st-move__lede">{view.error ?? view.headline}</p>
              <p className="st-move__note">Your current site is untouched.</p>
              <div className="st-building__actions">
                <Button
                  variant="primary"
                  icon={<RotateCcw />}
                  loading={retry.isPending}
                  onClick={() => retry.mutate(view.id)}
                >
                  Try again
                </Button>
                <Button variant="ghost" onClick={() => navigate("/sites")}>
                  Go to your sites
                </Button>
              </div>
              {retry.error && (
                <p className="st-move__error" role="alert">
                  {retry.error.message}
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="st-move__title">
                {view.state === "review" ? "Almost there" : "Moving your site…"}
              </h1>
              {view.state === "publishing" ? (
                <PublishingStory />
              ) : (
                <p className="st-move__lede">{view.headline}</p>
              )}
              {view.state === "waiting" && view.connectUrl && (
                <div className="st-building__actions">
                  <a className="st-button st-button--primary" href={view.connectUrl}>
                    Connect GitHub
                  </a>
                </div>
              )}
              {view.state === "review" && view.pullRequest && (
                <div className="st-move__approve">
                  <p>
                    We prepared the change on GitHub. Open it, read the short summary and choose{" "}
                    <strong>Merge pull request</strong>. You can undo it later with one click.
                  </p>
                  <div className="st-building__actions">
                    <a
                      className="st-button st-button--primary"
                      href={view.pullRequest.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <GitPullRequest aria-hidden="true" /> Approve on GitHub
                    </a>
                    <Button variant="secondary" onClick={() => void imp.refetch()}>
                      I’ve approved it
                    </Button>
                  </div>
                </div>
              )}
              {view.state !== "review" &&
                view.state !== "waiting" &&
                view.state !== "publishing" && (
                  <p className="st-move__note">
                    {timeNote(view.createdAt, Date.now())} You can leave this page — we’ll keep
                    going and your site will be waiting in <Link to="/sites">your sites</Link>.
                  </p>
                )}
            </>
          )}
          <Steps view={view} />
        </section>
        {ready && (
          <section className="st-move__review" aria-label="Review">
            <AttentionPanel groups={view.attention} />
            <FidelityPanel fidelity={view.fidelity} />
            <FinishSetup items={view.checklist} />
          </section>
        )}
      </main>
    </div>
  );
}
