import { describe, expect, it } from "vitest";
import type { ScreenshotRequest } from "./store";
import { OWNER, setup, tinyPng } from "./test-helpers";

const quote = {
  name: "pull-quote",
  label: "Pull quote",
  version: 1,
  fields: {
    quote: { kind: "text", maxLength: 200, multiline: true },
    note: { kind: "richText", optional: true },
  },
  defaults: { quote: "Slow down; breathe." },
  template: '<figure class="pq"><blockquote>{{quote}}</blockquote>{{rich note}}</figure>',
  css: ".pq { font-family: var(--os-font-heading); color: var(--os-color-heading); }",
};

describe("custom component tools", () => {
  it("lists the library, creates from it, inserts it and edits its fields like a block", async () => {
    const { rpc, store, siteId } = await setup();
    const list = (await rpc.call("list_components")).data;
    expect(list.components).toEqual([]);
    expect(list.library.map((c: { name: string }) => c.name)).toContain("bento-grid");
    expect(list.guidance).toMatch(/Prefer section presets/);

    const created = (await rpc.call("create_component", { from: "editorial-hero" })).data;
    expect(created.component).toMatchObject({ name: "editorial-hero", version: 1 });
    expect(created.findings.filter((f: { severity: string }) => f.severity === "error")).toEqual(
      [],
    );

    const inserted = (
      await rpc.call("insert_component", {
        page: "/",
        name: "editorial-hero",
        at: "start",
        fields: { headline: "Breathe in, slow down", intro: "Tea **after** every class." },
      })
    ).data;
    expect(inserted.addedToSite).toBe(false);
    let doc = await store.getDocument(siteId);
    const home = Object.values(doc.pages).find((p) => p.slug === "");
    const block = home?.sections[0]?.blocks[0];
    expect(block?.type).toBe("component/editorial-hero");
    expect(block?.fields.headline).toBe("Breathe in, slow down");
    expect(JSON.stringify(block?.fields.intro)).toContain('"bold"');

    // Fields edit through update_block with Markdown, like any block.
    await rpc.call("update_block", {
      page: "/",
      block: inserted.block,
      set: { headline: "Stillness, strength and good tea" },
    });
    doc = await store.getDocument(siteId);
    const page = await rpc.call("get_page", { page: "/" });
    expect(JSON.stringify(page.data)).toContain("Stillness, strength and good tea");
    expect(doc.components?.["editorial-hero"]).toBeTruthy();
  });

  it("inserting a library component adds it to the site in the same step", async () => {
    const { rpc, store, siteId } = await setup();
    const r = (await rpc.call("insert_component", { page: "/", name: "testimonial-marquee" })).data;
    expect(r.addedToSite).toBe(true);
    const doc = await store.getDocument(siteId);
    expect(doc.components?.["testimonial-marquee"]?.label).toBe("Testimonial marquee");
  });

  it("explains invalid definitions line by line and saves nothing", async () => {
    const { rpc, store, siteId } = await setup();
    const err = await rpc.callError("create_component", {
      component: { ...quote, template: '<div onclick="x()">{{nope}}</div>', js: "fetch('/x')" },
    });
    expect(err.code).toBe("invalid_component");
    expect(err.text).toMatch(/Template line 1: onclick: event handlers aren't allowed/);
    expect(err.text).toMatch(/JavaScript line 1: fetch\(\) isn't allowed/);
    expect((await store.getDocument(siteId)).components).toBeUndefined();
  });

  it("updates compatibly, refuses breaking changes without a migration, and migrates with one", async () => {
    const { rpc, store, siteId } = await setup();
    await rpc.call("create_component", { component: quote });
    const ins = (
      await rpc.call("insert_component", {
        page: "/",
        name: "pull-quote",
        fields: { quote: "Hello" },
      })
    ).data;
    const ok = (
      await rpc.call("update_component", { name: "pull-quote", changes: { label: "Big quote" } })
    ).data;
    expect(ok.component.label).toBe("Big quote");
    const breaking = await rpc.callError("update_component", {
      name: "pull-quote",
      changes: {
        fields: { text: { kind: "text" } },
        defaults: { text: "x" },
        template: "<blockquote>{{text}}</blockquote>",
      },
    });
    expect(breaking.code).toBe("would_break");
    const migrated = (
      await rpc.call("update_component", {
        name: "pull-quote",
        changes: {
          version: 2,
          fields: { text: { kind: "text" } },
          defaults: { text: "x" },
          template: "<blockquote>{{text}}</blockquote>",
        },
        migrate: { rename: { quote: "text" }, remove: ["note"] },
      })
    ).data;
    expect(migrated.migratedSections).toBe(1);
    const doc = await store.getDocument(siteId);
    const b = Object.values(doc.pages)
      .flatMap((p) => p.sections)
      .flatMap((s) => s.blocks)
      .find((x) => x.id === ins.block);
    expect(b).toMatchObject({ v: 2, fields: { text: "Hello" } });
  });

  it("editors edit fields but can't create or change component code", async () => {
    const { rpc } = await setup({ grant: { ...OWNER, role: "editor" } });
    const err = await rpc.callError("create_component", { component: quote });
    expect(err.code).toBe("forbidden");
    expect(err.text).toMatch(/owners and designers/);
  });

  it("previews with screenshots through the component preview path", async () => {
    const requests: ScreenshotRequest[] = [];
    const { rpc } = await setup({
      store: {
        screenshot: async (_site, req) => {
          requests.push(req);
          return { base64: tinyPng(), mimeType: "image/png", width: req.width, height: 600 };
        },
      },
    });
    await rpc.call("create_component", { component: quote });
    const r = await rpc.call("preview_component", {
      name: "pull-quote",
      fields: { quote: "Hi" },
      theme: "dark",
    });
    expect(r.content.filter((c) => c.type === "image")).toHaveLength(2);
    expect(requests.map((q) => q.width)).toEqual([1440, 390]);
    expect(requests[0]?.path).toMatch(/^\/_os\/component\/pull-quote\/\?f=.+&t=dark$/);
    expect(requests[0]?.sectionId).toBe("sec_c0mp0nent0");
    expect(requests[0]?.html).toContain('data-os-component="pull-quote"');
    expect(r.data.findings).toEqual([]);
  });

  it("falls back to rendered HTML without screenshots", async () => {
    const { rpc } = await setup();
    await rpc.call("create_component", { component: quote });
    const r = await rpc.call("preview_component", { name: "pull-quote" });
    expect(r.content[0]?.text).toContain("Slow down; breathe.");
  });
});
