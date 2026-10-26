import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page, SiteDocument } from "@openspace/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSiteDocument } from "../content/index";
import { deployLocation } from "../deploy";
import {
  b64urlEncode,
  checkPagePassword,
  getCookie,
  hashPagePassword,
  type Jwk,
  readSigned,
  safeReturnPath,
  signValue,
  verifyHubToken,
} from "./gate";
import {
  type GateContext,
  handleAuthCallback,
  handleGatedPage,
  handlePasswordSubmit,
  slugFromPath,
} from "./handlers";

const MEADOW = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tools/fixtures/meadow-site",
);
// Built at runtime: never a secret-shaped literal in source.
const SECRET = ["test", "session", "secret", "that", "is", "long", "enough"].join("-");
const enc = new TextEncoder();

let keys: CryptoKeyPair;
let jwk: Jwk;
beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  jwk = {
    ...((await crypto.subtle.exportKey("jwk", keys.publicKey)) as Jwk),
    kid: "k1",
    alg: "ES256",
  };
});

async function token(claims: Record<string, unknown>, kid = "k1"): Promise<string> {
  const h = b64urlEncode(enc.encode(JSON.stringify({ alg: "ES256", typ: "JWT", kid })));
  const p = b64urlEncode(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    enc.encode(`${h}.${p}`),
  );
  return `${h}.${p}.${b64urlEncode(sig)}`;
}

const NOW = Date.parse("2026-10-27T12:00:00Z");
const claims = {
  sub: "mem_1",
  aud: "st_meadw00001",
  iss: "https://hub.openspace.dev",
  exp: NOW / 1000 + 600,
  tier: "friend",
};

describe("Hub token verification", () => {
  const expect_ = { issuer: "https://hub.openspace.dev", audience: "st_meadw00001", now: NOW };
  it("accepts a valid token", async () => {
    expect(await verifyHubToken(await token(claims), { keys: [jwk] }, expect_)).toMatchObject({
      sub: "mem_1",
      tier: "friend",
    });
  });
  it("rejects expired, foreign, tampered and unknown-key tokens", async () => {
    await expect(
      verifyHubToken(await token({ ...claims, exp: NOW / 1000 - 3600 }), { keys: [jwk] }, expect_),
    ).rejects.toThrow(/expired/);
    await expect(
      verifyHubToken(await token({ ...claims, aud: "st_other00000" }), { keys: [jwk] }, expect_),
    ).rejects.toThrow(/another site/);
    await expect(
      verifyHubToken(
        await token({ ...claims, iss: "https://evil.example" }),
        { keys: [jwk] },
        expect_,
      ),
    ).rejects.toThrow(/issuer/);
    const t = await token(claims);
    const [h, , s] = t.split(".");
    const forged = `${h}.${b64urlEncode(enc.encode(JSON.stringify({ ...claims, sub: "admin" })))}.${s}`;
    await expect(verifyHubToken(forged, { keys: [jwk] }, expect_)).rejects.toThrow(/signature/);
    await expect(
      verifyHubToken(await token(claims, "k2"), { keys: [jwk] }, expect_),
    ).rejects.toThrow(/Unknown signing key/);
    await expect(verifyHubToken("nope", { keys: [jwk] }, expect_)).rejects.toThrow(/Malformed/);
  });
});

