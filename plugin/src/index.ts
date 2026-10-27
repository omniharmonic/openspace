/**
 * Structural validation for the OpenSpace Claude Code plugin (and the repo-root marketplace),
 * following the plugin-dev validator checklist: manifest fields, MCP server shapes, command /
 * agent / skill frontmatter, and references between files. Pure Node, no Claude Code needed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const name = "@omniharmonic/openspace-claude-plugin";

/** The plugin folder (`plugin/`). */
export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The repository root holding `.claude-plugin/marketplace.json`. */
export const REPO_ROOT = resolve(PLUGIN_ROOT, "..");

export interface Issue {
  file: string;
  message: string;
}

export interface MarkdownFile {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const AGENT_MODELS = new Set(["inherit", "sonnet", "opus", "haiku"]);
const AGENT_COLORS = new Set(["blue", "cyan", "green", "yellow", "magenta", "red"]);

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Split a Markdown file into YAML frontmatter and body. Throws when frontmatter is missing. */
export function readMarkdown(path: string): MarkdownFile {
  const text = readFileSync(path, "utf8");
  const m = /^---\n(?!\s*\n)([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${path}: missing YAML frontmatter`);
  const fm = parseYaml(m[1] as string) as unknown;
  if (!fm || typeof fm !== "object" || Array.isArray(fm))
    throw new Error(`${path}: frontmatter is not a mapping`);
  return { path, frontmatter: fm as Record<string, unknown>, body: m[2] as string };
}

const mdFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .map((f) => join(dir, f))
    : [];

export const commandFiles = (root = PLUGIN_ROOT) => mdFiles(join(root, "commands"));
export const agentFiles = (root = PLUGIN_ROOT) => mdFiles(join(root, "agents"));
export function skillFiles(root = PLUGIN_ROOT): string[] {
  const dir = join(root, "skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => statSync(join(dir, d)).isDirectory())
    .sort()
    .map((d) => join(dir, d, "SKILL.md"));
}

/** Every Markdown file shipped with the plugin (skills, references, commands, agents, README). */
export function allMarkdown(root = PLUGIN_ROOT): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Validate the whole plugin. Returns an empty list when everything is in order. */
export function validatePlugin(root = PLUGIN_ROOT): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) =>
    issues.push({ file: relative(root, path) || ".", message });

  // --- manifest ---------------------------------------------------------------------------------
  const manifestPath = join(root, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) add(manifestPath, "missing .claude-plugin/plugin.json");
  else {
    const m = readJson(manifestPath) as Record<string, unknown>;
    if (!str(m.name) || !KEBAB.test(m.name)) add(manifestPath, "name must be kebab-case");
    if (m.version !== undefined && (!str(m.version) || !SEMVER.test(m.version)))
      add(manifestPath, "version must be semver (X.Y.Z)");
    if (m.description !== undefined && !str(m.description))
      add(manifestPath, "description must be a non-empty string");
    const author = m.author as Record<string, unknown> | undefined;
    if (author !== undefined && (typeof author !== "object" || !str(author.name)))
      add(manifestPath, "author must be an object with a name");
    for (const key of ["commands", "agents", "skills", "hooks", "mcpServers"]) {
      const v = m[key];
      const paths = typeof v === "string" ? [v] : Array.isArray(v) ? v : [];
      for (const p of paths)
        if (typeof p === "string" && !p.startsWith("./"))
          add(manifestPath, `${key} path "${p}" must be relative and start with ./`);
    }
  }
  for (const dir of ["commands", "agents", "skills", "hooks"])
    if (existsSync(join(root, ".claude-plugin", dir)))
      add(join(root, ".claude-plugin", dir), `${dir}/ must sit at the plugin root`);

  // --- MCP servers --------------------------------------------------------------------------------
  const mcpPath = join(root, ".mcp.json");
  if (existsSync(mcpPath)) issues.push(...validateMcpConfig(mcpPath, root));

  // --- commands -----------------------------------------------------------------------------------
  for (const file of commandFiles(root)) {
    const base = file.split("/").pop() as string;
    if (!KEBAB.test(base.replace(/\.md$/, ""))) add(file, "command file names must be kebab-case");
    let md: MarkdownFile;
    try {
      md = readMarkdown(file);
    } catch (e) {
      add(file, (e as Error).message);
      continue;
    }
    if (!str(md.frontmatter.description)) add(file, "command needs a description");
    const hint = md.frontmatter["argument-hint"];
    if (hint !== undefined && typeof hint !== "string") add(file, "argument-hint must be a string");
    const tools = md.frontmatter["allowed-tools"];
    if (tools !== undefined && typeof tools !== "string" && !Array.isArray(tools))
      add(file, "allowed-tools must be a string or a list");
    if (md.body.trim().length < 40) add(file, "command body is too short");
    if (hint !== undefined && !/\$ARGUMENTS|\$1/.test(md.body))
      add(file, "argument-hint is set but the body never uses $ARGUMENTS");
  }

  // --- agents -------------------------------------------------------------------------------------
  for (const file of agentFiles(root)) {
    let md: MarkdownFile;
    try {
      md = readMarkdown(file);
    } catch (e) {
      add(file, (e as Error).message);
      continue;
    }
    const fm = md.frontmatter;
    const agentName = fm.name;
    if (
      !str(agentName) ||
      agentName.length < 3 ||
      agentName.length > 50 ||
      !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(agentName)
    )
      add(file, "agent name must be 3-50 lowercase letters, digits and hyphens");
    if (str(agentName) && file.split("/").pop() !== `${agentName}.md`)
      add(file, "agent file name must match its name");
    if (!str(fm.description) || fm.description.length < 10 || fm.description.length > 5000)
      add(file, "agent description must be 10-5000 characters");
    else if (!/^Use this agent when/.test(fm.description))
      add(file, 'agent description should start with "Use this agent when"');
    if (!str(fm.model) || !AGENT_MODELS.has(fm.model))
      add(file, "agent model must be inherit, sonnet, opus or haiku");
    if (!str(fm.color) || !AGENT_COLORS.has(fm.color))
      add(file, "agent color must be blue, cyan, green, yellow, magenta or red");
    if (fm.tools !== undefined && !Array.isArray(fm.tools) && typeof fm.tools !== "string")
      add(file, "agent tools must be a list");
    const len = md.body.trim().length;
    if (len < 20 || len > 10_000) add(file, "agent system prompt must be 20-10,000 characters");
    if (!/^## When to invoke/m.test(md.body))
      add(file, 'agent body needs a "When to invoke" section');
    if (!/^You are /m.test(md.body.trim())) add(file, 'agent prompt should start with "You are"');
  }

  // --- skills -------------------------------------------------------------------------------------
  for (const file of skillFiles(root)) {
    const dir = dirname(file);
    const dirName = dir.split("/").pop() as string;
    if (!KEBAB.test(dirName)) add(dir, "skill directory names must be kebab-case");
    if (!existsSync(file)) {
      add(dir, "skill directory has no SKILL.md");
      continue;
    }
    let md: MarkdownFile;
    try {
      md = readMarkdown(file);
    } catch (e) {
      add(file, (e as Error).message);
      continue;
    }
    if (!str(md.frontmatter.name)) add(file, "skill needs a name");
    else if (md.frontmatter.name !== dirName) add(file, "skill name must match its directory");
    const desc = md.frontmatter.description;
    if (!str(desc)) add(file, "skill needs a description");
    else {
      if (!/^This skill should be used when/.test(desc))
        add(file, 'skill description must be third person ("This skill should be used when…")');
      if (!/"[^"]+"/.test(desc)) add(file, "skill description needs quoted trigger phrases");
      if (desc.length > 1024) add(file, "skill description must be at most 1024 characters");
    }
    const words = md.body.split(/\s+/).filter(Boolean).length;
    if (words < 150) add(file, `skill body is too thin (${words} words)`);
    if (words > 3000)
      add(file, `skill body is too long (${words} words); move detail to references/`);
    if (/\bYou (should|need to|must|can)\b/.test(md.body))
      add(file, "skill body should use imperative form, not second person");
    for (const ref of md.body.matchAll(/`((?:references|examples|scripts|assets)\/[^`\s]+)`/g))
      if (!existsSync(join(dir, ref[1] as string)))
        add(file, `references ${ref[1]}, which does not exist`);
  }

  // --- README and examples ------------------------------------------------------------------------
  const readme = join(root, "README.md");
  if (!existsSync(readme)) add(readme, "plugin needs a README.md");
  else {
    const text = readFileSync(readme, "utf8");
    for (const line of [
      "/plugin marketplace add omniharmonic/openspace",
      "/plugin install openspace",
    ])
      if (!text.includes(line)) add(readme, `README must show "${line}"`);
    for (const link of text.matchAll(/\]\(((?:examples|skills|commands|agents)\/[^)]+)\)/g))
      if (!existsSync(join(root, link[1] as string))) add(readme, `broken link ${link[1]}`);
  }
  const examples = join(root, "examples");
  if (existsSync(examples))
    for (const f of readdirSync(examples).filter((x) => x.endsWith(".json")))
      issues.push(...validateMcpConfig(join(examples, f), root));

