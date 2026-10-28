/**
 * @omniharmonic/openspace-lint — Studio's Design check and SEO check, and the grid mobile auto-layout
 * (doc 04 §9, arch §3.3). Pure functions over a `SiteDocument`; fixes are `@omniharmonic/openspace-ops`
 * operations so Studio, MCP and the CLI apply them like any other edit.
 */
export const name = "@omniharmonic/openspace-lint";

export {
  COMPONENT_BUDGETS,
  componentDefinitionIssues,
  componentIssues,
  componentsKitGate,
  type KitGate,
  rangeAdmits,
  usesComponents,
} from "./components";
export {
  blockDisplayWidth,
  blocksInOrder,
  blockText,
  headingsOf,
  imagesIn,
  isTextBlock,
  type OutlineHeading,
} from "./content";
export { designCheck } from "./design-check";
export {
  CLOUDFLARE_BLOCKS,
  gatedPageLinks,
  type HostingWarning,
  hostingWarnings,
  isGatedPage,
  onGitHubPages,
} from "./hosting";
export { type Autofix, type CheckOptions, type Issue, type Severity, sortIssues } from "./issue";
export {
  describeBrokenLink,
  describeGatedLink,
  linkIssues,
  linkPlace,
  type PublishCheck,
  type PublishCheckOptions,
  type PublishProblem,
  publishCheck,
} from "./links";
export {
  type AutoMobileOptions,
  autoMobileLayout,
  autoMobileLayoutOps,
  MOBILE_WIDTH,
  mobileHeight,
  mobileRowCount,
  ROW_UNIT,
  readingOrder,
} from "./mobile";
export {
  type FixForPhonesResult,
  fixForPhones,
  isPhoneIssue,
  isPhoneRule,
  PHONE_RULE_PREFIX,
  phoneCheck,
  phoneIssuesFromProbe,
  phonePx,
  wideRules,
} from "./phone";
export {
  PHONE_HEIGHT,
  PHONE_LIMITS,
  PHONE_PREPARE_SCRIPT,
  PHONE_PROBE_SCRIPT,
  PHONE_WIDTHS,
  type PhoneFinding,
  type PhoneFindingKind,
  type PhoneProbeResult,
} from "./phone-probe";
export {
  blendOver,
  type PhotoContrastFailure,
  type PhotoTextCheck,
  photoContrast,
  photoTextChecks,
  worstCaseRatio,
} from "./photo-contrast";
export { effectiveTitle, seoCheck } from "./seo";
