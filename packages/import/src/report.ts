/**
 * IMPORT-REPORT.md: what was imported and where it went, what needs the owner's attention, and
 * the steps to finish the move. Written into the new site's folder.
 */
import { designCheck } from "@omniharmonic/openspace-lint";
import type { BuildResult } from "./map/site";
import { platformInfo } from "./platform";
import type { SqNotice, SqSite } from "./types";

const NOTICE_TITLES: Record<SqNotice["kind"], string> = {
  "unsupported-block": "Blocks that need a look",
  "custom-code": "Custom code and embeds",
  commerce: "Commerce",
  members: "Member areas",
  "locked-page": "Password-protected pages",
  fetch: "Pages that couldn't be read",
  robots: "Skipped because of robots.txt",
  media: "Images and files",
  form: "Forms and newsletter",
  collection: "Collections",
  link: "Links",
  theme: "Design",
  other: "Other",
};

const ORDER: SqNotice["kind"][] = [
  "commerce",
  "members",
  "locked-page",
  "custom-code",
  "form",
  "unsupported-block",
  "link",
  "media",
  "collection",
  "fetch",
  "robots",
  "theme",
  "other",
];

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export interface ReportInput {
  sq: SqSite;
  build: BuildResult;
  mediaFiles: number;
  mediaBytes: number;
  requests: number;
  owner: boolean;
  wxr: boolean;
  now: Date;
}

