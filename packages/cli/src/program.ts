import { resolve } from "node:path";
import { Command, CommanderError } from "commander";
import { renderAgentsMd, writeAgentsMd } from "./agents";
import { type Budgets, formatReport, githubAnnotations, runCheck } from "./check";
import { runDev, type Spawner } from "./dev";
import { EJECT_WARNING, runEject } from "./eject";
import { type GatedSyncDeps, runGatedSync } from "./gated-sync";
import { importSummary, runImportSquarespace } from "./import";
import { CliError, colorEnabled, type Io, paint } from "./io";
import { runMcp } from "./mcp";
import { runMigrate } from "./migrate";
import { runNew } from "./new";

export const VERSION = "0.1.0";

/** Build the `openspace` command tree. Commands report problems by throwing `CliError`. */
export interface ProgramDeps {
  spawner?: Spawner;
  /** `fetch` for `openspace import` (tests use recorded fixtures). */
  fetch?: typeof fetch;
  findBin?: (cwd: string) => string | undefined;
  gatedSync?: GatedSyncDeps;
}

export function createProgram(
  io: Io,
  setExit: (code: number) => void,
  deps: ProgramDeps = {},
): Command {
  const program = new Command("openspace")
    .description("Check, preview, migrate, scaffold and serve OpenSpace sites to Claude (MCP).")
    .version(VERSION)
    .configureOutput({ writeOut: (s) => io.out(s.trimEnd()), writeErr: (s) => io.err(s.trimEnd()) })
    .exitOverride();

  program
    .command("check")
    .argument("[dir]", "site folder (default: the current folder)")
    .description("Validate content: schemas, links, images, size budgets and secrets.")
    .option("--ci", "CI mode: also print GitHub Actions annotations")
    .option("--json", "print the report as JSON")
    .option("--media-warn-mb <n>", "media folder warning threshold in MB", Number)
    .option("--media-fail-mb <n>", "media folder failure threshold in MB", Number)
    .action(
      async (
        dir: string | undefined,
        opts: {
          ci?: boolean;
          json?: boolean;
          mediaWarnMb?: number;
          mediaFailMb?: number;
        },
      ) => {
        const budgets: Partial<Budgets> = {};
        if (opts.mediaWarnMb !== undefined) budgets.mediaWarnBytes = opts.mediaWarnMb * 1024 * 1024;
        if (opts.mediaFailMb !== undefined) budgets.mediaFailBytes = opts.mediaFailMb * 1024 * 1024;
        const report = await runCheck(resolve(io.cwd, dir ?? "."), { budgets });
        if (opts.json) {
          io.out(JSON.stringify(report, null, 2));
        } else {
          if (opts.ci) for (const line of githubAnnotations(report)) io.out(line);
          const color = colorEnabled(io);
          io.out(formatReport(report, (code, s) => paint(color, code, s)));
        }
        if (!report.ok) setExit(1);
      },
    );

  program
    .command("dev")
    .description("Start the local preview (astro dev) in this site.")
    .allowUnknownOption()
    .argument("[astroArgs...]", "extra arguments passed to astro dev")
    .action(async (args: string[]) => {
      setExit(await runDev(io, args, deps.spawner, deps.findBin));
    });

  program
    .command("migrate")
    .description("Upgrade content to the current schema version and write it back.")
    .option("--dry-run", "report what would change without writing")
    .action(async (opts: { dryRun?: boolean }) => {
      const r = await runMigrate(io.cwd, { dryRun: opts.dryRun });
      if (!r.applied.length && !r.blocksMigrated) {
        io.out(`Already up to date (schema version ${r.to}). Nothing changed.`);
        return;
      }
      io.out(`Migrated schema version ${r.from} -> ${r.to}.`);
      for (const a of r.applied) io.out(`  ${a}`);
      if (r.blocksMigrated)
        io.out(`  Upgraded ${r.blocksMigrated} block(s) to their latest version.`);
      io.out(opts.dryRun ? "Dry run, would write:" : `Wrote ${r.written.length} file(s):`);
      for (const f of r.written) io.out(`  ${f}`);
      for (const f of r.removed) io.out(`  ${opts.dryRun ? "would remove" : "removed"} ${f}`);
    });

  program
    .command("new")
    .description("Create a new site from a template.")
    .argument("<template>", "template id (for example: meadow)")
    .argument("<dir>", "folder to create")
    .option("--target <target>", "github-pages or cloudflare", "github-pages")
    .option("--repo <owner/name>", "GitHub repository, used for the Pages address")
    .option("--url <url>", "address the site is served from before a custom domain")
    .option("--domain <hostname>", "custom domain")
    .option("--title <title>", "site title")
    .option("--hub <url>", "Hub address")
    .option("--templates-dir <dir>", "folder holding template directories")
    .action(
      async (
        template: string,
        dir: string,
        opts: {
          target: string;
          repo?: string;
          url?: string;
          domain?: string;
          title?: string;
          hub?: string;
          templatesDir?: string;
        },
      ) => {
        if (opts.target !== "github-pages" && opts.target !== "cloudflare")
          throw new CliError(`--target must be github-pages or cloudflare, not "${opts.target}".`);
        const r = await runNew(io, template, dir, { ...opts, target: opts.target });
        if (r.usedFallback)
          io.out(
            `Note: template "${template}" has no content of its own yet, so the Meadow sample site (${r.contentFrom}) was used instead.`,
          );
        io.out(
          `Created ${r.dir} (${r.files} shell files, site id ${r.siteId}, template ${r.templateId}).`,
        );
        io.out("Next:");
        io.out(`  cd ${dir}`);
        io.out("  npm install");
        io.out("  npx openspace check");
        io.out("  npx openspace dev");
        if (opts.url === undefined && opts.repo === undefined && !opts.domain)
          io.out("Set deploy.url in openspace.json to where the site will be published.");
      },
    );

  const importCmd = program
    .command("import")
    .description("Move an existing website into a new OpenSpace site folder.");
  importCmd
    .command("squarespace")
    .description(
      "Import a Squarespace site (7.0 or 7.1): pages, blog/events/products, media, navigation, SEO, redirects and an approximate look. Only for sites you own or are moving for their owner.",
    )
    .argument("<url>", "the Squarespace site's address, e.g. https://www.example.com")
    .argument("[dir]", "new folder to create (default: from the address)")
    .option("--export <file>", "WordPress export (Settings → Import & Export) with your blog posts")
    .option(
      "--owner",
      "I own this site: also read Squarespace's ?format=json data (richer collections and SEO); robots.txt asks crawlers not to read it",
    )
    .option(
      "--target <target>",
      "github-pages or cloudflare (use cloudflare to sell products)",
      "github-pages",
    )
    .option("--repo <owner/name>", "GitHub repository, used for the Pages address")
    .option("--url <url>", "address the new site is served from before a custom domain")
    .option("--domain <hostname>", "custom domain (set it when you move the domain)")
    .option("--title <title>", "site title (default: the Squarespace site title)")
    .option("--hub <url>", "Hub address")
    .option("--max-pages <n>", "most pages and items to read (default 400)", Number)
    .option("--delay <ms>", "pause between requests to the site (default 300)", Number)
    .option("--no-media", "don't download images and files (a quick structural preview)")
    .action(
      async (
        url: string,
        dir: string | undefined,
        opts: {
          export?: string;
          owner?: boolean;
          target: string;
          repo?: string;
          url?: string;
          domain?: string;
          title?: string;
          hub?: string;
          maxPages?: number;
          delay?: number;
          media?: boolean;
        },
      ) => {
        if (opts.target !== "github-pages" && opts.target !== "cloudflare")
          throw new CliError(`--target must be github-pages or cloudflare, not "${opts.target}".`);
        io.err(
          `Importing ${url}${opts.owner ? " (owner mode: also reading ?format=json)" : ""}. Requests are paced and robots.txt is honoured.`,
        );
        const r = await runImportSquarespace(io, url, dir, {
          ...opts,
          target: opts.target,
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
        });
        for (const line of importSummary(r)) io.out(line);
        io.out("Next:");
        io.out(`  cd ${dir ?? r.dir}`);
        io.out("  npm install && npx openspace dev");
        io.out("  claude   # then /openspace:import-squarespace to bring it to visual parity");
        if (!r.check.ok) setExit(1);
      },
    );

  program
    .command("eject")
    .description("Copy the site kit into src/openspace-kit and remove the dependency.")
    .option("-y, --yes", "confirm without asking")
    .action(async (opts: { yes?: boolean }) => {
      io.err(EJECT_WARNING);
      if (!opts.yes) throw new CliError("Re-run with --yes to eject.");
      const r = await runEject(io);
      io.out(`Copied ${r.files} files from ${r.copiedFrom}.`);
      for (const f of r.rewritten) io.out(`  rewrote imports in ${f}`);
      if (r.addedDependencies.length)
        io.out(`Added dependencies: ${r.addedDependencies.join(", ")}. Run "npm install".`);
      io.out("Done. Studio can no longer edit this site.");
    });

  program
    .command("gated-sync")
    .description(
      "Publish workflow (Cloudflare): put this version's members-only and password pages into the Worker's private storage.",
    )
    .option("--bucket <name>", "R2 bucket (default: the OS_GATED bucket in wrangler.jsonc)")
    .action(async (opts: { bucket?: string }) => {
      await runGatedSync(io, opts, deps.gatedSync);
    });

  program
    .command("agents-md")
    .description("Regenerate AGENTS.md from the schema and block library.")
    .option("--stdout", "print instead of writing the file")
    .action(async (opts: { stdout?: boolean }) => {
      if (opts.stdout) {
        io.out((await renderAgentsMd(io.cwd)).trimEnd());
        return;
      }
      const { changed } = await writeAgentsMd(io.cwd);
      io.out(changed ? "Updated AGENTS.md." : "AGENTS.md is already up to date.");
    });

  program
    .command("mcp")
    .argument("[dir]", "site folder (default: the current folder)")
    .description("Run the local MCP server (stdio) so Claude can edit and design this site.")
    .option("--no-publish", "don't allow the publish tool (commits) on this connection")
    .option("--no-screenshots", "don't start a browser for screenshots")
    .option("--preview-port <n>", "port for the local preview server (default: random)", Number)
    .action(
      async (
        dir: string | undefined,
        opts: { publish?: boolean; screenshots?: boolean; previewPort?: number },
      ) => {
        // stdout is the MCP protocol channel; runMcp only talks on stderr.
        await runMcp(io, resolve(io.cwd, dir ?? "."), {
          publish: opts.publish,
          screenshots: opts.screenshots,
          previewPort: opts.previewPort,
        });
      },
    );

  return program;
}

/** Run the CLI with `argv` (without node and script) and return the exit code. */
export async function run(argv: string[], io: Io, deps: ProgramDeps = {}): Promise<number> {
  let code = 0;
  const program = createProgram(
    io,
    (c) => {
      code = c;
    },
    deps,
  );
  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (e) {
    if (e instanceof CommanderError) return e.exitCode;
    if (e instanceof CliError) {
      io.err(`Error: ${e.message}`);
      return e.exitCode;
    }
    const err = e as Error & { issues?: unknown };
    io.err(`Error: ${err.message}`);
    return 1;
  }
  return code;
}
