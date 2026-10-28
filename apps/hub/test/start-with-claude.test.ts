import { env } from "cloudflare:test";
import { designCheck } from "@omniharmonic/openspace-lint";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { bytesToBase64 } from "../src/lib/crypto";
import {
  HEADLINE_MAX_WORDS,
  headlineFrom,
  heroCopy,
  pickTemplate,
} from "../src/services/start-with-claude";
import { call, cookieFrom } from "./helpers";
import { HUB, McpTestClient, oauthConnect, PNG_1PX, toolText } from "./mcp-helpers";

type App = ReturnType<typeof createApp>;

async function devLogin(app: App, name: string) {
  const res = await call(app, "/auth/dev/login", { method: "POST", json: { name } });
  expect(res.status).toBe(200);
  return cookieFrom(res);
}

interface Doc {
  document: {
    site: { title: string };
    styles: {
      choices: { palette: { brand: string }; typography?: { heading?: { family: string } } };
    };
    pages: Record<string, { slug: string; sections: unknown[] }>;
    components?: Record<string, { template: string }>;
    designSystem?: {
      brief?: { about?: string; feeling?: string[] };
      tokens: { colors?: Record<string, { value: string; role?: string }> };
      sources?: Array<{ kind: string }>;
      brand?: { photos?: string[] };
    };
    media: Record<string, unknown>;
  };
}

const PAGE = `<!doctype html><html><head><title>Lantern Books</title><style>
:root{--ink:#1b1b1f;--paper:#fffaf2;--accent:#c2410c}
body{background:var(--paper);color:var(--ink);font-family:Georgia,serif}
.hero{padding:96px 24px;text-align:center}.hero h1{font-size:64px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.card{border:1px solid var(--ink);padding:24px}.card h3{color:var(--accent)}
footer{padding:32px;text-align:center}
</style></head><body>
<header><a class="brand" href="#">Lantern Books</a><nav><a href="#shelves">Shelves</a></nav></header>
<main>
<section class="hero"><h1>Second-hand books, first-rate stories</h1><p>A small shop on the corner of Mill Lane.</p><a class="btn" href="#shelves">Browse the shelves</a></section>
<section id="shelves"><div class="cards"><div class="card"><h3>Fiction</h3><p>Novels and short stories.</p></div><div class="card"><h3>Poetry</h3><p>Slim volumes, big feelings.</p></div><div class="card"><h3>Local history</h3><p>Maps, memoirs and more.</p></div></div></section>
</main>
<footer><p>© 2026 Lantern Books</p></footer>
</body></html>`;

const dataUrl = (mime: string, text: string) =>
  `data:${mime};base64,${bytesToBase64(new TextEncoder().encode(text))}`;

