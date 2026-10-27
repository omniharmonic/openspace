import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import type { Op } from "@omniharmonic/openspace-ops";
import {
  type BrokenLink,
  findBrokenLinks,
  type Page,
  resolveInternalLinks,
  type SiteDocument,
  SiteDocumentSchema,
  suggestLinkTarget,
  withComponents,
} from "@omniharmonic/openspace-schema";
import { componentIssues, componentsKitGate, usesComponents } from "./components";
import { gatedPageLinks, hostingWarnings } from "./hosting";
import { type CheckOptions, type Issue, issue, opMeta } from "./issue";

/**
 * Broken internal links, in plain language: the Design check's `broken-link` rule and the
 * publish gate (`publishCheck`) the Hub runs before a publish. Both use the schema's
 * `findBrokenLinks`, the same rules `openspace check` fails CI on.
 */

const titleOf = (p: Page) => p.title || (p.slug === "" ? "Home" : p.slug);

/** "A button on Home", "A card in the footer", "Your menu", "“Spring hours” in journal". */
export function linkPlace(doc: SiteDocument, link: BrokenLink): string {
  const s = link.scope;
  if (link.block) {
    const container =
      link.container === "footer"
        ? doc.site.footer
        : doc.pages[link.container as Page["id"]]?.sections.find((x) => x.id === link.section);
    const block = container?.blocks.find((b) => b.id === link.block);
    const label =
      (block && withComponents(blocksRegistry(), doc.components).get(block.type)?.meta.label) ||
      "block";
    const what = `A ${label.toLowerCase()}`;
    if (link.container === "footer") return `${what} in the footer`;
    const page = doc.pages[link.container as Page["id"]];
    return page ? `${what} on ${titleOf(page)}` : what;
  }
  if (s.kind === "site") {
    const head = link.path[0];
    if (head === "nav") return "Your menu";
    if (head === "header") return "The header";
    if (head === "announcement") return "The announcement bar";
    if (head === "popup") return "The pop-up";
    return "Your site settings";
  }
  if (s.kind === "page") {
    const page = doc.pages[s.page];
    return page ? `The page ${titleOf(page)}` : "A page";
  }
  const item = doc.collections[s.collection]?.[s.slug];
  const title = (item?.frontmatter as { title?: string } | undefined)?.title ?? s.slug;
  return `“${title}” in ${s.collection}`;
}

/** One sentence: "A button on Home links to /book, which isn't a page on your site." */
export function describeBrokenLink(doc: SiteDocument, link: BrokenLink): string {
  const where = linkPlace(doc, link);
  switch (link.kind) {
    case "page":
      return `${where} links to a page that no longer exists.`;
    case "item":
      return `${where} links to ${link.target}, which isn't on your site any more.`;
    case "collection":
      return `${where} points at the “${link.target}” collection, which doesn't exist.`;
    default:
      return `${where} links to ${link.target}, which isn't a page on your site.`;
  }
}

/** "The footer links to a members-only page …" — for links to pages GitHub Pages won't publish. */
export function describeGatedLink(doc: SiteDocument, link: BrokenLink): string {
  return `${linkPlace(doc, link)} links to a members-only page. Sites on GitHub Pages don't publish members-only pages, so visitors would see "page not found".`;
}

/** The autofix for a broken link in a block field or the menu: point it at an existing page. */
function linkFix(
  doc: SiteDocument,
  link: BrokenLink,
  meta: () => ReturnType<ReturnType<typeof opMeta>>,
): Issue["autofix"] | undefined {
  const target = link.kind === "page" ? "/" : link.target;
  const s = suggestLinkTarget(doc, target);
  if (!s) return undefined;
  const label = `Link to ${s.page ? titleOf(s.page) : s.path} instead`;
  if (link.block && link.field) {
    const container =
      link.container === "footer"
        ? doc.site.footer
        : doc.pages[link.container as Page["id"]]?.sections.find((x) => x.id === link.section);
    const block = container?.blocks.find((b) => b.id === link.block);
    if (!block) return undefined;
    const { value, changes } = resolveInternalLinks(block.fields[link.field], doc);
    if (!changes.length) return undefined;
    return {
      label,
      ops: [
        {
          op: "block.update",
          ...meta(),
          page: link.container as never,
          block: block.id as never,
          set: { [link.field]: value },
        } as Op,
      ],
    };
  }
  if (link.scope.kind === "site" && link.path[0] === "nav") {
    const { value, changes } = resolveInternalLinks(doc.site.nav, doc);
    if (!changes.length) return undefined;
    return { label, ops: [{ op: "site.update", ...meta(), set: { nav: value } } as Op] };
  }
  return undefined;
}

