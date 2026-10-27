import {
  type AspectRatio,
  type Block,
  type CompiledComponent,
  type ComponentDefinition,
  type ComponentRender,
  checkComponent,
  componentBlockDefinition,
  componentClass,
  componentNameOf,
  componentSection,
  describeComponentIssues,
  expandComponent,
  type ImageTreatment,
  type ImageValue,
  type Link as LinkValue,
  newId,
  type Page,
  type SiteDocument,
  type XNode,
} from "@omniharmonic/openspace-schema";
import { createElement, type ReactNode } from "react";
import { useRenderContext } from "./context";
import { Img } from "./image";
import { Link, resolveLink } from "./link";
import { Button, type ButtonRole } from "./primitives";
import type { RendererBlockDefinition } from "./registry";
import { RichText } from "./richtext";

/**
 * Custom components in the one renderer (ADR custom-components §3): the schema expands a
 * component's template with an instance's fields; this turns that element data into React using
 * the same primitives blocks use (`RichText`, `Img`, `Button`, `Link`). Nothing here executes
 * component JavaScript — published pages get it from `renderPageHtml`, Studio only inside a
 * sandboxed preview.
 */

/** Markup attribute names → React prop names. */
const PROP: Record<string, string> = {
  class: "className",
  tabindex: "tabIndex",
  datetime: "dateTime",
  viewbox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform",
  pathlength: "pathLength",
};
const SVG_TAG: Record<string, string> = {
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
};
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function ResolvedHref({
  link,
  children,
}: {
  link: unknown;
  children: (href: string, external: boolean) => ReactNode;
}) {
  const ctx = useRenderContext();
  const r = resolveLink(link as LinkValue, {
    doc: ctx.doc,
    basePath: ctx.basePath,
    currentPageId: ctx.page?.id,
  });
  return <>{children(r.href, r.newTab)}</>;
}

function toReact(nodes: readonly XNode[]): ReactNode[] {
  return nodes.map((n, i) => {
    if (typeof n === "string") return n;
    switch (n.k) {
      case "rich":
        return (
          <RichText
            // biome-ignore lint/suspicious/noArrayIndexKey: template output is positional
            key={i}
            doc={n.doc as Parameters<typeof RichText>[0]["doc"]}
            {...(n.className ? { className: n.className } : {})}
          />
        );
      case "image":
        return (
          <Img
            // biome-ignore lint/suspicious/noArrayIndexKey: template output is positional
            key={i}
            src={n.value as ImageValue}
            {...(n.sizes ? { sizes: n.sizes } : {})}
            {...(n.aspect ? { aspect: n.aspect as AspectRatio } : {})}
            {...(n.fit ? { fit: n.fit } : {})}
            {...(n.treatment ? { treatment: n.treatment as ImageTreatment } : {})}
            {...(n.loading === "eager" ? { priority: true } : {})}
            {...(n.className ? { className: n.className } : {})}
          />
        );
      case "button":
        return (
          <Button
            // biome-ignore lint/suspicious/noArrayIndexKey: template output is positional
            key={i}
            to={n.link as LinkValue}
            role={
              (["primary", "secondary", "tertiary"].includes(n.variant)
                ? n.variant
                : "primary") as ButtonRole
            }
            {...(n.className ? { className: n.className } : {})}
          >
            {n.label}
          </Button>
        );
      case "link":
        return (
          <Link
            // biome-ignore lint/suspicious/noArrayIndexKey: template output is positional
            key={i}
            to={n.link as LinkValue}
            {...(n.className ? { className: n.className } : {})}
          >
            {toReact(n.children)}
          </Link>
        );
      case "el": {
        const props: Record<string, unknown> = { key: i };
        const isSvg = n.tag === "svg" || !!n.attrs.viewbox || n.tag in SVG_TAG;
        let hrefLink: unknown;
        for (const [name, value] of Object.entries(n.attrs)) {
          if (typeof value === "object") {
            hrefLink = value.link;
            continue;
          }
          const prop =
            PROP[name] ??
            (name.startsWith("aria-") || name.startsWith("data-")
              ? name
              : isSvg || name.includes("-")
                ? camel(name)
                : name);
          props[prop] = value === true ? true : value;
        }
        if (n.style) props.style = n.style;
        const tag = SVG_TAG[n.tag] ?? n.tag;
        const children = toReact(n.children);
        if (hrefLink !== undefined)
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: template output is positional
            <ResolvedHref key={i} link={hrefLink}>
              {(href, external) =>
                createElement(
                  tag,
                  { ...props, href, ...(external ? { target: "_blank", rel: "noopener" } : {}) },
                  ...children,
                )
              }
            </ResolvedHref>
          );
        return createElement(tag, props, ...children);
      }
      default:
        return null;
    }
  });
}

