import { z } from "zod";
import { ToolError } from "../errors";
import { confirmArg, defineTool, siteArg } from "../tool";
import { requireConfirm } from "./pages";

export const getDraftDiff = defineTool({
  name: "get_draft_diff",
  title: "Unpublished changes",
  description: "Plain-language summary of the changes in the draft that are not published yet.",
  input: z.object({ site: siteArg }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    return { data: await ctx.store.getDraftDiff(siteId) };
  },
});

export const publish = defineTool({
  name: "publish",
  title: "Publish",
  description:
    "Publish the draft so the live site updates. Only after the owner explicitly asks: requires confirm: true and a connection allowed to publish. Run design_check first; message summarises the change (default: generated from the edits).",
  input: z.object({
    site: siteArg,
    message: z.string().max(500).optional(),
    confirm: confirmArg,
  }),
  annotations: { destructiveHint: true, openWorldHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    if (!ctx.grant.publish)
      throw new ToolError(
        "This connection isn't allowed to publish. The owner can publish from Studio, or allow publishing for this connection.",
        "forbidden",
      );
    if (!ctx.store.capabilities.canPublish)
      throw new ToolError(
        `Publishing isn't available here. ${ctx.store.capabilities.publishNote ?? ""}`.trim(),
        "unsupported",
      );
    requireConfirm(input.confirm, "Publishing");
    const session = await ctx.session(siteId);
    const r = await ctx.store.publish(siteId, { message: input.message, actor: session.actor });
    return {
      data: r,
      text:
        r.status === "no_changes"
          ? "Nothing to publish: the draft matches the live site."
          : `Published${r.version ? ` (${r.version.slice(0, 9)})` : ""}: ${r.summary}${r.note ? `\n${r.note}` : ""}`,
    };
  },
});

export const discardDraft = defineTool({
  name: "discard_draft",
  title: "Discard draft",
  description:
    "Throw away every unpublished change (including other people's) and return the draft to the live version. Destructive: requires confirm: true after the owner agrees.",
  input: z.object({ site: siteArg, confirm: confirmArg }),
  annotations: { destructiveHint: true },
  async handler(ctx, input) {
    requireConfirm(input.confirm, "Discarding the draft");
    const siteId = await ctx.siteId(input.site);
    const role = ctx.roleFor(siteId);
    if (role && role !== "owner" && role !== "designer")
      throw new ToolError(
        `Discarding the whole draft throws away everyone's unpublished work, so it needs a designer or owner (your role: ${role}).`,
        "forbidden",
      );
    const session = await ctx.session(siteId);
    const r = await ctx.store.discardDraft(siteId, {
      actor: session.actor,
      session: session.sessionId,
    });
    return {
      data: { discarded: r.hasChanges, summary: r.summary },
      text: r.hasChanges ? `Discarded: ${r.summary}` : "There were no unpublished changes.",
    };
  },
});

export const listVersions = defineTool({
  name: "list_versions",
  title: "List versions",
  description: "Published versions, newest first (for rollback).",
  input: z.object({ site: siteArg, limit: z.int().min(1).max(100).optional() }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    if (!ctx.store.capabilities.canRollback)
      return { data: { versions: [], note: "This store keeps no version history." } };
    return { data: { versions: await ctx.store.listVersions(siteId, { limit: input.limit }) } };
  },
});

export const rollback = defineTool({
  name: "rollback",
  title: "Roll back",
  description:
    "Restore the live site to an earlier published version (from list_versions). Requires confirm: true and publish permission; unpublished work is kept in a snapshot where the store supports it.",
  input: z.object({ site: siteArg, version: z.string(), confirm: confirmArg }),
  annotations: { destructiveHint: true, openWorldHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    if (!ctx.grant.publish)
      throw new ToolError(
        "This connection isn't allowed to publish, so it can't roll back either.",
        "forbidden",
      );
    if (!ctx.store.capabilities.canRollback)
      throw new ToolError("Rolling back isn't available here.", "unsupported");
    requireConfirm(input.confirm, "Rolling back");
    const session = await ctx.session(siteId);
    const r = await ctx.store.rollback(siteId, input.version, {
      actor: session.actor,
      session: session.sessionId,
    });
    return { data: r };
  },
});

export const createSnapshot = defineTool({
  name: "create_snapshot",
  title: "Create snapshot",
  description:
    "Save a named snapshot of the draft before a risky change (e.g. before restyling). A snapshot is also taken automatically before your first edit in each session.",
  input: z.object({
    site: siteArg,
    name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, "lowercase letters, digits and dashes"),
  }),
  annotations: {},
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const tag = await ctx.store.snapshot(siteId, input.name);
    return {
      data: { snapshot: tag, ...(tag ? {} : { note: "This store can't take snapshots." }) },
    };
  },
});

export const publishTools = [
  getDraftDiff,
  publish,
  discardDraft,
  listVersions,
  rollback,
  createSnapshot,
];
