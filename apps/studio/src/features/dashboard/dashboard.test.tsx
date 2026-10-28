import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));

describe("dashboard", () => {
  it("asks signed-out visitors to sign in, then returns", async () => {
    const { user, router } = renderStudio("/sites", { sites });
    expect(
      await screen.findByRole("heading", { name: "Sign in to OpenSpace" }),
    ).toBeInTheDocument();
    expect(router.state.location.search).toBe("?next=/sites");
    await user.type(screen.getByLabelText("Your name"), "Sam Rivera");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Your sites" })).toBeInTheDocument();
  });

  it("shows every site with status, inbox counts and pending updates", async () => {
    renderStudio("/sites", { user: SAM, sites });
    const willow = await screen.findByRole("article", { name: "Willow Street Yoga" });
    expect(within(willow).getByText("Live")).toBeInTheDocument();
    expect(within(willow).getByText("3 new entries")).toBeInTheDocument();
    expect(within(willow).getByText("Update ready")).toBeInTheDocument();
    const pan = screen.getByRole("article", { name: "Pan & Crumb" });
    expect(within(pan).getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("15 new entries")).toBeInTheDocument();
    expect(screen.getByText("1 needs attention")).toBeInTheDocument();
    // The header's search button is named even where only its icon shows (phones).
    // Its visible label is its name (kept for screen readers when phones hide it).
    expect(screen.getByRole("button", { name: /^Search/ })).toBeInTheDocument();
  });

  it("shows a building site as setting up", async () => {
    renderStudio("/sites", { user: SAM, sites: [{ ...(sites[0] as Site), status: "building" }] });
    const card = await screen.findByRole("article", { name: "Willow Street Yoga" });
    expect(within(card).getByText("Setting up")).toBeInTheDocument();
  });

  it("a move that didn't finish is never Live, and Try again retries the move", async () => {
    const moved: Site = {
      ...(sites[0] as Site),
      status: "failed",
      statusDetail:
        "The move didn't finish. Open it to try again — your current site is untouched.",
      import: { id: "imp_failedmove", state: "failed", kind: "url" },
    };
    const { user, hub } = renderStudio("/sites", { user: SAM, sites: [moved] });
    const card = await screen.findByRole("article", { name: "Willow Street Yoga" });
    expect(within(card).queryByText("Live")).not.toBeInTheDocument();
    expect(within(card).getByText("Needs attention")).toBeInTheDocument();
    expect(within(card).getByText(/The move didn't finish/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Willow Street Yoga" })).toHaveAttribute(
      "href",
      "/move/imp_failedmove",
    );
    await user.click(within(card).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.method === "retryImport")?.args).toEqual(["imp_failedmove"]),
    );
    expect(hub.calls.some((c) => c.method === "retryPublish")).toBe(false);
  });

  it("says what happened when GitHub sends someone back without finishing", async () => {
    const { router } = renderStudio("/sites?github=cancelled", { user: SAM, sites });
    expect(await screen.findByText("The GitHub step wasn’t finished")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("invites people with no sites to make one", async () => {
    const { user, router } = renderStudio("/sites", { user: SAM, sites: [] });
    expect(
      await screen.findByRole("heading", { name: "Make your first site" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Browse templates" }));
    expect(router.state.location.pathname).toBe("/templates");
  });

  it("switches to the Site Gardener table and remembers it", async () => {
    const { user } = renderStudio("/sites", { user: SAM, sites });
    await screen.findByRole("article", { name: "Willow Street Yoga" });
    await user.click(screen.getByRole("radio", { name: "Site Gardener table" }));
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(table).getByText("eastside-tenants")).toBeInTheDocument();
    expect(within(table).getByText("You’re a designer")).toBeInTheDocument();
    expect(localStorage.getItem("openspace.dashboard.view")).toBe("gardener");
  });

  it("transfers ownership after typed confirmation", async () => {
    const { user, hub } = renderStudio("/sites", { user: SAM, sites });
    const willow = await screen.findByRole("article", { name: "Willow Street Yoga" });
    await user.click(
      within(willow).getByRole("button", { name: "More actions for Willow Street Yoga" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Transfer ownership/ }));
    const dialog = await screen.findByRole("dialog", { name: "Transfer Willow Street Yoga" });
    const submit = within(dialog).getByRole("button", { name: "Transfer ownership" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText("New owner"), "willow-studio");
    await user.type(within(dialog).getByLabelText(/to confirm/), "Willow Street Yoga");
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(
      await screen.findByText("Willow Street Yoga now belongs to willow-studio"),
    ).toBeInTheDocument();
    expect(hub.calls.find((c) => c.method === "transferSite")?.args).toEqual([
      (sites[0] as Site).id,
      "willow-studio",
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("only offers transfer on sites you own", async () => {
    const { user } = renderStudio("/sites", { user: SAM, sites });
    const eastside = await screen.findByRole("article", { name: "Eastside Tenants Union" });
    await user.click(within(eastside).getByRole("button", { name: /More actions/ }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).queryByRole("menuitem", { name: /Transfer ownership/ }),
    ).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Open editor/ })).toBeInTheDocument();
  });

  it("deletes a site after typing its name, explaining what happens to its data", async () => {
    const { user, hub } = renderStudio("/sites", { user: SAM, sites });
    const willow = await screen.findByRole("article", { name: "Willow Street Yoga" });
    await user.click(within(willow).getByRole("button", { name: /More actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete site/ }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Willow Street Yoga?" });
    expect(dialog).toHaveAccessibleDescription(/archived in your GitHub account/);
    expect(dialog).toHaveAccessibleDescription(/30 days/);
    const submit = within(dialog).getByRole("button", { name: "Delete site" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/to confirm/), "Willow Street Yog");
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/to confirm/), "a");
    await user.click(submit);
    expect(await screen.findByText("Deleted Willow Street Yoga")).toBeInTheDocument();
    expect(hub.calls.find((c) => c.method === "deleteSite")?.args).toEqual([
      (sites[0] as Site).id,
      "Willow Street Yoga",
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "Willow Street Yoga" })).not.toBeInTheDocument(),
    );
    expect(hub.state.sites.some((s) => s.name === "Willow Street Yoga")).toBe(false);
  });

  it("retries publishing from a failed site's card", async () => {
    const { user, hub } = renderStudio("/sites", { user: SAM, sites, buildMs: 60_000 });
    const pan = await screen.findByRole("article", { name: "Pan & Crumb" });
    // The card says what actually happened, not "the first version" for every failure.
    expect(within(pan).queryByText(/first version/)).not.toBeInTheDocument();
    await user.click(within(pan).getByRole("button", { name: "Try again" }));
    expect(await within(pan).findByText("Setting up")).toBeInTheDocument();
    expect(hub.calls.find((c) => c.method === "retryPublish")?.args).toEqual([
      (sites[2] as Site).id,
    ]);
    expect(hub.calls.some((c) => c.method === "createSite")).toBe(false);
  });

  it("doesn't claim a failed site never went live, and re-reads a fresh failure", async () => {
    const fresh: Site = {
      ...(sites[2] as Site),
      id: "st_freshfail0",
      name: "Fresh Site",
      repo: `${SAM.login}/fresh-site`,
      status: "failed",
      statusDetail: null,
      createdAt: new Date().toISOString(),
    };
    const { hub } = renderStudio("/sites", { user: SAM, sites: [...sites, fresh] });
    const pan = await screen.findByRole("article", { name: "Pan & Crumb" });
    expect(within(pan).queryByText(/first version/)).not.toBeInTheDocument();
    const card = screen.getByRole("article", { name: "Fresh Site" });
    expect(within(card).getByText("The latest publish didn’t finish.")).toBeInTheDocument();
    // The Hub later reports it live: the dashboard picks that up without a reload.
    const row = hub.state.sites.find((s) => s.id === fresh.id);
    if (row) row.status = "live";
    await waitFor(() => expect(within(card).getByText("Live")).toBeInTheDocument());
  });

  it("clears the transfer form whichever way the dialog is closed", async () => {
    const { user } = renderStudio("/sites", { user: SAM, sites });
    const willow = await screen.findByRole("article", { name: "Willow Street Yoga" });
    const open = async () => {
      await user.click(within(willow).getByRole("button", { name: /More actions/ }));
      await user.click(await screen.findByRole("menuitem", { name: /Transfer ownership/ }));
      return screen.findByRole("dialog");
    };
    let dialog = await open();
    await user.type(within(dialog).getByLabelText("New owner"), "someone");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    dialog = await open();
    expect(within(dialog).getByLabelText("New owner")).toHaveValue("");
    await user.type(within(dialog).getByLabelText("New owner"), "someone");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    dialog = await open();
    expect(within(dialog).getByLabelText("New owner")).toHaveValue("");
  });
});

/** jsdom has no IntersectionObserver: a stub that reports everything as in view. */
class InViewObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    queueMicrotask(() =>
      this.cb(
        [{ target: el, isIntersecting: true } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      ),
    );
  }
  unobserve() {}
  disconnect() {}
}

describe("site thumbnails", () => {
  beforeEach(() => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = InViewObserver;
    // jsdom has no layout: give the card a width so the frame can be scaled into it.
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 320,
    });
  });
  afterEach(() => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  });

  /** The text of the card's live render, once it has drawn. */
  async function thumbnailText(name: string): Promise<string> {
    const card = await screen.findByRole("article", { name });
    const frame = await waitFor(() => {
      // The preview link is aria-hidden (the card's title link is the way in).
      const f = within(card)
        .getByRole("img", { name: `Preview of ${name}`, hidden: true })
        .querySelector("iframe");
      expect(f).toBeTruthy();
      return f as HTMLIFrameElement;
    });
    await act(async () => {
      frame.dispatchEvent(new Event("load"));
    });
    await waitFor(() =>
      expect(frame.contentDocument?.querySelector("[data-os-page]")).toBeTruthy(),
    );
    return frame.contentDocument?.body.textContent ?? "";
  }

  it("shows the site's published home page and refreshes after a publish", async () => {
    const willow = sites[0] as Site;
    const { hub, queryClient } = renderStudio("/sites", { user: SAM, sites: [willow] });
    const live = await hub.getDocument(willow.id, { ref: "published" });
    const before = live.document.site.description || willow.tagline || "";
    expect(before).not.toBe("");
    await waitFor(async () => expect(await thumbnailText(willow.name)).toContain(before));

    // The owner edits the home page's words and publishes.
    const room = hub.room(willow.id);
    const edited = JSON.parse(
      JSON.stringify(room.doc).replaceAll(before, "Now open on Sundays"),
    ) as typeof room.doc;
    act(() => room.reloadAll(edited, "test edit"));
    await hub.publish(willow.id);

    // Back on the dashboard (the site list is read again): the card shows the new words.
    await act(() => queryClient.invalidateQueries({ queryKey: ["sites"] }));
    await waitFor(async () => {
      const text = await thumbnailText(willow.name);
      expect(text).toContain("Now open on Sundays");
      expect(text).not.toContain(before);
    });
    // Read once per published version: the content key changed, not a timer.
    expect(
      hub.calls.filter((c) => c.method === "getDocument" && c.args[0] === willow.id).length,
    ).toBeLessThanOrEqual(3);
  });
});
