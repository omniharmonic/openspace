import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { hostingChanges } from "../src/services/hosting";
import {
  CLOUDFLARE_PACKAGE_ADDITIONS,
  STARTER_HOSTING_FILES,
  STARTER_SITE_FILES,
} from "../src/templates/starter-files";
import { call, devLogin } from "./helpers";
import { STUDIO_ORIGIN } from "./mcp-helpers";
import { addMember, createSite, RoomClient, userId } from "./room-helpers";

const starter = JSON.parse(env.STARTER_FILES) as Record<string, string>;

describe("starter hosting files", () => {
  it("match templates/starter", () => {
    const shell = Object.fromEntries(
      Object.entries(starter)
        .filter(([p]) => p.startsWith("site/"))
        .map(([p, c]) => [p.slice("site/".length), c]),
    );
    expect(STARTER_SITE_FILES).toEqual(shell);
    for (const p of [".github/workflows/publish.yml", "astro.config.mjs"]) {
      expect(
        STARTER_HOSTING_FILES["github-pages"][
          p as keyof (typeof STARTER_HOSTING_FILES)["github-pages"]
        ],
      ).toBe(starter[`site/${p}`]);
      expect(
        STARTER_HOSTING_FILES.cloudflare[p as keyof (typeof STARTER_HOSTING_FILES)["cloudflare"]],
      ).toBe(starter[`variants/cloudflare/${p}`]);
    }
    expect(STARTER_HOSTING_FILES.cloudflare["wrangler.jsonc"]).toBe(
      starter["variants/cloudflare/wrangler.jsonc"],
    );
    const site = JSON.parse(starter["site/package.json"] as string);
    const cf = JSON.parse(starter["variants/cloudflare/package.json"] as string);
    for (const [section, deps] of Object.entries(CLOUDFLARE_PACKAGE_ADDITIONS))
      for (const [name, version] of Object.entries(deps)) {
        expect(cf[section][name]).toBe(version);
        expect(site[section]?.[name]).toBeUndefined();
      }
  });

  it("merges package.json and round-trips back to GitHub Pages", async () => {
    const files: Record<string, string> = {
      "openspace.json": `${JSON.stringify({ deploy: { target: "github-pages", url: "https://x.github.io/y/", customDomain: null } }, null, 2)}\n`,
      "package.json": `${JSON.stringify({ name: "y", dependencies: { "@omniharmonic/openspace-site-kit": "^0.2.0", lodash: "^4" }, devDependencies: {} }, null, 2)}\n`,
    };
    const apply = async (target: "cloudflare" | "github-pages") => {
      for (const ch of await hostingChanges(async (p) => files[p] ?? null, target, "Maya-Yoga")) {
        if (ch.content === null) delete files[ch.path];
        else files[ch.path] = ch.content;
      }
    };
    await apply("cloudflare");
    expect(JSON.parse(files["openspace.json"] as string).deploy.target).toBe("cloudflare");
    const pkg = JSON.parse(files["package.json"] as string);
    expect(pkg.dependencies).toMatchObject({
      "@omniharmonic/openspace-site-kit": "^0.2.0",
      lodash: "^4",
      "@astrojs/cloudflare": expect.any(String),
    });
    expect(pkg.devDependencies.wrangler).toBeTruthy();
    expect(files["wrangler.jsonc"]).toContain('"name": "maya-yoga"');
    await apply("github-pages");
    expect(files["wrangler.jsonc"]).toBeUndefined();
    const back = JSON.parse(files["package.json"] as string);
    expect(back.dependencies).toEqual({
      "@omniharmonic/openspace-site-kit": "^0.2.0",
      lodash: "^4",
    });
    expect(files[".github/workflows/publish.yml"]).toBe(
      starter["site/.github/workflows/publish.yml"],
    );
  });
});

