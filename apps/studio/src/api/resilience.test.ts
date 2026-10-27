import { describe, expect, it, vi } from "vitest";
import {
  backoffMs,
  isRetryableRequest,
  isTransientError,
  useConnection,
  withRetry,
} from "./resilience";
import { HubError } from "./types";

const ok = () => new Response("{}", { status: 200 });
const busy = () =>
  new Response("<html><title>Worker exceeded resource limits</title></html>", { status: 503 });
const noSleep = { sleep: async () => {} };

describe("withRetry", () => {
  it("retries a GET through network errors (CORS-less 1102 pages) and 503s", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(busy())
      .mockResolvedValueOnce(ok());
    const res = await withRetry(f, noSleep)("https://hub/api/sites");
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("never repeats a write without an Idempotency-Key", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(busy());
    const res = await withRetry(f, noSleep)("https://hub/api/sites", { method: "POST" });
    expect(res.status).toBe(503);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("repeats a write that carries an Idempotency-Key", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(ok());
    const res = await withRetry(f, noSleep)("https://hub/api/sites", {
      method: "POST",
      headers: { "Idempotency-Key": "abc" },
    });
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last attempt and hands back the failure", async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(withRetry(f, { ...noSleep, retries: 2 })("https://hub/x")).rejects.toThrow(
      TypeError,
    );
    expect(f).toHaveBeenCalledTimes(3);
    // Other errors aren't retried.
    const g = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 404 }));
    expect((await withRetry(g, noSleep)("https://hub/x")).status).toBe(404);
    expect(g).toHaveBeenCalledTimes(1);
  });

  it("counts requests that are reconnecting while they wait", async () => {
    let release: () => void = () => {};
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok());
    const p = withRetry(f, {
      sleep: () =>
        new Promise<void>((r) => {
          release = r;
        }),
    })("https://hub/x");
    await vi.waitFor(() => expect(useConnection.getState().retrying).toBe(1));
    release();
    await p;
    expect(useConnection.getState().retrying).toBe(0);
  });
});

describe("helpers", () => {
  it("backs off exponentially with jitter, capped", () => {
    expect(backoffMs(0, { random: () => 0 })).toBe(100);
    expect(backoffMs(0, { random: () => 1 })).toBe(400);
    expect(backoffMs(3, { random: () => 1 })).toBe(3200);
    expect(backoffMs(10, { random: () => 1 })).toBe(5000);
  });

  it("knows which requests and failures are safe to retry", () => {
    expect(isRetryableRequest(undefined)).toBe(true);
    expect(isRetryableRequest({ method: "PATCH" })).toBe(false);
    expect(
      isRetryableRequest({ method: "POST", headers: new Headers({ "idempotency-key": "k" }) }),
    ).toBe(true);
    expect(isTransientError(new HubError(0, "network", "x"))).toBe(true);
    expect(isTransientError(new HubError(503, "unavailable", "x"))).toBe(true);
    expect(isTransientError(new HubError(500, "internal", "x"))).toBe(false);
    expect(isTransientError(new HubError(404, "not_found", "x"))).toBe(false);
  });
});
