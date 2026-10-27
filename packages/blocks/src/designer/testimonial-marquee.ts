import type { ComponentDefinition } from "@omniharmonic/openspace-schema";

/** Testimonial marquee: quote cards gliding sideways, paused on hover/focus, still for reduced motion. */
export const testimonialMarquee: ComponentDefinition = {
  name: "testimonial-marquee",
  label: "Testimonial marquee",
  description:
    "Customer quotes on cards that glide slowly across the page; they pause when hovered and stay still for people who prefer less motion.",
  version: 1,
  category: "testimonials",
  tags: ["testimonials", "quotes", "marquee", "animated", "social proof"],
  fields: {
    eyebrow: { kind: "text", label: "Small line above", maxLength: 60, optional: true },
    headline: { kind: "text", label: "Headline", maxLength: 100, optional: true },
    quotes: {
      kind: "list",
      label: "Quotes",
      min: 3,
      max: 12,
      itemLabel: "name",
      fields: {
        quote: { kind: "text", label: "Quote", maxLength: 260, multiline: true },
        name: { kind: "text", label: "Name", maxLength: 60 },
        role: { kind: "text", label: "Role or place", maxLength: 60, optional: true },
      },
      ai: "Real quotes from real customers only; ask the owner.",
    },
    speed: {
      kind: "select",
      label: "Speed",
      options: [
        { value: "slow", label: "Slow" },
        { value: "medium", label: "Medium" },
        { value: "fast", label: "Fast" },
      ],
      display: "segmented",
    },
  },
  defaults: {
    eyebrow: "Kind words",
    headline: "What our neighbours say",
    quotes: [
      {
        quote: "The only bakery where they remember my order and my dog's name.",
        name: "Priya N.",
        role: "Regular since 2016",
      },
      {
        quote: "Their sourdough ruined supermarket bread for me forever. No regrets.",
        name: "Tom H.",
        role: "Saturday market",
      },
      {
        quote: "We ordered our wedding cake here and people are still talking about it.",
        name: "Alex & Sam",
        role: "June wedding",
      },
      {
        quote: "Warm, unfussy and genuinely good. It feels like the heart of the street.",
        name: "Marta K.",
        role: "Local café owner",
      },
    ],
    speed: "slow",
  },
  template: `<div class="tm" data-speed="{{speed}}">
  {{#if headline}}<div class="tm__head">
    {{#if eyebrow}}<p class="tm__eyebrow">{{eyebrow}}</p>{{/if}}
    <h2 class="tm__title">{{headline}}</h2>
  </div>{{/if}}
  <div class="tm__viewport">
    <ul class="tm__track">
      {{#each quotes}}<li class="tm__card"><blockquote class="tm__quote"><p>{{quote}}</p></blockquote><p class="tm__who"><span class="tm__name">{{name}}</span>{{#if role}}<span class="tm__role">{{role}}</span>{{/if}}</p></li>{{/each}}
    </ul>
    <ul class="tm__track tm__track--copy" aria-hidden="true">
      {{#each quotes}}<li class="tm__card"><blockquote class="tm__quote"><p>{{quote}}</p></blockquote><p class="tm__who"><span class="tm__name">{{name}}</span>{{#if role}}<span class="tm__role">{{role}}</span>{{/if}}</p></li>{{/each}}
    </ul>
  </div>
</div>`,
  css: `.tm { --tm-duration: 90s; --tm-gap: var(--os-space-lg); }
.tm[data-speed="medium"] { --tm-duration: 60s; }
.tm[data-speed="fast"] { --tm-duration: 36s; }
.tm__head { text-align: center; margin: 0 auto var(--os-space-xl); max-width: 40em; }
.tm__eyebrow {
  margin: 0 0 var(--os-space-sm);
  font-family: var(--os-font-label);
  font-size: var(--os-type-eyebrow-font-size);
  letter-spacing: var(--os-type-eyebrow-letter-spacing);
  text-transform: var(--os-type-eyebrow-text-transform);
  color: var(--os-eyebrow-color);
}
.tm__title {
  margin: 0;
  font-family: var(--os-font-heading);
  font-weight: var(--os-font-weight-heading);
  font-size: var(--os-type-h2-font-size);
  line-height: var(--os-type-h2-line-height);
  color: var(--os-color-heading);
}
.tm__viewport {
  display: flex;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent);
  mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent);
}
.tm__track {
  display: flex;
  flex: none;
  gap: var(--tm-gap);
  margin: 0;
  padding: var(--os-space-xs) var(--tm-gap) var(--os-space-xs) 0;
  list-style: none;
  animation: glide var(--tm-duration) linear infinite;
}
.tm__viewport:hover .tm__track, .tm__viewport:focus-within .tm__track { animation-play-state: paused; }
.tm__card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--os-space-md);
  width: min(22rem, 78vw);
  padding: var(--os-space-lg);
  border: 1px solid var(--os-color-border);
  border-radius: var(--os-radius-card);
  background: var(--os-color-surface);
  color: var(--os-color-text);
}
.tm__quote { margin: 0; }
.tm__quote p {
  margin: 0;
  font-family: var(--os-font-heading);
  font-size: var(--os-type-h4-font-size);
  line-height: 1.35;
  color: var(--os-color-heading);
}
.tm__quote p::before { content: "\\201C"; color: var(--os-color-accent); }
.tm__quote p::after { content: "\\201D"; color: var(--os-color-accent); }
.tm__who { display: flex; flex-direction: column; margin: 0; font-size: var(--os-type-small-font-size); }
.tm__name { font-weight: var(--os-font-weight-strong); color: var(--os-color-heading); }
.tm__role { color: var(--os-color-text-muted); }
@keyframes glide {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}
@media (max-width: 767px) {
  .tm { --tm-gap: var(--os-space-md); }
  .tm__card { padding: var(--os-space-md); }
}
@media (prefers-reduced-motion: reduce) {
  .tm__viewport { flex-wrap: wrap; justify-content: center; -webkit-mask-image: none; mask-image: none; }
  .tm__track { flex-wrap: wrap; justify-content: center; animation: none; padding-right: 0; }
  .tm__track--copy { display: none; }
}`,
  section: { width: "full", padding: { d: "2xl", m: "xl" } },
  ai: {
    purpose: "Social proof that feels alive: real customer quotes gliding across the page.",
    whenToUse: "4–10 short, real quotes; above a call to action or near pricing.",
    avoid: "Invented quotes; long quotes (keep under 30 words); fewer than three quotes.",
  },
};
