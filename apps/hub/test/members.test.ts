import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DevGitHubAccess } from "../src/github/dev";
import { MAIN_BRANCH, parseRepo } from "../src/github/types";
import { sha256Hex } from "../src/lib/crypto";
import { checkPagePassword, hashPagePassword, memberReturnPath } from "../src/services/members";
import { call, cookieFrom, type TestApp } from "./helpers";
import { makePublicApp, outbox, type SiteFixture, siteWithForm } from "./public-helpers";

const b64urlDecode = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) =>
    c.charCodeAt(0),
  );
};
const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlDecode(s)));

/** What site-kit's `verifyHubToken` does: kid lookup in the JWKS, ES256 verify, claims. */
async function verifyLikeSiteKit(app: TestApp, token: string) {
  const jwks = (await (await call(app, "/.well-known/jwks.json")).json()) as {
    keys: Array<JsonWebKey & { kid: string; alg: string }>;
  };
  const [h, p, s] = token.split(".") as [string, string, string];
  const header = decodeJson(h);
  const jwk = jwks.keys.find((k) => k.kid === header.kid && k.alg === header.alg);
  if (!jwk) throw new Error("unknown kid");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    b64urlDecode(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  return { ok, header, claims: decodeJson(p) as Record<string, unknown> };
}

/** Add a members-only page and a password page to the published site. */
async function gatedSite(app: TestApp): Promise<SiteFixture> {
  const f = await siteWithForm(app, { form: null, name: "Juniper Members" });
  const gh = new DevGitHubAccess(env.HUB_DB);
  const repo = parseRepo(f.repo);
  const head = (await gh.getRef(repo, MAIN_BRANCH)) as string;
  const page = (
    id: string,
    slug: string,
    title: string,
    access: Record<string, boolean | string[]>,
    text: string,
  ) => ({
    path: `content/pages/${slug}.json`,
    content: JSON.stringify({
      id,
      title,
      slug,
      access,
      sections: [
        {
          id: `sec_${id.slice(3)}`,
          layout: { mode: "stack", columns: { d: [12] } },
          style: {},
          blocks: [
            {
              id: `blk_${id.slice(3)}`,
              type: "text",
              v: 1,
              fields: {
                content: {
                  type: "doc",
                  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
                },
              },
            },
          ],
        },
      ],
    }),
  });
  await gh.commitFiles(repo, {
    branch: MAIN_BRANCH,
    expectedHead: head,
    message: "Add gated pages",
    files: [
      page("pg_members000", "members", "Members", { members: true }, "Secret class recordings"),
      page("pg_retreat000", "retreat", "Retreat", { password: true }, "Retreat packing list"),
      page(
        "pg_gdsessn000",
        "gold",
        "Gold sessions",
        { members: true, tiers: ["tier_gold"] },
        "Gold tier recordings",
      ),
    ],
  });
  return f;
}

async function login(
  app: TestApp,
  siteId: string,
  email: string,
  extra: Record<string, string> = {},
) {
  return call(app, `/m/${siteId}/login`, {
    method: "POST",
    headers: { Accept: "application/json" },
    json: { email, return_to: `/s/${siteId}/members`, ...extra },
  });
}

async function magicLink(app: TestApp, email: string): Promise<string> {
  const mails = await outbox(app, `?kind=member-magic-link&to=${encodeURIComponent(email)}`);
  const link = mails[0]?.links.find((l) => l.includes("/verify/"));
  if (!link) throw new Error("no magic link");
  return new URL(link).pathname;
}

describe("member sign-in (magic link, Hub-signed ES256 token)", () => {
  it("round trip: email, single-use link, JWT verifiable against the JWKS, site callback", async () => {
    const app = makePublicApp();
    const f = await gatedSite(app);
    const res = await login(app, f.siteId, "Ana@Example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    const path = await magicLink(app, "ana@example.com");
    expect(path).toMatch(new RegExp(`^/m/${f.siteId}/verify/[A-Za-z0-9_-]{40,}$`));
    const token = path.split("/").pop() as string;
    // Only the hash is stored.
    const stored = await env.HUB_DB.prepare("SELECT token_hash FROM member_links WHERE site_id = ?")
      .bind(f.siteId)
      .first<{ token_hash: string }>();
    expect(stored?.token_hash).toBe(await sha256Hex(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    // GET never uses the link (mail scanners prefetch).
    const page = await call(app, path);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<form method="post"');
    const used = await call(app, path, { method: "POST", redirect: "manual" });
    expect(used.status).toBe(303);
    const loc = new URL(used.headers.get("location") as string);
    expect(`${loc.origin}${loc.pathname}`).toBe(
      `http://localhost:8787/s/${f.siteId}/_os/auth/callback`,
    );
    expect(loc.searchParams.get("return")).toBe(`/s/${f.siteId}/members`);
    const jwt = loc.searchParams.get("token") as string;
    const v = await verifyLikeSiteKit(app, jwt);
    expect(v.ok).toBe(true);
    expect(v.header).toMatchObject({ alg: "ES256", typ: "JWT" });
    expect(v.claims).toMatchObject({
      iss: "http://localhost:8787",
      aud: f.siteId,
      email: "ana@example.com",
    });
    expect(String(v.claims.sub)).toMatch(/^mem_/);
    expect(Number(v.claims.exp) - Number(v.claims.iat)).toBe(300);
    // Single use.
    expect((await call(app, path, { method: "POST", redirect: "manual" })).status).toBe(404);
    expect((await call(app, path)).status).toBe(404);
    // A tampered token fails verification.
    const [h, p, s] = jwt.split(".");
    const forged = `${h}.${btoa(JSON.stringify({ ...v.claims, aud: "st_other" })).replace(/=+$/, "")}.${s}`;
    expect((await verifyLikeSiteKit(app, forged)).ok).toBe(false);
    void p;
  });

  it("dev preview enforces gating: no member session, no members content", async () => {
    const app = makePublicApp();
    const f = await gatedSite(app);
    const anon = await call(app, `/s/${f.siteId}/members`, { redirect: "manual" });
    expect(anon.status).toBe(303);
    expect(anon.headers.get("location")).toBe(
      `http://localhost:8787/m/${f.siteId}/login?return=%2Fs%2F${f.siteId}%2Fmembers`,
    );
    expect(await anon.text()).not.toContain("Secret class recordings");
    // Forged cookie.
    const forged = await call(app, `/s/${f.siteId}/members`, {
      redirect: "manual",
      cookie: "os_member=eyJzdWIiOiJtZW1fMSJ9.AAAA",
    });
    expect(forged.status).toBe(303);
    // Sign in through the magic link and the preview's callback.
    await login(app, f.siteId, "ana@example.com");
    const used = await call(app, await magicLink(app, "ana@example.com"), {
      method: "POST",
      redirect: "manual",
    });
    const cb = new URL(used.headers.get("location") as string);
    const landed = await call(app, `${cb.pathname}${cb.search}`, { redirect: "manual" });
    expect(landed.status).toBe(303);
    expect(landed.headers.get("location")).toBe(`/s/${f.siteId}/members`);
    const setCookie = landed.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain(`Path=/s/${f.siteId}/`);
    const cookie = cookieFrom(landed, "os_member");
    const ok = await call(app, `/s/${f.siteId}/members`, { cookie });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("Secret class recordings");
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    // The cookie is bound to its site.
    const other = await gatedSite(app);
    expect(
      (await call(app, `/s/${other.siteId}/members`, { cookie, redirect: "manual" })).status,
    ).toBe(303);
    // Blocking the member ends access.
    const mem = await env.HUB_DB.prepare("SELECT id FROM members WHERE site_id = ?")
      .bind(f.siteId)
      .first<{ id: string }>();
    await call(app, `/api/sites/${f.siteId}/members/${mem?.id}`, {
      method: "PATCH",
      cookie: f.cookie,
      json: { status: "blocked" },
    });
    expect((await call(app, `/s/${f.siteId}/members`, { cookie, redirect: "manual" })).status).toBe(
      303,
    );
    // An invalid callback token sets nothing.
    const bad = await call(
      app,
      `/s/${f.siteId}/_os/auth/callback?token=x.y.z&return=/s/${f.siteId}/members`,
    );
    expect(bad.status).toBe(401);
    expect(bad.headers.get("set-cookie")).toBeNull();
  });

  it("password pages: prompt without content, wrong password refused, right one unlocks", async () => {
    const app = makePublicApp();
    const f = await gatedSite(app);
    const set = await call(app, `/api/sites/${f.siteId}/page-passwords/pg_retreat000`, {
      method: "PUT",
      cookie: f.cookie,
      json: { password: "cedar-grove" },
    });
    expect(set.status).toBe(200);
    expect(JSON.stringify(await set.json())).not.toContain("cedar");
    const prompt = await call(app, `/s/${f.siteId}/retreat`);
    expect(prompt.status).toBe(401);
    const html = await prompt.text();
    expect(html).toContain('type="password"');
    expect(html).not.toContain("Retreat packing list");
    const post = (password: string) =>
      call(app, `/s/${f.siteId}/_os/auth/password`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          page: "pg_retreat000",
          password,
          return: `/s/${f.siteId}/retreat`,
        }).toString(),
        redirect: "manual",
      });
    const wrong = await post("nope");
    expect(wrong.headers.get("location")).toContain("os_password=error");
    expect(wrong.headers.get("set-cookie")).toBeNull();
    const right = await post("cedar-grove");
    expect(right.headers.get("location")).toBe(`/s/${f.siteId}/retreat`);
    const unlocked = await call(app, `/s/${f.siteId}/retreat`, {
      cookie: cookieFrom(right, "os_pw"),
    });
    expect(await unlocked.text()).toContain("Retreat packing list");
    // Return paths stay inside the preview site.
    const evil = await call(app, `/s/${f.siteId}/_os/auth/password`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        page: "pg_retreat000",
        password: "cedar-grove",
        return: "//evil.example/x",
      }).toString(),
      redirect: "manual",
    });
    expect(evil.headers.get("location")).toBe(`/s/${f.siteId}/`);
  });

  it("purpose-bound cookies: a page-password cookie never passes as a member session", async () => {
    const app = makePublicApp();
    const f = await gatedSite(app);
    await call(app, `/api/sites/${f.siteId}/page-passwords/pg_retreat000`, {
      method: "PUT",
      cookie: f.cookie,
      json: { password: "cedar-grove" },
    });
    const right = await call(app, `/s/${f.siteId}/_os/auth/password`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        page: "pg_retreat000",
        password: "cedar-grove",
        return: `/s/${f.siteId}/retreat`,
      }).toString(),
      redirect: "manual",
    });
    const pw = cookieFrom(right, "os_pw").split("=").slice(1).join("=");
    const res = await call(app, `/s/${f.siteId}/members`, {
      cookie: `os_member=${pw}`,
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(await res.text()).not.toContain("Secret class recordings");
  });

  it("tier-limited pages and silent re-sign-in with the current tier; blocked members can't", async () => {
    const app = makePublicApp();
    const f = await gatedSite(app);
    await login(app, f.siteId, "ana@example.com");
    const used = await call(app, await magicLink(app, "ana@example.com"), {
      method: "POST",
      redirect: "manual",
    });
    const hubCookie = cookieFrom(used, "os_hub_member");
    expect(used.headers.getSetCookie().join("\n")).toContain(`Path=/m/${f.siteId}/`);
    const cb = new URL(used.headers.get("location") as string);
    const landed = await call(app, `${cb.pathname}${cb.search}`, { redirect: "manual" });
    const cookie = cookieFrom(landed, "os_member");
    const gold = () => call(app, `/s/${f.siteId}/gold`, { cookie, redirect: "manual" });
    const free = await gold();
    expect(free.status).toBe(403);
    expect(await free.text()).not.toContain("Gold tier recordings");
    await env.HUB_DB.prepare("UPDATE members SET tier = 'tier_gold' WHERE site_id = ?")
      .bind(f.siteId)
      .run();
    const paid = await gold();
    expect(paid.status).toBe(200);
    expect(await paid.text()).toContain("Gold tier recordings");

    // The site's session ran out: the Hub signs the member in again without an email.
    const again = await call(app, `/m/${f.siteId}/login?return=/s/${f.siteId}/gold`, {
      cookie: hubCookie,
      redirect: "manual",
    });
    expect(again.status).toBe(303);
    const back = new URL(again.headers.get("location") as string);
    expect(back.pathname).toBe(`/s/${f.siteId}/_os/auth/callback`);
    expect(back.searchParams.get("return")).toBe(`/s/${f.siteId}/gold`);
    const v = await verifyLikeSiteKit(app, back.searchParams.get("token") as string);
    expect(v.ok).toBe(true);
    expect(v.claims.tier).toBe("tier_gold");

    // Blocked: no silent sign-in, the form instead (and the Hub cookie is cleared).
    await env.HUB_DB.prepare("UPDATE members SET status = 'blocked' WHERE site_id = ?")
      .bind(f.siteId)
      .run();
    const refused = await call(app, `/m/${f.siteId}/login`, {
      cookie: hubCookie,
      redirect: "manual",
    });
    expect(refused.status).toBe(200);
    expect(refused.headers.get("set-cookie")).toContain("os_hub_member=;");
    expect((await gold()).status).toBe(303);
  });

  it("media only gated pages use needs the signed URL their (gate-checked) page carries", async () => {
    const app = makePublicApp();
    const f = await gatedSite(app);
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = parseRepo(f.repo);
    const head = (await gh.getRef(repo, MAIN_BRANCH)) as string;
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const media = JSON.parse(
      (await gh.readFile(repo, "content/media.json", head)) ?? "{}",
    ) as Record<string, unknown>;
    media["media/members-only.png"] = {
      id: "med_mbrsp0t001",
      path: "media/members-only.png",
      kind: "image",
      mime: "image/png",
      bytes: 68,
      width: 1,
      height: 1,
      alt: "Recording still",
      createdAt: "2026-10-01T00:00:00.000Z",
    };
    const members = JSON.parse(
      (await gh.readFile(repo, "content/pages/members.json", head)) as string,
    );
    members.sections[0].blocks.push({
      id: "blk_membersmg1",
      type: "image",
      v: 1,
      fields: {
        image: { src: "media/members-only.png", alt: "Recording still" },
        aspect: "3:2",
        lightbox: false,
      },
    });
    await gh.commitFiles(repo, {
      branch: MAIN_BRANCH,
      expectedHead: head,
      message: "Members image",
      files: [
        { path: "media/members-only.png", content: png, encoding: "base64" },
        { path: "content/media.json", content: JSON.stringify(media) },
        { path: "content/pages/members.json", content: JSON.stringify(members) },
      ],
    });
    const r0 = await call(app, `/s/${f.siteId}/media/members-only.png`);
    expect(r0.status, await r0.clone().text()).toBe(404);
    await login(app, f.siteId, "ana@example.com");
    const used = await call(app, await magicLink(app, "ana@example.com"), {
      method: "POST",
      redirect: "manual",
    });
    const cb = new URL(used.headers.get("location") as string);
    const landed = await call(app, `${cb.pathname}${cb.search}`, { redirect: "manual" });
    const html = await (
      await call(app, `/s/${f.siteId}/members`, { cookie: cookieFrom(landed, "os_member") })
    ).text();
    const src = html.match(/src="([^"]*members-only\.png[^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
    expect(src).toMatch(/\?exp=\d+&sig=/);
    const img = await call(app, src as string);
    expect(img.status).toBe(200);
    expect(img.headers.get("cache-control")).toBe("private, max-age=600");
  });

  it("hash format matches site-kit's PBKDF2 (`pbkdf2$100000$salt$hash`)", async () => {
    const h = await hashPagePassword("cedar-grove", new Uint8Array(16));
    expect(h).toMatch(/^pbkdf2\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(await checkPagePassword("cedar-grove", h)).toBe(true);
    expect(await checkPagePassword("cedar-grovE", h)).toBe(false);
  });

  it("no-JS sign-in redirects back to the page (open-redirect safe), same answer for everyone", async () => {
    const app = makePublicApp();
    const f = await gatedSite(app);
    const form = (fields: Record<string, string>) =>
      call(app, `/m/${f.siteId}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(),
        redirect: "manual",
      });
    const ok = await form({ email: "ana@example.com", _source: "/join", _anchor: "blk_x-sent" });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe(
      `http://localhost:8787/s/${f.siteId}/join?os_member=sent#blk_x-sent`,
    );
    for (const evil of [
      "//evil.example",
      "https://evil.example/",
      "/\\evil.example",
      "/\t/evil.example",
    ]) {
      const r = await form({ email: "ana@example.com", _source: evil });
      expect(new URL(r.headers.get("location") as string).origin).toBe("http://localhost:8787");
    }
    const bad = await form({ email: "not-an-email", _source: "/join" });
    expect(bad.headers.get("location")).toContain("os_member=error");
    // The Hub-hosted sign-in page.
    const page = await call(app, `/m/${f.siteId}/login?return=/s/${f.siteId}/members`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('name="email"');
    expect(html).not.toContain('type="password"');
    // Invite-only: non-members get the same answer and no email.
    await call(app, `/api/sites/${f.siteId}/commerce/settings`, {
      method: "PATCH",
      cookie: f.cookie,
      json: { membersSignup: "invite" },
    });
    const stranger = await call(app, `/m/${f.siteId}/login`, {
      method: "POST",
      headers: { Accept: "application/json", "cf-connecting-ip": "10.9.9.9" },
      json: { email: "stranger@example.com" },
    });
    expect(await stranger.json()).toMatchObject({ ok: true });
    expect(await outbox(app, "?kind=member-magic-link&to=stranger%40example.com")).toHaveLength(0);
  });

  it("throttles sign-in emails per member", async () => {
    const app = makePublicApp();
    const f = await gatedSite(app);
    // Bypass the per-IP limiter by using distinct client IPs.
    for (let i = 0; i < 7; i++)
      await call(app, `/m/${f.siteId}/login`, {
        method: "POST",
        headers: { Accept: "application/json", "cf-connecting-ip": `10.0.0.${i}` },
        json: { email: "ana@example.com" },
      });
    expect(await outbox(app, "?kind=member-magic-link&to=ana%40example.com")).toHaveLength(5);
  });

  it("serves a stable JWKS", async () => {
    const app = makePublicApp();
    const a = (await (await call(app, "/.well-known/jwks.json")).json()) as {
      keys: Array<Record<string, string>>;
    };
    const b = (await (await call(app, "/.well-known/jwks.json")).json()) as {
      keys: Array<Record<string, string>>;
    };
    expect(a.keys).toHaveLength(1);
    expect(a).toEqual(b);
    expect(a.keys[0]).toMatchObject({ kty: "EC", crv: "P-256", alg: "ES256", use: "sig" });
    expect(a.keys[0]).not.toHaveProperty("d");
  });

  it("keeps return paths on the site", () => {
    const base = "https://maya.example/";
    expect(memberReturnPath(base, "/members/videos?x=1")).toBe("/members/videos?x=1");
    expect(memberReturnPath(base, "https://evil.example/members")).toBe("/");
    expect(memberReturnPath(base, "//evil.example")).toBe("/");
    expect(memberReturnPath("https://u.github.io/repo/", "/members")).toBe("/repo/members");
    expect(memberReturnPath("https://u.github.io/repo/", "/repo/members")).toBe("/repo/members");
  });
});

describe("member directory and tiers", () => {
  it("adds, lists, filters, updates, exports and deletes members", async () => {
    const app = makePublicApp();
    const f = await gatedSite(app);
    const tier = (
      (await (
        await call(app, `/api/sites/${f.siteId}/tiers`, {
          method: "POST",
          cookie: f.cookie,
          json: { name: "Patrons", price: { amount: 900, currency: "USD", interval: "month" } },
        })
      ).json()) as { tier: { id: string } }
    ).tier;
    const add = await call(app, `/api/sites/${f.siteId}/members`, {
      method: "POST",
      cookie: f.cookie,
      json: { email: "Lee@Example.com", name: "Lee", tier: tier.id, invite: true },
    });
    expect(add.status).toBe(201);
    const { member, invited } = (await add.json()) as {
      member: { id: string; email: string };
      invited: boolean;
    };
    expect(member.email).toBe("lee@example.com");
    expect(invited).toBe(true);
    expect(
      (
        await call(app, `/api/sites/${f.siteId}/members`, {
          method: "POST",
          cookie: f.cookie,
          json: { email: "lee@example.com" },
        })
      ).status,
    ).toBe(409);
    await call(app, `/api/sites/${f.siteId}/members`, {
      method: "POST",
      cookie: f.cookie,
      json: { email: "sam@example.com" },
    });
    const byTier = (await (
      await call(app, `/api/sites/${f.siteId}/members?tier=${tier.id}`, { cookie: f.cookie })
    ).json()) as {
      members: Array<{ email: string }>;
      total: number;
    };
    expect(byTier.members.map((m) => m.email)).toEqual(["lee@example.com"]);
    const free = (await (
      await call(app, `/api/sites/${f.siteId}/members?tier=free`, { cookie: f.cookie })
    ).json()) as {
      total: number;
    };
    expect(free.total).toBe(1);
    const tiers = (await (
      await call(app, `/api/sites/${f.siteId}/tiers`, { cookie: f.cookie })
    ).json()) as {
      tiers: Array<{ id: string; members: number }>;
    };
    expect(tiers.tiers[0]).toMatchObject({ id: tier.id, members: 1 });
    expect(
      (
        await call(app, `/api/sites/${f.siteId}/tiers/${tier.id}`, {
          method: "DELETE",
          cookie: f.cookie,
        })
      ).status,
    ).toBe(409);
    const csv = await (
      await call(app, `/api/sites/${f.siteId}/members.csv`, { cookie: f.cookie })
    ).text();
    expect(csv.split("\r\n")[0]).toBe("id,email,name,tier,status,paid,created_at,last_login_at");
    expect(csv).toContain("lee@example.com");
    const del = await call(app, `/api/sites/${f.siteId}/members/${member.id}`, {
      method: "DELETE",
      cookie: f.cookie,
    });
    expect(del.status).toBe(200);
    // Erasing a person removes their member row too (exact address only).
    await call(app, `/api/sites/${f.siteId}/members`, {
      method: "POST",
      cookie: f.cookie,
      json: { email: "hana@example.com" },
    });
    const erase = await call(app, `/api/sites/${f.siteId}/data/erase`, {
      method: "POST",
      cookie: f.cookie,
      json: { email: "ana@example.com" },
    });
    expect(erase.status).toBe(200);
    const left = await env.HUB_DB.prepare(
      "SELECT email FROM members WHERE site_id = ? ORDER BY email",
    )
      .bind(f.siteId)
      .all<{ email: string }>();
    expect(left.results.map((r) => r.email)).toEqual(["hana@example.com", "sam@example.com"]);
  });
});
