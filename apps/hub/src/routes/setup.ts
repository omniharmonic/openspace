/**
 * "Finish setting up" (Studio): what the importer left to do, plus whether the site has been
 * live yet (nothing extra is offered before the first live version — wow first).
 *
 * - `GET /api/sites/:id/setup` → `{ setup: { everLive, imported } }`. `imported` is
 *   `content/setup-checklist.json` (written by `openspace import` and the hosted import; read from
 *   the draft, then main) normalised: unknown kinds become "other", bad entries are dropped.
 */
import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { getUserRow, toUser } from "../db/users";
import { DRAFT_BRANCH, MAIN_BRANCH, parseRepo } from "../github/types";
import { hasBeenLive } from "../services/hosting-switch";
import { siteForUser } from "../services/sites";
import type { AppEnv } from "../types";

export const SETUP_CHECKLIST_PATH = "content/setup-checklist.json";

export const SETUP_KINDS = [
  "store",
  "donations",
  "members",
  "password-pages",
  "forms-email",
  "newsletter",
  "domain",
  "analytics",
  "comments",
  "custom-code",
  "other",
] as const;

const ItemSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.string().max(40),
  title: z.string().min(1).max(160),
  detail: z.string().max(600).optional(),
  where: z.array(z.string().max(300)).max(50).optional(),
  count: z.number().int().min(0).optional(),
  status: z.string().max(20).optional(),
});

const FileSchema = z.object({
  version: z.number().int().optional(),
  source: z.string().max(40).optional(),
  from: z.string().max(80).optional(),
  items: z.array(z.unknown()).max(100),
});

export interface ImportedSetup {
  from: string | null;
  items: Array<{
    id: string;
    kind: (typeof SETUP_KINDS)[number];
    title: string;
    detail: string | null;
    where: string[];
    count: number | null;
    done: boolean;
  }>;
}

/** Parse the importer's checklist file; null when missing or unreadable. */
export function parseSetupChecklist(text: string | null): ImportedSetup | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const file = FileSchema.safeParse(raw);
  if (!file.success) return null;
  const items: ImportedSetup["items"] = [];
  for (const entry of file.data.items) {
    const it = ItemSchema.safeParse(entry);
    if (!it.success) continue;
    const kind = (SETUP_KINDS as readonly string[]).includes(it.data.kind)
      ? (it.data.kind as ImportedSetup["items"][number]["kind"])
      : "other";
    items.push({
      id: it.data.id,
      kind,
      title: it.data.title,
      detail: it.data.detail ?? null,
      where: it.data.where ?? [],
      count: it.data.count ?? null,
      done: it.data.status === "done",
    });
  }
  return { from: file.data.from ?? null, items };
}

export const setupRoutes = new Hono<AppEnv>();

setupRoutes.get("/:id/setup", async (c) => {
  const user = requireUser(c);
  const services = c.var.services;
  const site = await siteForUser(services, c.req.param("id"), user);
  let imported: ImportedSetup | null = null;
  try {
    const owner = await getUserRow(services.db, site.owner_id);
    const gh = services.github({ site, user: owner ? toUser(owner) : null });
    const repo = parseRepo(site.repo);
    const text =
      (await gh.readFile(repo, SETUP_CHECKLIST_PATH, DRAFT_BRANCH).catch(() => null)) ??
      (await gh.readFile(repo, SETUP_CHECKLIST_PATH, MAIN_BRANCH).catch(() => null));
    imported = parseSetupChecklist(text);
  } catch (err) {
    c.var.log?.warn("setup checklist read failed", { siteId: site.id, err });
  }
  return c.json({ setup: { everLive: await hasBeenLive(services, site), imported } });
});
