import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import { designCheck } from "@omniharmonic/openspace-lint";
import { validateDocument } from "@omniharmonic/openspace-ops";
import { describe, expect, it } from "vitest";
import { MemorySiteStore } from "./memory-store";
import { createMcpServer, handleMcpRequest } from "./server";
import { meadowDoc, OWNER, setup } from "./test-helpers";

const SPEC_TOOLS = [
  "list_sites",
  "get_site",
  "get_page",
  "list_blocks",
  "list_section_presets",
  "get_styles",
  "set_styles",
  "insert_section",
  "update_section",
  "move_section",
  "delete_section",
  "insert_block",
  "update_block",
  "move_block",
  "delete_block",
  "place_in_grid",
  "create_page",
  "update_page",
  "delete_page",
  "update_navigation",
  "upload_image",
  "create_post",
  "update_post",
  "list_posts",
  "get_draft_diff",
  "preview",
  "publish",
  "discard_draft",
  "rollback",
  // design-iteration helpers
  "design_check",
  "apply_fix",
  "list_templates",
  "apply_template_look",
  "render_page",
  "screenshot",
  "auto_mobile_layout",
  "get_block_schema",
];

describe("protocol", () => {
  it("initializes, negotiates the version and ignores notifications", async () => {
    const { rpc, server } = await setup();
    const init = await rpc.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "c", version: "1" },
    });
    expect(init.protocolVersion).toBe("2025-06-18");
    expect(init.capabilities).toMatchObject({ tools: {}, resources: {}, prompts: {} });
    expect((init.serverInfo as { name: string }).name).toBe("openspace");
    expect(typeof init.instructions).toBe("string");
    const unknownVersion = await rpc.request("initialize", {
      protocolVersion: "1999-01-01",
      capabilities: {},
    });
    expect(unknownVersion.protocolVersion).toBe("2025-11-25");
    expect(
      await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" }),
    ).toBeUndefined();
    expect(await rpc.request("ping")).toEqual({});
    const missing = await rpc.raw("nope/nothing");
    expect(missing.error?.code).toBe(-32601);
    const bad = (await server.handle({ hello: 1 })) as { error: { code: number } };
    expect(bad.error.code).toBe(-32600);
    const pings = [
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "ping" },
    ];
    // Batches were removed in 2025-06-18 (negotiated last: 2025-11-25)…
    const refused = (await server.handle(pings)) as { error: { code: number } };
    expect(refused.error.code).toBe(-32600);
    // …and allowed in a 2025-03-26 session.
    await rpc.request("initialize", { protocolVersion: "2025-03-26", capabilities: {} });
    const batch = (await server.handle(pings)) as unknown[];
    expect(batch).toHaveLength(2);
  });

  it("refuses requests before initialize (ping excepted) and hides internal error details", async () => {
    const store = new MemorySiteStore({ sites: [await meadowDoc()] });
    const server = createMcpServer(store, OWNER);
    const early = (await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" })) as {
      error: { code: number; message: string };
    };
    expect(early.error.code).toBe(-32600);
    expect(early.error.message).toMatch(/initialize/);
    expect(await server.handle({ jsonrpc: "2.0", id: 2, method: "ping" })).toMatchObject({
      result: {},
    });

    const logged: unknown[] = [];
    const broken = new MemorySiteStore({ sites: [await meadowDoc()] });
    broken.getDocument = async () => {
      throw new Error("secret path /home/maya/.ssh exploded");
    };
    const s2 = createMcpServer(broken, OWNER, { onError: (e) => logged.push(e) });
    await s2.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {} },
    });
    const r = (await s2.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_site", arguments: {} },
    })) as unknown as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0]?.text).not.toContain("secret");
    expect(r.result.content[0]?.text).toMatch(/logged/);
    expect(logged).toHaveLength(1);
  });

  it("lists every architecture tool with an object input schema", async () => {
    const { rpc } = await setup();
    const { tools } = (await rpc.request("tools/list")) as {
      tools: Array<{
        name: string;
        inputSchema: { type: string };
        description: string;
        annotations: Record<string, unknown>;
      }>;
    };
    const names = tools.map((t) => t.name);
    for (const n of SPEC_TOOLS) expect(names).toContain(n);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.description.length).toBeGreaterThan(20);
    }
    const pub = tools.find((t) => t.name === "publish");
    expect(pub?.annotations.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === "get_page")?.annotations.readOnlyHint).toBe(true);
    const unknown = await rpc.raw("tools/call", { name: "make_it_pop", arguments: {} });
    expect(unknown.error?.code).toBe(-32602);
  });

  it("works with the official SDK client over an SDK transport", async () => {
    const store = new MemorySiteStore({ sites: [await meadowDoc()] });
    const server = createMcpServer(store, OWNER);
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "sdk-test", version: "1.0.0" });
    await client.connect(clientT);
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThanOrEqual(SPEC_TOOLS.length);
    const r = await client.callTool({ name: "get_site", arguments: {} });
    expect(r.isError).toBeFalsy();
    expect((r.structuredContent as { title: string }).title).toBeTruthy();
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((p) => p.name)).toContain("iterate-design");
    const res = await client.readResource({ uri: "openspace://guidance/design" });
    expect(String((res.contents[0] as { text: string }).text)).toContain("One primary action");
    await client.close();
  });

  it("handleMcpRequest answers one message statelessly", async () => {
    const store = new MemorySiteStore({ sites: [await meadowDoc()] });
    const r = (await handleMcpRequest(store, OWNER, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "list_sites", arguments: {} },
    })) as unknown as {
      id: number;
      result: { structuredContent: { sites: unknown[] } };
    };
    expect(r.id).toBe(7);
    expect(r.result.structuredContent.sites).toHaveLength(1);
  });
});

