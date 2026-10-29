import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderStudio, SAM } from "../../test/render";
import { placeholderDocument } from "../editor/model/placeholder";
import { buildChecklist } from "../setup/checklist";
import { finishMovePrompt, oldAddress } from "../start/prompt";
import { claudeFraming, stillDiffers, wantsClaude } from "./FinishWithClaude";

const FAST_IMPORT = { user: SAM, importStepMs: 15 };

const page = (over: { score: number; differs?: string[]; path?: string }) => ({
  path: over.path ?? "/",
  device: "phone" as const,
  score: over.score,
  image: null,
  ...(over.differs ? { differs: over.differs } : {}),
});

/** Move a site in the mock and wait for the celebration. */
async function moveMaya() {
  const r = renderStudio("/move", FAST_IMPORT);
  await r.user.type(await screen.findByLabelText("Your site’s address"), "www.maya-yoga.com");
  await r.user.click(screen.getByLabelText("This is my site, or I’m moving it for its owner."));
  await r.user.click(screen.getByRole("button", { name: "Move my site" }));
  await screen.findByRole("heading", { name: "Your site is live!" });
  return r;
}

describe("when a move invites Claude", () => {
  it("below 90, or with differences or things that didn't come across", () => {
    expect(wantsClaude({ fidelity: { score: 84, pages: [] }, attention: [] })).toBe(true);
    expect(
      wantsClaude({ fidelity: { score: 95, pages: [page({ score: 95 })] }, attention: [] }),
    ).toBe(false);
    expect(
      wantsClaude({
        fidelity: { score: 93, pages: [page({ score: 91, differs: ["Image placement"] })] },
        attention: [],
      }),
    ).toBe(true);
    expect(
      wantsClaude({
        fidelity: null,
        attention: [{ title: "Embeds", items: ["A booking widget on /book"] }],
      }),
    ).toBe(true);
    expect(wantsClaude({ fidelity: null, attention: [] })).toBe(false);
    expect(
      stillDiffers({
        score: 80,
        pages: [page({ score: 70, path: "/about", differs: ["Section heights", "Fonts"] })],
      }),
    ).toEqual(["/about on a phone: section heights, fonts"]);
  });

  it("the ready message names the old address and the new site, and asks before publishing", () => {
    const m = finishMovePrompt({ id: "st_maya", name: "Maya Yoga" }, "www.maya-yoga.com", 84);
    expect(m).toContain("finish moving my site https://www.maya-yoga.com to OpenSpace");
    expect(m).toContain('site "Maya Yoga", id st_maya');
    expect(m).toContain("84/100");
    expect(m).toContain("page by page");
    expect(m).toContain("ask me before you publish");
    expect(oldAddress("owner/repo")).toBe("owner/repo");
    expect(oldAddress("https://x.example")).toBe("https://x.example");
    expect(finishMovePrompt({ id: "st_a", name: "A" }, null)).toContain(
      "finish moving my site to OpenSpace",
    );
  });
});

describe("honest words for where a move landed", () => {
  it("is plain that a low score is rough, names the basics mid-range, and offers Claude either way", () => {
    expect(claudeFraming(12).title).toBe(
      "The automatic move is rough. Claude can make it match closely.",
    );
    expect(claudeFraming(12).lede).toMatch(/^It came out at 12\/100/);
    expect(claudeFraming(12).lede).toContain("most of the design didn’t come across");
    expect(claudeFraming(64).title).toBe(
      "The automatic move got the basics. Claude can make it match closely.",
    );
    expect(claudeFraming(93).title).toBe("Want it even closer? Claude can finish the job");
    expect(claudeFraming(undefined).title).toBe("Claude can make it match your old site");
  });
});

