import type { OpBody } from "@omniharmonic/openspace-ops";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { demoSites } from "../api/fixtures";
import type { Site } from "../api/types";
import { DEV_IDS as I } from "../features/editor/model/dev-site";
import type { EditorStore } from "../features/editor/model/store";
import { renderStudio, SAM } from "./render";

/**
 * Global Constraint 9: no Git/infra vocabulary in non-Advanced Studio copy. No exceptions:
 * the PRD's "Building your site…" screen ships as "Setting up your site…".
 */
const FORBIDDEN =
  /\b(repo|repository|repositories|commit\w*|branch\w*|build\w*|deploy\w*|workflow\w*|GitHub Actions|MCP|CNAME|API token|account ID)\b/gi;

function visibleCopy(): string {
  let text = `${document.body.textContent ?? ""} `;
  for (const el of document.querySelectorAll("[aria-label],[placeholder],[title],[alt]")) {
    for (const attr of ["aria-label", "placeholder", "title", "alt"]) {
      const v = el.getAttribute(attr);
      if (v) text += ` ${v}`;
    }
  }
  return text;
}

function expectCleanCopy() {
  expect(visibleCopy().match(FORBIDDEN)).toBeNull();
}

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));

describe("UI copy avoids Git vocabulary", () => {
  it("finish setting up, its helpers and hosting", async () => {
    const site = sites[0] as Site;
    const { user } = renderStudio(`/sites/${site.id}/settings/setup`, {
      user: SAM,
      sites,
      demoContent: true,
    });
    await screen.findByTestId("setup-store");
    expectCleanCopy();
    await user.click(
      within(screen.getByTestId("setup-store")).getByRole("button", { name: "Start" }),
    );
    await screen.findByRole("dialog", { name: "Open your shop" });
    expectCleanCopy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Hosting" }));
    await screen.findByRole("heading", { name: /Shops, donations and member/ });
    expectCleanCopy();
  });

  it("template gallery", async () => {
    renderStudio("/templates");
    await screen.findAllByRole("article");
    expectCleanCopy();
  });

  it("new site details and sign-in", async () => {
    const { user } = renderStudio("/new/meadow");
    await user.type(await screen.findByLabelText("Site name"), "Willow");
    expectCleanCopy();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("button", { name: "Continue with GitHub" });
    expectCleanCopy();
  });

  it("building screen", async () => {
    const { user } = renderStudio("/new/meadow", { user: SAM, buildMs: 60_000 });
    await user.type(await screen.findByLabelText("Site name"), "Willow");
    await user.click(screen.getByRole("button", { name: "Create my site" }));
    await screen.findByRole("heading", { name: "Setting up your site…" });
    expectCleanCopy();
  });

  it("dashboard cards, gardener table and menus", async () => {
    const { user } = renderStudio("/sites", { user: SAM, sites });
    await screen.findByRole("article", { name: "Willow Street Yoga" });
    expectCleanCopy();
    await user.click(screen.getByRole("radio", { name: "Site Gardener table" }));
    expectCleanCopy();
    await user.click(screen.getByRole("button", { name: "More actions for Willow Street Yoga" }));
    await user.click(await screen.findByRole("menuitem", { name: /Transfer ownership/ }));
    await screen.findByRole("dialog");
    expectCleanCopy();
  });

  it("editor frame and command palette", async () => {
    const { user } = renderStudio(`/sites/${(sites[0] as Site).id}?welcome=1`, {
      user: SAM,
      sites,
    });
    // The first-run tour, through to its last stop.
    const tour = await screen.findByRole("dialog", { name: "This is your site" });
    expectCleanCopy();
    for (let i = 0; i < 3; i++)
      await user.click(within(tour).getByRole("button", { name: "Next" }));
    await screen.findByRole("dialog", { name: /Your site is live — and it's yours/ });
    await screen.findByRole("button", { name: "Copy link" });
    expectCleanCopy();
    await user.click(screen.getByRole("button", { name: "Start editing" }));
    await userEvent.keyboard("{Control>}k{/Control}");
    await screen.findByPlaceholderText("Search commands…");
    expectCleanCopy();
  });

  it("publishing, progress, history, offline and agent banners", async () => {
    const site = sites[0] as Site;
    const { hub, user } = renderStudio(`/sites/${site.id}`, {
      user: SAM,
      sites,
      agentPresenceMs: 50,
    });
    await screen.findByText("Saved");
    const store = (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore;
    const setLabel = (label: string) =>
      ({ op: "block.update", page: I.home, block: I.heroButton, set: { label } }) as OpBody;
    act(() => {
      store.getState().commit([setLabel("Book now")]);
    });
    await screen.findByText("Saved");

    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    await within(dialog).findByText("1 page edited");
    expectCleanCopy();
    await user.click(within(dialog).getByRole("radio", { name: "Schedule" }));
    expectCleanCopy();
    await user.click(within(dialog).getByRole("button", { name: "Discard changes…" }));
    await screen.findByRole("dialog", { name: "Discard unpublished changes?" });
    expectCleanCopy();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    // Back in the publish dialog; close it.
    await screen.findByRole("dialog", { name: "Publish changes" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    hub.failNextPublish(site.id);
    await act(() => hub.publish(site.id));
    await waitFor(() => expect(document.querySelector(".st-pill[data-phase=failed]")).toBeTruthy());
    expectCleanCopy();

    const agent = hub.room(site.id).startAgent({ userId: SAM.id, name: SAM.name });
    act(() => {
      agent.edit([setLabel("By Claude")]);
    });
    await screen.findByText("Claude is editing Home…");
    expectCleanCopy();
    await screen.findByRole("region", { name: "Changes by Claude" });
    expectCleanCopy();

    act(() => hub.room(site.id).setDown(true));
    await screen.findByRole("status", { name: "Offline" });
    expectCleanCopy();

    await user.click(screen.getByRole("button", { name: "History" }));
    const sheet = await screen.findByRole("dialog", { name: "History" });
    await within(sheet).findByRole("list", { name: "Published versions" });
    expectCleanCopy();
    await user.click(within(sheet).getByRole("tab", { name: "Snapshots" }));
    await within(sheet).findByText("No snapshots yet");
    expectCleanCopy();
  });

  it("flags forbidden words (self-check)", () => {
    document.body.innerHTML = "<p>Your repository was deployed from the main branch</p>";
    expect(visibleCopy().match(FORBIDDEN)).toEqual(["repository", "deployed", "branch"]);
    document.body.innerHTML = "";
  });
});
