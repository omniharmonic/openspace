import { CliError } from "./io";

/**
 * Wow first: every new or imported site starts on free GitHub Pages and goes live there before
 * anything else. Cloudflare hosting (shop checkout, donations, member areas, password pages) is
 * switched on afterwards from Studio → Finish setting up, which checks the Cloudflare account
 * first and keeps the GitHub Pages version live until the move is confirmed. Starting on
 * Cloudflare would make the very first publish depend on an account the owner hasn't set up.
 */
export const WOW_FIRST_MESSAGE =
  "New and imported sites always start on free GitHub Pages, so the first version goes live without any extra accounts. Shops, donations, member areas and password pages show a friendly “opening soon” note until you switch them on in Studio → Finish setting up (it moves the site to Cloudflare for you, with no downtime).";

export function assertGitHubPagesStart(target: string | undefined): void {
  if (target && target !== "github-pages")
    throw new CliError(
      `--target ${target} isn't available when creating a site. ${WOW_FIRST_MESSAGE}`,
    );
}
