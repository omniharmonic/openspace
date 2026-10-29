import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { studioOrigins } from "../lib/cors";
import { errorBody, HttpError } from "../lib/errors";
import { readJson } from "../lib/validate";
import { roomStub, unwrapRoom } from "../room";
import { siteForUser } from "../services/sites";
import type { AppEnv } from "../types";

/**
 * DraftRoom endpoints (arch §5.3):
 *
 * - `GET  /api/sites/:id/room?since=<seq>`  WebSocket upgrade (Studio).
 * - `GET  /api/sites/:id/room/document`     current draft document + seq (MCP read).
 * - `POST /api/sites/:id/room/ops`          submit ops over HTTP (MCP / Studio fallback).
 * - `GET  /api/sites/:id/room/live`         the draft against the live site.
 * - `POST /api/sites/:id/room/flush`        commit pending ops to the draft now.
 * - `POST /api/sites/:id/room/agent-sessions`              start an agent session (snapshot).
 * - `POST /api/sites/:id/room/agent-sessions/:sid/end`
 * - `POST /api/sites/:id/room/agent-sessions/:sid/undo`    "Undo all of Claude's changes"
 *   (`:sid` = `latest` for the most recent session).
 */
export const roomRoutes = new Hono<AppEnv>();

const SubmitSchema = z.strictObject({
  ops: z.array(z.unknown()).min(1).max(200),
  baseSeq: z.int().min(0).optional(),
  /** Submit as an agent session started with `agent-sessions` (MCP). */
  session: z.string().min(1).max(64).optional(),
  label: z.string().min(1).max(40).optional(),
});

const AgentSessionSchema = z.strictObject({
  label: z.string().trim().min(1).max(40).optional(),
  sessionId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{4,64}$/)
    .optional(),
});

roomRoutes.get("/:id/room", async (c) => {
  const user = requireUser(c);
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket")
    return c.json(errorBody("upgrade_required", "Connect with a WebSocket."), 426);
  const origin = c.req.header("origin");
  if (origin && !studioOrigins(c.var.config).includes(origin))
    return c.json(errorBody("forbidden_origin", "Requests from this origin are not allowed."), 403);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  const url = new URL(c.req.url);
  const forward = new URL(`https://room/connect${url.search}`);
  const headers = new Headers({
    Upgrade: "websocket",
    "x-os-site": site.id,
    "x-os-user": user.id,
  });
  return roomStub(c.env, site.id).fetch(new Request(forward, { headers }));
});

roomRoutes.get("/:id/room/document", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  const { doc, seq, head } = await unwrapRoom(roomStub(c.env, site.id).getDocument(site.id));
  return c.json({ document: doc, seq, head });
});

roomRoutes.post("/:id/room/ops", async (c) => {
  const user = requireUser(c);
  const input = await readJson(c, SubmitSchema);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  const result = await unwrapRoom(
    roomStub(c.env, site.id).submit(site.id, {
      ops: input.ops,
      ...(input.baseSeq !== undefined ? { baseSeq: input.baseSeq } : {}),
      actor: input.session
        ? {
            userId: user.id,
            kind: "agent",
            session: input.session,
            ...(input.label ? { label: input.label } : {}),
          }
        : { userId: user.id, kind: "human" },
    }),
  );
  return c.json(result);
});

/**
 * The draft against the live site: `{ liveChanged, draftHasChanges, followed, liveSha }`. A draft
 * with no changes of its own is brought up to date with what's live here (see `LiveStatus`).
 */
roomRoutes.get("/:id/room/live", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  return c.json(await unwrapRoom(roomStub(c.env, site.id).liveStatus(site.id)));
});

roomRoutes.post("/:id/room/flush", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  return c.json(await unwrapRoom(roomStub(c.env, site.id).flush(site.id)));
});

roomRoutes.post("/:id/room/agent-sessions", async (c) => {
  const user = requireUser(c);
  const input = await readJson(c, AgentSessionSchema);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  if (site.role === "contributor")
    throw new HttpError(403, "forbidden", "Contributors can't connect an AI to this site.");
  const result = await unwrapRoom(
    roomStub(c.env, site.id).startAgentSession(site.id, {
      userId: user.id,
      ...(input.label ? { label: input.label } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    }),
  );
  return c.json(result, 201);
});

roomRoutes.post("/:id/room/agent-sessions/:sid/end", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  await unwrapRoom(
    roomStub(c.env, site.id).endAgentSession(site.id, {
      userId: user.id,
      sessionId: c.req.param("sid"),
    }),
  );
  return c.json({ ok: true });
});

roomRoutes.post("/:id/room/agent-sessions/:sid/undo", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  if (site.role === "contributor")
    throw new HttpError(403, "forbidden", "You don't have access to this.");
  const sid = c.req.param("sid");
  return c.json(
    await unwrapRoom(
      roomStub(c.env, site.id).undoAgentSession(site.id, {
        userId: user.id,
        ...(sid === "latest" ? {} : { sessionId: sid }),
      }),
    ),
  );
});
