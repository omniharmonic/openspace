import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import { HubError, type Site } from "../../api/types";
import { SlowLoading } from "../../app/Connection";
import { renderStudio, SAM } from "../../test/render";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const SITE = (sites[0] as Site).id;

describe("the editor never sits on a spinner it can't explain", () => {
  it("says it can't reach OpenSpace (not 'being set up') while status checks fail, then opens once the site is live", async () => {
    // The phone remembers the site as "building" (from the move); the next checks can't reach
    // the Hub; then the Hub answers: the site has been live all along.
    let calls = 0;
    let reachable = false;
    renderStudio(`/sites/${SITE}`, { user: SAM, sites }, undefined, (h) => {
      const real = h.getSite.bind(h);
      h.getSite = async (id: string) => {
        calls++;
        const site = await real(id);
        if (calls === 1) return { ...site, status: "building" } as Site;
        if (!reachable) throw new HubError(0, "network", "OpenSpace isn’t answering right now.");
        return site;
      };
    });
    expect(await screen.findByText(/We can’t reach OpenSpace right now/)).toBeInTheDocument();
    expect(screen.queryByText(/still being set up/)).not.toBeInTheDocument();
    reachable = true;
    // Polling carries on through the failures: the editor opens on the live site.
    await waitFor(() => expect(screen.queryByText(/We can’t reach OpenSpace/)).toBeNull(), {
      timeout: 10_000,
    });
    expect(await screen.findByRole("button", { name: /Publish/ })).toBeEnabled();
  });

  it("offers a way out when opening takes too long", async () => {
    render(<SlowLoading label="Opening the editor" afterMs={20} />);
    expect(screen.getByText("Opening the editor")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "This is taking longer than usual" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to your sites" })).toBeInTheDocument();
  });
});
