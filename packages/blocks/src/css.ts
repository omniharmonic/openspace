import { accordionCss } from "./blocks/accordion";
import { buttonCss } from "./blocks/button";
import { cardCss } from "./blocks/card";
import { decorCss } from "./blocks/decor";
import { embedCss } from "./blocks/embed";
import { formCss } from "./blocks/form";
import { galleryCss } from "./blocks/gallery";
import { imageCss } from "./blocks/image";
import { logoStripCss } from "./blocks/logo-strip";
import { mapCss } from "./blocks/map";
import { newsletterCss } from "./blocks/newsletter";
import { quoteCss } from "./blocks/quote";
import { socialCss } from "./blocks/social";
import { textCss } from "./blocks/text";
import { videoCss } from "./blocks/video";

/**
 * Stylesheet for the block library. It builds on `os.css` (renderer) and references design
 * tokens only through the documented `--os-*` names; per-instance values are short private
 * custom properties set inline (`--g-cols`, `--line-c`, `--ar` …).
 *
 * Everything lives in the `os.blocks` cascade layer, ordered after the renderer's layers and
 * before `os.utilities`, so the site's own (unlayered) custom CSS always wins.
 */
export const BLOCKS_CSS = `/* OpenSpace block library (@openspace/blocks). Tokens: --os-* from @openspace/theme. */
@layer os.reset, os.base, os.layout, os.components, os.behaviors, os.blocks, os.utilities;
@layer os.blocks {
${[
  textCss,
  imageCss,
  buttonCss,
  galleryCss,
  videoCss,
  quoteCss,
  decorCss,
  formCss,
  newsletterCss,
  mapCss,
  socialCss,
  accordionCss,
  embedCss,
  logoStripCss,
  cardCss,
]
  .map((s) => s.trim())
  .join("\n")}
}
`;

/** `<style>` tag for `renderPageHtml({ extraHead })` and the Studio canvas. */
export function blocksStyleTag(): string {
  return `<style data-os="blocks">${BLOCKS_CSS}</style>`;
}
