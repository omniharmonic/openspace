import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { demoSites } from "../api/fixtures";
import type { Site } from "../api/types";
import { renderStudio, SAM } from "./render";

/**
 * Global Constraint 9: no Git/infra vocabulary in non-Advanced Studio copy. No exceptions:
 * the PRD's "Building your site…" screen ships as "Setting up your site…".
 */
const FORBIDDEN = /\b(repo|repository|repositories|commit\w*|branch\w*|build\w*|deploy\w*)\b/gi;

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
    renderStudio(`/sites/${(sites[0] as Site).id}?welcome=1`, { user: SAM, sites });
    await screen.findByRole("button", { name: "Copy link" });
    expectCleanCopy();
    await userEvent.keyboard("{Control>}k{/Control}");
    await screen.findByPlaceholderText("Search commands…");
    expectCleanCopy();
  });

  it("flags forbidden words (self-check)", () => {
    document.body.innerHTML = "<p>Your repository was deployed from the main branch</p>";
    expect(visibleCopy().match(FORBIDDEN)).toEqual(["repository", "deployed", "branch"]);
    document.body.innerHTML = "";
  });
});
