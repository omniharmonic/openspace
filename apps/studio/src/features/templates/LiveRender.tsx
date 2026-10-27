import { BLOCKS_CSS, registerAll } from "@omniharmonic/openspace-blocks";
import {
  BASE_CSS,
  compiledStylesFor,
  type ImageMap,
  PageView,
} from "@omniharmonic/openspace-renderer";
import type { Page, SiteDocument } from "@omniharmonic/openspace-schema";
import { googleFontsUrl } from "@omniharmonic/openspace-theme";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../ui";
import "./LiveRender.css";

registerAll();

/** Nothing moves and nothing navigates inside a live render; popups never cover the page. */
const RENDER_CSS = `
html,body{margin:0}
html.is-still,html.is-still body{overflow:hidden;scrollbar-width:none}
*{animation:none!important;transition:none!important}
.os-page a,.os-page button,.os-page summary,.os-page label{cursor:default}
.os-page :is(iframe,input,select,textarea,button){pointer-events:none}
.os-popup,.os-skip-link{display:none!important}
html.is-still .os-header.is-sticky{position:relative}
`;

function initFrame(d: Document): HTMLElement {
  const existing = d.getElementById("os-render-root");
  if (existing) return existing;
  const tag = (name: string, attrs: Record<string, string>) => {
    const node = d.createElement(name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };
  d.head.replaceChildren(
    tag("meta", { charset: "utf-8" }),
    tag("link", { rel: "stylesheet", "data-os": "fonts" }),
    tag("style", { "data-os": "tokens" }),
    tag("style", { "data-os": "base" }),
    tag("style", { "data-os": "blocks" }),
    tag("style", { "data-os": "render" }),
  );
  const q = (k: string) => d.head.querySelector(`[data-os="${k}"]`) as HTMLElement;
  q("base").textContent = BASE_CSS;
  q("blocks").textContent = BLOCKS_CSS;
  q("render").textContent = RENDER_CSS;
  d.documentElement.classList.add("os-js");
  d.body.className = "os-body";
  d.body.dataset.osMode = "editor";
  const root = tag("div", { id: "os-render-root" });
  d.body.replaceChildren(root);
  return root;
}

/**
 * One shared pair of observers for every live render: a render mounts its frame when it comes
 * within 400px of view and unmounts once it is about two screens away, so a gallery of dozens
 * keeps only the ones near the viewport alive.
 */
let near: IntersectionObserver | null = null;
let far: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, (visible: boolean) => void>();
export function observeNearViewport(el: Element, cb: (visible: boolean) => void): () => void {
  // Without IntersectionObserver (jsdom, very old browsers) renders stay placeholders.
  if (typeof IntersectionObserver === "undefined") return () => {};
  near ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) callbacks.get(e.target)?.(true);
    },
    { rootMargin: "400px" },
  );
  far ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (!e.isIntersecting) callbacks.get(e.target)?.(false);
    },
    { rootMargin: "1800px" },
  );
  callbacks.set(el, cb);
  near.observe(el);
  far.observe(el);
  return () => {
    near?.unobserve(el);
    far?.unobserve(el);
    callbacks.delete(el);
  };
}

/** True once the element has come near the viewport (and while it stays near). */
export function useNearViewport<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeNearViewport(el, setVisible);
  }, []);
  return [ref, visible];
}

export interface SiteRenderProps {
  /** The site to draw; undefined shows a loading placeholder. */
  doc: SiteDocument | undefined;
  /** Page id (default: the home page). */
  pageId?: string;
  /** Device width the page lays out at (CSS px): 1440, 834 or 390. */
  frameWidth?: number;
  /**
   * Height of the visible crop relative to the width (0.75 = 4:3). `"fill"` takes the
   * container's height (the container must have one).
   */
  aspect?: number | "fill";
  /** Show only the header and the first `sections` sections (the "Setting up" reveal). */
  sections?: number;
  /** Scrollable (dialog previews); otherwise a still thumbnail. */
  interactive?: boolean;
  /** Images for `media/` paths (the editor's canvas map). */
  imageMap?: ImageMap;
  /** Accessible name for the render. */
  title: string;
  /** Told when the render comes near or leaves the viewport (to fetch data lazily). */
  onVisibleChange?: (visible: boolean) => void;
  /** Shown while `doc` is loading (default: a quiet placeholder). */
  fallback?: ReactNode;
  className?: string;
}

