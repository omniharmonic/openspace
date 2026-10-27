/**
 * What the person pasted, as a GitHub repository: `owner/name`, `https://github.com/owner/name`
 * (with `/tree/<branch>/<folder>`), `git@github.com:owner/name.git`, or a GitHub Pages address
 * (`https://owner.github.io/` is the `owner/owner.github.io` repository; `https://owner.github.io/
 * name/` is usually `owner/name`).
 */

export interface GitHubTarget {
  owner: string;
  repo: string;
  ref?: string;
  /** Source folder inside the repository. */
  path?: string;
  /** The address was a github.io site: other repositories to try, in order, if `repo` isn't one. */
  alternatives?: string[];
  /** The GitHub Pages address the target was derived from (or that it serves). */
  pagesUrl?: string;
}

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/** Parse a repository or GitHub Pages reference; undefined when it is neither. */
export function parseGitHubTarget(input: string): GitHubTarget | undefined {
  const s = input.trim();
  const short = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/.exec(s);
  if (short && NAME.test(short[1] as string) && REPO.test(short[2] as string) && !s.includes(":"))
    return { owner: short[1] as string, repo: short[2] as string };
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(s);
  if (ssh) return { owner: ssh[1] as string, repo: ssh[2] as string };
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return undefined;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "github.com" || host === "www.github.com") {
    const [owner, rawRepo, kind, ref, ...rest] = parts;
    if (!owner || !rawRepo) return undefined;
    const repo = rawRepo.replace(/\.git$/, "");
    if (!NAME.test(owner) || !REPO.test(repo)) return undefined;
    return {
      owner,
      repo,
      ...(kind === "tree" && ref ? { ref } : {}),
      ...(kind === "tree" && rest.length ? { path: rest.join("/") } : {}),
    };
  }
  const pages = /^([a-z0-9-]+)\.github\.io$/.exec(host);
  if (pages) {
    const owner = pages[1] as string;
    const userRepo = `${owner}.github.io`;
    const first = parts[0];
    if (first && REPO.test(first) && !/\.[a-z0-9]{2,5}$/i.test(first))
      return {
        owner,
        repo: first,
        alternatives: [userRepo],
        pagesUrl: `https://${host}/${first}/`,
      };
    return { owner, repo: userRepo, pagesUrl: `https://${host}/` };
  }
  return undefined;
}

/** Whether an address is a GitHub repository or a GitHub Pages site. */
export const isGitHubAddress = (input: string): boolean => {
  const s = input.trim();
  if (/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(s)) return false; // `owner/name` only in `import github`
  return parseGitHubTarget(s) !== undefined;
};

/** The default GitHub Pages address of a repository. */
export function pagesUrlFor(owner: string, repo: string): string {
  const o = owner.toLowerCase();
  return repo.toLowerCase() === `${o}.github.io`
    ? `https://${o}.github.io/`
    : `https://${o}.github.io/${repo}/`;
}
