import { ArrowUpRight, CircleAlert, Cloud } from "lucide-react";
import { useState } from "react";
import { useHosting, useHostingActions } from "../../api";
import type { Site } from "../../api/types";
import { Badge, Button, Dialog, Spinner, toast } from "../../ui";
import { displayUrl } from "../onboarding/BuildingProgress";
import { CloudflareConnect } from "../setup/CloudflareConnect";
import "../setup/setup.css";

/**
 * Hosting: free GitHub Pages (every site starts here) ↔ the owner's own free Cloudflare account
 * (shops, donations, member sign-in, password pages). The move itself is the guided
 * CloudflareConnect from Finish setting up: one key pasted, checked, sealed in the browser, and
 * the current site stays live until the new one is confirmed.
 */
export function HostingSettings({ site }: { site: Site }) {
  const hosting = useHosting(site.id, true, { pollWhileMoving: 3000 });
  const actions = useHostingActions(site.id);
  const [confirmBack, setConfirmBack] = useState(false);

  if (hosting.isPending) return <Spinner size={16} label="Loading hosting" />;
  if (hosting.isError || !hosting.data)
    return (
      <p className="st-media-warn">
        {hosting.error?.message ??
          "We couldn't check your hosting just now. Try again in a minute."}
      </p>
    );
  const info = hosting.data;
  const onCloudflare = info.target === "cloudflare";
  const sw = info.switching;

  return (
    <div className="st-settings__stack">
      <section className="st-card" aria-labelledby="host-now">
        <div className="st-card__head">
          <div>
            <h3 id="host-now" className="st-card__title">
              {onCloudflare ? "Your own Cloudflare account" : "GitHub Pages (free)"}
            </h3>
            <p className="st-card__desc">
              {onCloudflare
                ? "Your site runs on your own Cloudflare account, on its free plan. Shops, donations, member sign-in and password pages all work here."
                : "Free, fast hosting from GitHub, where your site's files are kept. Perfect for most sites — and it costs nothing, ever."}
            </p>
          </div>
          <Badge tone="live" dot>
            In use
          </Badge>
        </div>
        <a className="st-home__link" href={site.url} target="_blank" rel="noreferrer">
          {displayUrl(site.url)} <ArrowUpRight aria-hidden="true" />
        </a>
      </section>

      {sw?.status === "rolled_back" && !onCloudflare && (
        <div className="st-setup-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>{sw.error}</div>
        </div>
      )}

      {!onCloudflare && (
        <section className="st-card" aria-labelledby="host-up">
          <div className="st-card__head">
            <div>
              <h3 id="host-up" className="st-card__title">
                <Cloud aria-hidden="true" className="st-inline-icon" /> Shops, donations and member
                areas
              </h3>
              <p className="st-card__desc">
                These run on a free Cloudflare account of your own (about 100,000 visits a day for
                free). Your site looks exactly the same; until then, those parts show a friendly
                “opening soon” note.
              </p>
            </div>
          </div>
          <CloudflareConnect site={site} />
        </section>
      )}

      {onCloudflare && (
        <section className="st-card" aria-labelledby="host-next">
          {sw && sw.status !== "done" && sw.status !== "rolled_back" ? (
            <CloudflareConnect site={site} />
          ) : (
            <>
              <h3 id="host-next" className="st-card__title">
                Your domain
              </h3>
              <p className="st-card__desc">
                {site.domain
                  ? `To finish, point ${site.domain} at Cloudflare — the Domain tab shows you how. Visitors keep seeing your site the whole time.`
                  : "When you connect a domain, the Domain tab walks you through it."}
              </p>
            </>
          )}
          <div className="st-row-actions st-row-actions--start">
            <Button variant="ghost" size="sm" onClick={() => setConfirmBack(true)}>
              Switch back to GitHub Pages
            </Button>
          </div>
        </section>
      )}

      <Dialog
        open={confirmBack}
        onOpenChange={setConfirmBack}
        title="Switch back to GitHub Pages?"
        description="Your shop, donations, member sign-in and password pages go back to showing “opening soon”. Everything else stays the same."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmBack(false)}>
              Stay on Cloudflare
            </Button>
            <Button
              variant="danger"
              loading={actions.switchTo.isPending}
              onClick={() =>
                actions.switchTo.mutate("github-pages", {
                  onSuccess: () => {
                    setConfirmBack(false);
                    toast({ title: "Switching back to GitHub Pages" });
                  },
                  onError: (err) =>
                    toast({ tone: "danger", title: "Couldn’t switch", description: err.message }),
                })
              }
            >
              Switch back
            </Button>
          </>
        }
      />
    </div>
  );
}
