import { BLOCKS_CSS, registerAll } from "@openspace/blocks";
import { BASE_CSS, compiledStylesFor, RenderContext } from "@openspace/renderer";
import type { Page, SiteDocument } from "@openspace/schema";
import { googleFontsUrl } from "@openspace/theme";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

registerAll();

/** Thumbnail-only CSS: nothing moves, nothing is clickable, no scrollbars. */
const PREVIEW_CSS = `
html,body{margin:0;overflow:hidden;scrollbar-width:none}
*{animation:none!important;transition:none!important}
.os-page{pointer-events:none;min-height:0}
.os-header.is-sticky{position:relative}
.os-preview-ghost{display:grid;align-content:start;gap:18px;height:170px;padding:44px 64px 0}
.os-preview-ghost span{display:block;height:28px;width:44%;border-radius:6px;background:currentColor;opacity:.07}
.os-preview-ghost span+span{height:14px;width:62%}
`;

function initFrame(d: Document): HTMLElement {
  const existing = d.getElementById("os-preview-root");
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
    tag("style", { "data-os": "preview" }),
  );
  const q = (k: string) => d.head.querySelector(`[data-os="${k}"]`) as HTMLElement;
  q("base").textContent = BASE_CSS;
  q("blocks").textContent = BLOCKS_CSS;
  q("preview").textContent = PREVIEW_CSS;
  // Render as a page with JavaScript (menus collapsed), like the canvas.
  d.documentElement.classList.add("os-js");
  d.body.className = "os-body";
  d.body.dataset.osMode = "editor";
  const root = tag("div", { id: "os-preview-root" });
  d.body.replaceChildren(root);
  return root;
}

/**
 * One shared observer for every thumbnail: a thumbnail mounts its frame when it comes within
 * 300px of view and unmounts it once it is more than about two screens away, so a long gallery
 * keeps only a few dozen live frames.
 */
let near: IntersectionObserver | null = null;
let far: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, (visible: boolean) => void>();
function observe(el: Element, cb: (visible: boolean) => void): () => void {
  // Without IntersectionObserver (old browsers, jsdom) thumbnails stay placeholders.
  if (typeof IntersectionObserver === "undefined") return () => {};
  near ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) callbacks.get(e.target)?.(true);
    },
    { rootMargin: "300px" },
  );
  far ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (!e.isIntersecting) callbacks.get(e.target)?.(false);
    },
    { rootMargin: "1600px" },
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

export interface PreviewFrameProps {
  doc: SiteDocument;
  /** Page context for links and the header (any page of the site). */
  page?: Page;
  /** Device width the content lays out at (CSS px). */
  width: number;
  /** Width of the thumbnail on screen. */
  displayWidth: number;
  /** Cap on the rendered height (CSS px, before scaling). */
  maxHeight?: number;
  children: ReactNode;
  title: string;
}

/**
 * A live, scaled render of real site content: an iframe at device width (so the published
 * page's media queries apply) holding the site's tokens, fonts, base and block CSS, with React
 * content portalled in from Studio. Sandboxed without scripts. Mounted only when scrolled into
 * view, so a gallery of a hundred presets stays fast.
 */
export function PreviewFrame({
  doc,
  page,
  width,
  displayWidth,
  maxHeight = 1100,
  children,
  title,
}: PreviewFrameProps) {
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(Math.round(width * 0.45));
  const scale = displayWidth / width;

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    return observe(el, (v) => {
      setVisible(v);
      if (!v) setRoot(null);
    });
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    const f = frame.current;
    if (!f) return;
    const init = () => {
      const d = f.contentDocument;
      if (d?.body) setRoot(initFrame(d));
    };
    init();
    f.addEventListener("load", init);
    return () => f.removeEventListener("load", init);
  }, [visible]);

  const css = compiledStylesFor(doc.styles);
  useLayoutEffect(() => {
    const d = root?.ownerDocument;
    if (!d) return;
    const tokens = d.head.querySelector('[data-os="tokens"]');
    if (tokens && tokens.textContent !== css.css) tokens.textContent = css.css;
    const fonts = d.head.querySelector('[data-os="fonts"]');
    const href = googleFontsUrl(css.tokens.pairing);
    if (fonts && fonts.getAttribute("href") !== href) fonts.setAttribute("href", href);
  }, [root, css]);

  // Fit the thumbnail to the content's real height.
  useEffect(() => {
    if (!root) return;
    const measure = () => {
      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h > 0) setHeight(Math.min(h, maxHeight));
    };
    measure();
    // The frame runs no scripts of its own, so watch it from Studio (plus late font loads).
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(root);
    const timers = [300, 1200].map((ms) => setTimeout(measure, ms));
    return () => {
      ro?.disconnect();
      for (const t of timers) clearTimeout(t);
    };
  }, [root, maxHeight]);

  return (
    <div
      ref={holder}
      className="st-preview"
      style={{ width: displayWidth, height: Math.max(24, Math.round(height * scale)) }}
    >
      {visible && (
        <iframe
          ref={frame}
          title={title}
          tabIndex={-1}
          aria-hidden="true"
          sandbox="allow-same-origin"
          className="st-preview__frame"
          style={{ width, height, transform: `scale(${scale})` }}
        />
      )}
      {root &&
        createPortal(
          <RenderContext.Provider
            value={{ doc, page, mode: "editor", basePath: "", hubUrl: doc.config.hub }}
          >
            <div className="os-page">{children}</div>
          </RenderContext.Provider>,
          root,
        )}
    </div>
  );
}