describe("Start with Claude", () => {
  it("picks the closest template and a look that fits the feeling", () => {
    const t = (id: string, persona: string, tags: string[]) => ({
      id,
      name: id,
      description: "",
      persona,
      mood: "",
      version: "1.0.0",
      tags,
      thumbnailUrl: null,
      looks: [
        {
          id: `${id}-calm`,
          name: "Calm",
          styles: {
            choices: {
              density: "airy",
              motion: "subtle",
              shape: "soft",
              buttons: "solid",
              palette: { neutral: "warm" },
            },
          },
        },
        {
          id: `${id}-bold`,
          name: "Bold",
          styles: {
            choices: {
              density: "compact",
              motion: "expressive",
              shape: "round",
              buttons: "pill-solid",
              palette: { neutral: "cool" },
            },
          },
        },
      ],
    });
    const list = [
      t("hearth", "Restaurants, cafés, bakeries", ["restaurant", "bakery"]),
      t("meadow", "Yoga, therapy", ["yoga"]),
      t("folio", "Personal sites", ["personal"]),
    ] as never;
    const a = pickTemplate(list, {
      name: "Crumb",
      about: "A neighbourhood bakery and tea room",
      feeling: ["playful", "bold"],
    });
    expect(a.template.id).toBe("hearth");
    expect(a.look.id).toBe("hearth-bold");
    expect(
      pickTemplate(list, { name: "x", about: "Gentle yoga classes", feeling: ["calm"] }).look.id,
    ).toBe("meadow-calm");
    expect(pickTemplate(list, { name: "x", about: "zzz" }).template.id).toBe("folio");
  });

  it("brand tokens and photos -> a live default site in their brand, with the design-system record", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Mairi Baker");
    const res = await call(app, "/api/start", {
      method: "POST",
      cookie,
      json: {
        name: "Crumb & Kettle",
        about: "A neighbourhood bakery and tea room in Leith.",
        audience: "Locals on their way to work, families at the weekend",
        feeling: ["warm", "unhurried"],
        tokens: JSON.stringify({
          color: {
            cream: { $value: "#fbf3e6", $type: "color" },
            cocoa: { $value: "#3b2416", $type: "color" },
            primary: { $value: "#b5532a", $type: "color" },
          },
          font: {
            heading: { $value: "Fraunces", $type: "fontFamily" },
            body: { $value: "Work Sans", $type: "fontFamily" },
          },
        }),
        tokensName: "crumb-tokens.json",
        photos: [{ name: "loaves.png", data: `data:image/png;base64,${bytesToBase64(PNG_1PX)}` }],
        brandDoc: { name: "voice.md", text: "We speak warmly and plainly. Never twee." },
      },
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const body = (await res.json()) as {
      site: { id: string; status: string; name: string };
      startedFrom: { kind: string; template: string };
    };
    expect(body.startedFrom.kind).toBe("template");
    expect(body.site.status).not.toBe("failed");
    const doc = (await (
      await call(app, `/api/sites/${body.site.id}/document`, { cookie })
    ).json()) as Doc;
    const d = doc.document;
    expect(d.styles.choices.palette.brand).toBe("#b5532a");
    expect(d.designSystem?.brief?.about).toContain("bakery");
    expect(d.designSystem?.brief?.feeling).toEqual(["warm", "unhurried"]);
    expect(d.designSystem?.sources?.map((s) => s.kind)).toEqual(
      expect.arrayContaining(["template", "tokens", "photos", "brand-doc"]),
    );
    expect(
      Object.values(d.designSystem?.tokens.colors ?? {}).find((c) => c.role === "background")
        ?.value,
    ).toBe("#fbf3e6");
    const photo = d.designSystem?.brand?.photos?.[0] as string;
    expect(photo).toMatch(/^media\/.*loaves/);
    expect(d.media[photo]).toBeTruthy();
    expect(JSON.stringify(d.pages)).toContain(photo);
  });

  it("derives a short hero headline from what the site is for (never the whole answer)", () => {
    const cases: Array<[string, string]> = [
      [
        "Teal House Pottery: a small ceramics studio in Portland selling handmade mugs and bowls, and running evening wheel-throwing classes.",
        "A small ceramics studio in Portland",
      ],
      [
        "A neighbourhood bakery and tea room in Leith.",
        "A neighbourhood bakery and tea room in Leith",
      ],
      [
        "We are a choir for people who think they can't sing.",
        "A choir for people who think they can't sing",
      ],
      ["Crumb is a family bakery. We bake every morning.", "A family bakery"],
      [
        "Small yoga classes for beginners in a converted chapel",
        "Small yoga classes for beginners in a converted chapel",
      ],
    ];
    for (const [about, want] of cases) expect(headlineFrom(about), about).toBe(want);
    const long =
      "Helping first-time founders across rural Scotland understand grants loans equity crowdfunding and everything in between";
    const h = headlineFrom(long) as string;
    expect(h.split(" ").length).toBeLessThanOrEqual(HEADLINE_MAX_WORDS);
    expect(h).not.toMatch(/\b(?:and|the|of)$/);
    // A one-line answer becomes the headline alone (no repeated supporting line).
    expect(heroCopy("Handmade pottery in Portland")).toEqual({
      tagline: "Handmade pottery in Portland",
      intro: "",
    });
  });

  it("a long 'What is it for?' -> short headline, the answer as the intro, no sample place or brand (wave 4 P1/P2)", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Teal Potter");
    const about =
      "Teal House Pottery: a small ceramics studio in Portland selling handmade mugs and bowls, and running evening wheel-throwing classes.";
    const res = await call(app, "/api/start", {
      method: "POST",
      cookie,
      json: { name: "Teal House Pottery", about, feeling: ["calm"] },
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const body = (await res.json()) as {
      site: { id: string };
      startedFrom: { template: string; note?: string };
    };
    expect(body.startedFrom.template).toBe("Kiln");
    const d = (
      (await (await call(app, `/api/sites/${body.site.id}/document`, { cookie })).json()) as {
        document: SiteDocument;
      }
    ).document;
    const home = Object.values(d.pages).find((p) => p.slug === "");
    const h1 = home?.sections
      .flatMap((s) => s.blocks)
      .find((b) => b.type === "heading" && b.fields.level === "h1");
    expect(h1?.fields.text).toBe("A small ceramics studio in Portland");
    expect(h1?.fields.subheading).toBe(about);
    expect(h1?.fields.eyebrow).toBeUndefined();
    const copy = designCheck(d, home?.id).filter(
      (i) => i.rule === "copy-length" && i.severity === "warning",
    );
    expect(copy.map((i) => i.message)).toEqual([]);
    expect(JSON.stringify(d.pages)).not.toContain("Saltmarsh Pottery");
    expect(JSON.stringify(d.collections)).not.toContain("Saltmarsh Pottery");
    expect(body.startedFrom.note).toMatch(/sample/);
  });

  it("refuses token files without tokens, in plain words", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Tok Tester");
    const res = await call(app, "/api/start", {
      method: "POST",
      cookie,
      json: { name: "X", tokens: '{"hello":"world"}' },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/couldn't find any colours/);
  });

  it("a page Claude made (upload) -> an editable site, live at once", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Lantern Owner");
    const res = await call(app, "/api/imports/html", {
      method: "POST",
      cookie,
      json: {
        confirmOwnership: true,
        html: { name: "lantern.html", data: dataUrl("text/html", PAGE) },
      },
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const body = (await res.json()) as {
      site: { id: string; name: string };
      startedFrom: { kind: string };
    };
    expect(body.startedFrom.kind).toBe("html");
    expect(body.site.name).toBe("lantern");
    const doc = (await (
      await call(app, `/api/sites/${body.site.id}/document`, { cookie })
    ).json()) as Doc;
    const d = doc.document;
    expect(Object.keys(d.components ?? {}).length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(d.pages)).toContain("Second-hand books");
    expect(d.designSystem?.sources?.[0]?.kind).toBe("html");
  });

  it("the Claude app can start a site from a conversation (start_site) and from a page (import_site html)", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Claude Starter");
    const { accessToken } = await oauthConnect(app, cookie, { sites: [], create: true });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, accessToken);
    await mcp.initialize();
    const made = await mcp.tool("start_site", {
      name: "Still Water Yoga",
      about: "Small yoga classes for beginners in a converted chapel",
      feeling: ["calm"],
      colors: ["#4b6b5d"],
    });
    expect(made.result?.isError, toolText(made)).toBeFalsy();
    expect(toolText(made)).toContain("template");
    const fromPage = await mcp.tool("import_site", {
      html: PAGE,
      name: "Lantern",
      confirmOwnership: true,
    });
    expect(fromPage.result?.isError, toolText(fromPage)).toBeFalsy();
    expect(toolText(fromPage)).toContain("every section keeps its design");
    void env;
  });
});
