import { BLOCKS_CSS, registerAll } from "@openspace/blocks";
import {
  BASE_CSS,
  compiledStylesFor,
  type EditorHooks,
  PageView,
  type RichTextHookArgs,
} from "@openspace/renderer";
import type { SiteDocument } from "@openspace/schema";
import { googleFontsUrl } from "@openspace/theme";
import {
  cloneElement,
  isValidElement,
  memo,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useCanvasImageMap } from "../../media/sources";
import { useDocStore } from "../model/context";
import { InlineText } from "../text/InlineText";

registerAll();

/**
 * Editor-only CSS inside the canvas document. Kept minimal so the canvas matches the published
 * page: just what ProseMirror needs, and a default cursor (clicks select instead of navigating).
 */
export const CANVAS_EDITOR_CSS = `
html{scrollbar-width:thin}
body{margin:0}
[data-os-inline-editor]{outline:none;white-space:pre-wrap;word-wrap:break-word;cursor:text}
[data-os-plain-editing]{outline:none;cursor:text;pointer-events:auto!important;-webkit-user-modify:read-write-plaintext-only}
[data-os-inline-editor] .ProseMirror-selectednode{outline:2px solid #3347e6}
.os-page a,.os-page button,.os-page summary,.os-page label,.os-page input,.os-page select,.os-page textarea{cursor:default}
.os-page :is(iframe,input,select,textarea,button){pointer-events:none}
`;

/**
 * Every rich-text field on the canvas: tagged with its field path (for click-to-edit), and
 * swapped for the inline editor while it is the field being edited.
 */
function RichField({ block, fieldPath, className, as, children }: RichTextHookArgs) {
  const editing = useDocStore(
    (s) =>
      s.editing === block.id &&
      s.editingField?.kind === "rich" &&
      s.editingField.path === fieldPath,
  );
  if (editing)
    return <InlineText blockId={block.id} path={fieldPath} className={className} as={as} />;
  if (!isValidElement(children)) return <>{children}</>;
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    "data-os-field": fieldPath,
  });
}

const hooks: EditorHooks = {
  renderRichText: (args) => <RichField {...args} />,
};

const CanvasPage = memo(function CanvasPage({
  doc,
  pageId,
}: {
  doc: SiteDocument;
  pageId: string;
}) {
  // Library files and fresh uploads resolve to viewable URLs (media/ paths aren't served here).
  const imageMap = useCanvasImageMap(doc.media);
  if (!doc.pages[pageId as keyof SiteDocument["pages"]]) return null;
  return <PageView doc={doc} page={pageId} mode="editor" editor={hooks} imageMap={imageMap} />;
});

function el(d: Document, tag: string, attrs: Record<string, string>) {
  const node = d.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** Build the canvas document's head and root (idempotent per document). */
function initDocument(d: Document): HTMLElement {
  const existing = d.getElementById("os-canvas-root");
  if (existing) return existing;
  d.head.replaceChildren(
    el(d, "meta", { charset: "utf-8" }),
    el(d, "meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
    el(d, "link", { rel: "preconnect", href: "https://fonts.googleapis.com" }),
    el(d, "link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }),
    el(d, "link", { rel: "stylesheet", "data-os": "fonts" }),
    el(d, "style", { "data-os": "tokens" }),
    el(d, "style", { "data-os": "base" }),
    el(d, "style", { "data-os": "blocks" }),
    el(d, "style", { "data-os": "custom" }),
    el(d, "style", { "data-os": "editor" }),
  );
  const q = (k: string) => d.head.querySelector(`[data-os="${k}"]`) as HTMLElement;
  q("base").textContent = BASE_CSS;
  q("blocks").textContent = BLOCKS_CSS;
  q("editor").textContent = CANVAS_EDITOR_CSS;
  d.documentElement.classList.add("os-js");
  d.body.className = "os-body";
  d.body.dataset.osMode = "editor";
  const root = el(d, "div", { id: "os-canvas-root" });
  d.body.replaceChildren(root);
  return root;
}

export interface CanvasFrameProps {
  width: number;
  height: number;
  scale: number;
  /** Called with the canvas document once it is ready (and with null when it goes away). */
  onDocument: (doc: Document | null) => void;
}

/**
 * The canvas: a same-origin iframe holding the site's token CSS, base CSS, block CSS and fonts,
 * with `<PageView mode="editor">` portalled into it. Owner code never runs here: code/embed
 * blocks are nested sandboxed iframes (no allow-same-origin) and head/footer injections are
 * not included.
 */
export function CanvasFrame({ width, height, scale, onDocument }: CanvasFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const onDocRef = useRef(onDocument);
  onDocRef.current = onDocument;

  useLayoutEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let current: Document | null = null;
    const init = () => {
      const d = frame.contentDocument;
      if (!d || d === current || !d.body) return;
      current = d;
      setRoot(initDocument(d));
      onDocRef.current(d);
    };
    init();
    // Some browsers replace the initial about:blank document when the frame finishes loading.
    frame.addEventListener("load", init);
    return () => {
      frame.removeEventListener("load", init);
      onDocRef.current(null);
    };
  }, []);

  // Site styles: compiled tokens, fonts and custom CSS update live.
  const compiled = useMemo(() => compiledStylesFor(doc.styles), [doc.styles]);
  const fontsHref = useMemo(() => googleFontsUrl(compiled.tokens.pairing), [compiled]);
  const customCss = doc.site.customCss ?? "";
  const locale = doc.site.locale;
  useLayoutEffect(() => {
    const d = root?.ownerDocument;
    if (!d) return;
    const q = (k: string) => d.head.querySelector(`[data-os="${k}"]`);
    const tokens = q("tokens");
    if (tokens && tokens.textContent !== compiled.css) tokens.textContent = compiled.css;
    const fonts = q("fonts");
    if (fonts && fonts.getAttribute("href") !== fontsHref) fonts.setAttribute("href", fontsHref);
    const custom = q("custom");
    if (custom && custom.textContent !== customCss) custom.textContent = customCss;
    d.documentElement.lang = locale;
  }, [root, compiled, fontsHref, customCss, locale]);

  useEffect(() => {
    const d = root?.ownerDocument;
    if (d) d.title = doc.pages[pageId as keyof SiteDocument["pages"]]?.title ?? "";
  }, [root, doc.pages, pageId]);

  return (
    <>
      <iframe
        ref={ref}
        title="Page canvas"
        className="st-ed-canvas__iframe"
        style={{ width, height, transform: `scale(${scale})` }}
      />
      {root && createPortal(<CanvasPage doc={doc} pageId={pageId} />, root)}
    </>
  );
}
