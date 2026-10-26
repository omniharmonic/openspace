import { BLOCKS_CSS, registerAll } from "@openspace/blocks";
import { BASE_CSS, compiledStylesFor, PageView } from "@openspace/renderer";
import type { Page, SiteDocument } from "@openspace/schema";
import { googleFontsUrl } from "@openspace/theme";
import { Component, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCanvasImageMap } from "../media/sources";
import "./collections.css";

registerAll();

const PREVIEW_CSS = `body{margin:0}.os-page a,.os-page button{cursor:default}
.os-page :is(iframe,input,select,textarea,button){pointer-events:none}`;

function el(d: Document, tag: string, attrs: Record<string, string>) {
  const node = d.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function initDocument(d: Document): HTMLElement {
  const existing = d.getElementById("os-preview-root");
  if (existing) return existing;
  d.head.replaceChildren(
    el(d, "meta", { charset: "utf-8" }),
    el(d, "meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
    el(d, "link", { rel: "stylesheet", "data-os": "fonts" }),
    el(d, "style", { "data-os": "tokens" }),
    el(d, "style", { "data-os": "base" }),
    el(d, "style", { "data-os": "blocks" }),
    el(d, "style", { "data-os": "custom" }),
    el(d, "style", { "data-os": "preview" }),
  );
  const q = (k: string) => d.head.querySelector(`[data-os="${k}"]`) as HTMLElement;
  q("base").textContent = BASE_CSS;
  q("blocks").textContent = BLOCKS_CSS;
  q("preview").textContent = PREVIEW_CSS;
  d.documentElement.classList.add("os-js");
  d.body.className = "os-body";
  const root = el(d, "div", { id: "os-preview-root" });
  d.body.replaceChildren(root);
  return root;
}

class PreviewBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidUpdate(prev: { children: ReactNode }) {
    if (prev.children !== this.props.children && this.state.error) this.setState({ error: null });
  }
  override render() {
    if (this.state.error)
      return (
        <p style={{ padding: 24, fontFamily: "system-ui" }}>
          The preview can't show this yet. Fix the highlighted fields and it will update.
        </p>
      );
    return this.props.children;
  }
}

/**
 * A live preview of a page that isn't in the document yet (a collection item page, composed by
 * site-kit exactly as it will be published), rendered by the one renderer in a same-origin
 * iframe with the site's own styles.
 */
export function PreviewFrame({
  doc,
  page,
  width,
  title,
}: {
  doc: SiteDocument;
  page: Page | null;
  /** CSS width of the frame (e.g. 390 for a phone). */
  width?: number;
  title: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const imageMap = useCanvasImageMap(doc.media);

  useLayoutEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const init = () => {
      const d = frame.contentDocument;
      if (d?.body) setRoot(initDocument(d));
    };
    init();
    frame.addEventListener("load", init);
    return () => frame.removeEventListener("load", init);
  }, []);

  const compiled = useMemo(() => compiledStylesFor(doc.styles), [doc.styles]);
  const fontsHref = useMemo(() => googleFontsUrl(compiled.tokens.pairing), [compiled]);
  useLayoutEffect(() => {
    const d = root?.ownerDocument;
    if (!d) return;
    const q = (k: string) => d.head.querySelector(`[data-os="${k}"]`);
    const tokens = q("tokens");
    if (tokens && tokens.textContent !== compiled.css) tokens.textContent = compiled.css;
    q("fonts")?.setAttribute("href", fontsHref);
    const custom = q("custom");
    if (custom) custom.textContent = doc.site.customCss ?? "";
    d.documentElement.lang = doc.site.locale;
  }, [root, compiled, fontsHref, doc.site.customCss, doc.site.locale]);

  return (
    <>
      <iframe
        ref={ref}
        title={title}
        className="st-preview-frame"
        style={width ? { width } : undefined}
      />
      {root &&
        page &&
        createPortal(
          <PreviewBoundary>
            <PageView doc={doc} page={page} mode="preview" imageMap={imageMap} />
          </PreviewBoundary>,
          root,
        )}
    </>
  );
}
