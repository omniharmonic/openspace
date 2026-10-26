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

export function translateBuildError(input: {
  conclusion?: string | null;
  steps?: readonly string[];
  text?: string | null;
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
  const haystack = [...(input.steps ?? []), input.text ?? ""].join("\n");
  for (const r of RULES)
    if (r.test.test(haystack))
      return { code: r.code, title: r.title, message: r.message, fix: r.fix };
  return GENERIC;
}

/** Look a stored error code back up (publishes.error_code → full copy). */
export function buildErrorByCode(code: string | null): BuildError | null {
  if (!code) return null;
  if (code === "timed_out") return translateBuildError({ conclusion: "timed_out" });
  if (code === "startup_failure") return translateBuildError({ conclusion: "startup_failure" });
  const r = RULES.find((x) => x.code === code);
  return r ? { code: r.code, title: r.title, message: r.message, fix: r.fix } : GENERIC;
}
