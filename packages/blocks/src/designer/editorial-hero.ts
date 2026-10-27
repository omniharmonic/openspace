import type { ComponentDefinition } from "@omniharmonic/openspace-schema";
import { photo } from "../presets/images";
import { rt } from "../shared";

/** Editorial split hero: a big serif headline beside a tall portrait that reveals on load. */
export const editorialHero: ComponentDefinition = {
  name: "editorial-hero",
  label: "Editorial split hero",
  description:
    "A magazine-style opening: large headline and intro beside a tall photo that unveils as the page loads.",
  version: 1,
  category: "hero",
  tags: ["hero", "editorial", "animated", "photo"],
  fields: {
    eyebrow: { kind: "text", label: "Small line above", maxLength: 60, optional: true },
    headline: {
      kind: "text",
      label: "Headline",
      maxLength: 120,
      ai: "4–10 words; the promise of the business, not its name.",
    },
    intro: {
      kind: "richText",
      label: "Introduction",
      marks: ["bold", "italic", "link"],
      blocks: ["paragraph"],
      maxLength: 320,
      optional: true,
    },
    photo: { kind: "image", label: "Photo", aspect: "4:5" },
    caption: { kind: "text", label: "Photo caption", maxLength: 90, optional: true },
    cta: { kind: "link", label: "Main button link", optional: true },
    ctaLabel: { kind: "text", label: "Main button text", maxLength: 32, optional: true },
    more: { kind: "link", label: "Second link", optional: true },
    moreLabel: { kind: "text", label: "Second link text", maxLength: 40, optional: true },
    layout: {
      kind: "select",
      label: "Photo side",
      options: [
        { value: "image-right", label: "Right" },
        { value: "image-left", label: "Left" },
      ],
      display: "segmented",
    },
  },
  defaults: {
    eyebrow: "Morning practice · Boulder",
    headline: "Slow down long enough to hear yourself think",
    intro: rt.doc(
      rt.p(
        "Small classes in a sunlit room above Pearl Street. Come as you are; leave a little lighter.",
      ),
    ),
    photo: photo("yogaDeck", 640, "4:5"),
    caption: "The studio at 7 a.m.",
    cta: { type: "url", url: "/schedule" },
    ctaLabel: "See the schedule",
    more: { type: "url", url: "/about" },
    moreLabel: "Our story",
    layout: "image-right",
  },
  template: `<div class="eh" data-layout="{{layout}}">
  <div class="eh__copy">
    {{#if eyebrow}}<p class="eh__eyebrow">{{eyebrow}}</p>{{/if}}
    <h1 class="eh__title">{{headline}}</h1>
    {{rich intro class="eh__intro"}}
    <div class="eh__actions">
      {{#if cta}}{{button cta label=ctaLabel}}{{/if}}
      {{#if more}}{{#link more class="eh__more"}}<span>{{moreLabel}}</span> <span aria-hidden="true">&rarr;</span>{{/link}}{{/if}}
    </div>
  </div>
  <figure class="eh__media">
    <div class="eh__frame">{{image photo sizes="(max-width: 767px) 100vw, 42vw" aspect="4:5" loading="eager"}}</div>
    {{#if caption}}<figcaption class="eh__caption">{{caption}}</figcaption>{{/if}}
  </figure>
</div>`,
  css: `.eh {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: var(--os-space-2xl);
  align-items: center;
}
.eh[data-layout="image-left"] { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); }
.eh[data-layout="image-left"] .eh__media { order: -1; }
.eh__eyebrow {
  margin: 0 0 var(--os-space-md);
  font-family: var(--os-font-label);
  font-size: var(--os-type-eyebrow-font-size);
  letter-spacing: var(--os-type-eyebrow-letter-spacing);
  text-transform: var(--os-type-eyebrow-text-transform);
  color: var(--os-eyebrow-color);
}
.eh__title {
  margin: 0;
  font-family: var(--os-font-heading);
  font-weight: var(--os-font-weight-heading);
  font-size: var(--os-type-display-font-size);
  line-height: var(--os-type-display-line-height);
  letter-spacing: var(--os-type-display-letter-spacing);
  color: var(--os-color-heading);
  text-wrap: balance;
}
.eh__intro {
  margin-top: var(--os-space-lg);
  max-width: 34em;
  font-size: var(--os-type-lead-font-size);
  line-height: var(--os-type-lead-line-height);
  color: var(--os-color-text-muted);
}
.eh__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--os-space-lg);
  margin-top: var(--os-space-xl);
}
.eh__more {
  color: var(--os-color-link);
  font-family: var(--os-font-label);
  text-decoration: none;
  border-bottom: 1px solid currentColor;
  padding-bottom: 2px;
}
.eh__more:hover { border-bottom-width: 2px; }
.eh__media { margin: 0; }
.eh__frame {
  overflow: hidden;
  border-radius: var(--os-radius-image);
  animation: unveil 1100ms var(--os-motion-ease, ease) both;
}
.eh__frame img { animation: settle 1800ms var(--os-motion-ease, ease) both; }
.eh__caption {
  margin-top: var(--os-space-sm);
  font-size: var(--os-type-small-font-size);
  color: var(--os-color-text-muted);
}
.eh__copy > * { animation: rise 900ms var(--os-motion-ease, ease) both; }
.eh__copy > :nth-child(2) { animation-delay: 90ms; }
.eh__copy > :nth-child(3) { animation-delay: 180ms; }
.eh__copy > :nth-child(4) { animation-delay: 270ms; }
@keyframes unveil {
  from { clip-path: inset(100% 0 0 0); }
  to { clip-path: inset(0 0 0 0); }
}
@keyframes settle {
  from { transform: scale(1.12); }
  to { transform: none; }
}
@keyframes rise {
  from { opacity: 0; transform: translateY(var(--os-motion-reveal-distance, 16px)); }
  to { opacity: 1; transform: none; }
}
@media (max-width: 767px) {
  .eh, .eh[data-layout="image-left"] { grid-template-columns: minmax(0, 1fr); gap: var(--os-space-xl); }
  .eh[data-layout] .eh__media { order: -1; }
}
@media (prefers-reduced-motion: reduce) {
  .eh__frame, .eh__frame img, .eh__copy > * { animation: none; }
}`,
  section: { width: "wide", padding: { d: "2xl", m: "xl" } },
  ai: {
    purpose: "A distinctive editorial opening section: headline, short intro, one tall photo.",
    whenToUse:
      "The first section of a home or landing page when the brand wants a magazine feel instead of a standard hero preset.",
    avoid: "More than one per page (it uses the page's main heading); long paragraphs.",
  },
};
