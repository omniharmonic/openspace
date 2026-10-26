import { compileStyles, contrastRatio } from "@openspace/theme";
import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  fetchImage,
  imageSize,
  MAX_IMAGE_BYTES,
  sniffImage,
  stripMetadata,
} from "./images";
import { templatesFromModule } from "./templates";
import { meadowDoc, setup, tinyPng } from "./test-helpers";

describe("styles are contrast-checked", () => {
  it("moves an unreadable override to the nearest accessible shade and explains it", async () => {
    const { rpc, store, siteId } = await setup();
    const r = (await rpc.call("set_styles", { overrides: { set: { "color.accent": "#f4f1ea" } } }))
      .data;
    expect(r.contrastAdjustments.length).toBeGreaterThan(0);
    expect(r.contrastAdjustments.join(" ")).toMatch(/accent/);
    const doc = await store.getDocument(siteId);
    const raw = compileStyles(doc.styles, { solve: false });
    // What is stored is what is published: no override-driven failures remain.
    expect(
      raw.contrast.failures.filter(
        (f) => f.theme === "light" && (f.fg === "accent" || f.bg === "accent"),
      ),
    ).toEqual([]);
  });

  it("refuses the same override in reject mode, leaving styles unchanged", async () => {
    const { rpc, store, siteId } = await setup();
    const before = structuredClone((await store.getDocument(siteId)).styles);
    const e = await rpc.callError("set_styles", {
      overrides: { set: { "color.accent": "#f4f1ea" } },
      onContrast: "reject",
    });
    expect(e.code).toBe("contrast");
    expect(e.text).toMatch(/fail WCAG AA/);
    expect((await store.getDocument(siteId)).styles).toEqual(before);
  });

  it("applies palettes and choices, rejects unknown pairings and invalid values with paths", async () => {
    const { rpc, store, siteId } = await setup();
    const r = (
      await rpc.call("set_styles", {
        palette: "harbor",
        choices: { pairing: "newsreader-public-sans", shape: "sharp" },
      })
    ).data;
    expect(r.styles.pairing.id).toBe("newsreader-public-sans");
    const doc = await store.getDocument(siteId);
    expect(doc.styles.choices.shape).toBe("sharp");
    const t = compileStyles(doc.styles).tokens.themes.light;
    expect(contrastRatio(t.text, t.background)).toBeGreaterThanOrEqual(4.5);
    expect(
      (await rpc.callError("set_styles", { choices: { pairing: "comic-sans" } })).text,
    ).toMatch(/Unknown type pairing/);
    const bad = await rpc.callError("set_styles", { choices: { shape: "wobbly" } });
    expect(bad.code).toBe("invalid_arguments");
    expect(bad.text).toMatch(/choices\.shape/);
    expect((await rpc.callError("set_styles", { palette: "neon" })).text).toMatch(
      /Unknown palette/,
    );
    const styles = (await rpc.call("get_styles")).data;
    expect(styles.options.pairings.length).toBeGreaterThan(10);
    expect(styles.themes.dark.text).toMatch(/^#/);
  });

  it("applies template looks (built-in and store-provided) with the same checks", async () => {
    const { rpc, store, siteId } = await setup();
    const list = (await rpc.call("list_templates")).data;
    expect(list.source).toBe("built-in");
    expect(list.templates).toHaveLength(12);
    for (const t of list.templates) expect(t.looks).toHaveLength(3);
    await rpc.call("apply_template_look", { template: "signal", look: "alternate" });
    expect((await store.getDocument(siteId)).styles.choices.pairing).toBe("bricolage-geist");
    // Every built-in look is valid Site Styles and compiles with no contrast failures.
    const doc = await meadowDoc();
    const { loadTemplates } = await import("./templates");
    for (const t of (await loadTemplates(store)).templates)
      for (const look of t.looks) {
        const c = compileStyles({ choices: look.choices });
        expect(
          c.warnings.filter((w) => w.code === "unknown-pairing"),
          `${t.id}/${look.id}`,
        ).toEqual([]);
        expect(c.contrast.failures, `${t.id}/${look.id}`).toEqual([]);
      }
    const e = await rpc.callError("apply_template_look", { template: "signal", look: "nope" });
    expect(e.text).toMatch(/Looks: signature, alternate, high-contrast/);

    const injected = await setup({
      store: {
        templates: {
          list: () => [
            {
              id: "custom",
              name: "Custom",
              looks: [
                {
                  id: "one",
                  name: "One",
                  choices: { ...doc.styles.choices, pairing: "outfit", buttons: "pill-solid" },
                },
              ],
            },
          ],
        },
      },
    });
    expect((await injected.rpc.call("list_templates")).data.source).toBe("store");
    await injected.rpc.call("apply_template_look", { template: "custom" });
    expect((await injected.store.getDocument(injected.siteId)).styles.choices.pairing).toBe(
      "outfit",
    );
  });

  it("normalises template registry module shapes", async () => {
    const choices = (await meadowDoc()).styles.choices;
    const viaLoad = await templatesFromModule({
      TEMPLATE_IDS: ["meadow"],
      loadTemplate: async (id: string) => ({
        template: {
          id,
          name: "Meadow",
          looks: [
            { name: "Soft Sage", choices },
            { name: "broken", choices: { x: 1 } },
          ],
        },
      }),
    });
    expect(viaLoad?.[0]?.looks.map((l) => l.id)).toEqual(["soft-sage"]);
    expect(
      await templatesFromModule({
        templates: { a: { id: "a", looks: [{ id: "l", styles: { choices } }] } },
      }),
    ).toHaveLength(1);
    expect(await templatesFromModule({ nothing: true })).toBeNull();
  });
});

describe("guards", () => {
  it("destructive tools need confirm: true", async () => {
    const { rpc, store, siteId } = await setup();
    const doc = await store.getDocument(siteId);
    const about = Object.values(doc.pages).find((p) => p.slug === "about");
    expect(about).toBeTruthy();
    const e = await rpc.callError("delete_page", { page: "about" });
    expect(e.code).toBe("confirmation_required");
    expect((await store.getDocument(siteId)).pages[about?.id as never]).toBeTruthy();
    await rpc.call("delete_page", { page: "about", confirm: true });
    const after = await store.getDocument(siteId);
    expect(after.pages[about?.id as never]).toBeUndefined();
    expect(JSON.stringify(after.site.nav)).not.toContain(about?.id as string);

    expect((await rpc.callError("discard_draft", {})).code).toBe("confirmation_required");
    const d = (await rpc.call("discard_draft", { confirm: true })).data;
    expect(d.discarded).toBe(true);
    expect((await store.getDocument(siteId)).pages[about?.id as never]).toBeTruthy();
  });

  it("publish needs the grant's publish permission and confirm", async () => {
    const noPublish = await setup({ grant: { sites: "*", publish: false } });
    await noPublish.rpc.call("update_site", { set: { tagline: "Slow yoga by the creek" } });
    const e = await noPublish.rpc.callError("publish", { confirm: true });
    expect(e.code).toBe("forbidden");
    expect(
      (await noPublish.rpc.callError("rollback", { version: "v0001", confirm: true })).code,
    ).toBe("forbidden");

    const { rpc } = await setup();
    expect((await rpc.call("publish", { confirm: true })).data.status).toBe("no_changes");
    await rpc.call("update_site", { set: { tagline: "Slow yoga by the creek" } });
    expect((await rpc.callError("publish", {})).code).toBe("confirmation_required");
    const p = (await rpc.call("publish", { confirm: true })).data;
    expect(p.status).toBe("published");
    expect((await rpc.call("get_draft_diff")).data.hasChanges).toBe(false);
    const versions = (await rpc.call("list_versions")).data.versions;
    expect(versions).toHaveLength(2);
    expect((await rpc.callError("rollback", { version: versions[1].version })).code).toBe(
      "confirmation_required",
    );
    await rpc.call("rollback", { version: versions[1].version, confirm: true });
  });

  it("refuses custom code, other sites and role-forbidden edits", async () => {
    const { rpc } = await setup();
    expect(
      (await rpc.callError("update_site", { set: { headInjection: "<script>x</script>" } })).code,
    ).toBe("forbidden");
    expect((await rpc.callError("get_site", { site: "st_other00000" })).code).toBe("forbidden");
    const editor = await setup({ grant: { sites: "*", publish: false, role: "editor" } });
    const e = await editor.rpc.callError("set_styles", { choices: { shape: "round" } });
    expect(e.code).toBe("forbidden");
    expect(e.text).toMatch(/editor/);
  });

  it("starts an agent session (with a snapshot) on the first edit and ends it on close", async () => {
    const { rpc, store, server, siteId } = await setup();
    await rpc.call("get_site");
    expect(store.opLog(siteId)).toHaveLength(0);
    await rpc.call("update_site", { set: { tagline: "Breathe" } });
    await rpc.call("update_site", { set: { tagline: "Breathe in" } });
    const log = store.opLog(siteId);
    expect(log).toHaveLength(2);
    expect(log[0]?.actor).toMatch(/^agent:/);
    expect(log[0]?.session).toBe(log[1]?.session);
    const sessionId = log[0]?.session as string;
    const sess = store.session(siteId, sessionId);
    expect(sess?.snapshot).toMatch(/^os\/snap\/agent-/);
    expect(store.snapshotDoc(siteId, sess?.snapshot as string)?.site.tagline).not.toBe("Breathe");
    await server.close();
    expect(store.session(siteId, sessionId)?.ended).toBe(true);
  });
});

describe("restores go through ops", () => {
  it("discard and rollback replay validated ops, and documents handed out are frozen copies", async () => {
    const { rpc, store, siteId } = await setup();
    const doc = await store.getDocument(siteId);
    expect(Object.isFrozen(doc.site)).toBe(true);
    expect(() => {
      (doc.site as { title: string }).title = "Hacked";
    }).toThrow();
    await rpc.call("update_site", { set: { tagline: "Draft tagline" } });
    const before = store.opLog(siteId).length;
    await rpc.call("discard_draft", { confirm: true });
    const restoreOps = store.opLog(siteId).slice(before);
    expect(restoreOps.length).toBeGreaterThan(0);
    expect(restoreOps.every((e) => e.op.id.startsWith("restore_"))).toBe(true);
    expect((await store.getDocument(siteId)).site.tagline).not.toBe("Draft tagline");

    await rpc.call("update_site", { set: { tagline: "Published tagline" } });
    await rpc.call("publish", { confirm: true });
    const versions = (await rpc.call("list_versions")).data.versions;
    const n = store.opLog(siteId).length;
    await rpc.call("rollback", { version: versions[1].version, confirm: true });
    expect(store.opLog(siteId).length).toBeGreaterThan(n);
    expect((await store.getDocument(siteId)).site.tagline).not.toBe("Published tagline");
  });

  it("discard_draft needs designer or owner when the grant has a role", async () => {
    const editor = await setup({ grant: { sites: "*", publish: true, role: "editor" } });
    const e = await editor.rpc.callError("discard_draft", { confirm: true });
    expect(e.code).toBe("forbidden");
    const designer = await setup({ grant: { sites: "*", publish: true, role: "designer" } });
    await designer.rpc.call("discard_draft", { confirm: true });
  });

  it("per-site roles override the grant's role for that site", async () => {
    const doc = await meadowDoc();
    const siteId = doc.config.siteId as string;
    const asDesigner = await setup({
      doc,
      grant: { sites: "*", publish: true, role: "editor", roles: { [siteId]: "designer" } },
    });
    await asDesigner.rpc.call("discard_draft", { confirm: true });
    const asEditor = await setup({
      grant: { sites: "*", publish: true, role: "designer", roles: { [siteId]: "editor" } },
    });
    expect((await asEditor.rpc.callError("discard_draft", { confirm: true })).code).toBe(
      "forbidden",
    );
  });
});

describe("editing tools", () => {
  it("inserts, updates, moves and deletes sections and blocks with precise errors", async () => {
    const { rpc } = await setup();
    const page = (await rpc.call("create_page", { title: "Workshops", addToNav: false })).data.page
      .id;
    const s = (
      await rpc.call("insert_section", { page, preset: "hero/centered", colorTheme: "dark" })
    ).data.section;
    expect(s.theme).toBe("dark");
    const explicit = (
      await rpc.call("insert_section", {
        page,
        section: {
          blocks: [
            {
              type: "text",
              fields: {
                content: "## Inversions clinic\n\nTwo hours on headstands, *without fear*.",
              },
            },
          ],
        },
      })
    ).data.section;
    expect(explicit.blocks[0].text).toContain("Inversions clinic");
    const blk = (
      await rpc.call("insert_block", {
        page,
        section: explicit.id,
        block: {
          type: "button",
          fields: { label: "Book a spot", link: { type: "url", url: "https://example.com/book" } },
        },
      })
    ).data.block;
    expect(blk.type).toBe("button");
    const unknown = await rpc.callError("insert_block", {
      page,
      section: explicit.id,
      block: { type: "hologram" },
    });
    expect(unknown.text).toMatch(/Unknown block type "hologram"/);
    const badField = await rpc.callError("insert_block", {
      page,
      section: explicit.id,
      block: { type: "button", fields: { label: 42 } },
    });
    expect(badField.code).toBe("rejected");
    expect(badField.text).toMatch(/label/);
    expect(badField.text).toMatch(/Nothing was changed/);
    await rpc.call("update_section", {
      page,
      section: explicit.id,
      colorTheme: "light-accent",
      set: { label: "Clinic" },
    });
    await rpc.call("move_section", { page, section: explicit.id, at: "start" });
    const order = (await rpc.call("get_page", { page, detail: "outline" })).data.sections.map(
      (x: { id: string }) => x.id,
    );
    expect(order[0]).toBe(explicit.id);
    await rpc.call("move_block", { page, block: blk.id, to: { section: s.id, at: "start" } });
    await rpc.call("delete_block", { page, block: blk.id });
    await rpc.call("delete_section", { page, section: s.id });
    expect((await rpc.callError("delete_section", { page, section: s.id })).code).toBe("not_found");
    expect((await rpc.callError("get_page", { page: "nowhere" })).text).toMatch(/Pages:/);
    const footer = (await rpc.call("get_page", { page: "footer", detail: "outline" })).data;
    expect(footer.sections).toHaveLength(1);
  });

  it("places blocks in grid sections and regenerates the mobile layout", async () => {
    const { rpc } = await setup();
    const page = (
      await rpc.call("create_page", {
        title: "Studio",
        presets: ["hero/editorial-overlap"],
        addToNav: false,
      })
    ).data;
    const section = page.sections[0];
    const blockId = section.blocks[0].id;
    const placed = (
      await rpc.call("place_in_grid", {
        page: page.page.id,
        section: section.id,
        block: blockId,
        d: { x: 2, y: 1, w: 10, h: 6 },
        m: null,
      })
    ).data;
    expect(placed.placement.d).toMatchObject({ x: 2, w: 10 });
    expect(placed.placement.m).toBeUndefined();
    const auto = (await rpc.call("auto_mobile_layout", { page: page.page.id, section: section.id }))
      .data;
    expect(auto.changed).toBeGreaterThan(0);
    expect(auto.mobile[blockId]).toMatchObject({ x: 1 });
    const overflow = await rpc.callError("place_in_grid", {
      page: page.page.id,
      section: section.id,
      block: blockId,
      d: { x: 20, y: 1, w: 10, h: 2 },
    });
    expect(overflow.text).toMatch(/overflows the 24-column grid/);
  });

  it("design_check ids drive apply_fix", async () => {
    const { rpc } = await setup();
    const page = (
      await rpc.call("create_page", {
        title: "Twice",
        presets: ["hero/centered", "hero/split-image"],
        addToNav: false,
      })
    ).data.page.id;
    const check = (await rpc.call("design_check", { page, checks: ["design"] })).data;
    const multi = check.issues.find((i: { rule: string }) => i.rule === "heading-multiple-h1");
    expect(multi?.autofix).toBeTruthy();
    const r = (await rpc.call("apply_fix", { issues: [multi.id, "made-up:id"] })).data;
    expect(r.applied.map((a: { id: string }) => a.id)).toEqual([multi.id]);
    expect(r.skipped[0].id).toBe("made-up:id");
    const again = (await rpc.call("design_check", { page, checks: ["design"] })).data;
    expect(again.issues.some((i: { rule: string }) => i.rule === "heading-multiple-h1")).toBe(
      false,
    );
  });

  it("creates pages from explicit sections, updates pages, nav and posts", async () => {
    const { rpc, store, siteId } = await setup();
    const p = (
      await rpc.call("create_page", {
        title: "Gift cards",
        sections: [
          {
            blocks: [
              { type: "text", fields: { content: "# Gift cards\n\nGive a month of classes." } },
            ],
          },
        ],
        navLabel: "Gifts",
      })
    ).data;
    await rpc.call("update_page", {
      page: p.page.id,
      set: { "seo.description": "Gift a month of small-group yoga classes at Meadow." },
    });
    const doc = await store.getDocument(siteId);
    expect(doc.pages[p.page.id as never]?.seo?.description).toMatch(/Gift a month/);
    const nav = doc.site.nav.filter((n) => n.type !== "button");
    await rpc.call("update_navigation", { tree: nav });
    expect(
      (
        await rpc.callError("update_navigation", {
          tree: [{ type: "page", page: "pg_missing000" }],
        })
      ).code,
    ).toBe("rejected");

    const post = (
      await rpc.call("create_post", {
        title: "Spring retreat dates",
        body: "We're heading to the foothills in **April**.",
        tags: ["retreats"],
      })
    ).data;
    expect(post.collection).toBe("journal");
    expect(post.item.status).toBe("draft");
    await rpc.call("update_post", {
      slug: post.item.slug,
      set: { status: "published", excerpt: "Dates for April." },
    });
    const posts = (await rpc.call("list_posts", { status: "published", withBody: true })).data
      .items;
    expect(
      posts.some(
        (i: { slug: string; body: string }) =>
          i.slug === post.item.slug && i.body.includes("April"),
      ),
    ).toBe(true);
    expect(
      (await rpc.callError("create_post", { title: "x", body: "y", date: "tomorrow" })).text,
    ).toMatch(/date/);
  });

  it("create_post passes date to every kind whose frontmatter has one (podcast, events without)", async () => {
    const { rpc } = await setup();
    const ep = (
      await rpc.call("create_post", {
        collection: "podcast",
        title: "Episode two: breathing out",
        body: "A short practice for evenings.",
        date: "2026-11-02",
        frontmatter: {
          audio: { src: "media/podcast/slow-mornings-01.mp3", duration: 900, mime: "audio/mpeg" },
        },
      })
    ).data;
    expect(ep.item.date).toBe("2026-11-02");
    const ev = (
      await rpc.call("create_post", {
        collection: "events",
        title: "Equinox restorative workshop",
        body: "Two slow hours.",
        date: "2026-11-21",
        frontmatter: { start: "2026-11-21T14:00:00-08:00", end: "2026-11-21T16:00:00-08:00" },
      })
    ).data;
    expect(ev.item.date).toBeUndefined();
    expect(ev.item.slug).toMatch(/^2026-11-21-/);
    expect(
      (
        await rpc.callError("create_post", {
          collection: "events",
          title: "No offset",
          body: "x",
          frontmatter: { start: "2026-11-21T14:00:00" },
        })
      ).text,
    ).toMatch(/start/);
  });

  it("uploads images (strips metadata, records size) and refuses oversized ones without a resizer", async () => {
    const { rpc, store, siteId } = await setup();
    const r = (
      await rpc.call("upload_image", {
        base64: tinyPng(3, 2, true),
        alt: "Mats rolled by the window",
        filename: "Mats.png",
      })
    ).data;
    expect(r.src).toMatch(/^media\/2026\/10\/mats-[a-z0-9]{4}\.png$/);
    expect([r.width, r.height]).toEqual([3, 2]);
    const bytes = store.mediaBytes(siteId, r.src) as Uint8Array;
    expect(Buffer.from(bytes).includes(Buffer.from("tEXt"))).toBe(false);
    expect((await store.getDocument(siteId)).media[r.src]?.alt).toBe("Mats rolled by the window");
    const big = await rpc.callError("upload_image", { base64: tinyPng(3000, 2000), alt: "Big" });
    expect(big.code).toBe("too_large");
    expect(big.text).toMatch(/2400/);
    expect((await rpc.callError("upload_image", { base64: "aGVsbG8=", alt: "" })).code).toBe(
      "unsupported_image",
    );
    expect(
      (await rpc.callError("upload_image", { url: "http://insecure.example/a.png", alt: "x" }))
        .text,
    ).toMatch(/https/);
  });
});

describe("look at the design", () => {
  it("renders whole pages, single sections and fragments", async () => {
    const { rpc, store, siteId } = await setup();
    const doc = await store.getDocument(siteId);
    const home = Object.values(doc.pages).find((p) => p.slug === "");
    const sec = home?.sections[0]?.id as string;
    const page = (await rpc.call("render_page", { page: "/" })).content[0]?.text as string;
    expect(page.startsWith("<!doctype html") || page.startsWith("<!DOCTYPE html")).toBe(true);
    const one = (await rpc.call("render_page", { page: "/", section: sec })).content[0]
      ?.text as string;
    expect(one).toContain(`data-os-id="${sec}"`);
    expect(one.length).toBeLessThan(page.length);
    const frag = (await rpc.call("render_page", { page: "/", section: sec, fragment: true }))
      .content[0]?.text as string;
    expect(frag.startsWith("<")).toBe(true);
    expect(frag).not.toContain("<html");
  });

  it("returns PNG screenshots from the store's provider, and a helpful error without one", async () => {
    const { rpc } = await setup();
    const none = await rpc.callError("screenshot", { page: "/" });
    expect(none.code).toBe("unsupported");
    expect(none.text).toMatch(/render_page/);

    const calls: Array<{ device: string; width: number; html: string }> = [];
    const withShots = await setup({
      store: {
        previewBaseUrl: "http://localhost:4400",
        screenshot: async (_site, req) => {
          calls.push(req);
          return { base64: tinyPng(), mimeType: "image/png", width: req.width, height: 900 };
        },
      },
    });
    const r = await withShots.rpc.call("screenshot", { page: "/", device: "all" });
    expect(calls.map((c) => c.width)).toEqual([1440, 834, 390]);
    expect(calls[0]?.html).toContain("<main");
    const images = r.content.filter((c) => c.type === "image");
    expect(images).toHaveLength(3);
    expect(images[0]?.mimeType).toBe("image/png");
    expect(r.data.url).toBe(`http://localhost:4400/${withShots.siteId}/`);
    expect((await withShots.rpc.call("preview", { page: "about" })).data.url).toMatch(/\/about\/$/);
  });
});

describe("resources and prompts", () => {
  it("lists and reads resources", async () => {
    const { rpc, siteId } = await setup();
    const { resources } = (await rpc.request("resources/list")) as {
      resources: Array<{ uri: string }>;
    };
    const uris = resources.map((r) => r.uri);
    for (const u of [
      "openspace://guidance/design",
      "openspace://presets",
      "openspace://schemas/blocks",
      `openspace://sites/${siteId}/tokens`,
      `openspace://sites/${siteId}/agents-md`,
    ])
      expect(uris).toContain(u);
    const read = async (uri: string) =>
      (
        (await rpc.request("resources/read", { uri })) as {
          contents: Array<{ text: string; mimeType: string }>;
        }
      ).contents[0] as { text: string; mimeType: string };
    expect((await read("openspace://guidance/design")).text).toContain("Two typefaces maximum");
    expect(JSON.parse((await read("openspace://presets")).text).length).toBeGreaterThan(90);
    expect(JSON.parse((await read("openspace://schemas/blocks/button")).text).type).toBe("object");
    expect(JSON.parse((await read("openspace://schemas/page")).text)).toBeTruthy();
    const tokens = JSON.parse((await read(`openspace://sites/${siteId}/tokens`)).text);
    expect(tokens.tokens.themes.light.text).toMatch(/^#/);
    expect((await read(`openspace://sites/${siteId}/agents-md`)).text).toContain("openspace mcp");
    const missing = await rpc.raw("resources/read", { uri: "openspace://nope" });
    expect(missing.error?.code).toBe(-32002);
    const templates = (await rpc.request("resources/templates/list")) as {
      resourceTemplates: unknown[];
    };
    expect(templates.resourceTemplates.length).toBe(3);
  });

  it("lists and renders prompts", async () => {
    const { rpc } = await setup();
    const { prompts } = (await rpc.request("prompts/list")) as { prompts: Array<{ name: string }> };
    expect(prompts.map((p) => p.name)).toEqual([
      "design-a-page",
      "restyle-site",
      "write-blog-post",
      "iterate-design",
    ]);
    const p = (await rpc.request("prompts/get", {
      name: "iterate-design",
      arguments: { page: "home", goal: "calmer mobile" },
    })) as {
      messages: Array<{ content: { text: string } }>;
    };
    expect(p.messages[0]?.content.text).toContain("screenshot");
    expect(p.messages[0]?.content.text).toContain("calmer mobile");
    const missing = await rpc.raw("prompts/get", { name: "design-a-page", arguments: {} });
    expect(missing.error?.message).toMatch(/brief/);
  });
});

describe("fetchImage", () => {
  const png = base64ToBytes(tinyPng(2, 2));
  const respond = (body: ConstructorParameters<typeof Response>[0], init: ResponseInit) =>
    new Response(body, init);

  it("downloads https images and follows https redirects", async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      if (url.endsWith("/start"))
        return respond(null, {
          status: 302,
          headers: { location: "https://cdn.example/final.png" },
        });
      return respond(png as unknown as BodyInit, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await fetchImage("https://img.example/start", f);
    expect(r.name).toBe("final.png");
    expect(r.bytes.length).toBe(png.length);
    expect(calls).toEqual(["https://img.example/start", "https://cdn.example/final.png"]);
  });

  it("refuses redirects to http, oversized content-length and oversized streams", async () => {
    const toHttp = (async () =>
      respond(null, {
        status: 301,
        headers: { location: "http://plain.example/a.png" },
      })) as unknown as typeof fetch;
    await expect(fetchImage("https://img.example/a", toHttp)).rejects.toThrow(/non-https/);
    const declared = (async () =>
      respond("x", {
        status: 200,
        headers: { "content-length": String(MAX_IMAGE_BYTES + 1) },
      })) as unknown as typeof fetch;
    await expect(fetchImage("https://img.example/a", declared)).rejects.toThrow(/15 MB/);
    let pulled = 0;
    const endless = (async () =>
      respond(
        new ReadableStream({
          pull(c) {
            pulled++;
            c.enqueue(new Uint8Array(1024 * 1024));
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    await expect(fetchImage("https://img.example/a", endless)).rejects.toThrow(/15 MB/);
    expect(pulled).toBeLessThan(40);
  });
});

describe("image helpers", () => {
  it("sniffs and measures formats and strips JPEG EXIF", () => {
    const png = base64ToBytes(tinyPng(7, 5));
    expect(sniffImage(png)).toBe("png");
    expect(imageSize(png)).toEqual({ width: 7, height: 5 });
    // JPEG: SOI, APP1 (Exif), SOF0 8x4, SOS, data, EOI.
    const app1 = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
    const sof = [0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x04, 0x00, 0x08, 0x01, 0x01, 0x11, 0x00];
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      ...app1,
      ...sof,
      0xff,
      0xda,
      0x00,
      0x02,
      0x12,
      0x34,
      0xff,
      0xd9,
    ]);
    expect(imageSize(jpeg)).toEqual({ width: 8, height: 4 });
    const stripped = stripMetadata(jpeg);
    expect(stripped.length).toBe(jpeg.length - app1.length);
    expect(imageSize(stripped)).toEqual({ width: 8, height: 4 });
  });
});
