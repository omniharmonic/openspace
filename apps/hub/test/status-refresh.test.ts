import { describe, expect, it } from "vitest";
import type { Services } from "../src/services";
import { refreshStatus } from "../src/services/sites";

// Studio polls GET /api/sites/:id while a site is being set up, and that check asks GitHub.
// A GitHub call that never answers must not hold the poll (and the phone's editor) up.
describe("site status refresh", () => {
  const building = { id: "st_1", repo: "o/r", status: "building" } as never;

  it("answers with the stored status when GitHub doesn't answer in time", async () => {
    const services = {
      github: () => ({ workflowStatus: () => new Promise(() => {}) }),
      db: null,
      now: () => 0,
    } as unknown as Services;
    const started = Date.now();
    const site = await refreshStatus(services, building, undefined, 30);
    expect(site).toMatchObject({ id: "st_1", status: "building" });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
