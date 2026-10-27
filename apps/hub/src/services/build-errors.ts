/**
 * Plain-language publish failures (arch §5.5, FR-21). GitHub tells us a run's conclusion and
 * which jobs/steps failed; this table turns that into copy Studio shows ("Couldn't publish: …")
 * and the automatic fix "Fix it for me" applies. Copy never uses Git vocabulary (Global
 * Constraint 9).
 */

/** What "Fix it for me" does for a failure. */
export type BuildFix = "revert" | "retry" | "enable_pages";

export interface BuildError {
  code: string;
  title: string;
  message: string;
  fix: BuildFix | null;
}

interface Rule {
  code: string;
  test: RegExp;
  title: string;
  message: string;
  fix: BuildFix;
}

const RULES: Rule[] = [
  {
    code: "image_too_large",
    test: /too large|exceeds .*(size|limit)|larger than \d+ ?MB|file size limit/i,
    title: "An image is too large",
    message:
      "One of the new images is bigger than the site can hold. We'll put the live site back while you swap in a smaller copy.",
    fix: "revert",
  },
  {
    code: "missing_image",
    test: /ENOENT[^\n]*media|could not (resolve|find)[^\n]*media|missing (image|media)|references? a deleted image/i,
    title: "A page uses an image that was removed",
    message:
      "A page still points at an image that no longer exists. We'll put the live site back; then remove or replace that image and publish again.",
    fix: "revert",
  },
  {
    code: "secret_found",
    test: /secret (detected|found)|found (a |an )?(secret|api key|password)|looks like a (password|key|secret)/i,
    title: "Something that looks like a password was found",
    message:
      "Your site is public, so we stopped before anything that looks like a password or key went live. Remove it and publish again.",
    fix: "revert",
  },
  {
    code: "content_invalid",
    test: /openspace check|check site|schema|invalid content|validation/i,
    title: "Some content couldn't be read",
    message:
      "Part of the latest changes isn't in a shape the site understands. We'll put the live site back while you take another look.",
    fix: "revert",
  },
  {
    code: "pages_off",
    test: /get pages site failed|pages (site )?(is not|isn't) enabled|not found.*pages site|configure-pages/i,
    title: "Publishing isn't switched on yet",
    message: "Web hosting for this site isn't switched on. We can switch it on and try again.",
    fix: "enable_pages",
  },
  {
    code: "install_failed",
    test: /npm (ci|install|ERR)|ERESOLVE|setup-node|registry/i,
    title: "We couldn't fetch the site's building blocks",
    message: "A service we rely on didn't answer in time. Trying again usually fixes this.",
    fix: "retry",
  },
  {
    code: "quota",
    test: /minutes|billing|spending limit|quota/i,
    title: "This month's free publishing time ran out",
    message:
      "The free publishing time on your GitHub account is used up for this month. It resets at the start of next month.",
    fix: "retry",
  },
];

const GENERIC: BuildError = {
  code: "publish_failed",
  title: "Something in the latest changes stopped the site from publishing",
  message:
    "Your changes are safe in the draft. We can put the live site back to the last version that worked.",
  fix: "revert",
};

// --- `openspace check` findings in a run's log ------------------------------------------------

/** One error `openspace check` reported, as read back from a run's log. */
export interface CheckFinding {
  /** Repo file (`content/pages/home.json`), when the log says. */
  file?: string;
  /** Check rule (`link`, `schema`, `image`…), when the log says. */
  rule?: string;
  /** Location inside the file (`sections.0.blocks.1.fields.link`). */
  path?: string;
  message: string;
}

const TIMESTAMP = /^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI colour codes in CI logs
const ANSI = /\u001b\[[0-9;]*m/g;
const FILE_RE = /^(?:content\/\S+|media\/\S*|openspace\.json)$/;
/** `[file ]error rule [path: ]message` — formatReport's lines, with or without the file. */
const FINDING_RE =
  /^(?:(content\/\S+|media\/\S*|openspace\.json)\s+)?error\s+([a-z]+)\s+(?:([\w.\-/]+?)(?:, line \d+)?: )?(.+)$/;
/** `::error file=…,title=rule::message` (a workflow command echoed into the log). */
const ANNOTATION_RE = /^::error (?:[^:]*?file=([^,:]+))?[^:]*?(?:title=([a-z]+))?[^:]*::(.+)$/;

/** Rules, by the words of their messages, for `##[error]message` lines (no rule column). */
function ruleOfMessage(message: string): string | undefined {
  if (/^Link to |^Navigation points at collection|^Redirect /.test(message)) return "link";
  if (/^Image .* does not exist in media\//.test(message)) return "image";
  if (/has no entry in content\/media\.json/.test(message)) return "media";
  if (/GitHub rejects files over|over the .* limit|longest edge may be at most/.test(message))
    return "size";
  if (/Remove it from content and rotate the credential/.test(message)) return "secret";
  return undefined;
}

/**
 * The errors `openspace check` printed in a run's log: its report lines (`content/pages/home.json`
 * then `error link sections.0…: Link to /book does not lead to any page`, or both on one line),
 * GitHub's `##[error]` rendering of its annotations, and raw `::error` commands. De-duplicated
 * (annotations repeat the report) by rule and message, keeping the most detailed one.
 */
export function parseCheckLog(text: string): CheckFinding[] {
  const out: CheckFinding[] = [];
  let file: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(ANSI, "").replace(TIMESTAMP, "").trim();
    const isAnnotation = line.startsWith("##[error]");
    line = line.replace(/^##\[(?:error|warning)\]\s*/, "");
    if (!line) continue;
    if (FILE_RE.test(line)) {
      file = line;
      continue;
    }
    const m = FINDING_RE.exec(line);
    if (m) {
      out.push({
        file: m[1] ?? file,
        rule: m[2],
        ...(m[3] ? { path: m[3] } : {}),
        message: (m[4] ?? "").trim(),
      });
      continue;
    }
    const a = ANNOTATION_RE.exec(line);
    if (a) {
      const message = (a[3] ?? "").trim();
      const rule = a[2] ?? ruleOfMessage(message);
      out.push({ ...(a[1] ? { file: a[1] } : {}), ...(rule ? { rule } : {}), message });
      continue;
    }
    if (isAnnotation) {
      const rule = ruleOfMessage(line);
      if (rule) out.push({ rule, message: line });
    }
    // A line that is neither ends the current file's block in the report.
    if (!/^\s/.test(raw.replace(TIMESTAMP, ""))) file = undefined;
  }
  // Annotations repeat the report without the file: keep the more detailed copy.
  const located = new Set(out.filter((f) => f.file).map((f) => f.message));
  const seen = new Set<string>();
  return out.filter((f) => {
    if (!f.file && located.has(f.message)) return false;
    const key = `${f.rule ?? ""}|${f.file ?? ""}|${f.path ?? ""}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What the Hub knows about the site, to name pages and blocks in the copy (optional). */
export interface SiteNames {
  /** Page title for a repo page file (`content/pages/home.json` → "Home"). */
  pageTitle?(file: string): string | undefined;
  /** Block label at a path inside a page file (`sections.0.blocks.1…` → "Button"). */
  blockLabel?(file: string, path: string): string | undefined;
}

/** "Home" for `content/pages/home.json`, "Services / massage" for a nested page. */
function humanPage(file: string): string | undefined {
  const m = /^content\/pages\/(.+)\.json$/.exec(file);
  if (!m?.[1]) return undefined;
  const name = m[1].replace(/[-_]+/g, " ").replace(/\//g, " / ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** One sentence per broken link: "A button on Home links to /book, which isn't a page on your site." */
function linkSentence(f: CheckFinding, names: SiteNames): string | null {
  const target =
    /^Link to page (\S+) but no such page exists/.exec(f.message)?.[1] ??
    /^Link to (\S+) (?:does not lead to any page|but no such item exists)/.exec(f.message)?.[1];
  const file = f.file;
  const page = file ? (names.pageTitle?.(file) ?? humanPage(file)) : undefined;
  const block = file && f.path ? names.blockLabel?.(file, f.path) : undefined;
  const thing = block ? `A ${block.toLowerCase()}` : "A link";
  const where =
    file === "content/site.json"
      ? f.path?.startsWith("footer")
        ? `${thing} in the footer`
        : f.path?.startsWith("nav")
          ? "Your menu"
          : "A link in your site settings"
      : page
        ? `${thing} on ${page}`
        : file?.startsWith("content/collections/")
          ? `${thing} in ${file.replace(/^content\/collections\//, "").replace(/\.[a-z]+$/, "")}`
          : thing;
  if (/^Link to page /.test(f.message)) return `${where} links to a page that no longer exists.`;
  if (/^Navigation points at collection "([^"]+)"/.test(f.message)) {
    const c = /"([^"]+)"/.exec(f.message)?.[1];
    return `Your menu points at the “${c}” collection, which doesn't exist.`;
  }
  if (/but no such item exists/.test(f.message))
    return `${where} links to ${target}, which isn't on your site any more.`;
  if (target) return `${where} links to ${target}, which isn't a page on your site.`;
  if (/^Redirect /.test(f.message)) return "A redirect points at a page that doesn't exist.";
  return null;
}

/** Plain-language copy for a run whose `openspace check` found broken links. */
function brokenLinks(findings: CheckFinding[], names: SiteNames): BuildError | null {
  const links = findings.filter((f) => f.rule === "link" || f.rule === "redirect");
  if (!links.length) return null;
  const sentences = [
    ...new Set(links.map((f) => linkSentence(f, names)).filter((x): x is string => !!x)),
  ];
  if (!sentences.length) return null;
  const shown = sentences.slice(0, 3);
  const more = sentences.length - shown.length;
  const one = sentences.length === 1;
  return {
    code: "broken_link",
    title: one
      ? "A link leads to a page that doesn't exist"
      : "Some links lead to pages that don't exist",
    message: [
      ...shown,
      ...(more > 0 ? [`…and ${more} more.`] : []),
      one
        ? "Point it at a page that exists (the Design check can pick one) and publish again; we can put the live site back meanwhile."
        : "Point them at pages that exist (the Design check can pick them) and publish again; we can put the live site back meanwhile.",
    ].join(" "),
    fix: "revert",
  };
}

/** Which RULES entry a check rule is. */
const CHECK_RULE_CODES: Record<string, string> = {
  image: "missing_image",
  media: "missing_image",
  size: "image_too_large",
  secret: "secret_found",
  schema: "content_invalid",
  block: "content_invalid",
};

export function translateBuildError(input: {
  conclusion?: string | null;
  steps?: readonly string[];
  text?: string | null;
  /** The failed jobs' log text (`##[error]` lines and `openspace check`'s report). */
  log?: string | null;
  names?: SiteNames;
}): BuildError {
  if (input.conclusion === "timed_out")
    return {
      code: "timed_out",
      title: "Publishing took too long",
      message: "It took longer than usual and was stopped. Trying again usually fixes this.",
      fix: "retry",
    };
  if (input.conclusion === "startup_failure")
    return {
      code: "startup_failure",
      title: "Publishing couldn't start",
      message: "The publishing setup for this site needs attention. Try again in a moment.",
      fix: "retry",
    };
  // What `openspace check` itself said beats guessing from step names.
  const findings = [...parseCheckLog(input.log ?? ""), ...parseCheckLog(input.text ?? "")];
  const links = brokenLinks(findings, input.names ?? {});
  if (links) return links;
  for (const f of findings) {
    const code = f.rule && CHECK_RULE_CODES[f.rule];
    const r = code && RULES.find((x) => x.code === code);
    if (r) return { code: r.code, title: r.title, message: r.message, fix: r.fix };
  }
  // Only the log's error lines: the rest echoes commands ("npx openspace check") that ran fine.
  const errorLines = (input.log ?? "")
    .split(/\r?\n/)
    .filter((l) => l.includes("##[error]"))
    .join("\n");
  const haystack = [...(input.steps ?? []), input.text ?? "", errorLines].join("\n");
  for (const r of RULES)
    if (r.test.test(haystack))
      return { code: r.code, title: r.title, message: r.message, fix: r.fix };
  return GENERIC;
}

/** Codes whose copy is specific to one run (stored with the publish as `error_detail`). */
const DETAILED = new Set(["broken_link"]);

/** The JSON stored as `publishes.error_detail` for an error, or null when the code says it all. */
export function buildErrorDetail(e: BuildError | null): string | null {
  return e && DETAILED.has(e.code) ? JSON.stringify({ title: e.title, message: e.message }) : null;
}

/** Look a stored error code back up (publishes.error_code → full copy). */
export function buildErrorByCode(code: string | null, detail?: string | null): BuildError | null {
  if (!code) return null;
  if (code === "timed_out") return translateBuildError({ conclusion: "timed_out" });
  if (code === "startup_failure") return translateBuildError({ conclusion: "startup_failure" });
  if (DETAILED.has(code)) {
    let copy: { title?: unknown; message?: unknown } = {};
    try {
      copy = detail ? (JSON.parse(detail) as typeof copy) : {};
    } catch {
      copy = {};
    }
    return {
      code,
      title:
        typeof copy.title === "string" ? copy.title : "A link leads to a page that doesn't exist",
      message:
        typeof copy.message === "string"
          ? copy.message
          : "Point it at a page that exists (the Design check can pick one) and publish again; we can put the live site back meanwhile.",
      fix: "revert",
    };
  }
  const r = RULES.find((x) => x.code === code);
  return r ? { code: r.code, title: r.title, message: r.message, fix: r.fix } : GENERIC;
}
