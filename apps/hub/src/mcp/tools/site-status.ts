/**
 * `site_status` — where a site is between "made" and "live", in words Claude can pass on:
 *
 * - `setting_up`  the repository and the editable draft are being made (seconds; tools answer
 *                 "still setting up, try again in N seconds" meanwhile)
 * - `publishing`  the editor works and every tool works on the draft; the first version is being
 *                 published (usually about a minute)
 * - `live`        online at its address
 * - `needs_github` / `failed` / `moving` — a step for the person, or a move in progress
 *
 * It waits a little (up to `wait` seconds) while the site is publishing, so Claude doesn't have to
 * call it over and over. Also shared: the grant that lands with a new site (atomically) and the
 * answer every site-creating tool gives.
 */
import { defineTool, ToolError } from "@omniharmonic/openspace-mcp-tools";
import { z } from "zod";
import { latestPublish } from "../../db/publishes";
import { HttpError } from "../../lib/errors";
import type { Services } from "../../services";
import { getSiteView, type SiteView } from "../../services/sites";
import { explainUnreachable, SETUP_RETRY_S } from "../access";
import { grantSiteStatement } from "../db";
import type { HubToolContext } from "../hub-tools";

export type SitePhase = "setting_up" | "publishing" | "live" | "needs_github" | "failed" | "moving";

export interface SiteState {
  site: { id: string; name: string; url: string | null; studioUrl: string };
  phase: SitePhase;
  live: boolean;
  /** The Studio editor (and every editing tool) works now. */
  editorReady: boolean;
  /** Check again after this many seconds (while it isn't live yet). */
  retryAfterSeconds?: number;
  /** A page the person has to open (GitHub step, "Try again"). */
  actionUrl?: string;
  message: string;
}

/** The first publish usually takes about a minute on GitHub Pages. */
const PUBLISH_RETRY_S = 30;

export const editorUrl = (services: Services, siteId: string, welcome = false) =>
  `${services.config.studioOrigin}/sites/${siteId}${welcome ? "?welcome=1" : ""}`;

/** The state of one site the person can see (status refreshed from its publish run). */
export async function siteState(services: Services, view: SiteView): Promise<SiteState> {
  const studioUrl = editorUrl(services, view.id);
  const site = { id: view.id, name: view.name, url: view.url, studioUrl };
  const where = view.url ? ` at ${view.url}` : "";
  if (view.github.access !== "ok")
    return {
      site,
      phase: "needs_github",
      live: false,
      editorReady: false,
      actionUrl: studioUrl,
      message: `One step for the person: open ${studioUrl} and choose "Connect GitHub" (about a minute, nothing to install). OpenSpace needs it to create the site's home on GitHub. When they're back, call site_status again.`,
    };
  if (view.import && !["ready", "failed"].includes(view.import.state) && view.status !== "live")
    return {
      site,
      phase: "moving",
      live: false,
      editorReady: false,
      retryAfterSeconds: 60,
      message: `"${view.name}" is being moved in (usually 5 to 15 minutes). Call import_status for the details.`,
    };
  if (view.status === "live")
    return {
      site,
      phase: "live",
      live: true,
      editorReady: true,
      message: `"${view.name}" is live${where}. Edit it in OpenSpace: ${studioUrl}`,
    };
  const setUp = Boolean(await latestPublish(services.db, view.id));
  if (view.status === "failed")
    return {
      site,
      phase: "failed",
      live: false,
      editorReady: setUp,
      actionUrl: studioUrl,
      message: `"${view.name}" didn't finish ${setUp ? "publishing" : "setting up"}: ${view.statusDetail ?? "something went wrong on GitHub"}. The person can choose "Try again" at ${studioUrl}${setUp ? " — your edits are safe in the draft, keep going meanwhile" : ""}.`,
    };
  if (!setUp)
    return {
      site,
      phase: "setting_up",
      live: false,
      editorReady: false,
      retryAfterSeconds: SETUP_RETRY_S,
      message: `"${view.name}" is still being set up (its home on GitHub and the editable draft) — usually under a minute. Check again in about ${SETUP_RETRY_S} seconds.`,
    };
  return {
    site,
    phase: "publishing",
    live: false,
    editorReady: true,
    retryAfterSeconds: PUBLISH_RETRY_S,
    message: `"${view.name}" is being published for the first time — usually about a minute, sometimes up to three. It will be live${where}. Meanwhile everything works: the editor (${studioUrl}) and every editing tool work on the draft. Check site_status again in about ${PUBLISH_RETRY_S} seconds.`,
  };
}