/** One rendered instance: the component root plus its expanded template. */
export function ComponentView({
  component,
  fields,
  blockId,
}: {
  component: CompiledComponent;
  fields: Record<string, unknown>;
  blockId: string;
}) {
  const { mode } = useRenderContext();
  const name = component.def.name;
  return (
    <div className={`os-c ${componentClass(name)}`} data-os-component={name} data-os-uid={blockId}>
      {/* The Studio canvas and gallery get the CSS inline; pages get it once in <head>. */}
      {mode === "editor" && component.css ? (
        <style data-os-component-css={name}>{component.css}</style>
      ) : null}
      {toReact(expandComponent(component, fields, blockId))}
    </div>
  );
}

/** The renderer's `render` for component block definitions. */
export const renderComponent: ComponentRender = ({ component, fields, blockId }) => (
  <ComponentView component={component} fields={fields} blockId={blockId} />
);

/**
 * The block definition for a `component/<name>` block from the document being rendered, or a
 * reason it can't render (unknown component, or a definition with problems).
 */
export function componentDefinitionFor(
  doc: SiteDocument | undefined,
  type: string,
): { def: RendererBlockDefinition } | { reason: string } | undefined {
  const name = componentNameOf(type);
  if (!name) return undefined;
  const def = doc?.components?.[name];
  if (!def) return { reason: `This site has no designer section called “${name}”` };
  const block = componentBlockDefinition(def, renderComponent);
  if (block) return { def: block as RendererBlockDefinition };
  const r = checkComponent(def);
  const first = r.ok ? "" : (describeComponentIssues(r.issues)[0] ?? "");
  return { reason: `The ${def.label} designer section has a problem in its code. ${first}` };
}

// --- page assets --------------------------------------------------------------------------------

const USE_RE = /data-os-component="([a-z0-9-]+)"/g;

/** Components used in rendered HTML (valid definitions only), in first-use order. */
export function componentsInHtml(doc: SiteDocument, html: string): CompiledComponent[] {
  const out: CompiledComponent[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(USE_RE)) {
    const name = m[1] as string;
    if (seen.has(name)) continue;
    seen.add(name);
    const def = doc.components?.[name];
    const r = def ? checkComponent(def) : undefined;
    if (r?.ok) out.push(r.component);
  }
  return out;
}

/** The `<style>` for the components on a page ("" when none). */
export function componentStyles(components: readonly CompiledComponent[]): string {
  const css = components
    .map((c) => c.css)
    .filter(Boolean)
    .join("\n")
    .replace(/<\/style/gi, "<\\/style");
  return css ? `<style data-os="components">${css}</style>` : "";
}

/**
 * Behaviour scripts for the components on a page: one small module per component with JS, run
 * once per instance with `ctx = { reducedMotion, uid }`. Errors stay inside the instance.
 */
export function componentScripts(components: readonly CompiledComponent[]): string {
  return components
    .filter((c) => c.js)
    .map((c) => {
      const name = c.def.name;
      const body = c.js.replace(/<\/script/gi, "<\\/script");
      return `<script type="module" data-os-component-js="${name}">const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)").matches;for(const root of document.querySelectorAll('[data-os-component="${name}"]')){try{(function(root,ctx){"use strict";\n${body}\n})(root,{reducedMotion,uid:root.dataset.osUid||""})}catch(e){console.error("[openspace] ${name}",e)}}</script>`;
    })
    .join("\n");
}

// --- previews ----------------------------------------------------------------------------------------

/** Slug of the synthetic page that previews a component (Hub/CLI preview routes, MCP). */
export const COMPONENT_PREVIEW_PATH = "_os/component";

/**
 * A document with one extra page showing `def` (or `doc.components[name]`) with its sample
 * content (or `fields`), for previews and screenshots. The page is never saved.
 */
export function componentPreview(
  doc: SiteDocument,
  input: string | ComponentDefinition,
  opts: {
    fields?: Record<string, unknown>;
    colorTheme?: Page["sections"][number]["style"]["colorTheme"];
  } = {},
): { doc: SiteDocument; page: Page; block: Block } {
  const def = typeof input === "string" ? doc.components?.[input] : input;
  if (!def) throw new Error(`No component called ${String(input)}`);
  const section = componentSection(def, {
    ...(opts.fields ? { fields: opts.fields } : {}),
    ...(opts.colorTheme ? { colorTheme: opts.colorTheme } : {}),
  });
  const page: Page = {
    id: newId("pg") as Page["id"],
    title: `${def.label} preview`,
    slug: `os-component-preview-${def.name}`,
    seo: { noindex: true },
    sections: [section],
  } as Page;
  return {
    doc: {
      ...doc,
      components: { ...(doc.components ?? {}), [def.name]: def },
      pages: { ...doc.pages, [page.id]: page },
    },
    page,
    block: section.blocks[0] as Block,
  };
}
