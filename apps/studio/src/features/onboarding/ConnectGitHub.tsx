import { Check, ExternalLink, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { type Site, useRetryPublish } from "../../api";
import { Wordmark } from "../../app/Wordmark";
import { Button, toast } from "../../ui";
import "./ConnectGitHub.css";

/** What came back from GitHub (`?github=` on the Hub's redirect), in plain words. */
const OUTCOMES: Record<string, { tone: "danger" | "neutral"; text: string }> = {
  cancelled: {
    tone: "neutral",
    text: "It looks like the GitHub step wasn’t finished. No problem — choose Continue to GitHub to try again.",
  },
  not_yours: {
    tone: "danger",
    text: "That GitHub permission belongs to a different account. Sign in to GitHub as yourself and try again.",
  },
  error: {
    tone: "danger",
    text: "We couldn’t check with GitHub just now. Wait a moment, then choose Try again.",
  },
  incomplete: {
    tone: "danger",
    text: "GitHub is connected, but setting up your site didn’t finish. Choose Try again.",
  },
  owner_only: {
    tone: "neutral",
    text: "Only the site’s owner can connect it to GitHub. Ask them to open this page.",
  },
};

export interface ConnectGitHubProps {
  site: Site;
  /** The signed-in person owns the site (only they can give GitHub permission). */
  isOwner: boolean;
}

/**
 * "One more step" — the GitHub App install, explained for someone who has never used GitHub.
 * One button sends them to GitHub (account preselected); GitHub sends them back here and the
 * site's setup continues on its own.
 */
export function ConnectGitHub({ site, isOwner }: ConnectGitHubProps) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const retry = useRetryPublish();
  const access = site.github?.access ?? "install";
  const outcome = OUTCOMES[params.get("github") ?? ""];
  const reconnect = site.status === "live";

  // Drop the one-off `?github=` once shown (a reload shouldn't repeat it).
  useEffect(() => {
    if (!params.get("github") || params.get("github") === "connect") return;
    const t = setTimeout(() => {
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete("github");
          return next;
        },
        { replace: true },
      );
    }, 15_000);
    return () => clearTimeout(t);
  }, [params, setParams]);

  const tryAgain = () =>
    retry.mutate(site.id, {
      onError: (err) =>
        toast({ tone: "danger", title: "Not connected yet", description: err.message }),
    });

  const title =
    access === "requested"
      ? "Waiting for your organization"
      : reconnect
        ? `Reconnect ${site.name} to GitHub`
        : "One more step: let OpenSpace save your site";

  return (
    <div className="st-ghconnect">
      <div className="st-ghconnect__card">
        <Wordmark to="/sites" />
        <h1 className="st-ghconnect__title">{title}</h1>
        {access === "requested" ? (
          <p className="st-ghconnect__lede">
            You asked the owners of your GitHub organization to approve OpenSpace. As soon as they
            do, choose <strong>Try again</strong> and {site.name} will be set up.
          </p>
        ) : reconnect ? (
          <p className="st-ghconnect__lede">
            {site.name} is still online, but OpenSpace can’t save changes to it until you give
            permission on GitHub again. It takes about a minute.
          </p>
        ) : (
          <p className="st-ghconnect__lede">
            Your site lives in your own free GitHub account, so it’s always yours. GitHub asks you
            once to let OpenSpace create and update it. It takes about a minute, and then we’ll set
            up <strong>{site.name}</strong> straight away.
          </p>
        )}

        {access !== "requested" && (
          <div className="st-ghconnect__explain">
            <h2 className="st-ghconnect__subtitle">What you’ll see on GitHub</h2>
            <ul className="st-ghconnect__list">
              <li>
                <Check aria-hidden="true" /> A page titled <strong>Install OpenSpace</strong>. Your
                account is already picked.
              </li>
              <li>
                <Check aria-hidden="true" /> Keep <strong>All repositories</strong> selected (a
                “repository” is the folder GitHub keeps a website in), then choose{" "}
                <strong>Install</strong>.
              </li>
              <li>
                <Check aria-hidden="true" /> GitHub lists what OpenSpace may do — read and save your
                site’s files and publish it. OpenSpace only ever touches sites you make with it, and
                you can remove the permission any time in GitHub’s settings.
              </li>
            </ul>
            {access === "repo_access" && (
              <p className="st-ghconnect__note" role="note">
                Right now OpenSpace may only use some of your repositories, so it can’t create a new
                one. On the next page, choose <strong>All repositories</strong> and{" "}
                <strong>Save</strong>.
              </p>
            )}
          </div>
        )}

        {outcome && (
          <p
            className={`st-ghconnect__outcome st-ghconnect__outcome--${outcome.tone}`}
            role={outcome.tone === "danger" ? "alert" : "status"}
          >
            {outcome.text}
          </p>
        )}

        <div className="st-ghconnect__actions">
          {isOwner && access !== "requested" && site.github?.connectUrl ? (
            <a className="st-button st-button--primary st-button--lg" href={site.github.connectUrl}>
              {reconnect ? "Reconnect GitHub" : "Continue to GitHub"}
              <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {(access === "requested" || outcome) && (
            <Button icon={<RotateCcw />} onClick={tryAgain} loading={retry.isPending}>
              Try again
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate("/sites")}>
            Go to your sites
          </Button>
        </div>
        {!isOwner && (
          <p className="st-ghconnect__note">
            Only {site.owner ?? "the site’s owner"} can give OpenSpace permission on GitHub. Ask
            them to open {site.name} in OpenSpace.
          </p>
        )}
        <p className="st-ghconnect__fine">
          Don’t have a GitHub account yet? You made one when you signed in — it’s free, and it’s
          where your site lives.
        </p>
      </div>
    </div>
  );
}