describe("hosting routes", () => {
  it("relays sealed secrets, refuses a switch without them, then switches (owner only)", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Maya Lin");
    const site = await createSite(app, owner, "Maya Yoga");
    const studio = await RoomClient.connect(app, site.id, owner);
    const got = await call(app, `/api/sites/${site.id}/hosting`, { cookie: owner });
    const { hosting } = (await got.json()) as {
      hosting: {
        target: string;
        actionsPublicKey: { keyId: string; key: string };
        secrets: string[];
      };
    };
    expect(hosting).toMatchObject({ target: "github-pages", secrets: [], switching: null });
    expect(atob(hosting.actionsPublicKey.key)).toHaveLength(32);

    const early = await call(app, `/api/sites/${site.id}/hosting`, {
      method: "POST",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: { target: "cloudflare" },
    });
    expect(early.status).toBe(409);
    expect(((await early.json()) as { error: { code: string } }).error.code).toBe(
      "missing_secrets",
    );

    const stale = await call(app, `/api/sites/${site.id}/hosting/secrets`, {
      method: "PUT",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: {
        secrets: [{ name: "CLOUDFLARE_API_TOKEN", encryptedValue: "c2VhbGVk", keyId: "old" }],
      },
    });
    expect(stale.status).toBe(409);
    const notAllowed = await call(app, `/api/sites/${site.id}/hosting/secrets`, {
      method: "PUT",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: {
        secrets: [
          {
            name: "GITHUB_TOKEN",
            encryptedValue: "c2VhbGVk",
            keyId: hosting.actionsPublicKey.keyId,
          },
        ],
      },
    });
    expect(notAllowed.status).toBe(400);

    const ana = await devLogin(app, "Ana Ruiz");
    await addMember(site.id, await userId(app, ana), "designer");
    const secrets = {
      secrets: [
        {
          name: "CLOUDFLARE_API_TOKEN",
          encryptedValue: "c2VhbGVkLXRva2Vu",
          keyId: hosting.actionsPublicKey.keyId,
        },
        {
          name: "CLOUDFLARE_ACCOUNT_ID",
          encryptedValue: "c2VhbGVkLWlk",
          keyId: hosting.actionsPublicKey.keyId,
        },
      ],
    };
    const byDesigner = await call(app, `/api/sites/${site.id}/hosting/secrets`, {
      method: "PUT",
      cookie: ana,
      headers: { Origin: STUDIO_ORIGIN },
      json: secrets,
    });
    expect(byDesigner.status).toBe(403);
    const put = await call(app, `/api/sites/${site.id}/hosting/secrets`, {
      method: "PUT",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: secrets,
    });
    expect(put.status).toBe(200);
    expect(
      ((await put.json()) as { hosting: { secrets: string[] } }).hosting.secrets.sort(),
    ).toEqual(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
    // Nothing secret is stored by the dev emulation either.
    const row = await env.HUB_DB.prepare(
      "SELECT * FROM dev_secrets WHERE name = 'CLOUDFLARE_API_TOKEN'",
    ).first();
    expect(JSON.stringify(row)).not.toContain("c2VhbGVk");

    const sw = await call(app, `/api/sites/${site.id}/hosting`, {
      method: "POST",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: { target: "cloudflare" },
    });
    expect(sw.status).toBe(200);
    expect(((await sw.json()) as { hosting: { target: string } }).hosting.target).toBe(
      "cloudflare",
    );
    await studio.waitFor((m) => m.type === "reload");
    const live = (await (
      await call(app, `/api/sites/${site.id}/document?ref=published`, { cookie: owner })
    ).json()) as {
      document: { config: { deploy: { target: string } } };
    };
    expect(live.document.config.deploy.target).toBe("cloudflare");
    const draft = (await (
      await call(app, `/api/sites/${site.id}/room/document`, { cookie: owner })
    ).json()) as {
      document: { config: { deploy: { target: string } } };
    };
    expect(draft.document.config.deploy.target).toBe("cloudflare");
    const view = (await (await call(app, `/api/sites/${site.id}`, { cookie: owner })).json()) as {
      deployTarget: string;
    };
    expect(view.deployTarget).toBe("cloudflare");

    const back = await call(app, `/api/sites/${site.id}/hosting`, {
      method: "POST",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: { target: "github-pages" },
    });
    expect(back.status).toBe(200);
    studio.close();
  });
});