describe("signed values and passwords", () => {
  it("signs, verifies and expires cookie values", async () => {
    const v = await signValue({ sub: "m" }, SECRET, 60, NOW);
    expect(await readSigned(v, SECRET, NOW)).toMatchObject({ sub: "m" });
    expect(await readSigned(v, SECRET, NOW + 120_000)).toBeUndefined();
    expect(await readSigned(v, `${SECRET}x`, NOW)).toBeUndefined();
    expect(await readSigned(`${v.split(".")[0]}.AAAA`, SECRET, NOW)).toBeUndefined();
    await expect(signValue({}, "short", 60)).rejects.toThrow(/at least 32/);
  });

  it("hashes and checks page passwords (PBKDF2), never storing them", async () => {
    const stored = await hashPagePassword("open sesame");
    expect(stored).toMatch(/^pbkdf2\$100000\$/);
    expect(stored).not.toContain("open sesame");
    expect(await checkPagePassword("open sesame", stored)).toBe(true);
    expect(await checkPagePassword("open sesam", stored)).toBe(false);
    expect(await checkPagePassword("x", undefined)).toBe(false);
  });

  it("parses cookies and only allows same-site return paths", () => {
    expect(getCookie("a=1; os_member=abc%3D; b=2", "os_member")).toBe("abc=");
    expect(safeReturnPath("/members/", "")).toBe("/members/");
    expect(safeReturnPath("//evil.example/", "/repo")).toBe("/repo/");
    expect(safeReturnPath("https://evil.example/", "")).toBe("/");
    expect(slugFromPath("/repo/members/plans/", "/repo")).toBe("members/plans");
    // Browsers strip tabs/newlines and treat backslashes as slashes: never leave the site.
    expect(safeReturnPath("/\t/evil.example/", "")).toBe("/");
    expect(safeReturnPath("/\\evil.example/", "")).toBe("/");
    expect(safeReturnPath("/other/", "/repo")).toBe("/repo/");
    expect(safeReturnPath("/repo/members/?a=1#b", "/repo")).toBe("/repo/members/?a=1#b");
  });
});

