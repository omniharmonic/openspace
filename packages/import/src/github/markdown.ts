/**
 * Markdown and front matter as static site generators read them: YAML (`---`) or TOML (`+++`,
 * Hugo) front matter, then Markdown with GitHub-flavoured extensions (tables, strikethrough,
 * autolinks, task lists) and raw HTML passed through (Jekyll's kramdown and Hugo's goldmark
 * both allow it). kramdown-only syntax (`{: .class}` attribute lists, `{:toc}`) is dropped.
 */
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import { parse as parseYaml } from "yaml";

export type FrontMatter = Record<string, unknown>;

export interface Parsed {
  /** Front matter (empty when there was none, or it didn't parse). */
  data: FrontMatter;
  /** Whether the file had front matter at all (Jekyll only processes files that do). */
  hasFrontMatter: boolean;
  body: string;
}

/** A tiny TOML subset for Hugo front matter: `key = value`, strings, numbers, booleans, arrays. */
function parseTomlLite(src: string): FrontMatter {
  const out: FrontMatter = {};
  let table: FrontMatter = out;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const t = /^\[([^\]]+)\]$/.exec(line);
    if (t) {
      const name = (t[1] as string).trim();
      table = {};
      out[name] = table;
      continue;
    }
    const kv = /^([A-Za-z0-9_.-]+|"[^"]+")\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const key = (kv[1] as string).replace(/^"|"$/g, "");
    table[key] = tomlValue((kv[2] as string).trim());
  }
  return out;
}

function tomlValue(v: string): unknown {
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1).replace(/\\"/g, '"');
  if (v === "true" || v === "false") return v === "true";
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]"))
    return v
      .slice(1, -1)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map(tomlValue);
  return v;
}

/** Split front matter from the body. */
export function parseFrontMatter(text: string): Parsed {
  const yaml = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  if (yaml) {
    let data: FrontMatter = {};
    try {
      const v = parseYaml(yaml[1] ?? "", { strict: false, uniqueKeys: false });
      if (v && typeof v === "object" && !Array.isArray(v)) data = v as FrontMatter;
    } catch {
      data = {};
    }
    return { data, hasFrontMatter: true, body: text.slice(yaml[0].length) };
  }
  const toml = /^\+\+\+[ \t]*\r?\n([\s\S]*?)\r?\n\+\+\+[ \t]*(?:\r?\n|$)/.exec(text);
  if (toml)
    return {
      data: parseTomlLite(toml[1] ?? ""),
      hasFrontMatter: true,
      body: text.slice(toml[0].length),
    };
  return { data: {}, hasFrontMatter: false, body: text };
}

/** Parse YAML (config and data files); undefined when it doesn't parse. */
export function parseYamlSafe(text: string): unknown {
  try {
    return parseYaml(text, { strict: false, uniqueKeys: false });
  } catch {
    return undefined;
  }
}

/** Parse TOML-lite (Hugo config). */
export const parseToml = parseTomlLite;

/** Drop kramdown's attribute lists and TOC markers, which aren't Markdown. */
function stripKramdown(md: string): string {
  return md
    .replace(/^\s*\{:\s*[^}]*\}\s*$/gm, "")
    .replace(/\{:\s*[.#][^}]*\}/g, "")
    .replace(/^\s*\*\s+TOC\s*$/gm, "")
    .replace(/\{:toc\}/g, "");
}

/** Markdown → HTML (raw HTML kept: the importer reads it, it is never published as is). */
export function markdownToHtml(md: string): string {
  return micromark(stripKramdown(md), {
    allowDangerousHtml: true,
    allowDangerousProtocol: false,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
}

/** The first paragraph's text of some HTML (an excerpt when none was written). */
export function firstParagraph(html: string): string | undefined {
  const m = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (!m) return undefined;
  const text = (m[1] ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

export const isMarkdownPath = (p: string) => /\.(?:md|markdown|mkd|mkdn|mdown)$/i.test(p);
