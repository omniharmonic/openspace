import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderStudio, SAM } from "../../test/render";
import { kindOf } from "./StartWithClaude";

describe("Start with Claude", () => {
  it("is offered next to the templates and on the dashboard", async () => {
    const { user, router } = renderStudio("/templates");
    await user.click(await screen.findByRole("link", { name: /Start with Claude/ }));
    expect(router.state.location.pathname).toBe("/start");
    expect(await screen.findByRole("heading", { name: "Start with Claude" })).toBeInTheDocument();
  });

  it("sorts what people bring by what it is", () => {
    expect(kindOf({ name: "brand-tokens.json", type: "application/json" })).toBe("tokens");
    expect(kindOf({ name: "Landing page.html", type: "text/html" })).toBe("page");
    expect(kindOf({ name: "site.zip", type: "application/zip" })).toBe("page");
    expect(kindOf({ name: "logo.png", type: "image/png" })).toBe("logo");
    expect(kindOf({ name: "bread.jpg", type: "image/jpeg" })).toBe("photos");
    expect(kindOf({ name: "Brand guide.pdf", type: "application/pdf" })).toBe("brandDoc");
  });

  it("goes from an idea and a design-token file to a live site and the hand-off to Claude", async () => {
    const { user, router, hub } = renderStudio("/start/form", { user: SAM });
    await screen.findByRole("heading", { name: "Start with Claude" });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/Give your site a name/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Site name"), "Crumb & Kettle");
    await user.type(screen.getByLabelText("What is it for?"), "A neighbourhood bakery in Leith.");
    await user.click(screen.getByRole("button", { name: "warm" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "Bring anything you already have" }),
    ).toBeInTheDocument();
    const tokens = new File(
      [JSON.stringify({ color: { primary: "#b5532a", paper: "#fbf3e6" } })],
      "crumb-tokens.json",
      { type: "application/json" },
    );
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, tokens);
    expect(await screen.findByText("crumb-tokens.json")).toBeInTheDocument();
    expect(screen.getByText(/Design system — colours, fonts and sizes/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Make my site" }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/start\/st_/));
    const call = hub.calls.find((c) => c.method === "startSite");
    expect(call?.args[0]).toMatchObject({
      name: "Crumb & Kettle",
      about: "A neighbourhood bakery in Leith.",
      feeling: ["warm"],
      tokensName: "crumb-tokens.json",
    });
    expect(
      await screen.findByRole("heading", { name: "Crumb & Kettle is live" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Now let Claude design it with you/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/How it should feel: warm/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Design-from-scratch skill/ })).toHaveAttribute(
      "href",
      "https://docs.openspace.host/skills/openspace-design-from-scratch.zip",
    );
    expect(screen.getByRole("link", { name: /Open Claude with it/ }).getAttribute("href")).toMatch(
      /^https:\/\/claude\.ai\/new\?q=/,
    );
    await user.click(screen.getByRole("tab", { name: "Claude Code" }));
    expect(screen.getByText("/plugin marketplace add omniharmonic/openspace")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open it in the editor" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sites\/st_/));
  });

  it("asks people who aren't signed in to sign in before they bring files", async () => {
    const { user } = renderStudio("/start/form");
    await user.type(await screen.findByLabelText("Site name"), "Still Water");
    await user.type(screen.getByLabelText("What is it for?"), "Yoga for beginners.");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in to keep Still Water" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Your name"), "Sam Rivera");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByRole("heading", { name: "Bring anything you already have" }),
    ).toBeInTheDocument();
  });

  it("Move my site: upload a page Claude made", async () => {
    const { user, router, hub } = renderStudio("/move", { user: SAM });
    await screen.findByRole("heading", { name: "Move your site to OpenSpace" });
    await user.click(screen.getByLabelText("This is my site, or I’m moving it for its owner."));
    const page = new File(["<!doctype html><h1>Hello</h1>"], "lantern.html", { type: "text/html" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, page);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/start\/st_/));
    expect(hub.calls.find((c) => c.method === "uploadPage")?.args[0]).toMatchObject({
      confirmOwnership: true,
      html: { name: "lantern.html" },
    });
    expect(await screen.findByText(/Your page is now a real site/)).toBeInTheDocument();
  });

  // A page chosen right after the screen opens, before Studio knows who is signed in, used to
  // send a signed-in person to "Sign in to move your site" and drop the page.
  it("Move my site: a page chosen while the session is still loading waits for it, then uploads", async () => {
    let answer: () => void = () => {};
    const { user, router, hub } = renderStudio("/move", { user: SAM }, undefined, (h) => {
      const real = h.getSession.bind(h);
      h.getSession = () =>
        new Promise((resolve) => {
          answer = () => resolve(real());
        });
    });
    await screen.findByRole("heading", { name: "Move your site to OpenSpace" });
    await user.click(screen.getByLabelText("This is my site, or I’m moving it for its owner."));
    const page = new File(["<!doctype html><h1>Hello</h1>"], "lantern.html", { type: "text/html" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, page);
    expect(await screen.findByText("Starting the move…")).toBeInTheDocument();
    answer();
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/start\/st_/));
    expect(screen.queryByRole("heading", { name: "Sign in to move your site" })).toBeNull();
    expect(hub.calls.find((c) => c.method === "uploadPage")?.args[0]).toMatchObject({
      html: { name: "lantern.html" },
    });
  });

  it("Move my site: a page chosen while signed out is brought in once they sign in", async () => {
    const { user, router, hub } = renderStudio("/move");
    await screen.findByRole("heading", { name: "Move your site to OpenSpace" });
    await user.click(screen.getByLabelText("This is my site, or I’m moving it for its owner."));
    const page = new File(["<!doctype html><h1>Hello</h1>"], "lantern.html", { type: "text/html" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, page);
    expect(
      await screen.findByRole("heading", { name: "Sign in to move your site" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Your name"), "Sam Rivera");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/start\/st_/));
    expect(hub.calls.find((c) => c.method === "uploadPage")?.args[0]).toMatchObject({
      confirmOwnership: true,
      html: { name: "lantern.html" },
    });
    expect(hub.calls.some((c) => c.method === "createImport")).toBe(false);
  });
});
