import { Hono } from "hono";
import { requireUser } from "../auth/session";
import { readJson } from "../lib/validate";
import {
  approveSubmission,
  listApprovals,
  RejectSchema,
  rejectSubmission,
} from "../services/approvals";
import {
  acceptInvitation,
  InviteSchema,
  inviteCollaborator,
  listCollaborators,
  previewInvitation,
  removeCollaborator,
  revokeInvitation,
  UpdateCollaboratorSchema,
  updateCollaborator,
} from "../services/collaborators";
import type { AppEnv } from "../types";

/** Collaborators and the Contributor approval queue, under `/api/sites`. */
export const collaboratorRoutes = new Hono<AppEnv>();

collaboratorRoutes.get("/:id/collaborators", async (c) => {
  const user = requireUser(c);
  return c.json(await listCollaborators(c.var.services, c.req.param("id"), user));
});

/** POST /api/sites/:id/collaborators { email | login, role } */
collaboratorRoutes.post("/:id/collaborators", async (c) => {
  const user = requireUser(c);
  const input = await readJson(c, InviteSchema);
  return c.json(await inviteCollaborator(c.var.services, c.req.param("id"), user, input), 201);
});

/** PATCH /api/sites/:id/collaborators/:userId { role?, lockedSections? } */
collaboratorRoutes.patch("/:id/collaborators/:userId", async (c) => {
  const user = requireUser(c);
  const patch = await readJson(c, UpdateCollaboratorSchema);
  return c.json(
    await updateCollaborator(
      c.env,
      c.var.services,
      c.req.param("id"),
      user,
      c.req.param("userId"),
      patch,
      c.var.log,
    ),
  );
});

collaboratorRoutes.delete("/:id/collaborators/:userId", async (c) => {
  const user = requireUser(c);
  await removeCollaborator(
    c.env,
    c.var.services,
    c.req.param("id"),
    user,
    c.req.param("userId"),
    c.var.log,
  );
  return c.json({ ok: true });
});

collaboratorRoutes.delete("/:id/invitations/:invitationId", async (c) => {
  const user = requireUser(c);
  await revokeInvitation(c.var.services, c.req.param("id"), user, c.req.param("invitationId"));
  return c.json({ ok: true });
});

/** GET /api/sites/:id/approvals[?status=pending|approved|rejected] */
collaboratorRoutes.get("/:id/approvals", async (c) => {
  const user = requireUser(c);
  return c.json({
    approvals: await listApprovals(c.var.services, c.req.param("id"), user, c.req.query("status")),
  });
});

collaboratorRoutes.post("/:id/approvals/:approvalId/approve", async (c) => {
  const user = requireUser(c);
  return c.json(
    await approveSubmission(
      c.env,
      c.var.services,
      c.req.param("id"),
      user,
      c.req.param("approvalId"),
    ),
  );
});

/** POST /api/sites/:id/approvals/:approvalId/reject { note? } */
collaboratorRoutes.post("/:id/approvals/:approvalId/reject", async (c) => {
  const user = requireUser(c);
  const { note } = await readJson(c, RejectSchema);
  return c.json(
    await rejectSubmission(
      c.var.services,
      c.req.param("id"),
      user,
      c.req.param("approvalId"),
      note,
    ),
  );
});

/** Invitation links: `/api/invitations/:token` (preview, no sign-in) and `/accept`. */
export const invitationRoutes = new Hono<AppEnv>();

invitationRoutes.get("/:token", async (c) =>
  c.json(await previewInvitation(c.var.services, c.req.param("token"))),
);

invitationRoutes.post("/:token/accept", async (c) => {
  const user = requireUser(c);
  return c.json(
    await acceptInvitation(c.env, c.var.services, c.req.param("token"), user, c.var.log),
  );
});
