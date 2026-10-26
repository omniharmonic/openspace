import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubError } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { loadDraft, saveDraft } from "./draft";

describe("onboarding: template → details → sign in → building → editor", () => {
  it("lets a signed-out visitor browse templates and switch looks", async () => {
    const { user } = renderStudio("/templates");
    expect(
      await screen.findByRole("heading", { name: "Start from a finished site" }),
    ).toBeInTheDocument();
    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(6);
    const meadow = screen.getByRole("article", { name: "Meadow" });
    expect(within(meadow).getByText("Oat look")).toBeInTheDocument();
    await user.click(within(meadow).getByRole("radio", { name: "Clay look" }));
    expect(within(meadow).getByText("Clay look")).toBeInTheDocument();
    expect(
      within(meadow).getByRole("img", { name: "Meadow template, Clay look" }),
    ).toBeInTheDocument();
  });

  it("opens a larger preview with device sizes", async () => {
    const { user } = renderStudio("/templates");
    const harbor = await screen.findByRole("article", { name: "Harbor" });
    await user.click(within(harbor).getByRole("button", { name: /Preview Harbor/ }));
    const dialog = await screen.findByRole("dialog", { name: "Harbor" });
    await user.click(within(dialog).getByRole("radio", { name: "Phone" }));
    expect(within(dialog).getByRole("radio", { name: "Phone" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(dialog).getByRole("button", { name: "Use Harbor" }));
    expect(await screen.findByRole("heading", { name: "Make it yours" })).toBeInTheDocument();
  });

  it("goes from gallery to a live site in the editor with dev sign-in", async () => {
    const { user, hub, router } = renderStudio("/templates");
    const meadow = await screen.findByRole("article", { name: "Meadow" });
    await user.click(within(meadow).getByRole("radio", { name: "Dusk look" }));
    await user.click(within(meadow).getByRole("button", { name: "Use Meadow" }));

    expect(await screen.findByRole("heading", { name: "Make it yours" })).toBeInTheDocument();
    expect(router.state.location.search).toContain("look=dusk");

    // Name is required.
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give your site a name");

    await user.type(screen.getByLabelText("Site name"), "Juniper Bodywork");
    await user.type(
      screen.getByLabelText(/One line about what you do/),
      "Massage that meets you where you are",
    );
    // The preview updates as you type.
    expect(screen.getByRole("img", { name: "Preview of Juniper Bodywork" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in to save Juniper Bodywork" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/GitHub is a free, safe place where your site’s files live. You own them./),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Your name"), "Sam Rivera");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "Setting up your site…" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Progress" })).toHaveTextContent(
      "Copying the Meadow template",
    );

    // Lands in the editor with the celebratory toast and the checklist.
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sites\/st_/), {
      timeout: 3000,
    });
    expect(
      await screen.findByRole("button", { name: "Copy link" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your site is live")).toBeInTheDocument();
    expect(screen.getByText("sam-rivera.github.io/juniper-bodywork")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Get your site ready" })).toBeInTheDocument();
    expect(router.state.location.search).not.toContain("welcome");

    const created = hub.calls.find((c) => c.method === "createSite");
    expect(created?.args[0]).toEqual({
      template: "meadow",
      look: "dusk",
      name: "Juniper Bodywork",
      tagline: "Massage that meets you where you are",
    });
    expect(loadDraft("meadow")).toBeNull();
  });

  it("signs in with GitHub and creates the site straight away", async () => {
    const { user, hub } = renderStudio("/new/hearth");
    await user.type(await screen.findByLabelText("Site name"), "Pan & Crumb");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Continue with GitHub" }));
    expect(
      await screen.findByRole("button", { name: "Copy link" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(hub.calls.find((c) => c.method === "startGitHubSignIn")?.args[0]).toEqual({
      template: "hearth",
      name: "Pan & Crumb",
      returnTo: "/new/hearth?look=cream&resume=1",
    });
  });

  it("skips sign-in when already signed in", async () => {
    const { user } = renderStudio("/new/signal?look=volt", { user: SAM });
    await user.type(await screen.findByLabelText("Site name"), "Tidewater");
    await user.click(screen.getByRole("button", { name: "Create my site" }));
    expect(
      await screen.findByRole("heading", { name: "Setting up your site…" }),
    ).toBeInTheDocument();
  });

  it("resumes after returning from GitHub sign-in", async () => {
    saveDraft({ template: "ledger", look: "ink", name: "Okafor Advisory", tagline: "Clear plans" });
    const { hub } = renderStudio("/new/ledger?look=ink&resume=1", { user: SAM });
    expect(
      await screen.findByRole("button", { name: "Copy link" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(hub.calls.filter((c) => c.method === "createSite")).toHaveLength(1);
    expect(hub.calls.find((c) => c.method === "createSite")?.args[0]).toMatchObject({
      name: "Okafor Advisory",
      look: "ink",
    });
  });

  it("offers a retry when the first publish fails", async () => {
    const { user, hub } = renderStudio("/new/hearth", { user: SAM, failTemplates: ["hearth"] });
    await user.type(await screen.findByLabelText("Site name"), "Pan & Crumb");
    await user.click(screen.getByRole("button", { name: "Create my site" }));
    expect(
      await screen.findByRole("heading", { name: "Pan & Crumb isn’t online yet" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    // Retries publishing the same site instead of creating a duplicate.
    expect(
      await screen.findByRole("button", { name: "Copy link" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(hub.calls.filter((c) => c.method === "createSite")).toHaveLength(1);
    const created = hub.state.sites[0];
    expect(hub.calls.find((c) => c.method === "retryPublish")?.args).toEqual([created?.id]);
    expect(hub.state.sites).toHaveLength(1);
  });

  it("keeps polling through a flaky connection instead of showing a failure", async () => {
    const { user, hub } = renderStudio("/new/meadow", { user: SAM, buildMs: 30 });
    const realGetSite = hub.getSite.bind(hub);
    let failures = 0;
    hub.getSite = async (id) => {
      if (failures < 2) {
        failures++;
        throw new HubError(0, "network", "Can't reach OpenSpace.");
      }
      return realGetSite(id);
    };
    await user.type(await screen.findByLabelText("Site name"), "Juniper");
    await user.click(screen.getByRole("button", { name: "Create my site" }));
    expect(await screen.findByText(/Having trouble reaching OpenSpace/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /isn’t online yet/ })).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Copy link" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(failures).toBe(2);
  });

  it("returns to the details form when creating fails after GitHub sign-in", async () => {
    saveDraft({ template: "ledger", look: "ink", name: "Okafor Advisory", tagline: "Clear plans" });
    const { router } = renderStudio("/new/ledger?look=ink&resume=1", { user: SAM, maxSites: 0 });
    expect(await screen.findByText("Your site wasn’t created")).toBeInTheDocument();
    expect(await screen.findByLabelText("Site name")).toHaveValue("Okafor Advisory");
    expect(router.state.location.search).not.toContain("resume");
    expect(screen.queryByRole("status", { name: "Starting your site" })).not.toBeInTheDocument();
  });

  it("explains when a template doesn't exist", async () => {
    renderStudio("/new/nope");
    expect(
      await screen.findByRole("heading", { name: "That template isn’t available" }),
    ).toBeInTheDocument();
  });
});

describe("home route", () => {
  it("sends signed-out visitors to the gallery", async () => {
    const { router } = renderStudio("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/templates"));
  });

  it("sends signed-in people to their sites", async () => {
    const { router } = renderStudio("/", { user: SAM });
    await waitFor(() => expect(router.state.location.pathname).toBe("/sites"));
  });
});
