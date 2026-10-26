import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { GitHubAppConfig } from "../src/env";
import { GitHubAppAccess } from "../src/github/app";
import { DevGitHubAccess } from "../src/github/dev";
import { DRAFT_BRANCH, MAIN_BRANCH, parseRepo } from "../src/github/types";
import {
  apexOf,
  DohResolver,
  dnsChecklist,
  GITHUB_PAGES_IPV4,
  normalizeHostname,
  parseRdap,
  progressMessage,
  recordsFor,
} from "../src/services/domains";
import { REGISTRARS } from "../src/services/registrars";
import { call } from "./helpers";
import { generateAppKey, pem } from "./keys";
import { mockFetch } from "./mock-fetch";
import { CONTACT_FORM, makePublicApp, siteWithForm, VALID } from "./public-helpers";

const rdapBody = (registrar: string, ns: string[]) => ({
  objectClassName: "domain",
  entities: [
    {
      roles: ["registrar"],
      vcardArray: [
        "vcard",
        [
          ["version", {}, "text", "4.0"],
          ["fn", {}, "text", registrar],
        ],
      ],
    },
  ],
  nameservers: ns.map((n) => ({ ldhName: n.toUpperCase() })),
});

async function configOf(repo: string, branch: string) {
  const gh = new DevGitHubAccess(env.HUB_DB);
  const r = parseRepo(repo);
  const head = (await gh.getRef(r, branch)) as string;
  return JSON.parse((await gh.readFile(r, "openspace.json", head)) as string) as {
    deploy: { customDomain: string | null };
  };
}

describe("domain helpers", () => {
  it("normalizes hostnames and finds the apex", () => {
    expect(normalizeHostname(" https://WWW.MayaYoga.com/about ")).toBe("www.mayayoga.com");
    expect(() => normalizeHostname("not a domain")).toThrow();
    expect(apexOf("www.mayayoga.co.uk")).toBe("mayayoga.co.uk");
    expect(apexOf("blog.maya.com")).toBe("maya.com");
  });

  it("lists the exact records: four apex A records + www CNAME (AAAA optional)", () => {
    const records = recordsFor("mayayoga.com", "maya-lin/maya-yoga");
    expect(records.filter((r) => r.type === "A").map((r) => r.value)).toEqual(GITHUB_PAGES_IPV4);
    expect(records.find((r) => r.type === "CNAME")).toEqual({
      type: "CNAME",
      host: "www",
      name: "www.mayayoga.com",
      value: "maya-lin.github.io",
    });
    expect(records.filter((r) => r.type === "AAAA").every((r) => r.optional)).toBe(true);
    expect(recordsFor("blog.maya.com", "maya/site")).toEqual([
      { type: "CNAME", host: "blog", name: "blog.maya.com", value: "maya.github.io" },
    ]);
  });

  it("parses RDAP and has guides for the top 8 registrars", () => {
    expect(parseRdap(rdapBody("NameCheap, Inc.", ["dns1.registrar-servers.com"]))).toEqual({
      registrar: "NameCheap, Inc.",
      nameservers: ["dns1.registrar-servers.com"],
    });
    expect(REGISTRARS.map((r) => r.id)).toEqual([
      "namecheap",
      "godaddy",
      "cloudflare",
      "squarespace",
      "porkbun",
      "hover",
      "gandi",
      "namecom",
    ]);
  });

  it("builds the DoH checklist and plain-language progress", async () => {
    const answers: Record<string, unknown> = {
      "mayayoga.com|A": {
        Answer: [...GITHUB_PAGES_IPV4.slice(0, 3), "203.0.113.5"].map((data) => ({
          type: 1,
          data,
        })),
      },
      "www.mayayoga.com|CNAME": { Answer: [{ type: 5, data: "maya-lin.github.io." }] },
    };
    const mock = mockFetch([
      [
        "GET",
        /cloudflare-dns\.com\/dns-query/,
        (c) => {
          const u = new URL(c.url);
          return (
            answers[`${u.searchParams.get("name")}|${u.searchParams.get("type")}`] ?? { Status: 0 }
          );
        },
      ],
    ]);
    const resolver = new DohResolver(mock.fetch);
    const items = await dnsChecklist(resolver, "mayayoga.com", "maya-lin/maya-yoga");
    expect(items.map((i) => [i.id, i.ok])).toEqual([
      ["apex", false],
      ["www", true],
    ]);
    expect(items[0]?.hint).toBe("Remove the other A record: 203.0.113.5.");
    expect(progressMessage(items, "pending")).toBe(
      "✓ www.mayayoga.com points to GitHub — waiting for the main domain",
    );
    expect(mock.calls[0]?.headers.get("accept")).toBe("application/dns-json");
  });
});