/** The home page (slug ""), else the first page. */
export function homeOf(doc: SiteDocument): Page | undefined {
  const pages = Object.values(doc.pages);
  return pages.find((p) => p.slug === "") ?? pages[0];
}

/**
 * A live render of a site through `@omniharmonic/openspace-renderer` — the same components as the canvas
 * and the published site — scaled down from device width into any box. The frame runs no
 * scripts (sandboxed, same-origin only so Studio can portal React content into it) and is
 * mounted only near the viewport.
 */
export function SiteRender({
  doc,
  pageId,
  frameWidth = 1440,
  aspect = 0.75,
  sections,
  interactive = false,
  imageMap,
  title,
  onVisibleChange,
  fallback,
  className,
}: SiteRenderProps) {
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onVisible = useRef(onVisibleChange);
  onVisible.current = onVisibleChange;

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    return observeNearViewport(el, (v) => {
      setVisible(v);
      if (!v) setRoot(null);
      onVisible.current?.(v);
    });
  }, []);

  useLayoutEffect(() => {
    const el = holder.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mounted = visible && Boolean(doc);
  useLayoutEffect(() => {
    if (!mounted) return;
    const f = frame.current;
    if (!f) return;
    const init = () => {
      const d = f.contentDocument;
      if (d?.body) setRoot(initFrame(d));
    };
    init();
    f.addEventListener("load", init);
    return () => f.removeEventListener("load", init);
  }, [mounted]);

  const css = useMemo(() => (doc ? compiledStylesFor(doc.styles) : null), [doc]);
  useLayoutEffect(() => {
    const d = root?.ownerDocument;
    if (!d || !css) return;
    const tokens = d.head.querySelector('[data-os="tokens"]');
    if (tokens && tokens.textContent !== css.css) tokens.textContent = css.css;
    const fonts = d.head.querySelector('[data-os="fonts"]');
    const href = googleFontsUrl(css.tokens.pairing);
    if (fonts && fonts.getAttribute("href") !== href) fonts.setAttribute("href", href);
    d.documentElement.classList.toggle("is-still", !interactive);
    if (doc) d.documentElement.lang = doc.site.locale;
  }, [root, css, interactive, doc]);

  const page = useMemo(() => {
    if (!doc) return undefined;
    const p = (pageId && doc.pages[pageId as keyof SiteDocument["pages"]]) || homeOf(doc);
    if (!p || sections === undefined) return p;
    return { ...p, sections: p.sections.slice(0, Math.max(0, sections)) };
  }, [doc, pageId, sections]);
  const shown = useMemo(
    () =>
      doc && page && sections !== undefined
        ? { ...doc, pages: { ...doc.pages, [page.id]: page } }
        : doc,
    [doc, page, sections],
  );

  const scale = box.w > 0 ? box.w / frameWidth : 0;
  const frameHeight =
    aspect === "fill"
      ? scale > 0
        ? Math.ceil(box.h / scale)
        : frameWidth
      : Math.round(frameWidth * aspect);

  return (
    <div
      ref={holder}
      className={cx("st-render", interactive && "st-render--interactive", className)}
      style={aspect === "fill" ? undefined : { aspectRatio: `${1 / aspect}` }}
      {...(interactive ? {} : { role: "img", "aria-label": title })}
      aria-busy={!root || undefined}
    >
      {!root && (fallback ?? <div className="st-render__placeholder" aria-hidden="true" />)}
      {mounted && scale > 0 && (
        <iframe
          ref={frame}
          title={title}
          tabIndex={interactive ? 0 : -1}
          aria-hidden={interactive ? undefined : "true"}
          sandbox="allow-same-origin"
          className="st-render__frame"
          style={{
            width: frameWidth,
            height: frameHeight,
            transform: `scale(${scale})`,
            visibility: root ? "visible" : "hidden",
          }}
        />
      )}
      {root &&
        shown &&
        page &&
        createPortal(
          <PageView doc={shown} page={page.id} mode="editor" imageMap={imageMap} />,
          root,
        )}
    </div>
  );
}