describe("build a five-section page from a brief", () => {
  it("results in a schema-valid page with zero Design check errors", async () => {
    const { rpc, store, siteId } = await setup();
    // Brief: "Weekend retreats page for Meadow Yoga: two-night retreats in the foothills, what's
    // included, the schedule, common questions, and a booking call to action."
    const site = (await rpc.call("get_site")).data;
    expect(site.pages.length).toBeGreaterThan(0);
    const presets = (await rpc.call("list_section_presets", { category: "hero" })).data.presets;
    expect(presets.some((p: { id: string }) => p.id === "hero/split-image@1")).toBe(true);

    const created = (
      await rpc.call("create_page", {
        title: "Retreats",
        description:
          "Two-night yoga retreats in the Colorado foothills: slow practice, good food and quiet trails.",
        presets: [
          "hero/split-image@1",
          "about/story-split",
          "services/steps@1",
          "faq/split@1",
          "cta/banner@1",
        ],
        themes: ["light-accent", "light", "light-accent", "light", "brand"],
      })
    ).data;
    expect(created.sections).toHaveLength(5);
    expect(created.inNav).toBe(true);
    const pageId = created.page.id as string;

    // Replace demo copy with the brief's words (rich text as Markdown).
    const outline = (await rpc.call("get_page", { page: "retreats", detail: "outline" })).data;
    expect(outline.sections).toHaveLength(5);
    type B = { id: string; type: string };
    const first = (i: number, type: string) => {
      const b = outline.sections[i].blocks.find((x: B) => x.type === type) as B | undefined;
      expect(b, `${type} in section ${i}`).toBeTruthy();
      return (b as B).id;
    };
    await rpc.call("update_block", {
      page: pageId,
      block: first(0, "heading"),
      set: { text: "Two quiet nights in the foothills" },
    });
    await rpc.call("update_block", {
      page: pageId,
      block: first(1, "text"),
      set: {
        content:
          "Our retreats are small on purpose: twelve guests, two teachers and a kitchen that cooks from the farm down the road. Mornings are for **slow flow and breath work**, afternoons for trail walks or naps, evenings for restorative practice by the fire. [See the dates](/contact)",
      },
    });
    await rpc.call("update_block", {
      page: pageId,
      block: first(4, "heading"),
      set: { text: "Save your place for spring" },
    });
    // A bad edit is rejected with a path the agent can correct; nothing changes.
    const beforeBad = JSON.stringify(await store.getDocument(siteId));
    const bad = await rpc.callError("update_block", {
      page: pageId,
      block: first(0, "heading"),
      set: { level: "h9" },
    });
    expect(bad.text).toMatch(/level/);
    expect(JSON.stringify(await store.getDocument(siteId))).toBe(beforeBad);

    // The full view returns rich text as Markdown.
    const full = (await rpc.call("get_page", { page: pageId })).data;
    const story = full.sections[1].blocks.find((b: B) => b.type === "text");
    expect(story.fields.content).toContain("**slow flow and breath work**");
    expect(full.sections[0].blocks.find((b: B) => b.type === "heading").fields.text).toBe(
      "Two quiet nights in the foothills",
    );

    // Look at it: the rendered HTML carries the new copy.
    const html = (await rpc.call("render_page", { page: pageId })).content[0]?.text ?? "";
    expect(html).toContain("<main");
    expect(html).toContain("Two quiet nights in the foothills");
    expect(html).toContain("<strong>slow flow and breath work</strong>");

    // Design check, fix what's fixable, confirm zero errors.
    const check = (await rpc.call("design_check", { page: pageId })).data;
    expect(check.counts).toBeDefined();
    if (check.counts.error > 0) await rpc.call("apply_fix", { issues: "all", page: pageId });
    const after = (await rpc.call("design_check", { page: pageId, minSeverity: "error" })).data;
    expect(after.issues).toEqual([]);

    const doc = await store.getDocument(siteId);
    const valid = validateDocument(doc, { registry: blocksRegistry() });
    expect(valid.ok).toBe(true);
    expect(designCheck(doc, pageId).filter((i) => i.severity === "error")).toEqual([]);
    expect(doc.site.nav.some((n) => n.type === "page" && n.page === pageId)).toBe(true);
    // The nav button stays last.
    expect(doc.site.nav[doc.site.nav.length - 1]?.type).toBe("button");

    const diff = (await rpc.call("get_draft_diff")).data;
    expect(diff.hasChanges).toBe(true);
    expect(diff.summary).toMatch(/Retreats/);
  });
});
