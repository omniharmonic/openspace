import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPreset } from "@omniharmonic/openspace-blocks";
import {
  ALL_TOOLS,
  createMcpServer,
  MemorySiteStore,
  PROMPTS,
} from "@omniharmonic/openspace-mcp-tools";
import { loadSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { loadTemplate, TEMPLATE_IDS } from "@omniharmonic/openspace-templates";
import { describe, expect, it } from "vitest";
import {
  agentFiles,
  allMarkdown,
  commandFiles,
  mentionedPresets,
  mentionedTools,
  PLUGIN_ROOT,
  REPO_ROOT,
  readJson,
  readMarkdown,
  recipes,
  skillFiles,
  validateMarketplace,
  validatePlugin,
} from "./index";

/**
 * Tools only the local stdio server (`openspace mcp`) adds on top of the shared set: they fetch
 * the web, so the Hub never serves them. Each must really be defined in the CLI.
 */
const LOCAL_TOOLS = ["import_site", "import_squarespace", "screenshot_url", "compare_fidelity"];
const CLI_MCP = join(REPO_ROOT, "packages", "cli", "src", "mcp");
/** Hub-only tools (the remote connector's account-level tools; defined in apps/hub). */
const HUB_TOOLS = ["create_site", "list_templates", "import_status", "start_site", "site_status"];
const TOOL_NAMES = new Set([...ALL_TOOLS.map((t) => t.name), ...LOCAL_TOOLS, ...HUB_TOOLS]);
const read = (rel: string) => readFileSync(join(PLUGIN_ROOT, rel), "utf8");

describe("plugin structure (plugin-validator checklist)", () => {
  it("the plugin validates with no issues", () => {
    expect(validatePlugin()).toEqual([]);
  });

  it("the repo-root marketplace lists the plugin from ./plugin", () => {
    expect(validateMarketplace()).toEqual([]);
    const m = readJson(join(REPO_ROOT, ".claude-plugin", "marketplace.json")) as {
      plugins: { name: string; source: string }[];
    };
    expect(m.plugins).toContainEqual(
      expect.objectContaining({ name: "openspace", source: "./plugin" }),
    );
  });

  it("the manifest names the plugin and its author", () => {
    const m = readJson(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json")) as Record<
      string,
      unknown
    >;
    expect(m).toMatchObject({
      name: "openspace",
      author: { name: "Benjamin Life" },
      license: "MIT",
    });
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("ships the required commands, skills and agent", () => {
    const base = (p: string) => p.split("/").pop();
    expect(commandFiles().map(base)).toEqual([
      "design-check.md",
      "design-from-scratch.md",
      "import-squarespace.md",
      "iterate.md",
      "migrate.md",
      "new-site.md",
      "publish.md",
      "restyle.md",
    ]);
    expect(skillFiles().map((p) => p.split("/").at(-2))).toEqual([
      "openspace-content",
      "openspace-design-from-scratch",
      "openspace-migrate",
      "openspace-site-setup",
      "openspace-web-design",
    ]);
    expect(agentFiles().map(base)).toEqual(["openspace-designer.md"]);
  });

  it("registers the local stdio server and documents the remote Hub server", () => {
    const local = readJson(join(PLUGIN_ROOT, ".mcp.json")) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(local.mcpServers.openspace).toEqual({
      command: "npx",
      args: ["-y", "@omniharmonic/openspace-cli", "mcp"],
    });
    const remote = readJson(join(PLUGIN_ROOT, "examples", "remote-hub.mcp.json")) as {
      mcpServers: Record<string, { type: string; url: string }>;
    };
    expect(remote.mcpServers.openspace).toEqual({
      type: "http",
      url: "https://hub.openspace.host/mcp",
    });
    // The package and command the server entry runs really exist.
    const cli = JSON.parse(
      readFileSync(join(REPO_ROOT, "packages", "cli", "package.json"), "utf8"),
    ) as { name: string; publishConfig: { bin: Record<string, string> } };
    expect(cli.name).toBe("@omniharmonic/openspace-cli");
    expect(Object.keys(cli.publishConfig.bin)).toEqual(["openspace"]);
    expect(readFileSync(join(REPO_ROOT, "packages", "cli", "src", "program.ts"), "utf8")).toMatch(
      /\.command\("mcp"\)/,
    );
  });
});

describe("validator catches broken plugins", () => {
  const copy = () => {
    const dir = mkdtempSync(join(tmpdir(), "os-plugin-"));
    for (const p of [
      ".claude-plugin",
      ".mcp.json",
      "README.md",
      "commands",
      "agents",
      "skills",
      "examples",
    ])
      cpSync(join(PLUGIN_ROOT, p), join(dir, p), { recursive: true });
    return dir;
  };

  it("flags bad manifests, frontmatter and references", () => {
    const dir = copy();
    try {
      writeFileSync(
        join(dir, ".claude-plugin", "plugin.json"),
        JSON.stringify({ name: "Open Space", version: "1" }),
      );
      writeFileSync(join(dir, "commands", "broken.md"), "no frontmatter here\n");
      writeFileSync(
        join(dir, "agents", "x.md"),
        "---\nname: x\ndescription: short\nmodel: gpt\ncolor: pink\n---\nhi\n",
      );
      const skill = join(dir, "skills", "openspace-content", "SKILL.md");
      writeFileSync(
        skill,
        readFileSync(skill, "utf8")
          .replace("This skill should be used when", "Use this skill when")
          .concat("\nSee `references/missing.md`. You should do it.\n"),
      );
      writeFileSync(
        join(dir, ".mcp.json"),
        JSON.stringify({
          mcpServers: { openspace: { type: "http", url: "http://hub.example/mcp" } },
        }),
      );
      const messages = validatePlugin(dir).map((i) => `${i.file}: ${i.message}`);
      for (const expected of [
        "name must be kebab-case",
        "version must be semver",
        "missing YAML frontmatter",
        "agent name must be 3-50",
        "agent model must be",
        "agent color must be",
        "skill description must be third person",
        "references references/missing.md",
        "imperative form",
        "url must use https/wss",
      ])
        expect(messages.join("\n")).toContain(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("skills and commands match the real MCP server", () => {
  const docs = allMarkdown().map((p) => ({ p, text: readFileSync(p, "utf8") }));

  it("every backticked tool name exists in @omniharmonic/openspace-mcp-tools", () => {
    const unknown: string[] = [];
    for (const { p, text } of docs)
      for (const t of mentionedTools(text)) if (!TOOL_NAMES.has(t)) unknown.push(`${p}: ${t}`);
    expect(unknown).toEqual([]);
  });

  it("the tool reference documents every tool and prompt", () => {
    const ref = read("skills/openspace-web-design/references/tool-reference.md");
    for (const name of TOOL_NAMES) expect(ref, name).toContain(`\`${name}\``);
    for (const p of PROMPTS) expect(ref, p.name).toContain(`\`${p.name}\``);
  });

  it("the web-design skill names the iteration loop's tools", () => {
    const skill = read("skills/openspace-web-design/SKILL.md");
    for (const t of [
      "get_page",
      "design_check",
      "apply_fix",
      "update_block",
      "screenshot",
      "render_page",
      "get_draft_diff",
    ])
      expect(skill).toContain(`\`${t}\``);
    expect(skill).toMatch(/never invent/i);
    expect(skill).toMatch(/mobile/i);
  });

  it("every preset id mentioned exists in the preset library", () => {
    const unknown: string[] = [];
    for (const { p, text } of docs)
      for (const id of mentionedPresets(text)) if (!getPreset(id)) unknown.push(`${p}: ${id}`);
    expect(unknown).toEqual([]);
  });

  it("the setup skill lists every template", () => {
    const skill = read("skills/openspace-site-setup/SKILL.md");
    expect(TEMPLATE_IDS).toHaveLength(20);
    for (const id of TEMPLATE_IDS) expect(skill).toContain(`\`${id}\``);
    const cmd = readMarkdown(join(PLUGIN_ROOT, "commands", "new-site.md")).body;
    for (const id of TEMPLATE_IDS) expect(cmd).toContain(`\`${id}\``);
  });

  it("the designer agent only reads", () => {
    const agent = readMarkdown(join(PLUGIN_ROOT, "agents", "openspace-designer.md"));
    const readOnly = agent.body.split("## Process")[0]?.split("Never call")[0] ?? "";
    for (const t of mentionedTools(readOnly))
      expect(t).toMatch(/^(get_|list_|design_check|phone_check|screenshot|render_page|preview)/);
    expect(agent.body).toContain("`design_check`");
    expect(agent.body).toContain("`screenshot`");
    expect(agent.body).toContain("`render_page`");
  });
});

describe("the Squarespace migration skill and command", () => {
  it("local-only tools are defined in the CLI's MCP server and registered there", () => {
    const sources = ["import-tool.ts", "reference-tool.ts", "fidelity-tool.ts"]
      .map((f) => readFileSync(join(CLI_MCP, f), "utf8"))
      .join("\n");
    for (const t of LOCAL_TOOLS) expect(sources).toContain(`name: "${t}"`);
    const index = readFileSync(join(CLI_MCP, "index.ts"), "utf8");
    expect(index).toMatch(/importSiteTool\(/);
    expect(index).toMatch(/importSquarespaceTool\(/);
    expect(index).toMatch(/screenshotUrlTool\(/);
    expect(index).toMatch(/compareFidelityTool\(/);
    for (const t of LOCAL_TOOLS)
      expect(
        ALL_TOOLS.some((x) => x.name === t),
        `${t} must stay local`,
      ).toBe(false);
  });

  it("the CLI has the import command the skill runs", () => {
    const program = readFileSync(join(REPO_ROOT, "packages", "cli", "src", "program.ts"), "utf8");
    expect(program).toMatch(/\.command\("import"\)/);
    for (const sub of ["squarespace", "wordpress", "url", "github"])
      expect(program).toMatch(new RegExp(`\\.command\\("${sub}"\\)`));
    // `openspace import <url>`: the default subcommand detects the platform.
    expect(program).toMatch(/\.command\("site", \{ isDefault: true/);
    const flags = [
      "--owner",
      "--export",
      "--render",
      "--platform",
      "--max-pages",
      "--delay",
      "--no-media",
    ];
    for (const flag of flags) expect(program).toContain(flag);
    const skill = read("skills/openspace-migrate/SKILL.md");
    for (const flag of flags) expect(skill).toContain(flag);
    // Imports always land on free GitHub Pages hosting first: no hosting choice in the import.
    expect(program).not.toMatch(
      /"--target <target>",\s*"github-pages or cloudflare \(use cloudflare to sell/,
    );
    expect(skill).not.toMatch(/(?:use|then|with) `--target cloudflare`/);
    for (const cmd of [
      "npx -y @omniharmonic/openspace-cli import https://",
      "npx -y @omniharmonic/openspace-cli import squarespace",
      "npx -y @omniharmonic/openspace-cli import wordpress",
      "npx -y @omniharmonic/openspace-cli import url",
    ])
      expect(skill).toContain(cmd);
  });

  it("the skill runs the screenshot comparison loop through design tools, never copied code", () => {
    const skill = read("skills/openspace-migrate/SKILL.md");
    for (const t of [
      "screenshot_url",
      "screenshot",
      "render_page",
      "design_check",
      "apply_fix",
      "update_section",
      "insert_section",
      "place_in_grid",
      "auto_mobile_layout",
      "set_styles",
      "get_draft_diff",
      "import_site",
      "import_squarespace",
    ])
      expect(skill, t).toContain(`\`${t}\``);
    for (const platform of ["Squarespace", "WordPress", "Wix", "Webflow", "Carrd", "Framer"])
      expect(skill).toContain(platform);
    expect(read("skills/openspace-migrate/references/platform-mapping.md")).toMatch(
      /## WordPress[\s\S]*## Wix[\s\S]*## Webflow[\s\S]*## Any other site/,
    );
    expect(skill).toMatch(/never copy it/i);
    expect(skill).toMatch(/desktop/);
    expect(skill).toMatch(/mobile/);
    expect(skill).toMatch(/robots\.txt/);
    expect(skill).toMatch(/only then cancel the Squarespace/);
    expect(skill).toMatch(/honest summary/i);
    const cmd = readMarkdown(join(PLUGIN_ROOT, "commands", "import-squarespace.md"));
    expect(cmd.body).toContain("openspace-migrate");
    expect(cmd.body).toContain("`screenshot_url`");
    const migrate = readMarkdown(join(PLUGIN_ROOT, "commands", "migrate.md"));
    expect(migrate.body).toContain("openspace-migrate");
    expect(migrate.body).toContain("`screenshot_url`");
    expect(migrate.body).toContain("`import_site`");
    expect(migrate.body).toContain("npx -y @omniharmonic/openspace-cli import <url>");
    expect(migrate.body).toMatch(/desktop and mobile/);
    expect(migrate.body).toMatch(/honest summary/);
  });
});

describe("page recipes compose clean pages through the real tools", () => {
  const text = read("skills/openspace-web-design/references/page-recipes.md");
  const all = recipes(text);

  it("has a recipe per site type", () => {
    expect(all.length).toBeGreaterThanOrEqual(8);
  });

  it.each(all.map((r, i) => [i, r] as const))(
    "recipe %i builds with zero design errors",
    async (i, recipe) => {
      expect(recipe.presets).toHaveLength(recipe.themes.length);
      const { doc } = loadTemplate("meadow") as { doc: Parameters<typeof structuredClone>[0] };
      const store = new MemorySiteStore({ sites: [structuredClone(doc) as never] });
      const server = createMcpServer(
        store,
        { sites: "*", publish: false, role: "owner" },
        {
          assumeInitialized: true,
        },
      );
      let n = 0;
      const call = async (name: string, args: Record<string, unknown>) => {
        const r = (await server.handle({
          jsonrpc: "2.0",
          id: ++n,
          method: "tools/call",
          params: { name, arguments: args },
        })) as unknown as {
          result: {
            isError?: boolean;
            content: { text?: string }[];
            structuredContent?: Record<string, unknown>;
          };
        };
        if (r.result.isError) throw new Error(`${name}: ${r.result.content[0]?.text}`);
        return r.result.structuredContent as Record<string, unknown>;
      };
      const created = (await call("create_page", {
        title: `Recipe ${i}`,
        slug: `recipe-${i}`,
        presets: recipe.presets,
        themes: recipe.themes,
        description:
          "A page composed from a plugin recipe to check that it passes the design check.",
        addToNav: false,
      })) as { page?: { id: string }; id?: string };
      const pageId = created.page?.id ?? created.id;
      expect(pageId).toBeTruthy();
      const check = (await call("design_check", { page: pageId, minSeverity: "error" })) as {
        counts: { error: number };
        issues: { message: string }[];
      };
      expect(check.issues.map((x) => x.message)).toEqual([]);
      expect(check.counts.error).toBe(0);
    },
  );
});

describe("every JSON example in the skills and commands is valid", () => {
  const FIXTURE = join(REPO_ROOT, "tools", "fixtures", "meadow-site");
  const examples = allMarkdown()
    .filter((p) => !p.endsWith("README.md"))
    .flatMap((p) =>
      [...readFileSync(p, "utf8").matchAll(/```json\n([\s\S]*?)```/g)].map((m, i) => ({
        where: `${p.slice(PLUGIN_ROOT.length + 1)} #${i + 1}`,
        value: JSON.parse(m[1] as string) as Record<string, unknown>,
      })),
    );

  it("finds the examples", () => {
    expect(examples.length).toBeGreaterThanOrEqual(13);
  });

  it.each(examples.map((e) => [e.where, e.value] as const))("%s", async (_where, value) => {
    if (Array.isArray(value.presets)) {
      expect(recipes(`\`\`\`json\n${JSON.stringify(value)}\n\`\`\``)).toHaveLength(1);
      return; // composed through the real tools in "page recipes" above
    }
    const doc = await loadSiteDocument(FIXTURE);
    const server = createMcpServer(
      new MemorySiteStore({ sites: [doc] }),
      { sites: "*", publish: false, role: "owner" },
      { assumeInitialized: true },
    );
    // A custom component definition: create it, place it and expect no blocking findings.
    if (typeof value.template === "string" && value.fields) {
      const call = async (name: string, args: Record<string, unknown>) =>
        (
          (await server.handle({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
          })) as unknown as {
            result: {
              isError?: boolean;
              content: { text?: string }[];
              structuredContent?: { findings?: { severity: string }[] };
            };
          }
        ).result;
      const created = await call("create_component", { component: value });
      expect(created.isError ?? false, created.content[0]?.text).toBe(false);
      const placed = await call("insert_component", { page: "/", name: value.name });
      expect(placed.isError ?? false, placed.content[0]?.text).toBe(false);
      expect(
        (placed.structuredContent?.findings ?? []).filter((f) => f.severity === "error"),
      ).toEqual([]);
      return;
    }
    // Design-system tokens: saved and applied through the real tool.
    if (value.colors && value.fonts) {
      const r = (await server.handle({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "update_design_system",
          arguments: { changes: { tokens: value }, applyToStyles: true },
        },
      })) as unknown as { result: { isError?: boolean; content: { text?: string }[] } };
      expect(r.result.isError ?? false, r.result.content[0]?.text).toBe(false);
      return;
    }
    // Anything else must be a create_post call: run it through the real server.
    expect(Object.keys(value)).toEqual(expect.arrayContaining(["collection", "title", "body"]));
    const r = (await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "create_post", arguments: value },
    })) as unknown as { result: { isError?: boolean; content: { text?: string }[] } };
    expect(r.result.content[0]?.text, JSON.stringify(value)).not.toMatch(/Invalid|rejected/);
    expect(r.result.isError ?? false).toBe(false);
  });
});
