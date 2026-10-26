/**
 * MCP session lifecycle: a session ends on `DELETE /mcp`, after 30 idle minutes (the minute cron)
 * or when its connection is revoked. Ending it ends the agent session it opened in each site's
 * DraftRoom, which tells Studio (`agent_session_ended` → the Accept / Undo banner).
 */
import type { HubBindings } from "../env";
import type { Logger } from "../lib/log";
import { roomStub, unwrapRoom } from "../room";
import { agentSessionsOf, endMcpSession, idleMcpSessions, liveSessionsOfConnection } from "./db";

/** A session not used for this long is over (the client re-initializes). */
export const MCP_IDLE_MS = 30 * 60 * 1000;

export async function endSession(
  env: HubBindings,
  id: string,
  reason: "ended" | "idle" | "revoked",
  now: number,
  log?: Logger,
): Promise<boolean> {
  const row = await endMcpSession(env.HUB_DB, id, now);
  if (!row) return false;
  for (const [siteId, ref] of Object.entries(agentSessionsOf(row))) {
    try {
      await unwrapRoom(
        roomStub(env, siteId).endAgentSession(siteId, {
          userId: row.user_id,
          sessionId: ref.sessionId,
          reason,
        }),
      );
    } catch (err) {
      // The person may have lost access to the site meanwhile; the session just stays open.
      log?.warn("ending agent session failed", { siteId, sessionId: ref.sessionId, err });
    }
  }
  return true;
}

/** Minute cron: end idle MCP sessions. */
export async function sweepIdleMcpSessions(
  env: HubBindings,
  now: number,
  log?: Logger,
): Promise<number> {
  let ended = 0;
  for (const id of await idleMcpSessions(env.HUB_DB, now - MCP_IDLE_MS))
    if (await endSession(env, id, "idle", now, log)) ended++;
  return ended;
}

export async function endConnectionSessions(
  env: HubBindings,
  connectionId: string,
  now: number,
  log?: Logger,
): Promise<void> {
  for (const id of await liveSessionsOfConnection(env.HUB_DB, connectionId))
    await endSession(env, id, "revoked", now, log);
}
