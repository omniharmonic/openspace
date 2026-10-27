import { env } from "cloudflare:test";
import { designerComponent } from "@omniharmonic/openspace-blocks";
import { componentPreviewPath } from "@omniharmonic/openspace-renderer";
import { componentSection } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { DevGitHubAccess } from "../src/github/dev";
import { call, devLogin } from "./helpers";
import { op, setup, T } from "./room-helpers";

// Custom components through the Hub (ADR custom-components): ops in the draft room, the files on
// the draft branch, the component preview route, and the publish gate on the site-kit version.
const repo = { owner: "maya-lin", name: "room-site" };
const gh = () => new DevGitHubAccess(env.HUB_DB);

async function addHero(app: Parameters<typeof call>[0], siteId: string, cookie: string) {
  const def = designerComponent("editorial-hero");
  if (!def) throw new Error("library changed");
  const section = componentSection(def);
  const res = await call(app, `/api/sites/${siteId}/room/ops`, {
    method: "POST",
    cookie,
    json: {
      ops: [
        op({ op: "component.upsert", component: def }),
        op({
          op: "section.insert",
          page: T.home,
          at: "start",
          // Sample links pointed at pages the site has, as Studio's gallery does.
          section: {
            ...section,
            blocks: section.blocks.map((b) => ({
              ...b,
              fields: {
                ...b.fields,
                cta: { type: "page", page: T.home },
                more: { type: "page", page: T.home },
              },
            })),
          },
        }),
      ],
    },
  });
  return { res, def, section };
}

describe("custom components on the Hub", () => {
  it("previews a component alone at /p/<site>/_os/component/<name>/ (with sample fields)", async () => {
    const { app, owner, site } = await setup();
    const { res } = await addHero(app, site.id, owner);
    expect(res.status).toBe(200);
    const path = componentPreviewPath("editorial-hero", {
      fields: { headline: "A preview headline" },
    });
    const html = await (await call(app, `/p/${site.id}${path}`, { cookie: owner })).text();
    expect(html).toContain('data-os-component="editorial-hero"');
    expect(html).toContain("A preview headline");
    expect(html).toContain('<style data-os="components">');
    expect((await call(app, `/p/${site.id}/_os/component/nope/`, { cookie: owner })).status).toBe(
      404,
    );
  });

  it("publishes component files and instances; refuses when main's site-kit is too old", async () => {
    const { app, owner, site } = await setup();
    const { res, section } = await addHero(app, site.id, owner);
    expect(res.status).toBe(200);
    // An exact, old pin on main: the publish run would install a site-kit without components.
    await gh().commitFiles(repo, {
      branch: "main",
      message: "Pin the kit",
      files: [
        {
          path: "package.json",
          content: JSON.stringify({
            dependencies: { "@omniharmonic/openspace-site-kit": "0.1.9" },
          }),
        },
      ],
    });
    const blocked = await call(app, `/api/sites/${site.id}/publish`, {
      method: "POST",
      cookie: owner,
    });
    expect(blocked.status).toBe(409);
    const error = ((await blocked.json()) as { error: { code: string; message: string } }).error;
    expect(error.code).toBe("kit_update_needed");
    expect(error.message).toMatch(/latest OpenSpace update/);

    await gh().commitFiles(repo, {
      branch: "main",
      message: "Update the kit",
      files: [
        {
          path: "package.json",
          content: JSON.stringify({
            dependencies: { "@omniharmonic/openspace-site-kit": "^0.1.11" },
          }),
        },
      ],
    });
    const ok = await call(app, `/api/sites/${site.id}/publish`, { method: "POST", cookie: owner });
    expect(ok.status).toBe(200);
    const files = await gh().readFiles(repo, "main", { textOnly: true });
    expect(JSON.parse(files["content/components/editorial-hero.json"] as string).name).toBe(
      "editorial-hero",
    );
    expect(files["content/pages/home.json"]).toContain(section.blocks[0]?.id as string);
    // The live preview renders the instance.
    const live = await (await call(app, `/s/${site.id}/`)).text();
    expect(live).toContain('data-os-component="editorial-hero"');
  });

  it("editors can't change component code but can edit an instance's fields", async () => {
    const { app, owner, site } = await setup();
    const { res, section } = await addHero(app, site.id, owner);
    expect(res.status).toBe(200);
    const ana = await devLogin(app, "Ana Ruiz");
    const inv = await call(app, `/api/sites/${site.id}/collaborators`, {
      method: "POST",
      cookie: owner,
      json: { login: "ana-ruiz", role: "editor" },
    });
    expect(inv.status).toBe(201);
    const token = ((await inv.json()) as { acceptUrl: string }).acceptUrl.split("/").pop();
    expect(
      (await call(app, `/api/invitations/${token}/accept`, { method: "POST", cookie: ana })).status,
    ).toBe(200);
    const def = designerComponent("editorial-hero");
    const code = await call(app, `/api/sites/${site.id}/room/ops`, {
      method: "POST",
      cookie: ana,
      json: { ops: [op({ op: "component.upsert", component: { ...def, label: "Changed" } })] },
    });
    const results = ((await code.json()) as { results: Array<Record<string, unknown>> }).results;
    expect(results[0]).toMatchObject({ status: "rejected", code: "forbidden" });
    expect(String(results[0]?.message)).toMatch(/owners and designers/);
    const field = await call(app, `/api/sites/${site.id}/room/ops`, {
      method: "POST",
      cookie: ana,
      json: {
        ops: [
          op({
            op: "block.update",
            page: T.home,
            block: section.blocks[0]?.id,
            set: { headline: "Edited by the editor" },
          }),
        ],
      },
    });
    expect(
      ((await field.json()) as { results: Array<{ status: string }> }).results[0]?.status,
    ).toBe("accepted");
  });
});