/** `alsoInsert` for a site an AI app creates: its grant lands with the site row, atomically. */
export function grantOnCreate(hub: HubToolContext) {
  return (siteId: string) => [
    grantSiteStatement(
      hub.services.db,
      hub.connection,
      { id: siteId, role: "owner" },
      hub.services.now(),
    ),
  ];
}

/**
 * What every site-creating tool answers: the editor link (works right away), the live address and
 * where publishing is, plus how to finish in the conversation.
 */
export async function newSiteAnswer(
  services: Services,
  view: SiteView,
  lead: string,
): Promise<{ text: string; state: SiteState; studioUrl: string }> {
  const state = await siteState(services, view);
  const studioUrl = editorUrl(services, view.id, true);
  const lines = [lead];
  if (state.phase === "needs_github" || state.phase === "failed") lines.push(state.message);
  else {
    lines.push(`Edit it in OpenSpace (works now): ${studioUrl}`);
    if (state.phase === "live") lines.push(`It's live at ${view.url}.`);
    else
      lines.push(
        `Live address: ${view.url} — the first version is being published now, usually about a minute. Tell the person it's on its way (the address shows "not found" until then), keep working — edits go to the draft — and call site_status to know when it's live.`,
      );
  }
  return { text: lines.join("\n"), state, studioUrl };
}

export function siteStatusTools(hub: HubToolContext) {
  const { services, user, connection, sites, log } = hub;

  const siteStatus = defineTool({
    name: "site_status",
    title: "Is my site live yet?",
    description:
      "Where a site is between created and live: setting_up (seconds), publishing (the first version — usually about a minute; the editor and every editing tool already work on the draft), live, or a step the person has to take (with a link). It waits up to `wait` seconds for a site that is publishing. Use it after start_site/create_site before telling the person their site is online, and use it with a site's name to get the 'Allow' link for a site you can't edit yet.",
    input: z.object({
      site: z.string().optional().describe("Site id (st_…) or name."),
      wait: z
        .number()
        .int()
        .min(0)
        .max(25)
        .optional()
        .describe("Seconds to wait for a publishing site to go live (default 10)."),
    }),
    annotations: { readOnlyHint: true },
    async handler(ctx, input) {
      const ref = input.site?.trim();
      const reachable = ref
        ? sites.filter((s) => s.id === ref || s.name.trim().toLowerCase() === ref.toLowerCase())
        : sites.length === 1
          ? sites
          : [];
      const target = reachable.length === 1 ? reachable[0] : undefined;
      if (!target) {
        if (!ref && sites.length > 1)
          throw new ToolError(
            `Several sites are available; pass "site" (one of: ${sites.map((s) => `${s.id} "${s.name}"`).join(", ")}).`,
            "invalid_arguments",
          );
        const why = await explainUnreachable(services, connection, sites, ref, ctx.label);
        throw why ?? new ToolError(`There's no site "${ref ?? ""}" on this account.`, "not_found");
      }
      const deadline = Date.now() + (input.wait ?? 10) * 1000;
      let state: SiteState;
      for (;;) {
        let view: SiteView;
        try {
          view = await getSiteView(services, target.id, user, log);
        } catch (err) {
          if (err instanceof HttpError) throw new ToolError(err.message, err.code);
          throw err;
        }
        state = await siteState(services, view);
        if (state.phase !== "publishing" || Date.now() + 5000 > deadline) break;
        await new Promise((r) => setTimeout(r, 5000));
      }
      return { text: state.message, data: state };
    },
  });

  return [siteStatus];
}
