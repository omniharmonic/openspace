import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorUi } from "../editor/editor-store";
import { FORBIDDEN, openWorkspace, visibleCopy, WILLOW } from "../workspace/testing";

// The editor and workspace screens load on demand; the first test in a busy run can be slow.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => useEditorUi.getState().reset());

type GrowthState = {
  orders: Array<{
    id: string;
    number: number;
    status: string;
    fulfillment: string;
    refunded: number;
    total: number;
    tracking: string | null;
  }>;
  inventory: Record<string, { qty: number | null }>;
  commerce: {
    shippingOptions: Array<{
      label: string;
      amount: number;
      freeOver?: number;
      byWeight?: Array<{ upToGrams: number; amount: number }>;
    }>;
    taxEnabled: boolean;
    donationMin: number;
    donationMax: number;
    lowStockThreshold: number;
  };
  discounts: Array<{ code: string; percentOff: number | null; active: boolean }>;
  payments: { mode: string; hasSovereignKey: boolean };
  outbox: Array<{ to: string; kind: string }>;
};
const growth = (hub: { growth: { sites: Record<string, unknown> } }) =>
  hub.growth.sites[WILLOW.id] as GrowthState;
const order = (hub: Parameters<typeof growth>[0], id: string) =>
  growth(hub).orders.find((o) => o.id === id);

