import { ROLES, type Role } from "@openspace/ops";
import { z } from "zod";
import { audit } from "../db/audit";
import { getSite, type SiteWithRole, setRole } from "../db/sites";
import { getUserByLogin, type User } from "../db/users";
import type { HubBindings } from "../env";
import { parseRepo } from "../github/types";
import { randomId, randomToken, sha256Hex } from "../lib/crypto";
import { forbidden, HttpError, notFound } from "../lib/errors";
import type { Logger } from "../lib/log";
import { roomStub } from "../room";
import type { Services } from "./index";
import { ownerOf, requireRole, siteForUser } from "./sites";

/**
 * Collaborators (arch §6.4, PRD §4.5): invite by email or GitHub login with a role, accept,
 * list, change role / personal section locks, remove. Roles live in D1 `site_roles` and are
 * enforced by the DraftRoom on every op; accepted collaborators with GitHub accounts are also
 * added to the repository with write access.
 */

export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Roles an invitation can grant. Ownership moves only by transfer. */
export const INVITABLE_ROLES = ["designer", "editor", "contributor"] as const;

const RANK: Record<Role, number> = { contributor: 1, editor: 2, designer: 3, owner: 4 };

export const InviteSchema = z
  .strictObject({
    email: z.email().max(254).optional(),
    login: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "That isn't a GitHub username")
      .optional(),
    role: z.enum(INVITABLE_ROLES),
  })
  .refine((v) => Boolean(v.email) !== Boolean(v.login), "Give an email or a GitHub username");

export const UpdateCollaboratorSchema = z.strictObject({
  role: z.enum(INVITABLE_ROLES).optional(),
  /** Section ids this person can't change beyond text and images (Editors). */
  lockedSections: z
    .array(z.string().regex(/^sec_[0-9a-z]{10}$/))
    .max(500)
    .optional(),
});

export interface CollaboratorView {
  userId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
  lockedSections: string[];
  since: string;
}

export interface InvitationView {
  id: string;
  email: string | null;
  login: string | null;
  role: Role;
  status: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
}

interface InvitationRow {
  id: string;
  site_id: string;
  email: string | null;
  github_login: string | null;
  role: Role;
  token_hash: string;
  invited_by: string;
  status: string;
  created_at: number;
  expires_at: number;
  accepted_at: number | null;
}

const toInvitationView = (r: InvitationRow): InvitationView => ({
  id: r.id,
  email: r.email,
  login: r.github_login,
  role: r.role,
  status: r.status,
  invitedBy: r.invited_by,
  createdAt: new Date(r.created_at).toISOString(),
  expiresAt: new Date(r.expires_at).toISOString(),
});

/** Only owners and designers manage people; designers can't hand out or touch more than they have. */
function requireManage(site: SiteWithRole, role?: Role): void {
  requireRole(site, "designer");
  if (role && RANK[role] > RANK[site.role])
    throw forbidden("You can't give someone more access than you have.");
}

async function notifyRoom(env: HubBindings, siteId: string, userId: string, log?: Logger) {
  try {
    await roomStub(env, siteId).refreshMember(siteId, userId);
  } catch (err) {
    log?.warn("room refresh failed", { siteId, userId, err });
  }
}

export async function listCollaborators(
  services: Services,
  id: string,
  user: User,
): Promise<{ collaborators: CollaboratorView[]; invitations: InvitationView[] }> {
  const site = await siteForUser(services, id, user);
  const rows = await services.db
    .prepare(
      `SELECT r.user_id, r.role, r.locked_sections, r.created_at, u.login, u.name, u.avatar_url
       FROM site_roles r JOIN users u ON u.id = r.user_id WHERE r.site_id = ? ORDER BY r.created_at`,
    )
    .bind(id)
    .all<{
      user_id: string;
      role: Role;
      locked_sections: string | null;
      created_at: number;
      login: string;
      name: string | null;
      avatar_url: string | null;
    }>();
  const collaborators = rows.results.map((r) => ({
    userId: r.user_id,
    login: r.login,
    name: r.name,
    avatarUrl: r.avatar_url,
    role: r.role,
    lockedSections: r.locked_sections ? (JSON.parse(r.locked_sections) as string[]) : [],
    since: new Date(r.created_at).toISOString(),
  }));
  // Pending invitations are visible to the people who can manage them.
  let invitations: InvitationView[] = [];
  if (RANK[site.role] >= RANK.designer) {
    const inv = await services.db
      .prepare(
        "SELECT * FROM invitations WHERE site_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC",
      )
      .bind(id, services.now())
      .all<InvitationRow>();
    invitations = inv.results.map(toInvitationView);
  }
  return { collaborators, invitations };
}

/**
 * Invite someone. Returns the invitation and its one-time accept URL (Studio shows it to copy;
 * an email with the same link is queued in the outbox when an address was given).
 */