export function renderReport(r: ReportInput): string {
  const { sq, build } = r;
  const info = platformInfo(sq.platform);
  const isSq = info.id === "squarespace";
  const label = info.label;
  /** Where the old site lives, for prose ("on Squarespace", "on the original site"). */
  const onOld = info.id === "generic" ? "the original site" : label;
  const command =
    info.importer === "squarespace"
      ? "squarespace"
      : info.importer === "wordpress"
        ? "wordpress"
        : "url";
  const L: string[] = [];
  const pages = build.pages;
  const items = build.collections.reduce((n, c) => n + c.items, 0);
  L.push(`# Import report: ${sq.title}`);
  L.push("");
  L.push(
    `Imported from ${sq.baseUrl}${isSq ? (sq.version ? ` (Squarespace ${sq.version})` : "") : info.id === "generic" ? "" : ` (${label}${sq.generator && sq.generator.toLowerCase() !== label.toLowerCase() ? `, ${sq.generator}` : ""})`} on ${r.now.toISOString().slice(0, 10)} with \`openspace import ${command}\`.`,
  );
  L.push(
    sq.sources?.length
      ? `Sources: ${sq.sources.join(", ")}. ${r.requests} requests.`
      : `Sources: page HTML and the sitemap${r.owner ? ", Squarespace's `?format=json` data (owner mode)" : ""}${r.wxr ? ", the WordPress export" : ""}. ${r.requests} requests.`,
  );
  L.push("");
  L.push("## Summary");
  L.push("");
  L.push(
    `- **${pages.length}** pages, **${items}** collection items in ${build.collections.length} collection(s)`,
  );
  L.push(
    `- **${r.mediaFiles}** media files (${(r.mediaBytes / 1024 / 1024).toFixed(1)} MB) downloaded into \`media/\``,
  );
  L.push(`- **${build.redirects.length}** redirects so old addresses keep working`);
  const attention = build.notices.filter(
    (n) => n.kind !== "collection" && n.kind !== "theme",
  ).length;
  L.push(`- **${attention}** item(s) need your attention (below)`);
  L.push("");

  L.push("## Pages");
  L.push("");
  const oldCol = isSq ? "Squarespace" : "Old address";
  L.push(`| ${oldCol} | OpenSpace | Title | Sections | Blocks |`);
  L.push("| --- | --- | --- | ---: | ---: |");
  for (const p of pages)
    L.push(
      `| \`${esc(p.from)}\` | \`${esc(p.to)}\` | ${esc(p.title)} | ${p.sections} | ${p.blocks} |`,
    );
  L.push("");
  if (build.collections.length) {
    L.push("## Collections");
    L.push("");
    L.push(`| ${oldCol} | OpenSpace | Kind | Items | Drafts |`);
    L.push("| --- | --- | --- | ---: | ---: |");
    for (const c of build.collections)
      L.push(`| \`${esc(c.from)}\` | \`${esc(c.to)}\` | ${c.kind} | ${c.items} | ${c.drafts} |`);
    L.push("");
  }
  L.push("## Design");
  L.push("");
  L.push(
    `The look was recreated with OpenSpace's own design system (Site Styles tokens, section color themes, layouts and section presets), not by copying ${isSq ? "Squarespace's template" : `${onOld}'s`} CSS or code.`,
  );
  L.push("");
  for (const n of build.themeNotes) L.push(`- ${n}`);
  L.push("");

  // Design check on the result.
  try {
    const issues = designCheck(build.doc);
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    L.push(`Design check: ${errors.length} error(s), ${warnings.length} warning(s).`);
    const top = [...errors, ...warnings].slice(0, 12);
    if (top.length) {
      L.push("");
      for (const i of top) {
        const page =
          i.page && i.page !== "footer"
            ? build.doc.pages[i.page as keyof typeof build.doc.pages]
            : undefined;
        L.push(
          `- ${i.severity === "error" ? "**error**" : "warning"} (${page ? `/${page.slug}` : (i.page ?? "site")}): ${i.message}`,
        );
      }
      if (errors.length + warnings.length > top.length)
        L.push(
          `- … and ${errors.length + warnings.length - top.length} more: run Design check in Studio or \`design_check\` with Claude.`,
        );
    }
    L.push("");
  } catch {
    // Design check is advisory here.
  }

  L.push("## Needs attention");
  L.push("");
  const byKind = new Map<SqNotice["kind"], SqNotice[]>();
  for (const n of build.notices) byKind.set(n.kind, [...(byKind.get(n.kind) ?? []), n]);
  if (sq.customCode.length) {
    byKind.set("custom-code", [
      {
        kind: "custom-code",
        where: "site",
        message: isSq
          ? `Site-wide Code Injection was found (${sq.customCode.length} snippet(s)). It was **not** copied: review it and add what you still need in Settings → Advanced (head/footer code). Squarespace-specific scripts won't work here.`
          : `Site-wide scripts were found (${sq.customCode.length}: ${sq.customCode.slice(0, 5).join(", ")}${sq.customCode.length > 5 ? "…" : ""}). They were **not** copied: add what you still need (analytics, chat) in Settings → Advanced. ${label}-specific scripts won't work here.`,
      },
      ...(byKind.get("custom-code") ?? []),
    ]);
  }
  let any = false;
  for (const kind of ORDER) {
    const list = byKind.get(kind);
    if (!list?.length) continue;
    any = true;
    L.push(`### ${NOTICE_TITLES[kind]}`);
    L.push("");
    // Collapse identical messages.
    const counts = new Map<string, { n: number; where: Set<string> }>();
    for (const n of list) {
      const e = counts.get(n.message) ?? { n: 0, where: new Set<string>() };
      e.n++;
      e.where.add(n.where);
      counts.set(n.message, e);
    }
    let shown = 0;
    for (const [message, e] of counts) {
      if (++shown > 15) {
        L.push(`- … and ${counts.size - 15} more like these.`);
        break;
      }
      const where = [...e.where];
      L.push(
        `- ${message}${where.length ? ` _(${where.slice(0, 4).join(", ")}${where.length > 4 ? `, +${where.length - 4} more` : ""})_` : ""}`,
      );
    }
    L.push("");
  }
  if (!any) {
    L.push("Nothing: every page, block and link was mapped.");
    L.push("");
  }
  if (build.linkFixes.length) {
    L.push("### Links pointed at the nearest page");
    L.push("");
    for (const f of build.linkFixes.slice(0, 30))
      L.push(`- ${f.where}: \`${esc(f.from)}\` → \`${esc(f.to)}\``);
    L.push("");
  }

  if (build.redirects.length) {
    L.push("## Redirects");
    L.push("");
    L.push("Saved in `content/site.json` (`redirects`), published with the site:");
    L.push("");
    L.push("| From | To |");
    L.push("| --- | --- |");
    for (const x of build.redirects.slice(0, 200))
      L.push(`| \`${esc(x.from)}\` | \`${esc(x.to)}\` |`);
    if (build.redirects.length > 200) L.push(`| … | ${build.redirects.length - 200} more |`);
    L.push("");
  }

  L.push("## Not moved by the importer");
  L.push("");
  for (const line of info.notMoved) L.push(`- ${line}`);
  L.push("");
  L.push("## Next steps");
  L.push("");
  L.push(
    "1. `npm install`, then `npx openspace check` (it should report no errors) and `npx openspace dev` to look around.",
  );
  L.push(
    `2. Bring it to visual parity with Claude: in this folder run \`claude\`, then \`${isSq ? "/openspace:import-squarespace" : `/openspace:migrate ${sq.baseUrl}`}\` (or ask Claude to compare each page with the original). It screenshots both sites at desktop and mobile and adjusts presets, Site Styles and sections — never raw HTML.`,
  );
  L.push(
    "3. Fix the items under **Needs attention**, then publish (push to GitHub, or `publish` with Claude).",
  );
  L.push("4. Move the domain only after the new site is live and checked:");
  L.push(
    "   - add the custom domain in OpenSpace (`deploy.customDomain` in `openspace.json`, or the Hub);",
  );
  L.push(
    `   - at your DNS provider (${isSq ? "Squarespace Domains" : info.id === "generic" || info.id === "wordpress" ? "your registrar" : `${label} Domains, your registrar`} or elsewhere), point the records at the new host as the domain guide says (GitHub Pages: \`A\`/\`CNAME\` records; Cloudflare: the Pages project's records);`,
  );
  L.push(
    isSq
      ? "   - keep the Squarespace subscription until the new site serves your domain over HTTPS and the redirects work; then cancel it (and transfer the domain away from Squarespace if you like)."
      : `   - keep ${info.id === "generic" ? "the old hosting" : info.id === "wordpress" ? "the WordPress hosting" : `the ${label} plan`} until the new site serves your domain over HTTPS and the redirects work; then cancel it (and transfer the domain if you like).`,
  );
  L.push("");
  return `${L.join("\n")}\n`;
}