describe("orders", () => {
  it("shows orders to send first, flags problem orders and filters to them", async () => {
    const { user } = await openWorkspace("orders");
    expect(await screen.findByRole("row", { name: "Order #1001" })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: "Order #1002" })).toBeNull(); // download only: done
    // Partly refunded but not posted yet still needs sending.
    expect(screen.getByRole("row", { name: "Order #1007" })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: "Order #1008" })).toBeNull(); // a donation
    expect(screen.getByText("1 order needs your attention.")).toBeInTheDocument();
    expect(visibleCopy().match(FORBIDDEN)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show it" }));
    expect(await screen.findByRole("row", { name: "Order #1004" })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: "Order #1001" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "All" }));
    await user.type(screen.getByRole("searchbox"), "#1007");
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
  });

  it("marks an order as sent with tracking and emails the customer", async () => {
    const { user, hub } = await openWorkspace("orders/ord_1");
    await user.click(await screen.findByRole("button", { name: "Mark as sent" }));
    const dialog = await screen.findByRole("dialog", { name: "Mark as sent" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Tracking number (optional)" }),
      "1Z999",
    );
    await user.click(within(dialog).getByRole("button", { name: "Mark as sent" }));
    await waitFor(() =>
      expect(order(hub, "ord_1")).toMatchObject({ fulfillment: "fulfilled", tracking: "1Z999" }),
    );
    expect(growth(hub).outbox.some((m) => m.kind === "order-shipped")).toBe(true);
    expect(await screen.findByText(/tracking 1Z999/)).toBeInTheDocument();
  });

  it("refunds part of an order, then the rest with restock", async () => {
    const { user, hub } = await openWorkspace("orders/ord_1");
    await user.click(await screen.findByRole("button", { name: "Refund" }));
    let dialog = await screen.findByRole("dialog", { name: "Refund order #1001" });
    await user.click(within(dialog).getByRole("radio", { name: "Part of it" }));
    const amount = within(dialog).getByRole("textbox", { name: "Amount" });
    await user.clear(amount);
    await user.type(amount, "10");
    await user.click(within(dialog).getByRole("button", { name: /^Refund \$10\.00$/ }));
    await waitFor(() =>
      expect(order(hub, "ord_1")).toMatchObject({ status: "partially_refunded", refunded: 1000 }),
    );
    const before = growth(hub).inventory["BLOCK-STD"]?.qty ?? 0;
    await user.click(screen.getByRole("button", { name: "Refund" }));
    dialog = await screen.findByRole("dialog", { name: "Refund order #1001" });
    await user.click(within(dialog).getByRole("button", { name: /^Refund \$44\.00$/ }));
    await waitFor(() => expect(order(hub, "ord_1")?.status).toBe("refunded"));
    expect(growth(hub).inventory["BLOCK-STD"]?.qty).toBe(before + 2);
  });

  it("refunds a sold-out order in full", async () => {
    const { user, hub } = await openWorkspace("orders/ord_4");
    expect(await screen.findByText(/automatic refund didn't go through/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refund" }));
    const dialog = await screen.findByRole("dialog", { name: "Refund order #1004" });
    expect(within(dialog).queryByRole("radio", { name: "Part of it" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /^Refund \$34\.00$/ }));
    await waitFor(() =>
      expect(order(hub, "ord_4")).toMatchObject({ status: "refunded", refunded: 3400 }),
    );
  });

  it("prints a packing slip without running anything from it", async () => {
    const { user, hub } = await openWorkspace("orders/ord_3");
    await user.click(await screen.findByRole("button", { name: "Packing slip" }));
    await waitFor(() => expect(hub.calls.some((c) => c.method === "getPackingSlip")).toBe(true));
    const frame = document.querySelector("iframe[sandbox]:not([title])") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(frame.srcdoc).toContain("Packing slip — order #1003");
  });

  it("lets editors fulfil but not refund", async () => {
    await openWorkspace("orders/ord_1", { site: { role: "editor" } });
    expect(await screen.findByRole("button", { name: "Mark as sent" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refund" })).toBeNull();
  });
});

describe("products and stock", () => {
  it("adjusts stock, flags low stock and starts tracking", async () => {
    const { user, hub } = await openWorkspace("products");
    const wide = await screen.findByRole("spinbutton", {
      name: "Stock for Cork yoga block — Wide",
    });
    expect(wide).toHaveValue(2);
    expect(screen.getByText("Low")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "One more Cork yoga block — Wide" }));
    await waitFor(() => expect(growth(hub).inventory["BLOCK-WIDE"]?.qty).toBe(3));
    await user.clear(
      screen.getByRole("spinbutton", { name: "Stock for Cork yoga block — Standard" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Stock for Cork yoga block — Standard" }),
      "40{Enter}",
    );
    await waitFor(() => expect(growth(hub).inventory["BLOCK-STD"]?.qty).toBe(40));
    expect(screen.getByText(/Download ready/)).toBeInTheDocument();
  });
});

describe("subscriptions and weight-based shipping (PRD 5.6)", () => {
  it("shows subscription orders with their interval", async () => {
    await openWorkspace("orders");
    expect((await screen.findAllByText("Monthly subscription")).length).toBeGreaterThan(0);
  });

  it("sets up weight tiers for a shipping option", async () => {
    const { user, hub } = await openWorkspace("store");
    await screen.findByText("Ready to take payments");
    await user.click(screen.getByRole("button", { name: "Add an option" }));
    const last = screen.getAllByRole("group", { name: /Shipping option/ }).at(-1) as HTMLElement;
    await user.click(within(last).getByRole("radio", { name: "By weight" }));
    const tiers = within(last).getByRole("group", { name: "Weight tiers" });
    const w = within(tiers).getByRole("spinbutton", { name: "Tier 1 weight in kilograms" });
    await user.clear(w);
    await user.type(w, "0.25");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Save shipping" }));
    await waitFor(() =>
      expect(growth(hub).commerce.shippingOptions.at(-1)?.byWeight).toEqual([
        { upToGrams: 250, amount: 500 },
        { upToGrams: 2000, amount: 900 },
        { upToGrams: 10_000, amount: 1800 },
      ]),
    );
  });
});

describe("store settings", () => {
  it("adds a pickup option and a free-over threshold, and turns on tax", async () => {
    const { user, hub } = await openWorkspace("store");
    await screen.findByText("Ready to take payments");
    expect(visibleCopy().match(FORBIDDEN)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add an option" }));
    const groups = screen.getAllByRole("group", { name: /Shipping option/ });
    const last = groups.at(-1) as HTMLElement;
    await user.click(within(last).getByRole("radio", { name: "Pickup" }));
    const name = within(last).getByRole("textbox", { name: "Name buyers see" });
    await user.clear(name);
    await user.type(name, "Collect from the studio");
    await user.click(screen.getByRole("button", { name: "Save shipping" }));
    await waitFor(() =>
      expect(growth(hub).commerce.shippingOptions.map((o) => [o.label, o.amount])).toEqual([
        ["Standard shipping", 600],
        ["Pick up at the studio", 0],
        ["Collect from the studio", 0],
      ]),
    );
    expect(growth(hub).commerce.shippingOptions[0]?.freeOver).toBe(7500);
    await user.click(screen.getByRole("switch", { name: /sales tax and VAT/ }));
    await waitFor(() => expect(growth(hub).commerce.taxEnabled).toBe(true));
  });

  it("creates discount codes in capitals and explains a taken code", async () => {
    const { user, hub } = await openWorkspace("store");
    await user.click(await screen.findByRole("button", { name: "New code" }));
    let dialog = await screen.findByRole("dialog", { name: "New discount code" });
    await user.type(within(dialog).getByRole("textbox", { name: "Code" }), "spring20");
    const pct = within(dialog).getByRole("textbox", { name: "Percent" });
    await user.clear(pct);
    await user.type(pct, "20");
    await user.click(within(dialog).getByRole("button", { name: "Create code" }));
    await waitFor(() =>
      expect(growth(hub).discounts.find((d) => d.code === "SPRING20")?.percentOff).toBe(20),
    );
    await user.click(screen.getByRole("button", { name: "New code" }));
    dialog = await screen.findByRole("dialog", { name: "New discount code" });
    await user.type(within(dialog).getByRole("textbox", { name: "Code" }), "welcome10");
    await user.click(within(dialog).getByRole("button", { name: "Create code" }));
    expect(await within(dialog).findByText("WELCOME10 is already a code.")).toBeInTheDocument();
  });

  it("connects Stripe in a new tab and saves sovereign keys without echoing them", async () => {
    const { user, hub } = await openWorkspace("store");
    await screen.findByText("Ready to take payments");
    await user.click(screen.getByRole("button", { name: "Use my own Stripe keys" }));
    const secret = ["sk", "test", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");
    const hook = ["whsec", "abcdefgh12345678"].join("_");
    await user.type(screen.getByLabelText("Secret or restricted key"), secret);
    await user.type(screen.getByLabelText("Webhook signing secret"), hook);
    await user.click(screen.getByRole("button", { name: "Save keys" }));
    expect(await screen.findByText(/Webhook address/)).toBeInTheDocument();
    expect(growth(hub).payments).toMatchObject({ mode: "sovereign", hasSovereignKey: true });
    expect(JSON.stringify(hub.calls)).not.toContain(secret);
    expect(document.body.textContent).not.toContain(secret);
    await user.click(screen.getByRole("button", { name: /Remove my keys/ }));
    await waitFor(() => expect(growth(hub).payments.mode).toBe("connect"));
  });

  it("starts Stripe onboarding when payments aren't connected", async () => {
    const { user, hub } = await openWorkspace("store");
    await screen.findByText("Ready to take payments");
    Object.assign(growth(hub).payments, { ready: false, account: null, chargesEnabled: false });
    await user.click(screen.getByRole("button", { name: "Check again" }));
    const tab = { opener: window as unknown } as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(tab);
    const assign = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, href: realLocation.href, assign },
    });
    try {
      await user.click(await screen.findByRole("button", { name: "Connect Stripe" }));
      await waitFor(() => expect(open).toHaveBeenCalled());
      // A new tab, not "noopener" (which returns null), and the tab can't reach back into Studio.
      expect(open.mock.calls[0]).toEqual([expect.stringContaining("stripe-onboarding"), "_blank"]);
      expect(tab.opener).toBeNull();
      expect(assign).not.toHaveBeenCalled();
      // A blocked pop-up falls back to this tab.
      open.mockReturnValue(null);
      await user.click(screen.getByRole("button", { name: /Continue in Stripe|Connect Stripe/ }));
      await waitFor(() =>
        expect(assign).toHaveBeenCalledWith(expect.stringContaining("stripe-onboarding")),
      );
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: realLocation });
      open.mockRestore();
    }
  });

  it("saves low-stock alerts", async () => {
    const { user, hub } = await openWorkspace("store");
    const threshold = await screen.findByRole("spinbutton", {
      name: "Warn me when stock drops to",
    });
    await user.clear(threshold);
    await user.type(threshold, "5");
    await user.click(screen.getByRole("button", { name: "Save alerts" }));
    await waitFor(() => expect(growth(hub).commerce.lowStockThreshold).toBe(5));
  });
});

describe("donations", () => {
  it("validates and saves gift limits and totals gifts received", async () => {
    const { user, hub } = await openWorkspace("donations");
    expect(await screen.findByText("Total given")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Total given").parentElement?.textContent).toContain("$50.00"),
    );
    expect(await screen.findByRole("heading", { name: "Recent gifts" })).toBeInTheDocument();
    const min = screen.getByRole("textbox", { name: "Smallest gift" });
    await user.clear(min);
    await user.type(min, "9000");
    await user.click(screen.getByRole("button", { name: "Save limits" }));
    expect(
      await screen.findByText("The smallest gift must be less than the largest."),
    ).toBeInTheDocument();
    await user.clear(min);
    await user.type(min, "3");
    await user.click(screen.getByRole("button", { name: "Save limits" }));
    await waitFor(() => expect(growth(hub).commerce.donationMin).toBe(3));
  });
});