export async function inviteCollaborator(
  services: Services,
  id: string,
  user: User,
  input: z.infer<typeof InviteSchema>,
): Promise<{ invitation: InvitationView; acceptUrl: string }> {
  const site = await siteForUser(services, id, user);
  requireManage(site, input.role);
  if (input.login) {
    const existing = await getUserByLogin(services.db, input.login);
    if (existing) {
      const role = await services.db
        .prepare("SELECT role FROM site_roles WHERE site_id = ? AND user_id = ?")
        .bind(id, existing.id)
        .first<{ role: Role }>();
      if (role)
        throw new HttpError(409, "already_collaborator", "That person already works on this site.");
    }
  }
  const now = services.now();
  const token = randomToken(24);
  const row: InvitationRow = {
    id: randomId("inv"),
    site_id: id,
    email: input.email?.toLowerCase() ?? null,
    github_login: input.login ?? null,
    role: input.role,
    token_hash: await sha256Hex(token),
    invited_by: user.id,
    status: "pending",
    created_at: now,
    expires_at: now + INVITE_TTL_MS,
    accepted_at: null,
  };
  await services.db
    .prepare(
      `INSERT INTO invitations (id, site_id, email, github_login, role, token_hash, invited_by, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(
      row.id,
      id,
      row.email,
      row.github_login,
      row.role,
      row.token_hash,
      user.id,
      now,
      row.expires_at,
    )
    .run();
  const acceptUrl = `${services.config.studioOrigin}/invite/${token}`;
  if (row.email)
    await services.db
      .prepare(
        "INSERT INTO outbox (id, site_id, to_addr, subject, text, kind, created_at) VALUES (?, ?, ?, ?, ?, 'invitation', ?)",
      )
      .bind(
        randomId("out"),
        id,
        row.email,
        `${user.name ?? user.login} invited you to work on ${site.name}`,
        `${user.name ?? user.login} invited you to help with ${site.name} as ${input.role}.\n\nAccept: ${acceptUrl}\n\nThis link works for 14 days.`,
        now,
      )
      .run();
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "collaborator.invite",
    meta: { invitation: row.id, role: input.role, email: row.email, login: row.github_login },
  });
  return { invitation: toInvitationView(row), acceptUrl };
}

export async function revokeInvitation(
  services: Services,
  id: string,
  user: User,
  invitationId: string,
): Promise<void> {
  const site = await siteForUser(services, id, user);
  requireManage(site);
  const res = await services.db
    .prepare(
      "UPDATE invitations SET status = 'revoked' WHERE id = ? AND site_id = ? AND status = 'pending'",
    )
    .bind(invitationId, id)
    .run();
  if (res.meta.changes !== 1) throw notFound("That invitation isn't waiting any more.");
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "collaborator.invite.revoke",
    meta: { invitationId },
  });
}

async function invitationByToken(services: Services, token: string): Promise<InvitationRow> {
  const row = await services.db
    .prepare("SELECT * FROM invitations WHERE token_hash = ?")
    .bind(await sha256Hex(token))
    .first<InvitationRow>();
  if (!row) throw notFound("This invitation link isn't valid.");
  if (row.status === "pending" && row.expires_at <= services.now()) {
    await services.db
      .prepare("UPDATE invitations SET status = 'expired' WHERE id = ?")
      .bind(row.id)
      .run();
    row.status = "expired";
  }
  return row;
}

/** `GET /api/invitations/:token` — what the invitation is for (shown before signing in). */
export async function previewInvitation(
  services: Services,
  token: string,
): Promise<{ siteName: string; role: Role; invitedBy: string; status: string; expiresAt: string }> {
  const row = await invitationByToken(services, token);
  const site = await getSite(services.db, row.site_id);
  if (!site || site.archived_at) throw notFound("This site no longer exists.");
  const inviter = await services.db
    .prepare("SELECT name, login FROM users WHERE id = ?")
    .bind(row.invited_by)
    .first<{ name: string | null; login: string }>();
  return {
    siteName: site.name,
    role: row.role,
    invitedBy: inviter?.name ?? inviter?.login ?? "Someone",
    status: row.status,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

/**
 * Accept an invitation as the signed-in person. Login invitations only work for that GitHub
 * account; email invitations for whoever holds the link. Adds the role, then (best effort) repo
 * write access on GitHub for GitHub accounts.
 */
export async function acceptInvitation(
  env: HubBindings,
  services: Services,
  token: string,
  user: User,
  log?: Logger,
): Promise<{ siteId: string; role: Role }> {
  const row = await invitationByToken(services, token);
  if (row.status !== "pending")
    throw new HttpError(410, "invitation_unavailable", `This invitation is ${row.status}.`);
  if (row.github_login && row.github_login.toLowerCase() !== user.login.toLowerCase())
    throw forbidden(`This invitation is for @${row.github_login}. Sign in with that account.`);
  const site = await getSite(services.db, row.site_id);
  if (!site || site.archived_at) throw notFound("This site no longer exists.");
  const now = services.now();
  const claim = await services.db
    .prepare(
      "UPDATE invitations SET status = 'accepted', accepted_at = ?, accepted_by = ? WHERE id = ? AND status = 'pending'",
    )
    .bind(now, user.id, row.id)
    .run();
  if (claim.meta.changes !== 1)
    throw new HttpError(410, "invitation_unavailable", "This invitation was just used.");
  const current = await services.db
    .prepare("SELECT role FROM site_roles WHERE site_id = ? AND user_id = ?")
    .bind(site.id, user.id)
    .first<{ role: Role }>();
  // Never downgrade someone who already has more access.
  if (!current || RANK[current.role] < RANK[row.role])
    await setRole(services.db, site.id, user.id, row.role, now);
  if (!user.isDev || services.config.useDevGitHub) {
    try {
      const owner = await ownerOf(services, site);
      await services
        .github({ site, user: owner })
        .addCollaborator(parseRepo(site.repo), user.login, "push");
    } catch (err) {
      log?.warn("adding GitHub collaborator failed", { siteId: site.id, err });
    }
  }
  await audit(services.db, {
    siteId: site.id,
    actor: user.id,
    action: "collaborator.accept",
    meta: { invitation: row.id, role: row.role },
  });
  await notifyRoom(env, site.id, user.id, log);
  return {
    siteId: site.id,
    role: current && RANK[current.role] >= RANK[row.role] ? current.role : row.role,
  };
}

export async function updateCollaborator(
  env: HubBindings,
  services: Services,
  id: string,
  user: User,
  targetId: string,
  patch: z.infer<typeof UpdateCollaboratorSchema>,
  log?: Logger,
): Promise<CollaboratorView> {
  const site = await siteForUser(services, id, user);
  requireManage(site, patch.role);
  const target = await services.db
    .prepare("SELECT role FROM site_roles WHERE site_id = ? AND user_id = ?")
    .bind(id, targetId)
    .first<{ role: Role }>();
  if (!target) throw notFound("That person doesn't work on this site.");
  if (target.role === "owner") throw forbidden("The owner's access can't be changed.");
  if (RANK[target.role] > RANK[site.role]) throw forbidden();
  if (patch.role)
    await services.db
      .prepare("UPDATE site_roles SET role = ? WHERE site_id = ? AND user_id = ?")
      .bind(patch.role, id, targetId)
      .run();
  if (patch.lockedSections)
    await services.db
      .prepare("UPDATE site_roles SET locked_sections = ? WHERE site_id = ? AND user_id = ?")
      .bind(JSON.stringify([...new Set(patch.lockedSections)]), id, targetId)
      .run();
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "collaborator.update",
    meta: { targetId, ...patch },
  });
  await notifyRoom(env, id, targetId, log);
  const { collaborators } = await listCollaborators(services, id, user);
  return collaborators.find((c) => c.userId === targetId) as CollaboratorView;
}

/** Remove a collaborator (or yourself — "leave site"). The owner can't be removed. */
export async function removeCollaborator(
  env: HubBindings,
  services: Services,
  id: string,
  user: User,
  targetId: string,
  log?: Logger,
): Promise<void> {
  const site = await siteForUser(services, id, user);
  if (targetId !== user.id) requireManage(site);
  const target = await services.db
    .prepare(
      "SELECT r.role, u.login FROM site_roles r JOIN users u ON u.id = r.user_id WHERE r.site_id = ? AND r.user_id = ?",
    )
    .bind(id, targetId)
    .first<{ role: Role; login: string }>();
  if (!target) throw notFound("That person doesn't work on this site.");
  if (target.role === "owner")
    throw forbidden("The owner can't be removed. Transfer the site instead.");
  if (targetId !== user.id && RANK[target.role] > RANK[site.role]) throw forbidden();
  await services.db
    .prepare("DELETE FROM site_roles WHERE site_id = ? AND user_id = ?")
    .bind(id, targetId)
    .run();
  try {
    const owner = await ownerOf(services, site);
    await services
      .github({ site, user: owner })
      .removeCollaborator(parseRepo(site.repo), target.login);
  } catch (err) {
    log?.warn("removing GitHub collaborator failed", { siteId: id, err });
  }
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "collaborator.remove",
    meta: { targetId },
  });
  await notifyRoom(env, id, targetId, log);
}

/** Expire stale invitations (cron). */
export async function expireInvitations(services: Services, now: number): Promise<number> {
  const r = await services.db
    .prepare(
      "UPDATE invitations SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?",
    )
    .bind(now)
    .run();
  return r.meta.changes ?? 0;
}

export { ROLES };
