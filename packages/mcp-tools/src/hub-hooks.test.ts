import { describe, expect, it } from "vitest";
import { ToolError } from "./errors";
import { setup } from "./test-helpers";

describe("server options a host (the Hub) can set", () => {
  it("replaces the instructions and adds prompts beside the built-in ones", async () => {
    const { rpc } = await setup({
      server: {
        instructions: "Ask the person a few questions first.",
        prompts: [
          {
            name: "start-a-site",
            title: "Start a site",
            description: "Make a new website together.",
            arguments: [{ name: "idea", description: "What it's for." }],
            render: (a) => `Let's make a site${a.idea ? ` for ${a.idea}` : ""}.`,
          },
        ],
      },
    });
    const init = await rpc.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
    });
    expect(init.instructions).toBe("Ask the person a few questions first.");
    const list = (await rpc.request("prompts/list")).prompts as Array<{ name: string }>;
    expect(list.map((p) => p.name)).toContain("start-a-site");
    expect(list.map((p) => p.name)).toContain("design-a-page");
    const got = (await rpc.request("prompts/get", {
      name: "start-a-site",
      arguments: { idea: "a bakery" },
    })) as { messages: Array<{ content: { text: string } }> };
    expect(got.messages[0]?.content.text).toBe("Let's make a site for a bakery.");
  });

  it("finds a site by its name, and lets the store explain a site it can't reach", async () => {
    const { rpc, store, siteId } = await setup({
      grant: { sites: [], publish: false, role: "owner" },
    });
    // Nothing granted: the store's explanation wins over the generic one.
    const explain = (ref: string | undefined) =>
      Promise.resolve(
        new ToolError(`Open https://studio/allow?site=${ref ?? "none"} to share it.`, "not_shared"),
      );
    (store as unknown as { explainUnreachable: typeof explain }).explainUnreachable = explain;
    const none = await rpc.callError("get_site");
    expect(none.code).toBe("not_shared");
    expect(none.text).toContain("allow?site=none");
    const named = await rpc.callError("get_site", { site: "Other place" });
    expect(named.text).toContain("allow?site=Other place");

    const granted = await setup({ grant: { sites: [siteId], publish: false, role: "owner" } });
    const title = (await granted.store.listSites())[0]?.title as string;
    const byName = await granted.rpc.call("get_site", { site: title.toUpperCase() });
    expect(byName.data).toBeTruthy();
  });
});
