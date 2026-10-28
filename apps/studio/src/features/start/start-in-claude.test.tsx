import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { McpGrant } from "../../api/manage-types";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";

const grant = (over: Partial<McpGrant> = {}): McpGrant => ({
  id: "grant_claude",
  clientName: "Claude",
  sites: [],
  publish: false,
  create: false,
  allSites: false,
  createdAt: new Date().toISOString(),
  lastUsedAt: null,
  ...over,
});

const site = (over: Partial<Site> = {}): Site =>
  ({
    id: "st_kilnandco1",
    name: "Kiln & Co",
    tagline: null,
    repo: "sam-rivera/kiln-and-co",
    status: "live",
    url: "https://sam-rivera.github.io/kiln-and-co",
    template: "html",
    look: null,
    createdAt: new Date().toISOString(),
    inboxCount: 0,
    updateAvailable: false,
    owner: "sam-rivera",
    role: "owner",
    ...over,
  }) as Site;

describe("Start with Claude happens in Claude", () => {
  it("not connected yet: connect steps, then open Claude with a ready message; the form is one link away", async () => {
    const { user, router } = renderStudio("/start", { user: SAM }, undefined, (hub) => {
      hub.manage.grants = [];
    });
    expect(await screen.findByRole("heading", { name: "Start with Claude" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /Connect OpenSpace to Claude \(once\)/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/All my sites, including ones I make later/),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/what’s the site for/), "my pottery studio");
    const open = screen.getByRole("link", { name: /Open Claude with this message/ });
    const href = open.getAttribute("href") ?? "";
    expect(href).toMatch(/^https:\/\/claude\.ai\/new\?q=/);
    const message = decodeURIComponent(href.split("?q=")[1] ?? "");
    expect(message).toContain("make a new website with OpenSpace");
    expect(message).toContain("my pottery studio");
    expect(message).toContain("ask me a few questions");
    expect(screen.getByRole("button", { name: "Copy the message" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Prefer a quick form instead?" }));
    expect(router.state.location.pathname).toBe("/start/form");
    expect(await screen.findByLabelText("Site name")).toBeInTheDocument();
  });

  it("already connected and allowed to create: skips straight to Claude", async () => {
    renderStudio("/start", { user: SAM }, undefined, (hub) => {
      hub.manage.grants = [grant({ create: true })];
    });
    expect(await screen.findByRole("heading", { name: /Claude is connected/ })).toBeInTheDocument();
    expect(screen.queryByText(/Add custom connector/)).not.toBeInTheDocument();
  });

  it("connected but not allowed to create: one click fixes it", async () => {
    const { user, hub } = renderStudio("/start", { user: SAM }, undefined, (h) => {
      h.manage.grants = [grant({ create: false })];
    });
    await user.click(await screen.findByRole("button", { name: "Let Claude create my site" }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.method === "updateMcpGrant")?.args).toEqual([
        "grant_claude",
        { create: true },
      ]),
    );
    expect(await screen.findByRole("heading", { name: /Claude is connected/ })).toBeInTheDocument();
  });
});

describe("Allow Claude to edit a site (the link Claude gives)", () => {
  it("asks the signed-in person, then confirms", async () => {
    const { user, hub } = renderStudio(
      "/connect/allow?app=grant_claude&site=st_kilnandco1",
      { user: SAM },
      undefined,
      (h) => {
        h.state.sites.push(site());
        h.manage.grants = [grant({ create: true })];
      },
    );
    expect(
      await screen.findByRole("heading", { name: /Allow Claude to edit Kiln & Co\?/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/can’t publish unless you turn that on/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(
      await screen.findByRole("heading", { name: /Claude can edit Kiln & Co/ }),
    ).toBeInTheDocument();
    expect(hub.calls.find((c) => c.method === "allowMcpGrantSite")?.args).toEqual([
      "grant_claude",
      "st_kilnandco1",
    ]);
  });

  it("explains a link that isn't for this account", async () => {
    renderStudio(
      "/connect/allow?app=grant_other&site=st_kilnandco1",
      { user: SAM },
      undefined,
      (h) => {
        h.state.sites.push(site());
        h.manage.grants = [grant()];
      },
    );
    expect(await screen.findByText("This link doesn’t match your account")).toBeInTheDocument();
  });

  it("asks people who aren't signed in to sign in first", async () => {
    renderStudio("/connect/allow?app=grant_claude&site=st_kilnandco1");
    expect(await screen.findByRole("heading", { name: "Sign in to allow it" })).toBeInTheDocument();
  });
});

describe("Apps with access", () => {
  it("shows and toggles 'all my sites' and 'create sites' (publishing stays separate)", async () => {
    const { user, hub } = renderStudio("/connect", { user: SAM }, undefined, (h) => {
      h.manage.grants = [grant({ create: true, allSites: true })];
    });
    expect(await screen.findByText(/All your sites, including new ones/)).toBeInTheDocument();
    const all = screen.getByRole("switch", {
      name: "Claude can edit all my sites, including ones I make later",
    });
    expect(all).toBeChecked();
    expect(screen.getByRole("switch", { name: "Claude can publish" })).not.toBeChecked();
    await user.click(all);
    await waitFor(() =>
      expect(hub.calls.find((c) => c.method === "updateMcpGrant")?.args).toEqual([
        "grant_claude",
        { allSites: false },
      ]),
    );
  });
});

describe("Let Claude edit a site made in Studio", () => {
  it("offers one click on the hand-off screen when Claude is connected but can't reach the site", async () => {
    const { user, hub } = renderStudio("/start/st_kilnandco1", { user: SAM }, undefined, (h) => {
      h.state.sites.push(site());
      h.manage.grants = [grant({ create: true, sites: [] })];
    });
    const offer = await screen.findByRole("button", { name: "Let Claude edit this site" });
    await user.click(offer);
    await waitFor(() =>
      expect(hub.calls.find((c) => c.method === "allowMcpGrantSite")?.args).toEqual([
        "grant_claude",
        "st_kilnandco1",
      ]),
    );
    expect(await screen.findByText(/Claude can edit\s+Kiln & Co/)).toBeInTheDocument();
  });
});
