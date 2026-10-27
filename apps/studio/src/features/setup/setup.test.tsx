import type { Block, SiteDocument } from "@omniharmonic/openspace-schema";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { placeholderDocument } from "../editor/model/placeholder";
import { buildChecklist, contentNeeds, progress } from "./checklist";
import { formatDollars, yearlySaving } from "./savings";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;

function docWith(blocks: Array<Pick<Block, "type" | "fields">>, products = 0): SiteDocument {
  const doc = placeholderDocument();
  // The footer is a section on every page: enough to carry the blocks under test.
  doc.site.footer = {
    ...doc.site.footer,
    blocks: blocks.map((b, i) => ({ id: `b${i}`, ...b }) as Block),
  };
  if (products)
    doc.collections = {
      shop: Object.fromEntries(
        Array.from({ length: products }, (_, i) => [
          `p${i}`,
          { kind: "products", slug: `p${i}`, frontmatter: {}, body: "" },
        ]),
      ) as never,
    };
  return doc;
}

const base = {
  site: { deployTarget: "github-pages", domain: null, status: "live" as const },
  setup: { everLive: true, imported: null },
  paymentsReady: false,
  acknowledged: [] as string[],
};

describe("buildChecklist", () => {
  it("finds a shop, donations and members in the content, and always offers a domain", () => {
    const doc = docWith(
      [
        { type: "donation", fields: { mode: "stripe" } },
        { type: "member-login", fields: {} },
        { type: "form", fields: {} },
      ],
      3,
    );
    expect(contentNeeds(doc)).toMatchObject({ store: 3, donations: 1, members: 1, forms: 1 });
    const items = buildChecklist({ ...base, doc });
    expect(items.map((i) => [i.id, i.status])).toEqual([
      ["store", "todo"],
      ["donations", "todo"],
      ["members", "todo"],
      ["forms-email", "todo"],
      ["domain", "todo"],
    ]);
    expect(items[0]).toMatchObject({ count: 3, where: ["/shop"], minutes: 10, wizard: "shop" });
    expect(items.every((i) => i.why.length > 20)).toBe(true);
  });

  it("donations that link elsewhere need nothing; nothing Cloudflare starts before the site is live", () => {
    const doc = docWith([{ type: "donation", fields: { mode: "link" } }], 1);
    const items = buildChecklist({
      ...base,
      doc,
      site: { ...base.site, status: "building" },
      setup: { everLive: false, imported: null },
    });
    expect(items.map((i) => [i.id, i.status])).toEqual([
      ["store", "later"],
      ["domain", "todo"],
    ]);
  });

  it("ticks steps off from the site's state", () => {
    const doc = docWith([], 2);
    const items = buildChecklist({
      ...base,
      doc,
      site: { deployTarget: "cloudflare", domain: "maya.yoga", status: "live" },
      paymentsReady: true,
    });
    expect(progress(items)).toEqual({ done: 2, total: 2, left: 0 });
  });

  it("merges the importer's list: known kinds join their step, others become their own", () => {
    const items = buildChecklist({
      ...base,
      doc: docWith([]),
      setup: {
        everLive: true,
        imported: {
          from: "Squarespace",
          items: [
            {
              id: "store",
              kind: "store",
              title: "Turn on your shop",
              detail: "12 products came across.",
              where: ["/shop"],
              count: 12,
              done: false,
            },
            {
              id: "cc",
              kind: "custom-code",
              title: "Check a custom code block",
              detail: "Your About page had custom code we couldn't bring over.",
              where: ["/about"],
              count: null,
              done: false,
            },
          ],
        },
      },
      acknowledged: ["import:cc"],
    });
    expect(items.map((i) => [i.id, i.status, i.source])).toEqual([
      ["store", "todo", "import"],
      ["domain", "todo", "content"],
      ["import:cc", "done", "import"],
    ]);
    expect(items[0]).toMatchObject({ count: 12, detail: "12 products came across." });
  });

  it("works out the yearly saving from the landing page prices", () => {
    expect(yearlySaving("Squarespace", false)).toBe(228);
    expect(yearlySaving("squarespace", true)).toBe(348);
    expect(yearlySaving("Webflow", true)).toBe(888);
    expect(yearlySaving("Jimdo", false)).toBeNull();
    expect(formatDollars(1234)).toBe("$1,234");
  });
});

describe("Finish setting up screen", () => {
  it("lists what's left with why and time, celebrates the saving, and opens a guided helper", async () => {
    const { user } = renderStudio(
      `/sites/${willow.id}/settings/setup`,
      { user: SAM, sites, demoContent: true },
      undefined,
      (hub) => {
        hub.manage.importedSetup[willow.id] = {
          from: "Squarespace",
          items: [
            {
              id: "store",
              kind: "store",
              title: "Turn on your shop",
              detail: null,
              where: ["/shop"],
              count: 4,
              done: false,
            },
          ],
        };
      },
    );
    const shop = await screen.findByTestId("setup-store");
    expect(within(shop).getByRole("heading", { name: "Open your shop" })).toBeInTheDocument();
    expect(within(shop).getByText(/pay you directly/)).toBeInTheDocument();
    expect(within(shop).getByText("About 10 minutes")).toBeInTheDocument();
    expect(screen.getByTestId("setup-domain")).toHaveTextContent("Use your own domain");
    expect(screen.getByText(/moved from Squarespace and it's live/)).toBeInTheDocument();
    expect(screen.getByText("$348 a year")).toBeInTheDocument();

    await user.click(within(shop).getByRole("button", { name: "Start" }));
    const dialog = await screen.findByRole("dialog", { name: "Open your shop" });
    expect(within(dialog).getByText("Your own Cloudflare account (free)")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Open Cloudflare sign-up/ })).toHaveAttribute(
      "href",
      "https://dash.cloudflare.com/sign-up",
    );
    expect(within(dialog).getByText("Get paid with Stripe")).toBeInTheDocument();
  });

  it("is reachable from the editor's top bar", async () => {
    const { user, router } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await user.click(await screen.findByRole("button", { name: /Finish setting up/ }));
    expect(router.state.location.pathname).toBe(`/sites/${willow.id}/settings/setup`);
  });
});
