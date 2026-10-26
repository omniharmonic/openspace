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