describe("moving to Cloudflare safely (wow first)", () => {
  const post = (app: ReturnType<typeof createApp>, cookie: string, path: string, json: unknown) =>
    call(app, path, { method: "POST", cookie, headers: { Origin: STUDIO_ORIGIN }, json });

  async function withSecrets(app: ReturnType<typeof createApp>, owner: string, siteId: string) {
    const got = (await (
      await call(app, `/api/sites/${siteId}/hosting`, { cookie: owner })
    ).json()) as {
      hosting: { actionsPublicKey: { keyId: string } };
    };
    const keyId = got.hosting.actionsPublicKey.keyId;
    await call(app, `/api/sites/${siteId}/hosting/secrets`, {
      method: "PUT",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: {
        secrets: [
          { name: "CLOUDFLARE_API_TOKEN", encryptedValue: "c2VhbGVk", keyId },
          { name: "CLOUDFLARE_ACCOUNT_ID", encryptedValue: "c2VhbGVk", keyId },
        ],
      },
    });
  }

  it("refuses a move before the site's first live version, in plain words", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Wow First");
    const site = await createSite(app, owner, "Not Live Yet");
    await withSecrets(app, owner, site.id);
    await env.HUB_DB.prepare("UPDATE sites SET status = 'building' WHERE id = ?")
      .bind(site.id)
      .run();
    await env.HUB_DB.prepare("DELETE FROM publishes WHERE site_id = ?").bind(site.id).run();
    const res = await post(app, owner, `/api/sites/${site.id}/hosting`, { target: "cloudflare" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_live_yet");
    expect(body.error.message).toMatch(/live on its free hosting first/);
    expect(body.error.message).not.toMatch(/secret|deploy|workflow|target/i);
  });

  it("checks the token, moves with the workers.dev address, confirms, and keeps the old address until then", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Cleo Shop");
    const site = await createSite(app, owner, "Cleo Shop");
    const bad = await post(app, owner, `/api/sites/${site.id}/hosting/cloudflare/check`, {
      token: "bad-token-0123456789abcdefghijklmnop",
    });
    expect(
      ((await bad.json()) as { check: { ok: boolean; problems: unknown[] } }).check,
    ).toMatchObject({
      ok: false,
      problems: [{ code: "token_invalid" }],
    });
    const good = await post(app, owner, `/api/sites/${site.id}/hosting/cloudflare/check`, {
      token: "dev-token-0123456789abcdefghijklmnop",
    });
    const { check } = (await good.json()) as { check: { ok: boolean; workersUrl: string } };
    expect(check.ok).toBe(true);
    expect(check.workersUrl).toMatch(/^https:\/\/[a-z0-9-]+\.dev-account\.workers\.dev\/$/);

    const before = (await (await call(app, `/api/sites/${site.id}`, { cookie: owner })).json()) as {
      url: string;
    };
    // Without the secrets the next publish would fail: refused.
    const early = await post(app, owner, `/api/sites/${site.id}/hosting`, {
      target: "cloudflare",
      url: check.workersUrl,
    });
    expect(early.status).toBe(409);
    expect(((await early.json()) as { error: { code: string } }).error.code).toBe(
      "missing_secrets",
    );
    await withSecrets(app, owner, site.id);
    const wrong = await post(app, owner, `/api/sites/${site.id}/hosting`, {
      target: "cloudflare",
      url: "https://someone-else.dev-account.workers.dev/",
    });
    expect(wrong.status).toBe(400);
    const sw = await post(app, owner, `/api/sites/${site.id}/hosting`, {
      target: "cloudflare",
      url: check.workersUrl,
    });
    expect(sw.status).toBe(200);
    const moved = (await sw.json()) as {
      hosting: { target: string; switching: { status: string; url: string } };
    };
    expect(moved.hosting.switching).toMatchObject({ status: "publishing", url: check.workersUrl });
    // The live address doesn't change until Cloudflare is confirmed.
    const mid = (await (await call(app, `/api/sites/${site.id}`, { cookie: owner })).json()) as {
      url: string;
    };
    expect(mid.url).toBe(before.url);
    const published = (await (
      await call(app, `/api/sites/${site.id}/document?ref=published`, { cookie: owner })
    ).json()) as { document: { config: { deploy: { url: string; target: string } } } };
    expect(published.document.config.deploy).toMatchObject({
      target: "cloudflare",
      url: check.workersUrl,
    });
    // The dev publish succeeds at once: reading the hosting screen confirms the move.
    const after = (await (
      await call(app, `/api/sites/${site.id}/hosting`, { cookie: owner })
    ).json()) as {
      hosting: { switching: { status: string } };
    };
    expect(after.hosting.switching.status).toBe("done");
    const view = (await (await call(app, `/api/sites/${site.id}`, { cookie: owner })).json()) as {
      url: string;
    };
    expect(view.url).toBe(check.workersUrl);
  });

  it("switches back to GitHub Pages by itself when the Cloudflare publish fails", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Rollback Rae");
    const site = await createSite(app, owner, "Rae Shop");
    await withSecrets(app, owner, site.id);
    const before = (await (await call(app, `/api/sites/${site.id}`, { cookie: owner })).json()) as {
      url: string;
    };
    const { check } = (await (
      await post(app, owner, `/api/sites/${site.id}/hosting/cloudflare/check`, {
        token: "dev-token-0123456789abcdefghijklmnop",
      })
    ).json()) as { check: { workersUrl: string } };
    const sw = await post(app, owner, `/api/sites/${site.id}/hosting`, {
      target: "cloudflare",
      url: check.workersUrl,
    });
    expect(sw.status).toBe(200);
    // The Cloudflare run fails.
    await env.HUB_DB.prepare(
      "UPDATE dev_workflow_runs SET conclusion = 'failure' WHERE id = (SELECT MAX(id) FROM dev_workflow_runs WHERE repo = ? COLLATE NOCASE)",
    )
      .bind(site.repo)
      .run();
    const after = (await (
      await call(app, `/api/sites/${site.id}/hosting`, { cookie: owner })
    ).json()) as {
      hosting: { target: string; switching: { status: string; error: string } };
    };
    expect(after.hosting.target).toBe("github-pages");
    expect(after.hosting.switching.status).toBe("rolled_back");
    expect(after.hosting.switching.error).toMatch(/stayed on GitHub Pages/);
    const published = (await (
      await call(app, `/api/sites/${site.id}/document?ref=published`, { cookie: owner })
    ).json()) as { document: { config: { deploy: { url: string; target: string } } } };
    expect(published.document.config.deploy.target).toBe("github-pages");
    expect(published.document.config.deploy.url).toBe(before.url);
  });
});

