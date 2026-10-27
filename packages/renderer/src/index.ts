/**
 * @omniharmonic/openspace-renderer — the one renderer (ADR-3). React components that turn OpenSpace content
 * into HTML for the Studio canvas, the Hub preview, site-kit builds and OG/email generation.
 * Published pages ship no React runtime: interactivity comes from vanilla `data-os-behavior`
 * modules (see `./behaviors-manifest` and the `@omniharmonic/openspace-renderer/node` entry for files).
 */
export const name = "@omniharmonic/openspace-renderer";

export * from "./behaviors-manifest";
export {
  alignClasses,
  BlockView,
  type BlockViewProps,
  blockStyleProps,
  blockTypeClass,
} from "./block";
export {
  AnnouncementBar,
  Footer,
  Popup,
  type PopupProps,
  type PopupTrigger,
  popupTrigger,
  SitePopup,
  shortHash,
} from "./chrome";
export {
  CollectionsContext,
  type CollectionsValue,
  feedKey,
  isLive,
  isUpcoming,
  itemDate,
  nextOccurrence,
  type QueryOptions,
  queryCollection,
  RECURRENCE_HORIZON_DAYS,
  type ResolvedCollections,
  type SocialFeedPost,
  useCollectionQuery,
  useCollections,
} from "./collections";
export {
  BlockFieldsContext,
  BlockRegistryContext,
  EditorContext,
  type EditorHooks,
  fieldPathOf,
  ImageResolverContext,
  RenderContext,
  type RenderContextValue,
  type RenderMode,
  type RichTextHookArgs,
  SectionContext,
  useEditor,
  useImageMap,
  useRenderContext,
} from "./context";
export { type CssVars, cx } from "./cx";
export {
  DRAWER_VARIANTS,
  type EffectiveHeader,
  effectiveHeader,
  Header,
  type HeaderProps,
  resolveNav,
} from "./header";
export { behaviorsForPage, type RenderPageHtmlOptions, renderPageHtml } from "./html";
export {
  compiledStylesFor,
  escapeHtml,
  jsonForScript,
  pageDescription,
  pageTitle,
  siteUrlFor,
} from "./html-meta";
export {
  type AboveFold,
  AboveFoldContext,
  Img,
  type ImgProps,
  REMOTE_WIDTHS,
  remoteSrcset,
  resolveImage,
} from "./image";
export {
  collectImageSrcs,
  type ImageMap,
  type ResolvedImage,
  type ResolvedImageSource,
} from "./image-map";
export * from "./layout-vars";
export {
  internalHref,
  itemPath,
  Link,
  type LinkProps,
  type LinkResolveOptions,
  mediaUrl,
  normalizeBasePath,
  pagePath,
  type ResolvedLink,
  resolveLink,
  sectionFragment,
  withBase,
  withTrailingSlash,
} from "./link";
export { PageView, type PageViewProps, resolvePage } from "./page";
export {
  Button,
  type ButtonProps,
  type ButtonRole,
  networkLabel,
  SocialIcon,
  SocialLinks,
} from "./primitives";
export {
  eventOn,
  expandOccurrences,
  itemKey,
  occurrenceDates,
  parseRecurrence,
  type RecurrenceRule,
} from "./recurrence";
export {
  getBlock,
  globalRegistry,
  listBlocks,
  type RendererBlockDefinition,
  type RendererBlockRegistry,
  registerBlocks,
  unregisterBlocks,
} from "./registry";
export { RichText, type RichTextProps, typeClass } from "./richtext";
export {
  backgroundVars,
  FirstSectionContext,
  SectionBackgroundLayer,
  SectionView,
  type SectionViewProps,
} from "./section";
export { BASE_CSS } from "./styles/base-css";
