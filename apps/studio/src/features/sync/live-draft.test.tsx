import type { OpBody } from "@omniharmonic/openspace-ops";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { useToastStore } from "../../ui/toast-store";
import { useEditorUi } from "../editor/editor-store";
import { DEV_IDS as I } from "../editor/model/dev-site";
import type { EditorStore } from "../editor/model/store";
import { liveStatusKey } from "./LiveDraft";

/**
 * Owner report: "I had a draft saved in the editor after Claude had improved the website
 * significantly, and I wasn't easily able to get rid of the draft to see the actual live version."
 * Claude can publish without going through the editor's draft (Claude Code pushing to the site);
 * the editor must never hide that work behind an older draft, nor quietly publish over it.
 */
const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;

const store = () =>
  (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();
const setLabel = (value: string): OpBody =>
  ({ op: "block.update", page: I.home, block: I.heroButton, set: { label: value } }) as OpBody;
const label = (doc: SiteDocument) =>
  (
    doc.pages[I.home as keyof SiteDocument["pages"]]?.sections[0]?.blocks.find(
      (b) => b.id === I.heroButton,
    )?.fields as { label?: string }
  )?.label;
/** `doc` with the hero button saying `value` (what Claude published). */
function withLabel(doc: SiteDocument, value: string): SiteDocument {
  const next = structuredClone(doc);
  const block = next.pages[I.home as keyof SiteDocument["pages"]]?.sections[0]?.blocks.find(
    (b) => b.id === I.heroButton,
  );
  if (!block) throw new Error("no hero button");
  (block.fields as { label?: string }).label = value;
  return next;
}

type Utils = ReturnType<typeof renderStudio>;

async function openEditor(): Promise<Utils> {
  const utils = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
  await screen.findByText("Saved");
  // The first check of the live site has settled (nothing changed).
  await waitFor(() => expect(utils.hub.calls.some((c) => c.method === "getLiveStatus")).toBe(true));
  return utils;
}

async function edit(value: string) {
  act(() => {
    store().commit([setLabel(value)]);
  });
  await screen.findByText("Saved");
}

/** Claude publishes `value` straight to the live site, and Studio looks (focus, poll, save…). */
async function claudePublishes(utils: Utils, value: string) {
  const live = await utils.hub.getDocument(willow.id, { ref: "published" });
  utils.hub.publishElsewhere(willow.id, withLabel(live.document, value));
  await act(() => utils.queryClient.invalidateQueries({ queryKey: liveStatusKey(willow.id) }));
  await liveBuildDone();
}

/** The live site's build of what Claude published finished (Studio shows its progress too). */
async function liveBuildDone() {
  await waitFor(() =>
    expect(document.querySelector(".st-pill")).toHaveAttribute("data-phase", "live"),
  );
}

const banner = () => screen.queryByRole("alert", { name: "Your live site changed" });

beforeEach(() => useEditorUi.getState().reset());
afterEach(() => useToastStore.getState().clear());

describe("the live site changed outside the editor", () => {
  it("shows Claude's published work when the draft has nothing of its own", async () => {
    const utils = await openEditor();
    expect(screen.queryByRole("button", { name: "Unpublished changes" })).not.toBeInTheDocument();

    await claudePublishes(utils, "Claude’s new button");

    await waitFor(() => expect(label(store().doc)).toBe("Claude’s new button"));
    expect(
      await screen.findByText("Now showing your live site’s latest version"),
    ).toBeInTheDocument();
    expect(banner()).not.toBeInTheDocument();
    // Nothing to publish, and nothing to put back.
    expect(screen.queryByRole("button", { name: "Unpublished changes" })).not.toBeInTheDocument();
  });

  it("asks before keeping an older draft, and publishing over the live site needs a say-so", async () => {
    const utils = await openEditor();
    const { user, hub } = utils;
    await edit("My draft button");
    await claudePublishes(utils, "Claude’s new button");

    const alert = await screen.findByRole("alert", { name: "Your live site changed" });
    expect(alert).toHaveTextContent("Your live site has newer changes.");
    expect(alert).toHaveTextContent("Publishing this draft would replace them.");
    // The draft is kept until the person chooses.
    expect(label(store().doc)).toBe("My draft button");

    await user.click(within(alert).getByRole("button", { name: "Keep my draft" }));
    await waitFor(() => expect(banner()).not.toBeInTheDocument());

    // Publishing still says what it would replace, and the button says so too.
    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Your live site has newer changes.",
    );
    expect(within(dialog).queryByRole("button", { name: "Publish now" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Publish anyway" }));
    await waitFor(() => expect(hub.calls.filter((c) => c.method === "publish")).toHaveLength(1));
    await liveBuildDone();
    const publishes = hub.calls.filter((c) => c.method === "publish");
    expect(publishes.at(-1)?.args).toEqual([willow.id, { overwriteLive: true }]);
    const live = await hub.getDocument(willow.id, { ref: "published" });
    expect(label(live.document)).toBe("My draft button");
  });

  it("goes back to the live version from the notice, undoably", async () => {
    const utils = await openEditor();
    const { user, hub } = utils;
    await edit("My draft button");
    await claudePublishes(utils, "Claude’s new button");

    const alert = await screen.findByRole("alert", { name: "Your live site changed" });
    await user.click(within(alert).getByRole("button", { name: "Use the live version" }));
    const confirm = await screen.findByRole("dialog", { name: "Go back to the live version?" });
    await user.click(within(confirm).getByRole("button", { name: "Use the live version" }));

    await waitFor(() => expect(label(store().doc)).toBe("Claude’s new button"));
    await waitFor(() => expect(banner()).not.toBeInTheDocument());
    await screen.findByText("Saved");
    expect(label(hub.room(willow.id).doc)).toBe("Claude’s new button");
    expect(await screen.findByText("Showing your live site")).toBeInTheDocument();
    // …and undo brings the draft back.
    act(() => {
      store().undo();
    });
    expect(label(store().doc)).toBe("My draft button");
  });

  it("a publish refused because the live site changed explains it in the dialog", async () => {
    const utils = await openEditor();
    const { user, hub } = utils;
    await edit("My draft button");
    // Claude publishes, but Studio hasn't looked yet.
    const live = await hub.getDocument(willow.id, { ref: "published" });
    hub.publishElsewhere(willow.id, withLabel(live.document, "Claude’s new button"));
    await liveBuildDone();
    // Studio's last look said nothing changed (the check after the build is still to come).
    await act(async () => {
      await utils.queryClient.cancelQueries({ queryKey: liveStatusKey(willow.id) });
      utils.queryClient.setQueryData(liveStatusKey(willow.id), {
        liveChanged: false,
        draftHasChanges: true,
        followed: false,
        liveSha: null,
      });
    });

    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    await within(dialog).findByText("1 page edited");
    // The Hub refuses to put the draft over the newer live site…
    await user.click(within(dialog).getByRole("button", { name: "Publish now" }));
    await waitFor(() =>
      expect(hub.calls.filter((c) => c.method === "publish").map((c) => c.args)).toEqual([
        [willow.id],
      ]),
    );
    // …and the dialog explains it instead of failing.
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Publishing replaces them with what’s in the editor.",
    );
    expect(within(dialog).getByRole("button", { name: "Publish anyway" })).toBeInTheDocument();
    // Claude's work is still live.
    const still = await hub.getDocument(willow.id, { ref: "published" });
    expect(label(still.document)).toBe("Claude’s new button");
  });
});

describe("Unpublished changes menu", () => {
  it("views the live site or goes back to it", async () => {
    const utils = await openEditor();
    const { user } = utils;
    await edit("My draft button");
    const opened: string[] = [];
    window.open = ((url: string) => {
      opened.push(url);
      return null;
    }) as typeof window.open;

    const chip = await screen.findByRole("button", { name: "Unpublished changes" });
    await user.click(chip);
    await user.click(await screen.findByRole("menuitem", { name: "View live site" }));
    expect(opened[0]?.startsWith(willow.url)).toBe(true);

    await user.click(screen.getByRole("button", { name: "Unpublished changes" }));
    await user.click(await screen.findByRole("menuitem", { name: "Go back to the live version…" }));
    const confirm = await screen.findByRole("dialog", { name: "Go back to the live version?" });
    await user.click(within(confirm).getByRole("button", { name: "Use the live version" }));
    const live = await utils.hub.getDocument(willow.id, { ref: "published" });
    await waitFor(() => expect(label(store().doc)).toBe(label(live.document)));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Unpublished changes" })).not.toBeInTheDocument(),
    );
  });

  // Owner report: "it asks me to update to the live version but when i click to make it live,
  // it just infinitely loops back". Claude Code and the editor had written the same content
  // differently, so the Hub kept counting the draft as changed while the editor had nothing to
  // undo.
  it("going back ends 'Unpublished changes' even when only the files' writing differs", async () => {
    const utils = await openEditor();
    const { user, hub } = utils;
    hub.writeDraftDifferently(willow.id);
    await act(async () => {
      await utils.queryClient.invalidateQueries({ queryKey: liveStatusKey(willow.id) });
    });
    await user.click(await screen.findByRole("button", { name: "Unpublished changes" }));
    await user.click(await screen.findByRole("menuitem", { name: "Go back to the live version…" }));
    const confirm = await screen.findByRole("dialog", { name: "Go back to the live version?" });
    await user.click(within(confirm).getByRole("button", { name: "Use the live version" }));
    await waitFor(() => expect(hub.calls.some((c) => c.method === "discardDraft")).toBe(true));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Unpublished changes" })).not.toBeInTheDocument(),
    );
    // And it stays gone when the live site is checked again.
    await act(async () => {
      await utils.queryClient.invalidateQueries({ queryKey: liveStatusKey(willow.id) });
    });
    expect(screen.queryByRole("button", { name: "Unpublished changes" })).not.toBeInTheDocument();
  });
});

