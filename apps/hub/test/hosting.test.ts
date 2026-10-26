import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { hostingChanges } from "../src/services/hosting";
import {
  CLOUDFLARE_PACKAGE_ADDITIONS,
  STARTER_HOSTING_FILES,
} from "../src/templates/starter-hosting";
import { call, devLogin } from "./helpers";
import { STUDIO_ORIGIN } from "./mcp-helpers";
import { addMember, createSite, RoomClient, userId } from "./room-helpers";

const starter = JSON.parse(env.STARTER_FILES) as Record<string, string>;

describe("starter hosting files", () => {
  it("match templates/starter", () => {
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
      "package.json": `${JSON.stringify({ name: "y", dependencies: { "@openspace/site-kit": "^0.2.0", lodash: "^4" }, devDependencies: {} }, null, 2)}\n`,
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
      "@openspace/site-kit": "^0.2.0",
      lodash: "^4",
      "@astrojs/cloudflare": expect.any(String),
    });
    expect(pkg.devDependencies.wrangler).toBeTruthy();
    expect(files["wrangler.jsonc"]).toContain('"name": "maya-yoga"');
    await apply("github-pages");
    expect(files["wrangler.jsonc"]).toBeUndefined();
    const back = JSON.parse(files["package.json"] as string);
    expect(back.dependencies).toEqual({ "@openspace/site-kit": "^0.2.0", lodash: "^4" });
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
