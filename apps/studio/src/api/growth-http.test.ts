import { describe, expect, it, vi } from "vitest";
import { queryString } from "./growth-http";
import { createHttpHub } from "./http";
import { HubError } from "./types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function hubWith(responses: unknown[]) {
  const fetch = vi.fn();
  for (const r of responses) fetch.mockResolvedValueOnce(r instanceof Response ? r : json(r));
  return { hub: createHttpHub({ baseUrl: "https://hub.example", fetch }), fetch };
}

const call = (fetch: ReturnType<typeof vi.fn>, i = 0) => {
  const [url, init] = fetch.mock.calls[i] as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
};

describe("Hub contract for Task 25 routes", () => {
  it("builds query strings with repeated keys and drops empty values", () => {
    expect(queryString({ tag: ["a", "b"], match: "all", q: "", unread: true, spam: false })).toBe(
      "?tag=a&tag=b&match=all&unread=1",
    );
    expect(queryString({})).toBe("");
  });

  it("calls the inbox, subscriber and analytics routes (Task 16)", async () => {
    const { hub, fetch } = hubWith([
      { submissions: [], nextCursor: null, total: 0, unread: 0 },
      { changed: 2 },
      { deleted: 1 },
      { added: 1, updated: 0, skipped: [] },
      { range: { name: "week" } },
      { settings: { retentionMonths: 6 } },
    ]);
    await hub.listSubmissions("st_1", { form: "contact", q: "yoga", unread: true, limit: 50 });
    expect(call(fetch).url).toBe(
      "https://hub.example/api/sites/st_1/submissions?form=contact&q=yoga&unread=1&limit=50",
    );
    await hub.markSubmissionsRead("st_1", { all: true, form: "contact" });
    expect(call(fetch, 1)).toMatchObject({
      url: "https://hub.example/api/sites/st_1/submissions/mark-read",
      method: "POST",
      body: { all: true, form: "contact" },
    });
    await hub.deleteSubmissions("st_1", ["sub_1"]);
    expect(call(fetch, 2)).toMatchObject({
      url: expect.stringMatching(/submissions\/delete$/),
      body: { ids: ["sub_1"] },
    });
    await hub.importSubscribers("st_1", { csv: "email\na@b.co", consent: true });
    expect(call(fetch, 3).body).toEqual({ csv: "email\na@b.co", consent: true });
    await hub.getAnalytics("st_1", { from: "2026-10-01", to: "2026-10-26" });
    expect(call(fetch, 4).url).toBe(
      "https://hub.example/api/sites/st_1/analytics?from=2026-10-01&to=2026-10-26",
    );
    expect(await hub.updateServiceSettings("st_1", { retentionMonths: 6 })).toEqual({
      retentionMonths: 6,
    });
    expect(call(fetch, 5)).toMatchObject({
      method: "PATCH",
      url: expect.stringMatching(/services\/settings$/),
    });
  });

  it("calls the commerce, orders and discount routes (Task 18)", async () => {
    const { hub, fetch } = hubWith([
      { orders: [], nextCursor: null },
      { order: { id: "ord_1" } },
      { order: { id: "ord_1" } },
      { payments: { ready: true } },
      { discount: { code: "SPRING" } },
      { inventory: { sku: "A", qty: 4 } },
      new Response(null, { status: 200 }),
    ]);
    await hub.listOrders("st_1", { problem: true, kind: "order" });
    expect(call(fetch).url).toBe("https://hub.example/api/sites/st_1/orders?problem=1&kind=order");
    await hub.refundOrder("st_1", "ord_1", { amount: 500, restock: false });
    expect(call(fetch, 1)).toMatchObject({ method: "POST", body: { amount: 500, restock: false } });
    await hub.fulfillOrder("st_1", "ord_1", { tracking: "1Z", notify: true });
    expect(call(fetch, 2).url).toMatch(/orders\/ord_1\/fulfill$/);
    await hub.refreshStripeConnect("st_1");
    expect(call(fetch, 3)).toMatchObject({
      method: "POST",
      url: expect.stringMatching(/commerce\/connect\/refresh$/),
    });
    await hub.createDiscount("st_1", { code: "SPRING", percentOff: 10 });
    expect(call(fetch, 4).body).toEqual({ code: "SPRING", percentOff: 10 });
    await hub.adjustInventory("st_1", "A", -1);
    expect(call(fetch, 5).body).toEqual({ sku: "A", delta: -1 });
    await hub.uploadProductFile(
      "st_1",
      "GUIDE",
      new Blob(["pdf"], { type: "application/pdf" }),
      "guide.pdf",
    );
    const [url, init] = fetch.mock.calls[6] as [string, RequestInit];
    expect(url).toBe("https://hub.example/api/sites/st_1/products/file?sku=GUIDE");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["X-Filename"]).toBe("guide.pdf");
  });

  it("calls the campaign, sender and member routes and passes the reviewed version on approve", async () => {
    const { hub, fetch } = hubWith([
      { count: 12 },
      { campaign: { id: "c" } },
      { sender: { id: "s" } },
      { member: { id: "m" }, invited: true },
      { approval: { id: "a" } },
      json({ error: { code: "changed_since_review", message: "Changed" } }, 409),
    ]);
    expect(await hub.countSegment("st_1", { tags: ["a", "b"], match: "all" })).toBe(12);
    expect(call(fetch).url).toBe(
      "https://hub.example/api/sites/st_1/segments/count?tag=a&tag=b&match=all",
    );
    await hub.scheduleCampaign("st_1", "c", "2026-11-01T09:00:00Z");
    expect(call(fetch, 1)).toMatchObject({
      url: expect.stringMatching(/campaigns\/c\/schedule$/),
      body: { sendAt: "2026-11-01T09:00:00Z" },
    });
    await hub.verifySender("st_1", "s");
    expect(call(fetch, 2).url).toMatch(/senders\/s\/verify$/);
    expect(await hub.addMember("st_1", { email: "a@b.co", invite: true })).toEqual({
      member: { id: "m" },
      invited: true,
    });
    await hub.decideApproval("st_1", "a", "approve", undefined, "hash123");
    expect(call(fetch, 4).body).toEqual({ contentHash: "hash123" });
    await expect(
      hub.decideApproval("st_1", "a", "approve", undefined, "old"),
    ).rejects.toMatchObject(new HubError(409, "changed_since_review", "Changed"));
  });
});
