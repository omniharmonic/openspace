import { describe, expect, it } from "vitest";
import { TEMPLATE_FIXTURES } from "./fixtures";
import { createMockHub } from "./mock";

describe("createMockHub", () => {
  it("serves the six launch templates with three looks each", async () => {
    const hub = createMockHub();
    const templates = await hub.listTemplates();
    expect(templates.map((t) => t.id)).toEqual([
      "meadow",
      "harbor",
      "atelier",
      "ledger",
      "hearth",
      "signal",
    ]);
    for (const t of templates) expect(t.looks).toHaveLength(3);
  });

  it("requires sign-in for sites and offers dev auth", async () => {
    const hub = createMockHub();
    expect(await hub.getSession()).toEqual({ user: null, auth: { github: true, dev: true } });
    await expect(hub.listSites()).rejects.toMatchObject({ status: 401 });
    const user = await hub.devLogin("Ana Ortiz");
    expect(user).toMatchObject({ login: "ana-ortiz", name: "Ana Ortiz" });
    expect((await hub.getSession()).user?.login).toBe("ana-ortiz");
    await hub.logout();
    expect((await hub.getSession()).user).toBeNull();
  });

  it("creates a site that is building, then live once the setup time passes", async () => {
    let t = 1_000;
    const hub = createMockHub({ buildMs: 500, now: () => t });
    await hub.devLogin("Ana");
    const site = await hub.createSite({
      template: "meadow",
      look: "oat",
      name: "Willow Street Yoga",
      tagline: "Slow classes",
    });
    expect(site.id).toMatch(/^st_[0-9a-hjkmnp-tv-z]{10}$/);
    expect(site).toMatchObject({
      status: "building",
      url: "https://ana.github.io/willow-street-yoga",
      inboxCount: 0,
    });
    expect((await hub.getSite(site.id)).status).toBe("building");
    t += 500;
    expect((await hub.getSite(site.id)).status).toBe("live");
    expect((await hub.listSites()).map((s) => s.id)).toEqual([site.id]);
  });

  it("marks configured templates as failed", async () => {
    let t = 0;
    const hub = createMockHub({ buildMs: 10, now: () => t, failTemplates: ["hearth"] });
    await hub.devLogin("Ana");
    const site = await hub.createSite({
      template: "hearth",
      look: "cream",
      name: "Pan",
      tagline: "",
    });
    t = 10;
    expect((await hub.getSite(site.id)).status).toBe("failed");
  });

  it("rejects unknown templates and empty names", async () => {
    const hub = createMockHub({ user: { id: "u", login: "u", name: "U", avatarUrl: null } });
    await expect(
      hub.createSite({ template: "nope", look: "x", name: "A", tagline: "" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      hub.createSite({ template: "meadow", look: "oat", name: " ", tagline: "" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("seeds demo sites on sign-in and transfers ownership", async () => {
    const hub = createMockHub({ sites: "demo" });
    await hub.startGitHubSignIn({});
    const sites = await hub.listSites();
    expect(sites.length).toBe(3);
    const own = sites.find((s) => s.owner === "sam-rivera");
    if (!own) throw new Error("expected an owned demo site");
    const res = await hub.transferSite(own.id, "@client-co");
    expect(res.status).toBe("complete");
    expect(res.site).toMatchObject({ owner: "client-co", role: "designer" });
    await expect(hub.transferSite(own.id, "again")).rejects.toMatchObject({ status: 403 });
  });

  it("does not leak internal state through returned objects", async () => {
    const hub = createMockHub();
    const templates = await hub.listTemplates();
    (templates[0] as { name: string }).name = "changed";
    expect(TEMPLATE_FIXTURES[0]?.name).toBe("Meadow");
  });
});
