import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderStudio, SAM } from "../../test/render";
import { publishStory } from "./MoveProgress";

const FAST_IMPORT = { importStepMs: 15 };

describe("Move my site (hosted import)", () => {
  it("is offered next to the templates", async () => {
    const { user, router } = renderStudio("/templates");
    const link = await screen.findByRole("link", {
      name: /Already have a site\? Move it to OpenSpace/,
    });
    await user.click(link);
    expect(router.state.location.pathname).toBe("/move");
    expect(
      await screen.findByRole("heading", { name: "Move your site to OpenSpace" }),
    ).toBeInTheDocument();
  });

  it("goes from an address to a live site with what needs attention, signing in on the way", async () => {
    const { user, router, hub } = renderStudio("/move", FAST_IMPORT);
    await screen.findByRole("heading", { name: "Move your site to OpenSpace" });
    await user.type(screen.getByLabelText("Your site’s address"), "www.maya-yoga.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Ownership must be confirmed.
    expect(screen.getByRole("alert")).toHaveTextContent("confirm this is your site");
    await user.click(screen.getByLabelText("This is my site, or I’m moving it for its owner."));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in to move your site" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Your name"), "Sam Rivera");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/move\/imp_/));
    const call = hub.calls.find((c) => c.method === "createImport");
    expect(call?.args[0]).toMatchObject({ url: "www.maya-yoga.com", confirmOwnership: true });

    // The celebration, with the address and the review panels.
    expect(
      await screen.findByRole("heading", { name: "Your site is live!" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /github\.io\/maya-yoga/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Progress" })).toHaveTextContent(
      "6 pages, 4 items, 23 images",
    );
    const attention = screen
      .getByRole("heading", { name: "What needs your attention" })
      .closest("section") as HTMLElement;
    expect(within(attention).getByText("Forms and newsletter")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Finish setting up/ })).toBeInTheDocument();
    expect(screen.getByText("Use your own web address")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open it in Studio" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sites\/st_/));
  });

  it("explains a move that didn't finish and tries again", async () => {
    const { user } = renderStudio("/move", { user: SAM, ...FAST_IMPORT });
    await user.type(
      await screen.findByLabelText("Your site’s address"),
      "https://fail.example.com",
    );
    await user.click(screen.getByLabelText("This is my site, or I’m moving it for its owner."));
    await user.click(screen.getByRole("button", { name: "Move my site" }));
    expect(
      await screen.findByRole("heading", { name: "The move didn’t finish" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Couldn't read https:\/\/fail\.example\.com/)).toBeInTheDocument();
    expect(screen.getByText("Your current site is untouched.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
  });

  it("offers to make a GitHub Pages site editable in place, then waits for the approval", async () => {
    const { user, hub } = renderStudio("/move", { user: SAM, ...FAST_IMPORT });
    await user.type(
      await screen.findByLabelText("Your site’s address"),
      "https://life-culture.github.io/powerwith/",
    );
    // The default (a new site) needs no decision; converting in place waits behind More options.
    expect(screen.queryByText("This site lives on GitHub. What would you like?")).toBeNull();
    await user.click(screen.getByRole("button", { name: /More options for GitHub sites/ }));
    expect(screen.getByText("This site lives on GitHub. What would you like?")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Make this site editable where it is/ }));
    await user.click(screen.getByLabelText("This is my site, or I’m moving it for its owner."));
    await user.click(screen.getByRole("button", { name: "Move my site" }));
    expect(
      await screen.findByRole("heading", { name: "Almost there" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    const approve = screen.getByRole("link", { name: /Approve on GitHub/ });
    expect(approve).toHaveAttribute("href", expect.stringContaining("/pull/1"));
    const id = Object.keys(hub.imports.imports)[0] as string;
    hub.mergeImport(id);
    await user.click(screen.getByRole("button", { name: "I’ve approved it" }));
    expect(
      await screen.findByRole("heading", { name: "Your site is live!" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(hub.calls.find((c) => c.method === "convertRepo")?.args[0]).toMatchObject({
      repo: "https://life-culture.github.io/powerwith/",
    });
  });

  it("the dashboard offers moving a site and shows a move in progress", async () => {
    const { user, router } = renderStudio("/sites", { user: SAM, sites: [], importStepMs: 60_000 });
    await user.click(await screen.findByRole("button", { name: "Move my existing site" }));
    expect(router.state.location.pathname).toBe("/move");
    await user.type(await screen.findByLabelText("Your site’s address"), "maya-yoga.com");
    await user.click(screen.getByLabelText("This is my site, or I’m moving it for its owner."));
    await user.click(screen.getByRole("button", { name: "Move my site" }));
    expect(await screen.findByRole("heading", { name: "Moving your site…" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "your sites" }));
    const card = await screen.findByRole("article", { name: "Maya Yoga" });
    expect(within(card).getByText("Moving in…")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Maya Yoga" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/move\/imp_/),
    );
  });
});

describe("publishing a moved site", () => {
  it("tells what's happening during the slow publish, with an honest time", () => {
    expect(publishStory(0)).toContain("Saving your pages");
    expect(publishStory(45)).toContain("Building your site");
    expect(publishStory(120)).toContain("Putting it online");
    expect(publishStory(400)).toContain("within 5 minutes");
  });
});