/**
 * Design check `broken-link` issues: links that lead nowhere on `pageId` (or every page and
 * collection item), in the footer and in the site's menu, header and banners.
 */
export function linkIssues(
  doc: SiteDocument,
  pageId?: string,
  options: CheckOptions = {},
  meta: () => ReturnType<ReturnType<typeof opMeta>> = opMeta(options),
): Issue[] {
  const out: Issue[] = [];
  for (const link of findBrokenLinks(doc)) {
    const s = link.scope;
    if (pageId && s.kind === "page" && s.page !== pageId) continue;
    if (pageId && s.kind === "item") continue;
    const page = link.container ?? (s.kind === "page" ? s.page : undefined);
    const autofix = linkFix(doc, link, meta);
    out.push(
      issue({
        rule: "broken-link",
        severity: link.severity,
        ...(page ? { page } : {}),
        ...(link.section ? { section: link.section } : {}),
        ...(link.block ? { block: link.block } : {}),
        key: `${s.kind === "item" ? `${s.collection}/${s.slug}:` : ""}${link.path.join(".")}`,
        message: describeBrokenLink(doc, link),
        fix:
          link.severity === "error"
            ? "Point the link at a page that exists, or add the missing page. The site can't be published until then."
            : "Point the link at a page that exists, or add the missing page.",
        ...(autofix ? { autofix } : {}),
      }),
    );
  }
  for (const link of gatedPageLinks(doc)) {
    const s = link.scope;
    if (pageId && s.kind === "page" && s.page !== pageId) continue;
    if (pageId && s.kind === "item") continue;
    const page = link.container ?? (s.kind === "page" ? s.page : undefined);
    out.push(
      issue({
        rule: "gated-link",
        severity: "warning",
        ...(page ? { page } : {}),
        ...(link.section ? { section: link.section } : {}),
        ...(link.block ? { block: link.block } : {}),
        key: `${s.kind === "item" ? `${s.collection}/${s.slug}:` : ""}${link.path.join(".")}`,
        message: describeGatedLink(doc, link),
        fix: "Remove the link, point it at a public page, or switch the site to Cloudflare hosting (Settings → Hosting).",
      }),
    );
  }
  return out;
}

// --- publish gate -------------------------------------------------------------------------------

export interface PublishProblem {
  rule: "schema" | "block" | "link" | "component" | "kit";
  severity: "error" | "warning";
  /** Plain language: which page, which block, which link. */
  message: string;
  page?: string;
  section?: string;
  block?: string;
  /** The link target, for link problems. */
  target?: string;
}

export interface PublishCheck {
  ok: boolean;
  errors: PublishProblem[];
  warnings: PublishProblem[];
}

const where = (doc: SiteDocument, path: readonly PropertyKey[]): string => {
  const [head, id] = path.map(String);
  if (head === "pages" && id) {
    const page = doc.pages[id as Page["id"]];
    return page ? `on ${titleOf(page)}` : "on a page";
  }
  if (head === "collections") return `in ${id ?? "a collection"}`;
  if (head === "site") return "in the site settings";
  return "in the site";
};