describe("custom domain wizard API", () => {
  it("looks up the registrar and shows registrar-specific steps", async () => {
    const mock = mockFetch([
      [
        "GET",
        /rdap\.org\/domain\/mayayoga\.com$/,
        () => rdapBody("GoDaddy.com, LLC", ["ns1.cloudflare.com", "kim.ns.cloudflare.com"]),
      ],
      ["GET", /rdap\.org\/domain\/unknown\.com$/, () => new Response("", { status: 404 })],
    ]);
    const app = makePublicApp({ fetch: mock.fetch });
    const f = await siteWithForm(app, { form: null });
    const res = await call(app, `/api/sites/${f.siteId}/domain/lookup`, {
      method: "POST",
      cookie: f.cookie,
      json: { domain: "www.mayayoga.com" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      apex: string;
      registrar: string;
      guide: { id: string; steps: string[] };
      records: unknown[];
    };
    // DNS is hosted at Cloudflare even though GoDaddy is the registrar: Cloudflare's steps win.
    expect(body).toMatchObject({
      apex: "mayayoga.com",
      registrar: "GoDaddy.com, LLC",
      guide: { id: "cloudflare" },
    });
    expect(body.records).toHaveLength(9);
    const unknown = (await (
      await call(app, `/api/sites/${f.siteId}/domain/lookup`, {
        method: "POST",
        cookie: f.cookie,
        json: { domain: "unknown.com" },
      })
    ).json()) as { guide: { id: string } };
    expect(unknown.guide.id).toBe("other");
    const regs = (await (await call(app, "/api/domains/registrars")).json()) as {
      registrars: unknown[];
    };
    expect(regs.registrars).toHaveLength(8);
  });

  it("connects, verifies (dev DNS), enforces HTTPS, updates openspace.json and removes", async () => {
    const mock = mockFetch([
      ["GET", /rdap\.org/, () => rdapBody("Porkbun LLC", ["curitiba.porkbun.com"])],
    ]);
    const app = makePublicApp({ fetch: mock.fetch });
    const f = await siteWithForm(app);
    // Make sure there is a draft branch to update too.
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = parseRepo(f.repo);
    expect(await gh.getRef(repo, DRAFT_BRANCH)).not.toBeNull();

    const connect = await call(app, `/api/sites/${f.siteId}/domain`, {
      method: "POST",
      cookie: f.cookie,
      json: { domain: "mayayoga.test" },
    });
    expect(connect.status).toBe(201);
    expect(
      ((await connect.json()) as { domain: { status: string; registrar: string } }).domain,
    ).toMatchObject({ status: "pending", registrar: "Porkbun LLC" });
    expect((await gh.getPages(repo))?.cname).toBe("mayayoga.test");

    // The new domain may call public endpoints straight away.
    const form = await call(app, `/f/${f.siteId}/${CONTACT_FORM.id}`, {
      method: "POST",
      headers: { Origin: "https://www.mayayoga.test", Accept: "application/json" },
      json: VALID,
    });
    expect(form.status).toBe(200);
    expect(form.headers.get("access-control-allow-origin")).toBe("https://www.mayayoga.test");

    const check = await call(app, `/api/sites/${f.siteId}/domain/check`, {
      method: "POST",
      cookie: f.cookie,
    });
    const view = (
      (await check.json()) as {
        domain: {
          status: string;
          https: boolean;
          checklist: Array<{ id: string; ok: boolean }>;
          message: string;
        };
      }
    ).domain;
    expect(view.status).toBe("active");
    expect(view.https).toBe(true);
    expect(view.checklist.map((i) => [i.id, i.ok])).toEqual([
      ["apex", true],
      ["www", true],
      ["https", true],
    ]);
    expect(view.message).toBe("Your domain is connected and secure.");
    expect((await gh.getPages(repo))?.httpsEnforced).toBe(true);
    expect((await configOf(f.repo, MAIN_BRANCH)).deploy.customDomain).toBe("mayayoga.test");
    expect((await configOf(f.repo, DRAFT_BRANCH)).deploy.customDomain).toBe("mayayoga.test");
    const get = (await (
      await call(app, `/api/sites/${f.siteId}/domain`, { cookie: f.cookie })
    ).json()) as { domain: { status: string } };
    expect(get.domain.status).toBe("active");

    const del = await call(app, `/api/sites/${f.siteId}/domain`, {
      method: "DELETE",
      cookie: f.cookie,
    });
    expect(del.status).toBe(200);
    expect((await gh.getPages(repo))?.cname).toBeNull();
    expect((await configOf(f.repo, MAIN_BRANCH)).deploy.customDomain).toBeNull();
    const actions = (
      await env.HUB_DB.prepare(
        "SELECT action FROM audit_log WHERE site_id = ? AND action LIKE 'domain.%' ORDER BY at",
      )
        .bind(f.siteId)
        .all<{ action: string }>()
    ).results.map((r) => r.action);
    expect(actions).toEqual(["domain.connect", "domain.activate", "domain.remove"]);
  });

  it("keeps a domain on one site and needs designer rights", async () => {
    const mock = mockFetch([["GET", /rdap\.org/, () => new Response("", { status: 404 })]]);
    const app = makePublicApp({ fetch: mock.fetch });
    const a = await siteWithForm(app, { form: null, name: "Site A" });
    const b = await siteWithForm(app, { form: null, name: "Site B" });
    expect(
      (
        await call(app, `/api/sites/${a.siteId}/domain`, {
          method: "POST",
          cookie: a.cookie,
          json: { domain: "shared.test" },
        })
      ).status,
    ).toBe(201);
    const taken = await call(app, `/api/sites/${b.siteId}/domain`, {
      method: "POST",
      cookie: b.cookie,
      json: { domain: "shared.test" },
    });
    expect(taken.status).toBe(409);
    expect(
      (await call(app, `/api/sites/${a.siteId}/domain/check`, { method: "POST" })).status,
    ).toBe(401);
    expect(
      (
        await call(app, `/api/sites/${a.siteId}/domain`, {
          method: "POST",
          cookie: a.cookie,
          json: { domain: "nope" },
        })
      ).status,
    ).toBe(400);
  });
});

describe("GitHub Pages domain + HTTPS (GitHub App)", () => {
  it("reads certificate state and enforces HTTPS through the Pages API", async () => {
    const { pkcs8 } = await generateAppKey();
    const appCfg: GitHubAppConfig = {
      appId: "1",
      privateKey: pem("PRIVATE KEY", pkcs8),
      clientId: "c",
      clientSecret: "s",
      slug: "os",
    };
    const m = mockFetch([
      ["POST", /access_tokens$/, () => ({ token: "ghs_x", expires_at: "2099-01-01T00:00:00Z" })],
      [
        "GET",
        /\/repos\/maya\/site\/pages$/,
        () => ({
          html_url: "https://mayayoga.com/",
          cname: "mayayoga.com",
          https_enforced: false,
          https_certificate: { state: "approved" },
        }),
      ],
      ["PUT", /\/repos\/maya\/site\/pages$/, () => new Response(null, { status: 204 })],
    ]);
    const gh = new GitHubAppAccess({ app: appCfg, installationId: 9, fetch: m.fetch });
    expect(await gh.getPages({ owner: "maya", name: "site" })).toEqual({
      url: "https://mayayoga.com/",
      cname: "mayayoga.com",
      httpsEnforced: false,
      certificate: "approved",
    });
    await gh.setPagesHttps({ owner: "maya", name: "site" }, true);
    expect(m.calls.find((c) => c.method === "PUT")?.body).toEqual({ https_enforced: true });
  });
});