describe("on a phone (390px)", () => {
  const realMatchMedia = window.matchMedia;
  const realWidth = window.innerWidth;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: realWidth });
  });

  it("offers the same choices", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.matchMedia = (query: string) =>
      ({
        matches: /max-width:\s*767px/.test(query),
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
    const utils = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByTestId("mobile-studio");
    await waitFor(() => expect(store().doc.pages[I.home]).toBeTruthy());
    await waitFor(() =>
      expect(utils.hub.calls.some((c) => c.method === "getLiveStatus")).toBe(true),
    );
    act(() => {
      store().commit([setLabel("My draft button")]);
    });
    await claudePublishes(utils, "Claude’s new button");

    const top = document.querySelector(".st-mob__top") as HTMLElement;
    expect(
      await within(top).findByRole("button", { name: "Unpublished changes" }),
    ).toBeInTheDocument();
    const alert = await screen.findByRole("alert", { name: "Your live site changed" });
    expect(alert.closest(".st-mob__banners")).not.toBeNull();
    await utils.user.click(within(alert).getByRole("button", { name: "Use the live version" }));
    const confirm = await screen.findByRole("dialog", { name: "Go back to the live version?" });
    await utils.user.click(within(confirm).getByRole("button", { name: "Use the live version" }));
    await waitFor(() => expect(label(store().doc)).toBe("Claude’s new button"));
  });
});
