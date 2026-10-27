/**
 * Jekyll's Liquid, close enough to read a site's own pages, layouts and includes: liquidjs with
 * Jekyll includes (`{% include file.html param="x" %}` → `include.param`), Jekyll's URL filters
 * (`relative_url`, `absolute_url`), `markdownify`, `{% link %}`, `{% post_url %}` and
 * `{% highlight %}`. Tags from plugins the importer doesn't know (`{% seo %}`, `{% feed_meta %}`,
 * theme-specific tags) render as nothing; a template that still doesn't parse falls back to its
 * text with the Liquid removed, so one odd page never stops an import.
 */
import { Liquid, type TagToken, type TopLevelToken } from "liquidjs";
import { markdownToHtml } from "./markdown";

export interface LiquidSite {
  /** `baseurl` from `_config.yml` (`/repo` for project sites, "" otherwise). */
  baseurl: string;
  /** The site's absolute origin (`https://owner.github.io`). */
  url: string;
  /** Source path → output URL (for `{% link %}`). */
  linkTargets: Map<string, string>;
  /** Post name (`2024-01-02-hello`) → output URL (for `{% post_url %}`). */
  postTargets: Map<string, string>;
  /** Include files (path under `_includes/` → text). */
  includes: Record<string, string>;
}

const BUILTIN_TAGS = new Set([
  "assign",
  "block",
  "break",
  "capture",
  "endcapture",
  "case",
  "when",
  "else",
  "elsif",
  "endcase",
  "comment",
  "endcomment",
  "continue",
  "cycle",
  "decrement",
  "echo",
  "for",
  "endfor",
  "if",
  "endif",
  "include",
  "increment",
  "layout",
  "liquid",
  "raw",
  "endraw",
  "render",
  "tablerow",
  "endtablerow",
  "unless",
  "endunless",
  "endblock",
  "highlight",
  "endhighlight",
  "link",
  "post_url",
]);

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Remove Liquid from text that liquidjs couldn't parse (keeps everything else). */
export function stripLiquid(text: string, site?: Pick<LiquidSite, "baseurl">): string {
  return text
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "")
    .replace(/\{%-?\s*raw\s*-?%\}([\s\S]*?)\{%-?\s*endraw\s*-?%\}/g, "$1")
    .replace(/\{\{-?\s*site\.baseurl\s*-?\}\}/g, site?.baseurl ?? "")
    .replace(/\{\{-?\s*["']([^"']*)["']\s*\|\s*(?:relative_url|absolute_url)\s*-?\}\}/g, "$1")
    .replace(/\{%[\s\S]*?%\}/g, "")
    .replace(/\{\{[\s\S]*?\}\}/g, "");
}

export class JekyllLiquid {
  private readonly engine: Liquid;
  private readonly registered = new Set<string>(BUILTIN_TAGS);

  constructor(private readonly site: LiquidSite) {
    this.engine = new Liquid({
      jekyllInclude: true,
      dynamicPartials: false,
      strictFilters: false,
      strictVariables: false,
      lenientIf: true,
      templates: site.includes,
      // Generous but bounded: a recursive include must not hang the import.
      renderLimit: 5_000,
      parseLimit: 2_000_000,
      memoryLimit: 64_000_000,
    });
    const relative = (v: unknown) => {
      const s = String(v ?? "");
      if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//") || s.startsWith("#")) return s;
      return `${site.baseurl}${s.startsWith("/") ? s : `/${s}`}`;
    };
    this.engine.registerFilter("relative_url", relative);
    this.engine.registerFilter("absolute_url", (v: unknown) => {
      const r = relative(v);
      return /^[a-z][a-z0-9+.-]*:/i.test(r) ? r : `${site.url}${r}`;
    });
    this.engine.registerFilter("markdownify", (v: unknown) => markdownToHtml(String(v ?? "")));
    this.engine.registerFilter("jsonify", (v: unknown) => JSON.stringify(v ?? null));
    this.engine.registerFilter("smartify", (v: unknown) => v);
    this.engine.registerFilter("inspect", (v: unknown) => JSON.stringify(v ?? null));
    this.engine.registerFilter("cgi_escape", (v: unknown) => encodeURIComponent(String(v ?? "")));
    this.engine.registerFilter("uri_escape", (v: unknown) => encodeURI(String(v ?? "")));
    this.engine.registerFilter("scssify", (v: unknown) => v);
    this.engine.registerFilter("sassify", (v: unknown) => v);
    this.engine.registerFilter("absolute_path", relative);
    const self = this;
    this.engine.registerTag("link", {
      parse(token: TagToken) {
        (this as unknown as { arg: string }).arg = token.args.trim();
      },
      render() {
        const arg = (this as unknown as { arg: string }).arg.replace(/^["']|["']$/g, "");
        const to = self.site.linkTargets.get(arg.replace(/^\//, ""));
        return to ? `${self.site.baseurl}${to}` : `${self.site.baseurl}/${arg}`;
      },
    });
    this.engine.registerTag("post_url", {
      parse(token: TagToken) {
        (this as unknown as { arg: string }).arg = token.args.trim();
      },
      render() {
        const arg = (this as unknown as { arg: string }).arg.replace(/^["']|["']$/g, "");
        const name = arg.split("/").pop() ?? arg;
        const to = self.site.postTargets.get(name.replace(/\.(?:md|markdown|html)$/, ""));
        return `${self.site.baseurl}${to ?? `/${name}`}`;
      },
    });
    this.engine.registerTag("highlight", {
      parse(token: TagToken, remain: TopLevelToken[]) {
        const me = this as unknown as { lang: string; body: string };
        me.lang = token.args.trim().split(/\s+/)[0] ?? "";
        const parts: string[] = [];
        let t: TopLevelToken | undefined = remain.shift();
        while (t) {
          if ((t as TagToken).name === "endhighlight") break;
          parts.push(t.getText());
          t = remain.shift();
        }
        me.body = parts.join("").replace(/^\n/, "");
      },
      render() {
        const me = this as unknown as { lang: string; body: string };
        return `<pre><code${me.lang ? ` class="language-${escapeHtml(me.lang)}"` : ""}>${escapeHtml(me.body)}</code></pre>`;
      },
    });
    for (const inc of Object.values(site.includes)) this.registerUnknown(inc);
  }

  /** Register a do-nothing tag for every tag name in `text` the engine doesn't know. */
  private registerUnknown(text: string) {
    for (const m of text.matchAll(/\{%-?\s*([A-Za-z_][\w-]*)/g)) {
      const name = m[1] as string;
      if (this.registered.has(name)) continue;
      this.registered.add(name);
      this.engine.registerTag(name, {
        parse() {},
        render() {
          return "";
        },
      });
    }
  }

  /** Render a template; on a Liquid error, the text with Liquid removed. */
  async render(template: string, scope: Record<string, unknown>): Promise<string> {
    if (!/\{[{%]/.test(template)) return template;
    this.registerUnknown(template);
    try {
      return String(await this.engine.parseAndRender(template, scope));
    } catch {
      return stripLiquid(template, this.site);
    }
  }
}
