import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";

const base = demoSites(SAM.login, Date.UTC(2026, 9, 1))[0] as Site;
const waiting: Site = {
  ...base,
  status: "failed",
  statusDetail: "One more step: give OpenSpace permission on GitHub.",
  github: { access: "install", connectUrl: "http://localhost:8787/auth/github/install?site=x" },
};

describe("GitHub install step", () => {
  it("a site waiting for GitHub opens the friendly one-more-step screen, never the generic error", async () => {
    renderStudio(`/sites/${waiting.id}`, { user: SAM, sites: [waiting] });
    expect(
      await screen.findByRole("heading", { name: "One more step: let OpenSpace save your site" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t finish setting up/i)).not.toBeInTheDocument();
    expect(screen.getByText(/All repositories/)).toBeInTheDocument();
    const go = screen.getByRole("link", { name: /Continue to GitHub/ });
    expect(go).toHaveAttribute("href", waiting.github?.connectUrl);
  });

  it("explains a cancelled install and offers Try again", async () => {
    renderStudio(`/sites/${waiting.id}?github=cancelled`, { user: SAM, sites: [waiting] });
    expect(await screen.findByText(/GitHub step wasn’t finished/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("a live site that lost access asks to reconnect", async () => {
    const lost: Site = { ...waiting, status: "live" };
    renderStudio(`/sites/${lost.id}`, { user: SAM, sites: [lost] });
    expect(
      await screen.findByRole("heading", { name: `Reconnect ${lost.name} to GitHub` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reconnect GitHub/ })).toBeInTheDocument();
  });

  it("the dashboard card offers Connect GitHub instead of a generic retry", async () => {
    renderStudio("/sites", { user: SAM, sites: [waiting] });
    const card = await screen.findByRole("article", { name: waiting.name });
    expect(within(card).getByText("One more step")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Connect GitHub" })).toHaveAttribute(
      "href",
      waiting.github?.connectUrl,
    );
  });
});

describe("Connect your AI before having a site", () => {
  it("is reachable from an empty dashboard and puts the Claude app first", async () => {
    const { user, router } = renderStudio("/sites", { user: SAM, sites: [] });
    await screen.findByRole("heading", { name: "Make your first site" });
    await user.click(screen.getByRole("button", { name: "Connect your AI" }));
    expect(router.state.location.pathname).toBe("/connect");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toMatch(/Recommended: the Claude app/);
    expect(screen.getByText("http://localhost:8787/mcp")).toBeInTheDocument();
    expect(screen.getByText("/plugin install openspace@openspace")).toBeInTheDocument();
    expect(
      screen.getByText("claude plugin marketplace add omniharmonic/openspace"),
    ).toBeInTheDocument();
  });
});