describe("setup checklist", () => {
  it("normalises the importer's file", async () => {
    const { parseSetupChecklist } = await import("../src/routes/setup");
    expect(parseSetupChecklist(null)).toBeNull();
    expect(parseSetupChecklist("{oops")).toBeNull();
    const parsed = parseSetupChecklist(
      JSON.stringify({
        version: 1,
        source: "import",
        from: "Squarespace",
        items: [
          {
            id: "store",
            kind: "store",
            title: "Turn on your shop",
            where: ["/shop"],
            count: 12,
            status: "todo",
          },
          { id: "x", kind: "spaceship", title: "Something new" },
          { id: "", kind: "store" },
        ],
      }),
    );
    expect(parsed).toEqual({
      from: "Squarespace",
      items: [
        {
          id: "store",
          kind: "store",
          title: "Turn on your shop",
          detail: null,
          where: ["/shop"],
          count: 12,
          done: false,
        },
        {
          id: "x",
          kind: "other",
          title: "Something new",
          detail: null,
          where: [],
          count: null,
          done: false,
        },
      ],
    });
  });

  it("serves everLive and the imported list", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Setup Sam");
    const site = await createSite(app, owner, "Setup Site");
    const res = await call(app, `/api/sites/${site.id}/setup`, { cookie: owner });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ setup: { everLive: true, imported: null } });
  });
});