export interface PublishCheckOptions {
  /**
   * How block field problems count (default `error`, as in `openspace check`). The Hub passes
   * `warning`: a site's own check pins its block library version, which may accept fields this
   * one doesn't, and a publish must never be refused for a difference the site's run won't see.
   */
  blocks?: "error" | "warning";
  /**
   * The site's `package.json` / `package-lock.json` on the branch its publish run builds from.
   * When the draft uses custom components, the site-kit they pin must be able to render them.
   */
  siteKit?: { packageJson?: string | null; packageLock?: string | null; installed?: string | null };
}

/**
 * What must hold before a draft goes live — the parts of `openspace check` that look at content
 * (the document's shape, every block's fields, internal links). Errors block a publish; warnings
 * (text links that lead nowhere) don't. Media files, sizes and secrets are checked by the site's
 * own publish run; members-only pages are never a problem here.
 */
/** Block type at a document path (`pages.<id>.sections.<i>.blocks.<j>…` or the footer). */
function blockTypeAtPath(doc: SiteDocument, path: readonly PropertyKey[]): string | undefined {
  if (path[0] === "site") return doc.site.footer.blocks[Number(path[3])]?.type;
  const page = doc.pages[String(path[1]) as Page["id"]];
  return page?.sections[Number(path[3])]?.blocks[Number(path[5])]?.type;
}

export function publishCheck(doc: SiteDocument, options: PublishCheckOptions = {}): PublishCheck {
  const errors: PublishProblem[] = [];
  const warnings: PublishProblem[] = [];
  const parsed = SiteDocumentSchema.safeParse(doc);
  if (!parsed.success)
    for (const i of parsed.error.issues.slice(0, 20))
      errors.push({
        rule: "schema",
        severity: "error",
        message: `Something ${where(doc, i.path)} isn't in a shape the site understands (${i.path.join(".")}: ${i.message}).`,
      });
  const blockSeverity = options.blocks ?? "error";
  // Custom component instances are always checked against the site's own definitions.
  const registry = withComponents(blocksRegistry(), doc.components);
  for (const i of registry.validateDocument(doc).slice(0, 20)) {
    const component = /^component\//.test(String(blockTypeAtPath(doc, i.path)));
    (blockSeverity === "error" || component ? errors : warnings).push({
      rule: "block",
      severity: component ? "error" : blockSeverity,
      block: i.blockId,
      message: `A ${component ? "designer section" : "block"} ${where(doc, i.path)} has a setting the site can't use (${i.message}).`,
    });
  }
  for (const i of componentIssues(doc)) {
    const p: PublishProblem = {
      rule: "component",
      severity: i.severity === "error" ? "error" : "warning",
      message: `${i.message} ${i.fix}`,
      ...(i.page ? { page: i.page } : {}),
      ...(i.section ? { section: i.section } : {}),
      ...(i.block ? { block: i.block } : {}),
    };
    if (i.severity === "error") errors.push(p);
  }
  if (options.siteKit && usesComponents(doc)) {
    const gate = componentsKitGate(options.siteKit);
    if (!gate.ok) errors.push({ rule: "kit", severity: "error", message: gate.message as string });
  }
  for (const link of findBrokenLinks(doc)) {
    const p: PublishProblem = {
      rule: "link",
      severity: link.severity,
      message: describeBrokenLink(doc, link),
      target: link.target,
      ...(link.container ? { page: link.container } : {}),
      ...(link.scope.kind === "page" && !link.container ? { page: link.scope.page } : {}),
      ...(link.section ? { section: link.section } : {}),
      ...(link.block ? { block: link.block } : {}),
    };
    (link.severity === "error" ? errors : warnings).push(p);
  }
  for (const link of gatedPageLinks(doc))
    warnings.push({
      rule: "link",
      severity: "warning",
      message: describeGatedLink(doc, link),
      target: link.target,
      ...(link.container ? { page: link.container } : {}),
      ...(link.scope.kind === "page" && !link.container ? { page: link.scope.page } : {}),
      ...(link.section ? { section: link.section } : {}),
      ...(link.block ? { block: link.block } : {}),
    });
  for (const w of hostingWarnings(doc))
    warnings.push({ rule: "block", severity: "warning", message: w.message, ...w.where });
  return { ok: errors.length === 0, errors, warnings };
}
