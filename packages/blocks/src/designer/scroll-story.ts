import type { ComponentDefinition } from "@omniharmonic/openspace-schema";
import { photo } from "../presets/images";
import { rt } from "../shared";

/** Horizontal scroll story: numbered chapters in a swipeable track with arrows and progress. */
export const scrollStory: ComponentDefinition = {
  name: "scroll-story",
  label: "Horizontal scroll story",
  description:
    "Numbered chapters with photos in a sideways track: swipe on phones, arrow buttons and a progress line on desktop.",
  version: 1,
  category: "process",
  tags: ["process", "story", "timeline", "horizontal", "scroll"],
  fields: {
    eyebrow: { kind: "text", label: "Small line above", maxLength: 60, optional: true },
    headline: { kind: "text", label: "Headline", maxLength: 100 },
    intro: {
      kind: "richText",
      label: "Introduction",
      marks: ["bold", "italic", "link"],
      blocks: ["paragraph"],
      maxLength: 300,
      optional: true,
    },
    chapters: {
      kind: "list",
      label: "Chapters",
      min: 2,
      max: 10,
      itemLabel: "title",
      fields: {
        kicker: { kind: "text", label: "Label", maxLength: 30, optional: true },
        title: { kind: "text", label: "Title", maxLength: 70 },
        body: { kind: "text", label: "Text", maxLength: 280, multiline: true },
        photo: { kind: "image", label: "Photo", aspect: "4:5" },
      },
    },
  },
  defaults: {
    eyebrow: "How a pot is made",
    headline: "From a lump of clay to your kitchen table",
    intro: rt.doc(
      rt.p("Every piece passes through our hands at least six times over three weeks."),
    ),
    chapters: [
      {
        kicker: "Week one",
        title: "Wedging and throwing",
        body: "We knead the clay to push out air, then centre it on the wheel and pull the walls up by hand.",
        photo: photo("potterWheel", 420, "4:5"),
      },
      {
        kicker: "Week two",
        title: "Trimming and drying",
        body: "Once leather-hard, each pot is trimmed, signed, and left to dry slowly under cloth.",
        photo: photo("greenwareShelves", 420, "4:5"),
      },
      {
        kicker: "Week three",
        title: "Glazing",
        body: "Glazes are mixed in small batches and brushed or dipped, so no two pieces match exactly.",
        photo: photo("glazePainting", 420, "4:5"),
      },
      {
        kicker: "Firing",
        title: "Into the kiln",
        body: "A slow firing to 1240°C turns the glaze to glass and the clay to stone.",
        photo: photo("ceramics", 420, "4:5"),
      },
    ],
  },
  template: `<div class="ss">
  <div class="ss__head">
    <div class="ss__intro-wrap">
      {{#if eyebrow}}<p class="ss__eyebrow">{{eyebrow}}</p>{{/if}}
      <h2 class="ss__title" id="{{@uid}}-title">{{headline}}</h2>
      {{rich intro class="ss__intro"}}
    </div>
    <div class="ss__nav" data-ss-nav hidden>
      <button type="button" class="ss__btn" data-ss-prev aria-label="Previous chapter"><span aria-hidden="true">&larr;</span></button>
      <button type="button" class="ss__btn" data-ss-next aria-label="Next chapter"><span aria-hidden="true">&rarr;</span></button>
    </div>
  </div>
  <ol class="ss__track" tabindex="0" aria-labelledby="{{@uid}}-title">
    {{#each chapters}}
    <li class="ss__card">
      <figure class="ss__media">{{image photo sizes="(max-width: 767px) 80vw, 380px" aspect="4:5" fit="cover"}}</figure>
      <p class="ss__kicker"><span class="ss__num">{{@number}}</span>{{#if kicker}}<span>{{kicker}}</span>{{/if}}</p>
      <h3 class="ss__card-title">{{title}}</h3>
      <p class="ss__body">{{body}}</p>
    </li>
    {{/each}}
  </ol>
  <div class="ss__progress" aria-hidden="true"><span data-ss-bar></span></div>
</div>`,
  css: `.ss__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--os-space-lg);
  margin-bottom: var(--os-space-xl);
}
.ss__intro-wrap { max-width: 40em; }
.ss__eyebrow {
  margin: 0 0 var(--os-space-sm);
  font-family: var(--os-font-label);
  font-size: var(--os-type-eyebrow-font-size);
  letter-spacing: var(--os-type-eyebrow-letter-spacing);
  text-transform: var(--os-type-eyebrow-text-transform);
  color: var(--os-eyebrow-color);
}
.ss__title {
  margin: 0;
  font-family: var(--os-font-heading);
  font-weight: var(--os-font-weight-heading);
  font-size: var(--os-type-h1-font-size);
  line-height: var(--os-type-h1-line-height);
  color: var(--os-color-heading);
  text-wrap: balance;
}
.ss__intro { margin-top: var(--os-space-sm); color: var(--os-color-text-muted); }
.ss__nav { display: flex; gap: var(--os-space-xs); }
.ss__nav[hidden] { display: none; }
.ss__btn {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border: 1px solid var(--os-color-border);
  border-radius: var(--os-radius-full);
  background: var(--os-color-surface);
  color: var(--os-color-text);
  font-size: var(--os-type-h4-font-size);
  cursor: pointer;
  transition: background-color var(--os-motion-duration-fast, 150ms) var(--os-motion-ease, ease);
}
.ss__btn:hover:not(:disabled) { background: var(--os-color-surface-raised); }
.ss__btn:focus-visible { outline: 2px solid var(--os-color-focus); outline-offset: 2px; }
.ss__btn:disabled { opacity: 0.35; cursor: default; }
.ss__track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: clamp(16rem, 30vw, 26rem);
  gap: var(--os-space-lg);
  margin: 0;
  padding: var(--os-space-2xs) 0 var(--os-space-lg);
  list-style: none;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  scrollbar-width: none;
}
.ss__track::-webkit-scrollbar { display: none; }
.ss__track:focus-visible { outline: 2px solid var(--os-color-focus); outline-offset: 4px; }
.ss__card { scroll-snap-align: start; }
.ss__media { margin: 0; overflow: hidden; border-radius: var(--os-radius-image); }
.ss__media picture, .ss__media img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ss__kicker {
  display: flex;
  gap: var(--os-space-xs);
  align-items: baseline;
  margin: var(--os-space-md) 0 var(--os-space-2xs);
  font-family: var(--os-font-label);
  font-size: var(--os-type-small-font-size);
  color: var(--os-color-text-muted);
}
.ss__num { font-family: var(--os-font-heading); color: var(--os-color-accent); font-weight: var(--os-font-weight-strong); }
.ss__card-title {
  margin: 0;
  font-family: var(--os-font-heading);
  font-size: var(--os-type-h3-font-size);
  line-height: var(--os-type-h3-line-height);
  color: var(--os-color-heading);
}
.ss__body { margin: var(--os-space-xs) 0 0; color: var(--os-color-text); }
.ss__progress { height: 2px; background: var(--os-color-border); border-radius: var(--os-radius-full); overflow: hidden; }
.ss__progress span {
  display: block;
  height: 100%;
  background: var(--os-color-accent);
  transform: scaleX(0.08);
  transform-origin: left;
  transition: transform 160ms linear;
}
@media (max-width: 767px) {
  .ss__track { grid-auto-columns: 80%; gap: var(--os-space-md); }
}
@media (prefers-reduced-motion: reduce) {
  .ss__track { scroll-behavior: auto; }
  .ss__btn, .ss__progress span { transition: none; }
}`,
  js: `const track = root.querySelector(".ss__track");
const nav = root.querySelector("[data-ss-nav]");
const prev = root.querySelector("[data-ss-prev]");
const next = root.querySelector("[data-ss-next]");
const bar = root.querySelector("[data-ss-bar]");
if (!track || !nav || !prev || !next) return;
const behavior = ctx.reducedMotion ? "auto" : "smooth";
const step = () => {
  const card = track.querySelector(".ss__card");
  const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
  return card ? card.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
};
let queued = false;
const update = () => {
  queued = false;
  const max = track.scrollWidth - track.clientWidth;
  prev.disabled = track.scrollLeft <= 2;
  next.disabled = track.scrollLeft >= max - 2;
  nav.hidden = max <= 2;
  if (bar) bar.style.transform = "scaleX(" + (max > 0 ? Math.max(0.08, track.scrollLeft / max) : 1) + ")";
};
track.addEventListener("scroll", () => {
  if (!queued) {
    queued = true;
    requestAnimationFrame(update);
  }
}, { passive: true });
prev.addEventListener("click", () => track.scrollBy({ left: -step(), behavior }));
next.addEventListener("click", () => track.scrollBy({ left: step(), behavior }));
new ResizeObserver(update).observe(track);
update();`,
  section: { width: "wide", padding: { d: "2xl", m: "xl" } },
  ai: {
    purpose: "A step-by-step story or process told as swipeable chapters with photos.",
    whenToUse:
      "How something is made, a journey, a programme's stages, a year in review — 3 to 8 chapters with good photos.",
    avoid: "Chapters without photos; long text in a chapter (keep each under about 40 words).",
  },
};