describe("Worker handlers", () => {
  let doc: SiteDocument;
  let ctx: GateContext;
  const secretPage: Page = {
    id: "pg_secretpage",
    title: "Teacher notes",
    slug: "teachers",
    access: { password: true },
    sections: [],
  };
  beforeAll(async () => {
    doc = await loadSiteDocument(MEADOW);
    doc = { ...doc, pages: { ...doc.pages, [secretPage.id]: secretPage } };
    ctx = {
      doc,
      location: deployLocation(doc.config),
      now: NOW,
      fetchJwks: async () => ({ keys: [jwk] }),
    };
  });
  const r2 = (pages: Record<string, Page>) => ({
    get: async (key: string) => {
      const slug = key.replace(/^pages\/|\.json$/g, "");
      const page = pages[slug];
      return page ? { text: async () => JSON.stringify(page) } : null;
    },
  });
  const membersPage: Page = {
    id: "pg_membershme",
    title: "Member library",
    slug: "members/library",
    sections: [],
  };

  it("sends visitors without a session to the Hub sign-in", async () => {
    const res = await handleGatedPage(
      new Request("https://meadowyoga.example/members/library/"),
      { OS_SESSION_SECRET: SECRET, OS_GATED: r2({ "members/library": membersPage }) },
      ctx,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://hub.openspace.dev/m/st_meadw00001/login?return=%2Fmembers%2Flibrary%2F",
    );
  });

  it("magic link → session cookie → gated page from R2", async () => {
    const env = { OS_SESSION_SECRET: SECRET, OS_GATED: r2({ "members/library": membersPage }) };
    const t = await token(claims);
    const cb = await handleAuthCallback(
      new Request(
        `https://meadowyoga.example/_os/auth/callback?token=${t}&return=/members/library/`,
      ),
      env,
      ctx,
    );
    expect(cb.status).toBe(303);
    expect(cb.headers.get("location")).toBe("/members/library/");
    const cookie = cb.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^os_member=.+; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/);
    const page = await handleGatedPage(
      new Request("https://meadowyoga.example/members/library/", {
        headers: { cookie: cookie.split(";")[0] ?? "" },
      }),
      env,
      ctx,
    );
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("private, no-store");
    const html = await page.text();
    expect(html).toContain("<title>Member library · Meadow Yoga</title>");
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it("renders gated pages with the build-time image map and their behaviors", async () => {
    const photo = "media/2026/10/studio-open.jpg";
    const gated: Page = {
      id: "pg_membersfaq",
      title: "Members FAQ",
      slug: "members/faq",
      sections: [
        {
          id: "sec_membersfq1",
          layout: { mode: "stack", columns: { d: [12] } },
          style: {},
          blocks: [
            {
              id: "blk_membersph1",
              type: "image",
              v: 1,
              fields: { image: { src: photo, alt: "The studio" }, aspect: "3:2", lightbox: false },
            },
            {
              id: "blk_membersac1",
              type: "accordion",
              v: 1,
              fields: {
                items: [
                  {
                    question: "When?",
                    answer: {
                      type: "doc",
                      content: [{ type: "paragraph", content: [{ type: "text", text: "Daily." }] }],
                    },
                  },
                ],
                exclusive: true,
                openFirst: false,
                faqSchema: false,
              },
            },
          ],
        },
      ],
    };
    const manifest = {
      [photo]: {
        src: "/_astro/studio-open.abc.jpg",
        srcset: "/_astro/studio-open.abc.jpg 1600w",
        sources: [{ type: "image/avif", srcset: "/_astro/studio-open.abc.avif 1600w" }],
        width: 1600,
        height: 1067,
      },
    };
    let fetched = "";
    const env = {
      OS_SESSION_SECRET: SECRET,
      OS_GATED: r2({ "members/faq": gated }),
      ASSETS: {
        fetch: async (req: Request | string) => {
          fetched = String(typeof req === "string" ? req : req.url);
          return new Response(JSON.stringify(manifest));
        },
      },
    };
    const session = await signValue({ sub: "mem_1" }, SECRET, 600, NOW);
    const res = await handleGatedPage(
      new Request("https://meadowyoga.example/members/faq/", {
        headers: { cookie: `os_member=${session}` },
      }),
      env,
      {
        ...ctx,
        assets: { base: "/_os/os.1.css", tokens: "/_os/tokens.1.css", blocks: "/_os/blocks.1.css" },
      },
    );
    const html = await res.text();
    expect(res.status, html.slice(0, 300)).toBe(200);
    expect(fetched).toBe("https://meadowyoga.example/_os/images.json");
    expect(html).toContain('srcSet="/_astro/studio-open.abc.avif 1600w"');
    expect(html).toMatch(/width="1600" height="1067"/);
    expect(html).toContain('<link rel="modulepreload" href="/_os/behaviors/accordion.js">');
    expect(html).toContain('<script type="module" src="/_os/behaviors/os-behaviors.js">');
    expect(html).toContain('<link rel="stylesheet" href="/_os/blocks.1.css">');
  });

  it("answers 503 when the Worker isn't configured", async () => {
    const page = await handleGatedPage(
      new Request("https://meadowyoga.example/members/x/"),
      {},
      ctx,
    );
    expect(page.status).toBe(503);
    const cb = await handleAuthCallback(
      new Request(`https://meadowyoga.example/_os/auth/callback?token=${await token(claims)}`),
      { OS_SESSION_SECRET: SECRET },
      {
        ...ctx,
        fetchJwks: async () => {
          throw new Error("offline");
        },
      },
    );
    expect(cb.status).toBe(503);
    expect(await cb.text()).toContain("Signing in isn’t available right now");
    const noSecret = await handleAuthCallback(
      new Request(`https://meadowyoga.example/_os/auth/callback?token=${await token(claims)}`),
      { OS_SESSION_SECRET: "short" },
      ctx,
    );
    expect(noSecret.status).toBe(503);
  });

  it("rejects bad sign-in links", async () => {
    const res = await handleAuthCallback(
      new Request("https://meadowyoga.example/_os/auth/callback?token=a.b.c"),
      { OS_SESSION_SECRET: SECRET },
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("password pages: prompt, wrong password, unlock", async () => {
    const hash = await hashPagePassword("lotus");
    const env = {
      OS_SESSION_SECRET: SECRET,
      OS_PAGE_PASSWORDS: JSON.stringify({ [secretPage.id]: hash }),
    };
    const prompt = await handleGatedPage(
      new Request("https://meadowyoga.example/teachers/"),
      env,
      ctx,
    );
    expect(prompt.status).toBe(200);
    const promptHtml = await prompt.text();
    expect(promptHtml).toContain('type="password"');
    expect(promptHtml).toContain('action="/_os/auth/password"');
    const post = (password: string) =>
      handlePasswordSubmit(
        new Request("https://meadowyoga.example/_os/auth/password", {
          method: "POST",
          body: new URLSearchParams({ page: secretPage.id, password, return: "/teachers/" }),
        }),
        env,
        ctx,
      );
    const wrong = await post("lily");
    expect(wrong.headers.get("location")).toBe("/teachers/?os_password=error");
    const right = await post("lotus");
    expect(right.headers.get("location")).toBe("/teachers/");
    const cookie = (right.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const unlocked = await handleGatedPage(
      new Request("https://meadowyoga.example/teachers/", { headers: { cookie } }),
      env,
      ctx,
    );
    expect(await unlocked.text()).not.toContain('type="password"');
  });
});