describe("Finish it with Claude, after a move", () => {
  it("is the main next step on the result, with the editor second", async () => {
    await moveMaya();
    const invite = screen
      .getByRole("heading", {
        name: "The automatic move got the basics. Claude can make it match closely.",
      })
      .closest("section") as HTMLElement;
    expect(invite).toHaveClass("st-moveclaude--prominent");
    expect(within(invite).getByText(/It came out at 64\/100/)).toBeInTheDocument();
    // It sits with the celebration, before the page-by-page review.
    const celebrate = screen
      .getByRole("heading", { name: "Your site is live!" })
      .closest("div") as HTMLElement;
    expect(celebrate).toContainElement(invite);
    const finish = within(invite).getByRole("button", { name: "Finish it with Claude" });
    const editor = screen.getByRole("button", { name: "Open the editor" });
    expect(finish).toHaveClass("st-button--primary");
    expect(editor).not.toHaveClass("st-button--primary");
    expect(screen.queryByRole("button", { name: "Open it in Studio" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Finish it with Claude" })).toHaveLength(1);
  });

  it("connected but not on this site: one click allows it (never a self-grant), then opens Claude", async () => {
    const { user, hub } = await moveMaya();
    const invite = screen
      .getByRole("heading", {
        name: "The automatic move got the basics. Claude can make it match closely.",
      })
      .closest("section") as HTMLElement;
    expect(within(invite).getByText(/stays editable here/)).toBeInTheDocument();
    expect(within(invite).getByText(/\/about on a computer: image placement/)).toBeInTheDocument();
    await user.click(within(invite).getByRole("button", { name: "Finish it with Claude" }));

    expect(
      await within(invite).findByRole("heading", { name: "Let Claude work on Maya Yoga" }),
    ).toBeInTheDocument();
    await user.click(within(invite).getByRole("button", { name: "Let Claude edit this site" }));
    await waitFor(() => expect(hub.calls.some((c) => c.method === "allowMcpGrantSite")).toBe(true));
    expect(
      await within(invite).findByRole("heading", { name: "Claude can work on Maya Yoga" }),
    ).toBeInTheDocument();

    const open = within(invite).getByRole("link", { name: /Open Claude with this message/ });
    const href = open.getAttribute("href") ?? "";
    expect(href).toMatch(/^https:\/\/claude\.ai\/new\?q=/);
    const message = decodeURIComponent(href.split("?q=")[1] ?? "");
    expect(message).toContain("https://www.maya-yoga.com");
    expect(message).toMatch(/site "Maya Yoga", id st_/);
    expect(within(invite).getByRole("button", { name: "Copy the message" })).toBeInTheDocument();
    expect(within(invite).getByText(/Claude desktop app/)).toBeInTheDocument();
  });

  it("not connected yet: the connect-once steps come first", async () => {
    const r = renderStudio("/move", FAST_IMPORT, undefined, (hub) => {
      hub.manage.grants = [];
    });
    await r.user.type(await screen.findByLabelText("Your site’s address"), "www.maya-yoga.com");
    await r.user.click(screen.getByLabelText("This is my site, or I’m moving it for its owner."));
    await r.user.click(screen.getByRole("button", { name: "Move my site" }));
    await screen.findByRole("heading", { name: "Your site is live!" });
    await r.user.click(screen.getByRole("button", { name: "Finish it with Claude" }));
    expect(
      await screen.findByRole("heading", { name: /Connect OpenSpace to Claude \(once\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/tick/)).toHaveTextContent("Maya Yoga");
  });

  it("the editor's Finish setting up offers it first for a moved site", async () => {
    const { user, router } = await moveMaya();
    await user.click(screen.getByRole("button", { name: "Open the editor" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sites\/st_/));
    const id = router.state.location.pathname.split("/")[2] as string;
    await router.navigate(`/sites/${id}/settings/setup`);
    const item = await screen.findByTestId("setup-closer");
    expect(within(item).getByText("Make it match your old site")).toBeInTheDocument();
    await user.click(within(item).getByRole("button", { name: "Start" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Finish your move with Claude",
    });
    const open = await within(dialog).findByRole("link", { name: /Open Claude with this message/ });
    expect(decodeURIComponent(open.getAttribute("href") ?? "")).toContain(
      "https://www.maya-yoga.com",
    );
  });
});

describe("Finish setting up for moved sites", () => {
  const base = {
    doc: placeholderDocument(),
    site: { deployTarget: "github-pages", domain: null, status: "live" as const },
    paymentsReady: false,
    acknowledged: [] as string[],
  };
  const imported = { everLive: true, imported: { from: "Squarespace", items: [] } };

  it("puts 'Make it match your old site' first when the move wasn't a near-perfect match", () => {
    const items = buildChecklist({ ...base, setup: imported, moveNeedsClaude: true });
    expect(items[0]).toMatchObject({ id: "closer", wizard: "claude", status: "todo" });
    expect(
      buildChecklist({
        ...base,
        setup: imported,
        moveNeedsClaude: true,
        acknowledged: ["closer"],
      })[0]?.status,
    ).toBe("done");
    // A close move (or a site made from a template) doesn't get it.
    expect(buildChecklist({ ...base, setup: imported }).some((i) => i.id === "closer")).toBe(false);
  });
});
