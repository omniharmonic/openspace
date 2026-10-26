import type { Page, SiteDocument } from "@openspace/schema";
import type { ReactNode } from "react";
import { AnnouncementBar, Footer } from "./chrome";
import {
  EditorContext,
  type EditorHooks,
  ImageResolverContext,
  RenderContext,
  type RenderMode,
} from "./context";
import { cx } from "./cx";
import { effectiveHeader, Header } from "./header";
import type { ImageMap } from "./image-map";
import { responsiveVars } from "./layout-vars";
import { normalizeBasePath } from "./link";
import { FirstSectionContext, SectionView } from "./section";

export interface PageViewProps {
  doc: SiteDocument;
  /** A page id in `doc.pages`, or a page object (e.g. an unsaved draft or a collection item page). */
  page: string | Page;
  mode?: RenderMode;
  basePath?: string;
  imageMap?: ImageMap;
  hubUrl?: string;
  /** Studio hooks (canvas selection affordances). */
  editor?: EditorHooks;
  /** Rendered after the footer (popups, cart drawer mount points). */
  extras?: ReactNode;
}

/** Resolve the page prop to a page object; throws for unknown ids. */
export function resolvePage(doc: SiteDocument, page: string | Page): Page {
  if (typeof page !== "string") return page;
  const found = doc.pages[page as keyof SiteDocument["pages"]];
  if (!found) throw new Error(`Page ${page} does not exist`);
  return found;
}

/**
 * A whole page: skip link, announcement bar, header, the page's sections in `<main>`, footer.
 * The same component renders the Studio canvas (`mode: "editor"`), the Hub preview and the
 * published site.
 */
export function PageView(props: PageViewProps) {
  const { doc, mode = "production", imageMap = {}, extras } = props;
  const page = resolvePage(doc, props.page);
  const basePath = normalizeBasePath(props.basePath);
  const hubUrl = props.hubUrl ?? doc.config.hub;
  const visible = page.sections.filter((s) => !s.hidden || mode === "editor");
  const header = effectiveHeader(doc.site, page);
  const heroTheme = visible[0]?.style.colorTheme ?? "light";
  const cart = doc.site.integrations?.stripeConnected ?? false;
  const logoVars = header.logoHeight
    ? responsiveVars("logo-h", header.logoHeight, (px) => `${px}px`)
    : undefined;

  const content = (
    <RenderContext.Provider value={{ doc, page, mode, basePath, hubUrl }}>
      <ImageResolverContext.Provider value={imageMap}>
        <div
          className={cx("os-page", header.overlay && !header.hidden && "has-overlay-header")}
          data-os-page={page.id}
          style={logoVars}
        >
          <a className="os-skip-link" href="#main">
            Skip to content
          </a>
          <AnnouncementBar announcement={doc.site.announcement} />
          <Header site={doc.site} page={page} heroTheme={heroTheme} cart={cart} />
          <main id="main" className="os-main" tabIndex={-1}>
            {visible.map((section, i) => (
              <FirstSectionContext.Provider key={section.id} value={i === 0}>
                <SectionView section={section} />
              </FirstSectionContext.Provider>
            ))}
          </main>
          <Footer site={doc.site} />
          {extras}
        </div>
      </ImageResolverContext.Provider>
    </RenderContext.Provider>
  );
  return props.editor ? (
    <EditorContext.Provider value={props.editor}>{content}</EditorContext.Provider>
  ) : (
    content
  );
}
