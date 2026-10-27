import type { ComponentDefinition } from "@omniharmonic/openspace-schema";
import { photo } from "../presets/images";
import { rt } from "../shared";

/** Layered image collage: three overlapping photos with a round badge, beside a short story. */
export const layeredCollage: ComponentDefinition = {
  name: "layered-collage",
  label: "Layered photo collage",
  description:
    "Three photos layered like prints on a table, with a round badge and a short story beside them.",
  version: 1,
  category: "about",
  tags: ["about", "collage", "photos", "layered"],
  fields: {
    eyebrow: { kind: "text", label: "Small line above", maxLength: 60, optional: true },
    headline: { kind: "text", label: "Headline", maxLength: 100 },
    body: {
      kind: "richText",
      label: "Story",
      marks: ["bold", "italic", "link"],
      blocks: ["paragraph", "bulletList"],
      maxLength: 700,
    },
    photoLarge: { kind: "image", label: "Large photo", aspect: "4:5" },
    photoSide: { kind: "image", label: "Side photo", aspect: "4:5" },
    photoSmall: { kind: "image", label: "Small photo", aspect: "1:1" },
    badge: { kind: "text", label: "Badge text", maxLength: 24, optional: true },
    cta: { kind: "link", label: "Button link", optional: true },
    ctaLabel: { kind: "text", label: "Button text", maxLength: 32, optional: true },
  },
  defaults: {
    eyebrow: "Our story",
    headline: "Made by hand, one batch at a time",
    body: rt.doc(
      rt.p(
        "We started with one oven and a borrowed table. Twelve years later we still shape every loaf by hand, and still know most of our neighbours by name.",
      ),
    ),
    photoLarge: photo("bakerOven", 560, "4:5"),
    photoSide: photo("breadLoaves", 420, "4:5"),
    photoSmall: photo("croissant", 280, "1:1"),
    badge: "Since 2014",
    cta: { type: "url", url: "/about" },
    ctaLabel: "Meet the bakers",
  },
  template: `<div class="lc">
  <div class="lc__copy">
    {{#if eyebrow}}<p class="lc__eyebrow">{{eyebrow}}</p>{{/if}}
    <h2 class="lc__title">{{headline}}</h2>
    {{rich body class="lc__body"}}
    {{#if cta}}<div class="lc__actions">{{button cta label=ctaLabel variant="secondary"}}</div>{{/if}}
  </div>
  <div class="lc__collage">
    <figure class="lc__piece lc__piece--large">{{image photoLarge sizes="(max-width: 767px) 70vw, 34vw" aspect="4:5" fit="cover"}}</figure>
    <figure class="lc__piece lc__piece--side">{{image photoSide sizes="(max-width: 767px) 55vw, 26vw" aspect="4:5" fit="cover"}}</figure>
    <figure class="lc__piece lc__piece--small">{{image photoSmall sizes="(max-width: 767px) 38vw, 18vw" aspect="1:1" fit="cover"}}</figure>
    {{#if badge}}<p class="lc__badge"><span>{{badge}}</span></p>{{/if}}
  </div>
</div>`,
  css: `.lc {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: var(--os-space-2xl);
  align-items: center;
}
.lc__eyebrow {
  margin: 0 0 var(--os-space-sm);
  font-family: var(--os-font-label);
  font-size: var(--os-type-eyebrow-font-size);
  letter-spacing: var(--os-type-eyebrow-letter-spacing);
  text-transform: var(--os-type-eyebrow-text-transform);
  color: var(--os-eyebrow-color);
}
.lc__title {
  margin: 0;
  font-family: var(--os-font-heading);
  font-weight: var(--os-font-weight-heading);
  font-size: var(--os-type-h1-font-size);
  line-height: var(--os-type-h1-line-height);
  letter-spacing: var(--os-type-h1-letter-spacing);
  color: var(--os-color-heading);
  text-wrap: balance;
}
.lc__body { margin-top: var(--os-space-md); color: var(--os-color-text); max-width: 32em; }
.lc__actions { margin-top: var(--os-space-xl); }
.lc__collage { position: relative; aspect-ratio: 6 / 5; }
.lc__piece {
  position: absolute;
  margin: 0;
  overflow: hidden;
  border-radius: var(--os-radius-image);
  box-shadow: var(--os-shadow-lg);
  background: var(--os-color-surface);
  transition: transform var(--os-motion-duration-slow, 400ms) var(--os-motion-ease, ease);
}
.lc__piece picture, .lc__piece img { display: block; width: 100%; height: 100%; object-fit: cover; }
.lc__piece--large { top: 0; left: 0; width: 56%; height: 86%; z-index: 1; }
.lc__piece--side {
  right: 0;
  bottom: 6%;
  width: 42%;
  height: 70%;
  z-index: 2;
  transform: rotate(2.5deg);
  border: var(--os-space-2xs) solid var(--os-color-background);
}
.lc__piece--small {
  left: 34%;
  bottom: -4%;
  width: 26%;
  aspect-ratio: 1;
  z-index: 3;
  transform: rotate(-5deg);
  border: var(--os-space-2xs) solid var(--os-color-background);
}
.lc__collage:hover .lc__piece--side { transform: rotate(0deg) translateY(-8px); }
.lc__collage:hover .lc__piece--small { transform: rotate(-1deg) translateY(-6px); }
.lc__badge {
  position: absolute;
  top: 4%;
  right: 6%;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 7.5rem;
  aspect-ratio: 1;
  margin: 0;
  padding: var(--os-space-sm);
  border-radius: var(--os-radius-full);
  background: var(--os-color-accent);
  color: var(--os-color-accent-text);
  font-family: var(--os-font-heading);
  font-size: var(--os-type-h4-font-size);
  line-height: 1.1;
  text-align: center;
  transform: rotate(8deg);
}
@media (min-width: 768px) and (max-width: 1199px) {
  .lc { gap: var(--os-space-xl); }
}
@media (max-width: 767px) {
  .lc { grid-template-columns: minmax(0, 1fr); gap: var(--os-space-xl); }
  .lc__collage { margin-inline: var(--os-space-xs); }
  .lc__badge { width: 5.5rem; font-size: var(--os-type-small-font-size); }
}
@media (prefers-reduced-motion: reduce) {
  .lc__piece { transition: none; }
}`,
  section: { width: "wide", padding: { d: "2xl", m: "xl" } },
  ai: {
    purpose: "An about/story section with a layered, tactile photo collage.",
    whenToUse:
      "Craft, food, studio and maker businesses telling their story; when three good photos exist.",
    avoid: "Using it with low-quality or unrelated photos; more than one per page.",
  },
};
