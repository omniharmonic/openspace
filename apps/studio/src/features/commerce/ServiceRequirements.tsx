import { Server } from "lucide-react";
import { useNavigate } from "react-router";
import { useCapabilities, useEmailUnavailable } from "../../api";
import type { Site } from "../../api/types";

export type ServiceFeature = "store" | "donations" | "members";

const NAMES: Record<ServiceFeature, string> = {
  store: "Your shop",
  donations: "Donations",
  members: "Member sign-in and members-only pages",
};

/** The site is published to GitHub Pages (the default), where Hub-run features can't run. */
export function onGitHubPages(site: Pick<Site, "deployTarget">): boolean {
  return site.deployTarget !== "cloudflare";
}

/**
 * What a store / donations / member area needs before it works for visitors, said up front:
 * Cloudflare hosting (not GitHub Pages), payments on this Hub, and email for sign-in links.
 */
export function ServiceRequirements({ site, feature }: { site: Site; feature: ServiceFeature }) {
  const navigate = useNavigate();
  const caps = useCapabilities();
  const noEmail = useEmailUnavailable();
  const needs: string[] = [];
  const pages = onGitHubPages(site);
  if (pages)
    needs.push(
      "Cloudflare hosting. Your site is on GitHub Pages, which only serves plain pages — switch in Settings → Hosting.",
    );
  if (feature !== "members" && !caps.payments.configured)
    needs.push(
      "Stripe payments. This OpenSpace Hub can't take payments yet; connect your own Stripe keys in Store settings.",
    );
  if (feature === "members" && noEmail)
    needs.push(
      "Email sending. Members sign in with a link sent by email, and this OpenSpace Hub has no email provider yet.",
    );
  if (needs.length === 0) return null;
  return (
    <div className="st-callout st-callout--pending" role="note" aria-label="What this needs">
      <Server aria-hidden="true" />
      <div>
        <strong>{NAMES[feature]} won’t work on your live site yet.</strong> It needs:
        <ul className="st-callout__list">
          {needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        {pages && (
          <button
            type="button"
            className="st-linklike"
            onClick={() => navigate(`/sites/${site.id}/settings/hosting`)}
          >
            Open hosting settings
          </button>
        )}
      </div>
    </div>
  );
}
