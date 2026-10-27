/**
 * What builds a repository's site, from its files: Jekyll (GitHub Pages' default — a
 * `_config.yml`, `_posts`, or just Markdown pages), Hugo, Eleventy, another generator whose output
 * isn't in the repository, or plain HTML that is published as it is.
 */

export type RepoKind = "jekyll" | "hugo" | "eleventy" | "built" | "html" | "structured";

export interface RepoDetection {
  kind: RepoKind;
  /** Why (for the report). */
  evidence: string[];
  /** The generator's name for messages (`Astro`, `Next.js`…), for `built`. */
  generator?: string;
}

export function detectRepo(files: readonly string[], packageJson?: string): RepoDetection {
  const has = (p: string) => files.includes(p);
  const some = (re: RegExp) => files.some((f) => re.test(f));
  const evidence: string[] = [];
  const nojekyll = has(".nojekyll");
  if (!nojekyll) {
    if (has("_config.yml") || has("_config.yaml")) evidence.push("_config.yml");
    if (some(/(?:^|\/)_posts\//)) evidence.push("_posts");
    if (some(/^_layouts\//)) evidence.push("_layouts");
    if (evidence.length) return { kind: "jekyll", evidence };
  }
  if (
    (has("hugo.toml") || has("hugo.yaml") || has("hugo.json") || has("config.toml")) &&
    (some(/^content\//) || some(/^layouts\//) || some(/^themes\//))
  )
    return { kind: "hugo", evidence: ["Hugo configuration and content/"] };
  let deps: Record<string, string> = {};
  try {
    const pkg = packageJson ? (JSON.parse(packageJson) as Record<string, unknown>) : {};
    deps = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    };
  } catch {
    deps = {};
  }
  if (
    some(/^(?:\.eleventy\.(?:c?js|mjs)|eleventy\.config\.(?:c?js|mjs|ts))$/) ||
    deps["@11ty/eleventy"]
  )
    return { kind: "eleventy", evidence: ["Eleventy configuration"] };
  const generators: [string, string][] = [
    ["astro", "Astro"],
    ["next", "Next.js"],
    ["gatsby", "Gatsby"],
    ["@docusaurus/core", "Docusaurus"],
    ["vuepress", "VuePress"],
    ["vitepress", "VitePress"],
    ["vite", "Vite"],
    ["react-scripts", "Create React App"],
    ["@sveltejs/kit", "SvelteKit"],
    ["nuxt", "Nuxt"],
  ];
  for (const [dep, name] of generators)
    if (deps[dep]) return { kind: "built", evidence: [`${name} in package.json`], generator: name };
  if (has("mkdocs.yml")) return { kind: "built", evidence: ["mkdocs.yml"], generator: "MkDocs" };
  if (some(/\.html?$/i) && (has("index.html") || has("index.htm")))
    return { kind: "html", evidence: ["index.html"] };
  // GitHub Pages runs Jekyll on Markdown-only repositories too.
  if (!nojekyll && some(/\.(?:md|markdown)$/i))
    return { kind: "jekyll", evidence: ["Markdown pages (GitHub Pages builds them with Jekyll)"] };
  if (some(/\.html?$/i)) return { kind: "html", evidence: ["HTML files"] };
  return { kind: "built", evidence: ["no pages in the repository"] };
}
