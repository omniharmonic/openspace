/**
 * Site access for the remote MCP that can't get out of sequence.
 *
 * An AI app only reaches the sites the person shared with it (or all of them, when they chose
 * "All my sites, including ones I make later"). When it asks for a site it can't reach, the
 * answer is never a bare "not found": it names the site and gives the person a one-click Studio
 * link — "Allow Claude to edit <site>" — that only they, signed in, can confirm. The app can never
 * grant itself access.
 *
 * While a new site is still being set up (the repository and the draft are being made), site
 * tools answer "still setting up, try again in N seconds" instead of failing.
 */
import { ToolError } from "@omniharmonic/openspace-mcp-tools";
import { latestPublish } from "../db/publishes";
import { listSitesForUser, type SiteWithRole } from "../db/sites";
import type { Services } from "../services";
import { AGENT_ROLES, type ConnectionRow, type GrantSite } from "./db";

/** Studio page where the signed-in person lets this connection edit one site. */
export function allowUrl(studioOrigin: string, connectionId: string, siteId: string): string {
  const q = new URLSearchParams({ app: connectionId, site: siteId });
  return `${studioOrigin}/connect/allow?${q}`;
}

/** The person's sites this connection can't reach (that an AI could be allowed to edit). */
export async function unsharedSites(
  services: Services,
  userId: string,
  reachable: readonly GrantSite[],
): Promise<SiteWithRole[]> {
  const ids = new Set(reachable.map((s) => s.id));
  return (await listSitesForUser(services.db, userId)).filter(
    (s) => !ids.has(s.id) && AGENT_ROLES.includes(s.role),
  );
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Why `ref` (a site id or name; undefined = no site was given) isn't reachable, as an error the
 * person can act on — or null for the generic answer.
 */
export async function explainUnreachable(
  services: Services,
  connection: Pick<ConnectionRow, "id" | "kind" | "user_id" | "client_name">,
  reachable: readonly GrantSite[],
  ref: string | undefined,
  appName: string,
): Promise<ToolError | null> {
  const studio = services.config.studioOrigin;
  const all = await listSitesForUser(services.db, connection.user_id);
  const reachableIds = new Set(reachable.map((s) => s.id));
  const target = ref
    ? all.filter((s) => s.id === ref || norm(s.name) === norm(ref) || s.repo === ref)
    : all.filter((s) => !reachableIds.has(s.id));
  const site = target.length === 1 ? target[0] : undefined;
  if (ref && !site) return null;
  if (!site) {
    if (!all.length)
      return new ToolError(
        "The person doesn't have a site yet. Ask them what it's for and who it's for, then make it with start_site.",
        "no_sites",
      );
    if (!target.length) return null;
    const names = target
      .slice(0, 6)
      .map((s) => `"${s.name}"`)
      .join(", ");
    return new ToolError(
      `${appName} hasn't been allowed to edit any of your sites yet. You have ${target.length === 1 ? "one site" : `${target.length} sites`} (${names}). Ask the person which one to work on and give them its "Allow" link (call site_status with that site's name), or tell them they can allow all their sites in Studio → Connect your AI (${studio}/connect).`,
      "not_shared",
    );
  }
  if (!AGENT_ROLES.includes(site.role))
    return new ToolError(
      `The person is a contributor on "${site.name}", and AI apps can only edit sites where they're an editor, designer or owner. Its owner can change their role in Studio.`,
      "forbidden",
    );
  if (connection.kind !== "oauth")
    return new ToolError(
      `This link only reaches the sites it was made for. To work on "${site.name}", the person can make a link for it in Studio (the site's Settings → Connect your AI), or connect the OpenSpace connector in their Claude app.`,
      "not_shared",
    );
  const url = allowUrl(studio, connection.id, site.id);
  return new ToolError(
    `${appName} isn't allowed to edit "${site.name}" yet. Ask the person to open ${url} and choose "Allow" (they're signed in to OpenSpace, it takes one click). Then try again — nothing else to set up.`,
    "not_shared",
  );
}

/** Retry hints while a site is set up (seconds). */
export const SETUP_RETRY_S = 15;

/**
 * A plain answer for a site that is still being set up or waits for the person, or null when the
 * site is set up (the original error then stands).
 */
export async function setupError(
  services: Services,
  site: Pick<SiteWithRole, "id" | "name" | "status" | "github_access"> | null,
): Promise<ToolError | null> {
  if (!site) return null;
  const studio = services.config.studioOrigin;
  if (site.github_access)
    return new ToolError(
      `"${site.name}" is waiting for one step from the person: open ${studio}/sites/${site.id} and choose "Connect GitHub" (about a minute, nothing to install). Then try again.`,
      "needs_github",
    );
  if (site.status === "live") return null;
  // The first version is recorded when setup finishes; before that there is no draft yet.
  if (await latestPublish(services.db, site.id)) return null;
  if (site.status === "building")
    return new ToolError(
      `"${site.name}" is still being set up — this usually takes under a minute. Try again in about ${SETUP_RETRY_S} seconds (site_status shows how it's going).`,
      "still_setting_up",
    );
  return new ToolError(
    `"${site.name}" didn't finish setting up. The person can choose "Try again" at ${studio}/sites/${site.id}, then you can carry on.`,
    "setup_failed",
  );
}