  // --- hygiene ------------------------------------------------------------------------------------
  for (const file of allMarkdown(root)) {
    const text = readFileSync(file, "utf8");
    if (/\/Users\/|\/home\/[a-z]/.test(text)) add(file, "contains a hard-coded absolute path");
    if (/\b(sk_live|ghp_|AKIA)[A-Za-z0-9]/.test(text)) add(file, "contains a secret-shaped string");
  }
  return issues;
}

/** Validate an MCP config file (`{ mcpServers: { name: server } }`). */
export function validateMcpConfig(path: string, root = PLUGIN_ROOT): Issue[] {
  const issues: Issue[] = [];
  const add = (message: string) => issues.push({ file: relative(root, path), message });
  let cfg: Record<string, unknown>;
  try {
    cfg = readJson(path) as Record<string, unknown>;
  } catch (e) {
    add(`invalid JSON: ${(e as Error).message}`);
    return issues;
  }
  const servers = cfg.mcpServers as Record<string, Record<string, unknown>> | undefined;
  if (!servers || typeof servers !== "object" || !Object.keys(servers).length) {
    add("needs a non-empty mcpServers object");
    return issues;
  }
  for (const [serverName, s] of Object.entries(servers)) {
    if (!KEBAB.test(serverName)) add(`server name "${serverName}" must be kebab-case`);
    const type = (s.type as string | undefined) ?? "stdio";
    if (type === "stdio") {
      if (!str(s.command)) add(`${serverName}: stdio server needs a command`);
      if (
        s.args !== undefined &&
        (!Array.isArray(s.args) || s.args.some((a) => typeof a !== "string"))
      )
        add(`${serverName}: args must be a list of strings`);
    } else if (type === "http" || type === "sse" || type === "ws") {
      if (!str(s.url)) add(`${serverName}: ${type} server needs a url`);
      else if (!/^(https|wss):\/\//.test(s.url)) add(`${serverName}: url must use https/wss`);
    } else add(`${serverName}: unknown server type ${type}`);
  }
  return issues;
}

/** Validate the repo-root marketplace and that it lists this plugin. */
export function validateMarketplace(repoRoot = REPO_ROOT): Issue[] {
  const issues: Issue[] = [];
  const path = join(repoRoot, ".claude-plugin", "marketplace.json");
  const add = (message: string) => issues.push({ file: relative(repoRoot, path), message });
  if (!existsSync(path)) {
    add("missing .claude-plugin/marketplace.json");
    return issues;
  }
  const m = readJson(path) as Record<string, unknown>;
  if (!str(m.name) || !KEBAB.test(m.name)) add("name must be kebab-case");
  const owner = m.owner as Record<string, unknown> | undefined;
  if (!owner || !str(owner.name)) add("owner.name is required");
  const plugins = m.plugins as Record<string, unknown>[] | undefined;
  if (!Array.isArray(plugins) || !plugins.length) {
    add("plugins must be a non-empty list");
    return issues;
  }
  const seen = new Set<string>();
  for (const p of plugins) {
    if (!str(p.name) || !KEBAB.test(p.name)) add("plugin name must be kebab-case");
    else if (seen.has(p.name)) add(`duplicate plugin ${p.name}`);
    else seen.add(p.name);
    if (typeof p.source === "string") {
      if (!p.source.startsWith("./")) add(`${p.name}: relative source must start with ./`);
      const dir = join(repoRoot, p.source);
      const manifest = join(dir, ".claude-plugin", "plugin.json");
      if (!existsSync(manifest)) add(`${p.name}: ${p.source} has no .claude-plugin/plugin.json`);
      else {
        const pm = readJson(manifest) as Record<string, unknown>;
        if (pm.name !== p.name) add(`${p.name}: plugin.json name is ${String(pm.name)}`);
        if (p.version !== undefined && pm.version !== p.version)
          add(
            `${p.name}: version ${String(p.version)} differs from plugin.json ${String(pm.version)}`,
          );
      }
    } else if (!p.source || typeof p.source !== "object")
      add(`${String(p.name)}: source is required`);
  }
  return issues;
}

/** Backticked snake_case identifiers in a text (candidate MCP tool names). */
export function mentionedTools(text: string): string[] {
  return [...new Set([...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1] as string))];
}

/** Preset ids (`category/name@n`) mentioned anywhere in a text. */
export function mentionedPresets(text: string): string[] {
  return [
    ...new Set([...text.matchAll(/\b([a-z]+\/[a-z0-9-]+@\d+)\b/g)].map((m) => m[1] as string)),
  ];
}

/** `{ "presets": [...], "themes": [...] }` JSON recipes inside fenced blocks. */
export function recipes(text: string): { presets: string[]; themes: string[] }[] {
  const out: { presets: string[]; themes: string[] }[] = [];
  for (const m of text.matchAll(/```json\n([\s\S]*?)```/g)) {
    try {
      const v = JSON.parse(m[1] as string) as { presets?: unknown; themes?: unknown };
      if (Array.isArray(v.presets) && Array.isArray(v.themes))
        out.push({ presets: v.presets as string[], themes: v.themes as string[] });
    } catch {
      // not a recipe
    }
  }
  return out;
}
