import { describe, expect, it, vi } from "vitest";
import { createHttpHub, githubStartUrl } from "./http";
import { HubError } from "./types";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createHttpHub", () => {
  it("sends credentials and JSON to the configured base URL", async () => {
    const fetch = vi.fn(async () => jsonResponse({ site: { id: "st_0000000000" } }));
    const hub = createHttpHub({ baseUrl: "https://hub.example/", fetch });
    await hub.createSite({ template: "meadow", look: "oat", name: "Willow", tagline: "Yoga" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hub.example/api/sites");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      template: "meadow",
      look: "oat",
      name: "Willow",
      tagline: "Yoga",
    });
  });

  it("unwraps list envelopes and bare arrays", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sites: [{ id: "a" }] }))
      .mockResolvedValueOnce(jsonResponse([{ id: "b" }]));
    const hub = createHttpHub({ fetch });
    expect(await hub.listSites()).toEqual([{ id: "a" }]);
    expect(await hub.listSites()).toEqual([{ id: "b" }]);
    expect(fetch.mock.calls[0]?.[0]).toBe("http://localhost:8787/api/sites");
  });

  it("treats 401 from /api/me as signed out", async () => {
    const hub = createHttpHub({ fetch: vi.fn(async () => jsonResponse({ error: "nope" }, 401)) });
    expect(await hub.getSession()).toEqual({ user: null, auth: { github: true, dev: false } });
  });

  it("raises HubError with the server's code and message", async () => {
    const hub = createHttpHub({
      fetch: vi.fn(async () =>
        jsonResponse({ error: { code: "quota", message: "Too many sites" } }, 429),
      ),
    });
    await expect(hub.listSites()).rejects.toMatchObject({
      status: 429,
      code: "quota",
      message: "Too many sites",
    });
  });

  it("maps network failures to a plain-language HubError", async () => {
    const hub = createHttpHub({
      fetch: vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    });
    const err = await hub.listTemplates().catch((e) => e);
    expect(err).toBeInstanceOf(HubError);
    expect(err.code).toBe("network");
  });

  it("posts the transfer recipient and dev login name", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ user: { id: "u", login: "ana", name: "Ana", avatarUrl: null } }),
    );
    const hub = createHttpHub({ fetch });
    expect(await hub.devLogin("Ana")).toMatchObject({ login: "ana" });
    await hub.transferSite("st_1", "client").catch(() => undefined);
    expect(fetch.mock.calls[0]?.[0]).toBe("http://localhost:8787/auth/dev/login");
    expect(fetch.mock.calls[1]?.[0]).toBe("http://localhost:8787/api/sites/st_1/transfer");
    expect(
      JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string),
    ).toEqual({ to: "client" });
  });

  it("navigates to the Hub for GitHub sign-in", async () => {
    const navigate = vi.fn();
    const hub = createHttpHub({ baseUrl: "https://hub.example", navigate, fetch: vi.fn() });
    expect(
      await hub.startGitHubSignIn({ template: "meadow", name: "Willow", returnTo: "/new/meadow" }),
    ).toBeNull();
    const url = new URL(navigate.mock.calls[0]?.[0] as string);
    expect(url.origin + url.pathname).toBe("https://hub.example/auth/github/start");
    expect(url.searchParams.get("template")).toBe("meadow");
    expect(url.searchParams.get("name")).toBe("Willow");
    expect(url.searchParams.get("return_to")).toMatch(/\/new\/meadow$/);
  });

  it("builds the GitHub start URL without optional params", () => {
    expect(githubStartUrl("https://hub.example/", {})).toBe(
      "https://hub.example/auth/github/start",
    );
  });
});

describe("draft room and publishing routes", () => {
  it("opens the room WebSocket with since and relays frames", () => {
    const made: Array<{ url: string; ws: Record<string, unknown> }> = [];
    class FakeWS {
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onclose: ((e: { code: number; reason: string }) => void) | null = null;
      sent: string[] = [];
      constructor(url: string) {
        made.push({ url, ws: this as unknown as Record<string, unknown> });
      }
      send(d: string) {
        this.sent.push(d);
      }
      close() {}
    }
    const hub = createHttpHub({
      baseUrl: "https://hub.example",
      WebSocket: FakeWS as unknown as typeof WebSocket,
    });
    const sock = hub.connectRoom("st_1", 42);
    expect(made[0]?.url).toBe("wss://hub.example/api/sites/st_1/room?since=42");
    const got: string[] = [];
    sock.onmessage = (d) => got.push(d);
    const ws = made[0]?.ws as unknown as FakeWS;
    ws.onmessage?.({ data: '{"type":"flushed"}' });
    expect(got).toEqual(['{"type":"flushed"}']);
    sock.send("ping");
    expect(ws.sent).toEqual(["ping"]);
    hub.connectRoom("st_1", null);
    expect(made[1]?.url).toBe("wss://hub.example/api/sites/st_1/room");
    expect(createHttpHub({ WebSocket: FakeWS as never }).connectRoom("s", 0)).toBeTruthy();
    expect(made[2]?.url).toBe("ws://localhost:8787/api/sites/s/room?since=0");
  });

  it("splits the publish response into the site and the outcome", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        id: "st_1",
        name: "W",
        publish: { status: "published", sha: "abc", summary: "Edited Home" },
      }),
    );
    const hub = createHttpHub({ fetch: fetch as never });
    const r = await hub.publish("st_1");
    expect(r.site).toEqual({ id: "st_1", name: "W" });
    expect(r.publish).toEqual({ status: "published", sha: "abc", summary: "Edited Home" });
    expect((fetch.mock.calls as unknown[][])[0]?.[0]).toBe(
      "http://localhost:8787/api/sites/st_1/publish",
    );
  });

  it("calls the history, schedule and agent routes", async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/versions")) return jsonResponse({ versions: [{ sha: "a" }] });
      if (url.endsWith("/snapshots")) return jsonResponse({ snapshots: [{ name: "x" }] });
      if (url.endsWith("/schedule")) return jsonResponse({ schedules: [] });
      if (url.endsWith("/room/document")) return jsonResponse({ document: {}, seq: 3, head: "h" });
      return jsonResponse({ ok: true });
    });
    const hub = createHttpHub({ fetch: fetch as never });
    expect(await hub.listVersions("s")).toEqual([{ sha: "a" }]);
    expect(await hub.listSnapshots("s")).toEqual([{ name: "x" }]);
    expect(await hub.listSchedules("s")).toEqual([]);
    expect(await hub.getRoomDocument("s")).toEqual({ document: {}, seq: 3, head: "h" });
    await hub.rollback("s", "abcdef1");
    await hub.schedulePublish("s", new Date(Date.UTC(2026, 11, 1, 9)));
    await hub.undoAgentSession("s", "ses1");
    await hub.getDocument("s", { ref: "published" });
    const calls = fetch.mock.calls.map(([url, init]) => [
      init?.method,
      url.replace("http://localhost:8787", ""),
      init?.body ? JSON.parse(init.body as string) : undefined,
    ]);
    expect(calls.slice(4)).toEqual([
      ["POST", "/api/sites/s/rollback", { sha: "abcdef1" }],
      ["POST", "/api/sites/s/schedule", { at: "2026-12-01T09:00:00.000Z" }],
      ["POST", "/api/sites/s/room/agent-sessions/ses1/undo", {}],
      ["GET", "/api/sites/s/document?ref=published", undefined],
    ]);
  });
});
