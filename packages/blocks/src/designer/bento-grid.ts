import type { ComponentDefinition } from "@omniharmonic/openspace-schema";
import { photo } from "../presets/images";

/** Bento feature grid: tiles of mixed sizes, photo tiles with a scrim, lift on hover/focus. */
export const bentoGrid: ComponentDefinition = {
  name: "bento-grid",
  label: "Bento feature grid",
  description:
    "Features as a mosaic of tiles in four sizes; photo tiles carry their words on a soft shade, every tile lifts on hover.",
  version: 1,
  category: "features",
  tags: ["features", "services", "grid", "bento", "hover"],
  fields: {
    eyebrow: { kind: "text", label: "Small line above", maxLength: 60, optional: true },
    headline: { kind: "text", label: "Headline", maxLength: 100 },
    intro: { kind: "text", label: "Introduction", maxLength: 240, multiline: true, optional: true },
    tiles: {
      kind: "list",
      label: "Tiles",
      min: 1,
      max: 9,
      itemLabel: "title",
      fields: {
        title: { kind: "text", label: "Title", maxLength: 60 },
        text: { kind: "text", label: "Text", maxLength: 180, multiline: true, optional: true },
        photo: { kind: "image", label: "Photo (optional)", optional: true },
        size: {
          kind: "select",
          label: "Size",
          options: [
            { value: "standard", label: "Standard" },
            { value: "wide", label: "Wide" },
            { value: "tall", label: "Tall" },
            { value: "feature", label: "Feature (large)" },
          ],
        },
        link: { kind: "link", label: "Link (optional)", optional: true },
      },
    },
  },
  defaults: {
    eyebrow: "What we do",
    headline: "Everything a small team needs, under one roof",
    intro: "Desks, rooms and help when you need it — without signing your life away.",
    tiles: [
      {
        title: "Quiet desks",
        text: "Fixed or flexible desks in a calm, plant-filled room.",
        photo: photo("coworking", 640),
        size: "feature",
        link: { type: "url", url: "/desks" },
      },
      { title: "Fast fibre", text: "1 Gbps, wired and wireless.", size: "standard" },
      { title: "Meeting rooms", text: "Book by the hour from your phone.", size: "standard" },
      {
        title: "Events every week",
        text: "Breakfasts, workshops and the Friday demo night.",
        photo: photo("meetup", 640),
        size: "wide",
      },
      { title: "Bike storage", text: "Secure, covered, with a pump.", size: "tall" },
      { title: "Coffee that's good", text: "Local roasters, rotating monthly.", size: "standard" },
    ],
  },
  template: `<div class="bg">
  <div class="bg__head">
    {{#if eyebrow}}<p class="bg__eyebrow">{{eyebrow}}</p>{{/if}}
    <h2 class="bg__title">{{headline}}</h2>
    {{#if intro}}<p class="bg__intro">{{intro}}</p>{{/if}}
  </div>
  <ul class="bg__grid">
    {{#each tiles}}
    <li class="bg__tile" data-size="{{size}}">
      {{#if photo}}<div class="bg__media">{{image photo sizes="(max-width: 767px) 100vw, 50vw" fit="cover"}}</div>{{/if}}
      <div class="bg__body">
        <h3 class="bg__tile-title">{{title}}</h3>
        {{#if text}}<p class="bg__text">{{text}}</p>{{/if}}
      </div>
      {{#if link}}{{#link link class="bg__cover"}}<span class="bg__sr">{{title}}</span>{{/link}}{{/if}}
    </li>
    {{/each}}
  </ul>
</div>`,
  css: `.bg__head { max-width: 42em; margin-bottom: var(--os-space-xl); }
.bg__eyebrow {
  margin: 0 0 var(--os-space-sm);
  font-family: var(--os-font-label);
  font-size: var(--os-type-eyebrow-font-size);
  letter-spacing: var(--os-type-eyebrow-letter-spacing);
  text-transform: var(--os-type-eyebrow-text-transform);
  color: var(--os-eyebrow-color);
}
.bg__title {
  margin: 0;
  font-family: var(--os-font-heading);
  font-weight: var(--os-font-weight-heading);
  font-size: var(--os-type-h1-font-size);
  line-height: var(--os-type-h1-line-height);
  color: var(--os-color-heading);
  text-wrap: balance;
}
.bg__intro { margin: var(--os-space-sm) 0 0; color: var(--os-color-text-muted); font-size: var(--os-type-lead-font-size); }
.bg__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(11rem, auto);
  grid-auto-flow: dense;
  gap: var(--os-space-md);
  margin: 0;
  padding: 0;
  list-style: none;
}
.bg__tile {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  padding: var(--os-space-lg);
  border: 1px solid var(--os-color-border);
  border-radius: var(--os-radius-card);
  background: var(--os-color-surface);
  transition: transform var(--os-motion-duration-base, 240ms) var(--os-motion-ease, ease),
    box-shadow var(--os-motion-duration-base, 240ms) var(--os-motion-ease, ease);
}
.bg__tile[data-size="wide"] { grid-column: span 2; }
.bg__tile[data-size="tall"] { grid-row: span 2; }
.bg__tile[data-size="feature"] { grid-column: span 2; grid-row: span 2; }
.bg__tile:hover, .bg__tile:focus-within { transform: translateY(-4px); box-shadow: var(--os-shadow-md); }
.bg__tile:focus-within { outline: 2px solid var(--os-color-focus); outline-offset: 2px; }
.bg__media { position: absolute; inset: 0; }
.bg__media picture, .bg__media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--os-motion-duration-slow, 400ms) var(--os-motion-ease, ease);
}
.bg__tile:hover .bg__media img { transform: scale(1.05); }
.bg__media::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, color-mix(in oklab, var(--os-color-neutral-950) 78%, transparent), transparent 70%);
}
.bg__body { position: relative; z-index: 1; }
.bg__tile:has(.bg__media) .bg__tile-title, .bg__tile:has(.bg__media) .bg__text { color: var(--os-color-neutral-50); }
.bg__tile-title {
  margin: 0;
  font-family: var(--os-font-heading);
  font-size: var(--os-type-h3-font-size);
  line-height: var(--os-type-h3-line-height);
  color: var(--os-color-heading);
}
.bg__text { margin: var(--os-space-2xs) 0 0; color: var(--os-color-text-muted); }
.bg__cover { position: absolute; inset: 0; z-index: 2; border-radius: inherit; }
.bg__cover:focus-visible { outline: none; }
.bg__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 1199px) {
  .bg__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 767px) {
  .bg__grid { grid-template-columns: minmax(0, 1fr); grid-auto-rows: minmax(9rem, auto); }
  .bg__tile[data-size] { grid-column: auto; grid-row: auto; }
  .bg__tile[data-size="feature"], .bg__tile[data-size="tall"] { min-height: 18rem; }
}
@media (prefers-reduced-motion: reduce) {
  .bg__tile, .bg__media img { transition: none; }
  .bg__tile:hover, .bg__tile:focus-within { transform: none; }
  .bg__tile:hover .bg__media img { transform: none; }
}`,
  section: { width: "wide", padding: { d: "2xl", m: "xl" } },
  ai: {
    purpose: "A modern overview of features, services or amenities as a mosaic of tiles.",
    whenToUse:
      "4–8 short features where one or two deserve emphasis (feature/wide tiles), ideally with one or two photos.",
    avoid: "Long text in tiles; all tiles the same size (use a features preset instead).",
  },
};
