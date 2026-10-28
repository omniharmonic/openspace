import { TOKEN_VARS, TYPE_PRESET_NAMES } from "@omniharmonic/openspace-theme";

/**
 * `os.css` — the OpenSpace base stylesheet, shared by every site and cacheable forever per
 * renderer version. It references design tokens only through the documented `--os-*` contract
 * (`TOKEN_VARS`); per-instance values arrive as short private custom properties set inline by the
 * renderer (`--x`, `--cols`, `--pad`, `--aspect` …), never as `--os-*` names.
 *
 * Everything sits in cascade layers so a site's custom CSS (unlayered) always wins.
 * Breakpoints: mobile < 768px, tablet 768–1199px, desktop ≥ 1200px; the header collapses to
 * its menu button below 1024px.
 */

const T = TOKEN_VARS;
const v = (name: string) => `var(${name})`;

function typePreset(name: (typeof TYPE_PRESET_NAMES)[number]): string {
  const p = T.type[name];
  return [
    `font-family:${v(p["font-family"])}`,
    `font-size:${v(p["font-size"])}`,
    `line-height:${v(p["line-height"])}`,
    `letter-spacing:${v(p["letter-spacing"])}`,
    `font-weight:${v(p["font-weight"])}`,
    `text-transform:${v(p["text-transform"])}`,
  ].join(";");
}

const typeClasses = TYPE_PRESET_NAMES.map((n) => `.os-type-${n}{${typePreset(n)}}`).join("\n");

const c = T.color;
const button = (role: "primary" | "secondary" | "tertiary") => {
  const b = T.button[role];
  return `.os-button--${role}{--b-bg:${v(b.bg)};--b-color:${v(b.color)};--b-bc:${v(b["border-color"])};--b-bw:${v(b["border-width"])};--b-radius:${v(b.radius)};--b-px:${v(b["padding-x"])};--b-py:${v(b["padding-y"])};--b-td:${v(b["text-decoration"])};--b-icon:${v(b.icon)};--b-bg-h:${v(b["bg-hover"])};--b-color-h:${v(b["color-hover"])};--b-bc-h:${v(b["border-color-hover"])};--b-bg-a:${v(b["bg-active"])};--b-color-a:${v(b["color-active"])};--b-bc-a:${v(b["border-color-active"])}}`;
};

const M = T.motion;
const ease = v(M.ease);

export const BASE_CSS = `/* OpenSpace base stylesheet (@omniharmonic/openspace-renderer). Tokens: --os-* from @omniharmonic/openspace-theme. */
@layer os.reset, os.base, os.layout, os.components, os.behaviors, os.utilities;

@layer os.reset {
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;hanging-punctuation:first allow-end last}
body{margin:0;min-height:100vh;min-height:100svh;overflow-wrap:break-word;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
:where(h1,h2,h3,h4,h5,h6,p,figure,blockquote,dl,dd,ul,ol,pre){margin:0}
:where(img,picture,video,canvas,svg,iframe){display:block;max-width:100%}
:where(img,video){height:auto}
:where(input,button,textarea,select){font:inherit;color:inherit;letter-spacing:inherit}
:where(button){cursor:pointer}
:where(ul,ol)[class]{list-style:none;padding:0}
:where(table){border-collapse:collapse}
:where(summary){cursor:pointer}
[hidden]{display:none!important}
}

@layer os.base {
html{scroll-behavior:smooth;scroll-padding-top:var(--header-h,0px)}
body{background:${v(c.background)};color:${v(c.text)};${typePreset("body")}}
${typeClasses}
:where(h1){${typePreset("h1")}}
:where(h2){${typePreset("h2")}}
:where(h3){${typePreset("h3")}}
:where(h4,h5,h6){${typePreset("h4")}}
:where(h1,h2,h3,h4,h5,h6,.os-type-display){color:${v(c.heading)};text-wrap:balance}
:where(p,li,blockquote){text-wrap:pretty}
:where(a){color:${v(c.link)};text-decoration-line:underline;text-decoration-thickness:from-font;text-underline-offset:0.2em;transition:color ${v(M["duration-fast"])} ${ease}}
:where(a:hover){color:${v(c.heading)}}
:where(strong,b){font-weight:${v(T.font.weightStrong)}}
:focus-visible{outline:2px solid ${v(c.focus)};outline-offset:3px}
::selection{background:${v(c.accent)};color:${v(c["accent-text"])}}
:where(hr){border:0;border-top:1px solid ${v(c.border)};margin-block:${v(T.space.md)}}
:where(code,kbd,pre){font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.9em}
:where(code){background:${v(c.surface)};padding:0.1em 0.35em;border-radius:${v(T.radius.sm)}}
.os-visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.os-skip-link{position:absolute;z-index:1000;inset-inline-start:${v(T.space.xs)};top:${v(T.space.xs)};padding:${v(T.space["2xs"])} ${v(T.space.xs)};background:${v(c.background)};color:${v(c.heading)};border-radius:${v(T.radius.button)};box-shadow:${v(T.shadow.md)};transform:translateY(-200%);transition:transform ${v(M["duration-fast"])} ${ease}}
.os-skip-link:focus{transform:none}
.os-main:focus{outline:none}

/* Rich text flow */
.os-rich{display:flow-root}
.os-rich>*+*{margin-block-start:0.75em}
.os-rich>*+:is(h1,h2,h3,h4){margin-block-start:1.1em}
.os-rich>:is(h1,h2,h3,h4)+*{margin-block-start:max(0.6em,${v(T.space.xs)})}
.os-rich>:is(p,ul,ol,blockquote){max-inline-size:${v(T.measure)}}
.os-rich :is(ul,ol){padding-inline-start:1.25em}
.os-rich li+li{margin-block-start:0.35em}
.os-rich li::marker{color:${v(c["text-muted"])}}
.os-rich blockquote{border-inline-start:2px solid ${v(c.accent)};padding-inline-start:1.1em;font-family:${v(T.font.heading)};font-size:${v(T.type.lead["font-size"])};line-height:${v(T.type.lead["line-height"])};color:${v(c.heading)}}
.os-rich .os-type-eyebrow{color:${v(c["text-muted"])}}
.os-rich :where(.os-type-lead){color:${v(c.text)}}
.os-highlight{background:var(--hl,${v(T.accent[200])});color:${v(T.neutral[950])};padding-inline:0.15em;border-radius:2px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
}

@layer os.layout {
/* Page & sections */
.os-page{--bar-h:calc(max(var(--mlogo-h,2rem),2.75rem) + 1.5rem);--header-h:var(--bar-h);position:relative;display:flex;flex-direction:column;min-height:100vh;min-height:100svh}
.os-main{flex:1}
.os-section{position:relative;isolation:isolate;display:flex;flex-direction:column;justify-content:center;background:var(--bg,${v(c.background)});color:${v(c.text)};padding-block:var(--mpad,${v(T.section.padY)});min-height:var(--mminh,auto);overflow-x:clip}
.os-section[data-os-hidden],.os-block[data-os-hidden]{opacity:0.45}
.os-section__bg{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
.os-section__bg>.os-img,.os-section__media{position:absolute;inset:0;width:100%;height:100%;border-radius:0}
.os-section__bg .os-img__img,.os-section__video{width:100%;height:100%;object-fit:cover;object-position:var(--focal,50% 50%)}
.os-section__overlay{position:absolute;inset:0;background:var(--overlay);opacity:var(--overlay-opacity)}
.os-section__inner{width:100%;margin-inline:auto;--content-max:${v(T.width.content)}}
.os-w-narrow{--content-max:${v(T.width.narrow)}}
.os-w-wide{--content-max:${v(T.width.wide)}}
.os-w-full{--content-max:100vw}

/* Stack mode: 1–4 columns, per-breakpoint ratios (--cols/--tcols/--mcols) and order (--to/--mo) */
.os-stack{display:grid;max-inline-size:calc(var(--content-max) + 2 * ${v(T.section.gutter)});padding-inline:${v(T.section.gutter)};grid-template-columns:var(--mcols,minmax(0,1fr));row-gap:var(--gap,${v(T.section.blockGap)});column-gap:var(--gap,${v(T.space.xl)});align-items:start}
.os-w-full.os-stack{max-inline-size:none}
.os-stack.is-bleed{padding-inline:0}
.os-stack.is-align-center{align-items:center}
.os-stack.is-align-end{align-items:end}
.os-stack.is-align-stretch{align-items:stretch}
.os-col{display:flex;flex-direction:column;gap:calc(${v(T.section.blockGap)} * 0.6);min-width:0;order:var(--mo,0)}
.os-stack.is-align-center>.os-col{justify-content:center}

/* Grid mode (arch §3.3): 8 columns on mobile, 24 from tablet up; rows grow to fit content */
.os-grid{--row-unit:1.25rem;--grid-gap:${v(T.space["2xs"])};display:grid;grid-template-columns:[full-start] ${v(T.section.gutter)} [content-start] repeat(8,minmax(0,1fr)) [content-end] ${v(T.section.gutter)} [full-end];grid-template-rows:repeat(var(--mrows,1),minmax(var(--row-unit),auto));grid-auto-rows:minmax(var(--row-unit),auto);column-gap:var(--grid-gap)}
.os-grid__item{grid-column:var(--mcs,calc(var(--mx) + 1))/var(--mce,calc(var(--mx) + 1 + var(--mw)));grid-row:var(--mrs,var(--my))/var(--mre,span var(--mh));z-index:var(--mz,1);min-width:0;display:flex;flex-direction:column}
.os-grid__item>.os-block{flex:1}
.os-grid__item.os-grid__item--unplaced{grid-column:content-start/content-end;grid-row:auto}

@media (min-width:768px){
.os-page{--bar-h:calc(max(var(--tlogo-h,2.5rem),2.75rem) + 2rem)}
.os-section{padding-block:var(--tpad,${v(T.section.padY)});min-height:var(--tminh,auto)}
.os-stack{grid-template-columns:var(--tcols,minmax(0,1fr))}
.os-col{order:var(--to,0)}
.os-grid{--row-unit:1.5rem;grid-template-columns:[full-start] minmax(${v(T.section.gutter)},1fr) [content-start] repeat(24,minmax(0,calc((var(--content-max) - 23 * var(--grid-gap)) / 24))) [content-end] minmax(${v(T.section.gutter)},1fr) [full-end];grid-template-rows:repeat(var(--trows,1),minmax(var(--row-unit),auto))}
.os-grid__item{grid-column:var(--tcs,calc(var(--tx) + 1))/var(--tce,calc(var(--tx) + 1 + var(--tw)));grid-row:var(--trs,var(--ty))/var(--tre,span var(--th));z-index:var(--tz,1)}
}
@media (min-width:1200px){
.os-page{--bar-h:calc(max(var(--logo-h,2.5rem),2.75rem) + 2rem)}
.os-section{padding-block:var(--pad,${v(T.section.padY)});min-height:var(--minh,auto)}
.os-stack{grid-template-columns:var(--cols,minmax(0,1fr))}
.os-col{order:0}
.os-grid{grid-template-rows:repeat(var(--rows,1),minmax(var(--row-unit),auto))}
.os-grid__item{grid-column:var(--cs,calc(var(--x) + 1))/var(--ce,calc(var(--x) + 1 + var(--w)));grid-row:var(--rs,var(--y))/var(--re,span var(--h));z-index:var(--z,1)}
}

/* Blocks: container-query context + token style overrides */
.os-block{position:relative;min-width:0;container-type:inline-size;container-name:block}
.os-block.has-pad{padding:var(--mbpad)}
.os-block.has-radius{border-radius:var(--radius);overflow:hidden}
.os-block.has-shadow{box-shadow:var(--shadow)}
.os-block.os-themed{background:${v(c.background)};color:${v(c.text)}}
.os-block.os-themed:not(.has-pad){padding:${v(T.space.md)}}
.os-border-subtle{border:1px solid ${v(c.border)}}
.os-border-strong{border:1.5px solid ${v(c["text-muted"])}}
.os-malign-start{text-align:start}.os-malign-center{text-align:center}.os-malign-end{text-align:end}
.os-malign-center .os-rich>*{margin-inline:auto}
.os-malign-end .os-rich>*{margin-inline-start:auto}
@media (min-width:768px){
.os-block.has-pad{padding:var(--tbpad)}
.os-talign-start{text-align:start}.os-talign-center{text-align:center}.os-talign-end{text-align:end}
.os-talign-start .os-rich>*{margin-inline:0}
.os-talign-center .os-rich>*{margin-inline:auto}
.os-talign-end .os-rich>*{margin-inline:auto 0}
}
@media (min-width:1200px){
.os-block.has-pad{padding:var(--bpad)}
.os-align-start{text-align:start}.os-align-center{text-align:center}.os-align-end{text-align:end}
.os-align-start .os-rich>*{margin-inline:0}
.os-align-center .os-rich>*{margin-inline:auto}
.os-align-end .os-rich>*{margin-inline:auto 0}
}
/* Large type never overflows a narrow column */
@container block (max-width:34rem){
.os-type-display{font-size:min(${v(T.type.display["font-size"])},16cqi)}
.os-type-h1{font-size:min(${v(T.type.h1["font-size"])},12cqi)}
}
/* Layout helpers for block authors */
.os-cluster{display:flex;flex-wrap:wrap;gap:${v(T.space.xs)};align-items:center}
.os-malign-center .os-cluster{justify-content:center}
.os-malign-end .os-cluster{justify-content:flex-end}
@media (min-width:1200px){.os-align-start .os-cluster{justify-content:flex-start}.os-align-center .os-cluster{justify-content:center}.os-align-end .os-cluster{justify-content:flex-end}}
.os-flow>*+*{margin-block-start:${v(T.space.xs)}}
.os-cards{display:grid;gap:${v(T.space.sm)};grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))}
.os-split{display:grid;gap:${v(T.space.md)};align-items:center}
@container block (min-width:40rem){.os-split{grid-template-columns:1fr 1fr}}
.os-card{background:${v(c["surface-raised"])};color:${v(c.text)};border-radius:${v(T.radius.card)};padding:${v(T.space.sm)}}
.os-muted{color:${v(c["text-muted"])}}
.os-block-missing{padding:${v(T.space.xs)};border:1px dashed ${v(c.danger)};border-radius:${v(T.radius.sm)};color:${v(c.danger)};${typePreset("small")}}
}

@layer os.components {
/* Images & treatments (theme image vars, overridden per block by .os-image-<treatment>) */
.os-img{position:relative;display:block;isolation:isolate;overflow:hidden;border-radius:${v(T.image.radius)};clip-path:${v(T.image["clip-path"])};aspect-ratio:var(--aspect,${v(T.image["aspect-ratio"])});padding:${v(T.image["frame-padding"])};background:${v(T.image["frame-color"])};border:${v(T.image["frame-border"])}}
.os-img>picture{display:block;height:100%;overflow:hidden;border-radius:inherit;background:${v(T.image.backdrop)}}
.os-img__img{width:100%;height:100%;object-fit:cover;object-position:var(--focal,50% 50%);filter:${v(T.image.filter)};mix-blend-mode:${v(T.image.blend)};transition:transform ${v(M["duration-slow"])} ${ease}}
.os-img__img.has-placeholder{background-size:cover;background-position:center}
.os-img.is-contain .os-img__img{object-fit:contain}
.os-img.is-unsized{aspect-ratio:var(--aspect,3 / 2)}
.os-img.is-fill{height:100%;min-height:calc(var(--row-unit,1.5rem) * 4);aspect-ratio:auto}
.os-img.is-fill>picture{position:absolute;inset:${v(T.image["frame-padding"])}}
.os-grid__item>.os-block>:only-child:has(>.os-img.is-fill),.os-grid__item>.os-block>.os-img.is-fill{height:100%}
.os-img::after{content:"";position:absolute;inset:${v(T.image["frame-padding"])};z-index:1;pointer-events:none;border-radius:inherit;background:${v(T.image.overlay)};mix-blend-mode:${v(T.image["overlay-blend"])};opacity:${v(T.image["overlay-opacity"])}}
@media (hover:hover){a:hover .os-img__img,.os-img.is-zoom:hover .os-img__img{transform:scale(${v(M["hover-scale"])})}}
.os-block.has-radius .os-img{border-radius:var(--radius)}

/* Buttons (Site Styles button system: per-role theme button vars) */
.os-button{display:inline-flex;align-items:center;justify-content:center;gap:0.5em;min-height:2.75rem;padding:var(--b-py) var(--b-px);background:var(--b-bg);color:var(--b-color);border:var(--b-bw) solid var(--b-bc);border-radius:var(--b-radius);text-decoration-line:var(--b-td);text-decoration-thickness:1px;text-underline-offset:0.3em;${typePreset("button")};text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background-color ${v(M["duration-fast"])} ${ease},color ${v(M["duration-fast"])} ${ease},border-color ${v(M["duration-fast"])} ${ease},transform ${v(M["duration-fast"])} ${ease}}
.os-button:hover{background:var(--b-bg-h);color:var(--b-color-h);border-color:var(--b-bc-h)}
.os-button:active{background:var(--b-bg-a);color:var(--b-color-a);border-color:var(--b-bc-a)}
.os-button__label::after{content:var(--b-icon);display:inline-block;margin-inline-start:0.4em;transition:transform ${v(M["duration-base"])} ${ease}}
.os-button:hover .os-button__label::after{transform:translateX(0.2em)}
.os-button[disabled],.os-button[aria-disabled=true]{opacity:0.55;pointer-events:none}
.os-button.is-busy{cursor:progress}
${button("primary")}
${button("secondary")}
${button("tertiary")}

/* Forms: input outlines use text-muted (border is decorative only) for 3:1 UI contrast */
.os-form{display:grid;gap:${v(T.space.sm)}}
.os-form__row{display:grid;gap:${v(T.space.sm)}}
@container block (min-width:32rem){.os-form__row{grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))}}
.os-field{display:grid;gap:${v(T.space["3xs"])};min-width:0}
.os-label{${typePreset("small")};font-weight:${v(T.font.weightStrong)};color:${v(c.heading)}}
.os-label .os-required{color:${v(c.danger)};margin-inline-start:0.15em}
.os-input,.os-textarea,.os-select{display:block;width:100%;min-height:3rem;padding:0.7em 0.95em;background:${v(c.background)};color:${v(c.text)};border:1px solid ${v(c["text-muted"])};border-radius:${v(T.radius.input)};${typePreset("body")};line-height:1.4;transition:border-color ${v(M["duration-fast"])} ${ease},box-shadow ${v(M["duration-fast"])} ${ease}}
.os-textarea{min-height:8rem;resize:vertical}
.os-select{appearance:none;padding-inline-end:2.5em;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 1.2em) 55%,calc(100% - 0.85em) 55%;background-size:0.35em 0.35em;background-repeat:no-repeat}
/* Single-line selects match text inputs exactly (appearance:none selects otherwise size from the font's own metrics). */
.os-select:not([multiple]){height:calc(2.8em + 2px)}
.os-input::placeholder,.os-textarea::placeholder{color:${v(c["text-muted"])};opacity:1}
.os-input:hover,.os-textarea:hover,.os-select:hover{border-color:${v(c.text)}}
.os-input:focus-visible,.os-textarea:focus-visible,.os-select:focus-visible{outline:2px solid ${v(c.focus)};outline-offset:1px;border-color:${v(c.focus)}}
.os-input[aria-invalid=true],.os-textarea[aria-invalid=true],.os-select[aria-invalid=true]{border-color:${v(c.danger)};border-width:1.5px}
.os-check{display:flex;align-items:flex-start;gap:0.6em;cursor:pointer}
.os-check input{flex:none;width:1.25em;height:1.25em;margin:0.15em 0 0;accent-color:${v(c.accent)}}
.os-field__help{${typePreset("small")};color:${v(c["text-muted"])}}
.os-field__error{${typePreset("small")};color:${v(c.danger)}}
.os-field__error:empty{display:none}
.os-form__status{padding:${v(T.space.xs)} ${v(T.space.sm)};border-radius:${v(T.radius.input)};border:1.5px solid currentColor;${typePreset("small")}}
.os-form__status:empty{display:none}
.os-form__status[data-state=success]{color:${v(c.success)}}
.os-form__status[data-state=error]{color:${v(c.danger)}}
.os-form__status a{color:inherit}
.os-hp{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}

/* Announcement bar */
.os-announcement{position:relative;display:flex;align-items:center;justify-content:center;gap:${v(T.space.xs)};padding:0.65rem calc(${v(T.section.gutter)} + 2.5rem);background:${v(c.background)};color:${v(c.text)};${typePreset("small")};text-align:center}
.os-announcement__link{color:inherit;text-decoration-line:underline}
.os-announcement__close{position:absolute;inset-inline-end:calc(${v(T.section.gutter)} - 0.5rem);top:50%;translate:0 -50%;display:grid;place-items:center;width:2.5rem;height:2.5rem;padding:0;border:0;border-radius:${v(T.radius.full)};background:transparent;color:inherit}
.os-announcement__close:hover{background:${v(c.surface)}}

/* Header */
.os-header{position:relative;z-index:50;background:${v(c.background)};color:${v(c.text)};${typePreset("nav")};transition:background-color ${v(M["duration-base"])} ${ease},box-shadow ${v(M["duration-base"])} ${ease},color ${v(M["duration-base"])} ${ease}}
.os-header.is-sticky{position:sticky;top:0}
.os-header.is-scrolled{box-shadow:0 1px 0 ${v(c.border)},${v(T.shadow.sm)}}
.has-overlay-header .os-header{background:transparent;margin-bottom:calc(-1 * var(--header-h))}
.has-overlay-header .os-header.is-scrolled{background:${v(c.background)}}
.has-overlay-header .os-section--first{padding-top:calc(var(--mpad,${v(T.section.padY)}) + var(--header-h))}
@media (min-width:768px){.has-overlay-header .os-section--first{padding-top:calc(var(--tpad,${v(T.section.padY)}) + var(--header-h))}}
@media (min-width:1200px){.has-overlay-header .os-section--first{padding-top:calc(var(--pad,${v(T.section.padY)}) + var(--header-h))}}
.os-header__bar{display:flex;align-items:center;gap:${v(T.space.sm)};min-height:var(--bar-h);max-inline-size:calc(${v(T.width.wide)} + 2 * ${v(T.section.gutter)});margin-inline:auto;padding:0.75rem ${v(T.section.gutter)}}
.os-header__brand{display:inline-flex;align-items:center;flex:0 1 auto;min-width:0;color:${v(c.heading)};text-decoration:none;margin-inline-end:auto}
.os-header__logo{height:var(--mlogo-h,2rem);width:auto;border-radius:0;background:none}
.os-header__logo .os-img__img{height:100%;width:auto;object-fit:contain}
.os-header__title{${typePreset("wordmark")};text-wrap:balance;overflow-wrap:break-word;max-inline-size:30ch}
.os-header__brand--split,.os-nav,.os-header__tagline{display:none}
.os-header__actions{display:none;align-items:center;gap:${v(T.space.xs)}}
.os-header__actions .os-button{min-height:2.5rem;padding-block:0.5rem}
/* A short label stays on one line beside narrow columns (it wraps on phones if it must). */
@media (min-width:768px){.os-button{white-space:nowrap;flex-shrink:0}}
.os-header__toggle,.os-header__cart,.os-menu__close{position:relative;display:inline-grid;place-items:center;width:2.75rem;height:2.75rem;padding:0;border:0;border-radius:${v(T.radius.full)};background:transparent;color:inherit}
.os-header__toggle:hover,.os-header__cart:hover,.os-menu__close:hover{background:${v(c.surface)}}
html:not(.os-js) .os-header__toggle{display:none}
.os-header__cart-count{position:absolute;top:0.2rem;inset-inline-end:0.1rem;min-width:1.15rem;height:1.15rem;padding-inline:0.25rem;border-radius:${v(T.radius.full)};background:${v(c.accent)};color:${v(c["accent-text"])};font-size:0.7rem;line-height:1.15rem;text-align:center}
.os-header__cart-count:empty{display:none}
.os-social{display:flex;flex-wrap:wrap;gap:0.25rem;align-items:center}
.os-social__link{display:inline-grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:${v(T.radius.full)};color:inherit}
.os-social__link:hover{background:${v(c.surface)};color:${v(c.heading)}}

/* Desktop navigation */
.os-nav{min-width:0}
.os-nav__list{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;column-gap:clamp(1rem,2vw,2.25rem);row-gap:0}
.os-nav__link{position:relative;display:inline-flex;align-items:center;gap:0.3em;padding-block:0.5rem;color:inherit;text-decoration:none;white-space:nowrap;list-style:none}
.os-nav__link::-webkit-details-marker{display:none}
.os-nav__link::after{content:"";position:absolute;inset-inline:0;bottom:0.2rem;height:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform ${v(M["duration-base"])} ${ease}}
.os-nav__link:hover::after,.os-nav__link[aria-current=page]::after,.os-nav__link.is-current::after{transform:scaleX(1)}
.os-nav__link:hover{color:${v(c.heading)}}
.os-nav__item--folder{position:relative}
.os-nav__chevron{transition:rotate ${v(M["duration-fast"])} ${ease}}
.os-nav__folder[open] .os-nav__chevron{rotate:180deg}
.os-nav .os-nav__sub{position:absolute;top:calc(100% + 0.5rem);inset-inline-start:-1rem;min-width:13rem;padding:0.5rem;background:${v(c["surface-raised"])};color:${v(c.text)};border-radius:${v(T.radius.card)};box-shadow:${v(T.shadow.lg)}}
.os-nav__sublink{display:block;padding:0.55rem 0.75rem;border-radius:${v(T.radius.sm)};color:inherit;text-decoration:none}
.os-nav__sublink:hover,.os-nav__sublink[aria-current=page]{background:${v(c.surface)};color:${v(c.heading)}}

/* Mobile menu (no JS: shown inline under the bar) */
.os-menu{padding:0 ${v(T.section.gutter)} ${v(T.space.md)};background:${v(c.background)};color:${v(c.text)}}
.os-menu__head{display:none}
.os-menu__list{display:grid;gap:0.25rem}
.os-menu__list .os-nav__link{font-size:${v(T.type.h4["font-size"])};font-family:${v(T.font.heading)};padding-block:0.6rem}
.os-menu__list .os-nav__link::after{display:none}
.os-menu .os-nav__sub{padding:0 0 0.5rem 1rem}
.os-menu__foot{display:flex;flex-wrap:wrap;align-items:center;gap:${v(T.space.xs)};margin-top:${v(T.space.md)};padding-top:${v(T.space.sm)};border-top:1px solid ${v(c.border)}}
.os-js .os-menu{position:fixed;z-index:60;overflow-y:auto;overscroll-behavior:contain;visibility:hidden;transition:transform ${v(M["duration-slow"])} ${ease},opacity ${v(M["duration-base"])} ${ease},visibility 0s linear ${v(M["duration-slow"])}}
.os-js .os-menu.is-open{visibility:visible;transform:none;opacity:1;transition-delay:0s}
.os-js .os-menu__head{display:flex;align-items:center;justify-content:space-between;min-height:var(--bar-h);margin-bottom:${v(T.space.xs)}}
.os-menu__title{font-family:${v(T.font.heading)};color:${v(c.heading)}}
.os-js .os-menu--slide,.os-js .os-menu--drawer{top:0;bottom:0;width:min(26rem,88vw);box-shadow:${v(T.shadow.lg)}}
.os-js .os-menu--slide{inset-inline-end:0;transform:translateX(100%)}
.os-js .os-menu--drawer{inset-inline-start:0;transform:translateX(-100%)}
.os-js .os-menu--fullscreen{inset:0;opacity:0}
.os-js .os-menu--fullscreen .os-menu__list .os-nav__link{font-size:${v(T.type.h2["font-size"])}}
.os-js .os-menu--dropdown{position:absolute;top:100%;inset-inline:0;max-height:calc(100dvh - var(--header-h));opacity:0;transform:translateY(-0.5rem);box-shadow:${v(T.shadow.md)}}
.os-js .os-menu--dropdown .os-menu__head{display:none}
.os-header.is-menu-open::before{content:"";position:fixed;inset:0;z-index:55;background:${v(T.neutral[950])};opacity:0.45}
.os-header.has-menu-dropdown.is-menu-open::before,.os-header.has-menu-fullscreen.is-menu-open::before{display:none}

@media (min-width:1024px){
.os-header:not(.is-drawer) .os-header__toggle{display:none}
.os-header:not(.is-drawer) .os-menu{display:none}
.os-header:not(.is-drawer) .os-nav{display:block}
.os-header__actions{display:flex;flex:none}
.os-header--classic-left .os-nav{margin-inline-start:auto}
.os-header--transparent-overlay .os-nav{margin-inline-start:auto}
.os-header--classic-center .os-header__bar{display:grid;grid-template-columns:1fr auto 1fr}
.os-header--classic-center .os-header__actions{justify-self:end}
.os-header--split-nav .os-header__brand--main{display:none}
.os-header--split-nav .os-nav{flex:1}
.os-header.os-header--split-nav .os-nav--split{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:clamp(1.5rem,3vw,3rem)}
.os-header--split-nav .os-nav__list--start{justify-content:flex-end}
.os-header--split-nav .os-header__brand--split{display:inline-flex;margin:0}
.os-header--nav-left-logo-center .os-header__bar{position:relative}
.os-header--nav-left-logo-center .os-header__brand{position:absolute;inset-inline-start:50%;translate:-50% 0;margin:0;max-inline-size:34%}
[dir=rtl] .os-header--nav-left-logo-center .os-header__brand{translate:50% 0}
.os-header--nav-left-logo-center .os-nav{order:-1;margin-inline-end:auto;max-inline-size:33%}
.os-header--nav-left-logo-center .os-nav__list{justify-content:flex-start}
.os-page:has(>.os-header--sidebar-left){--sidebar-w:clamp(16rem,28vw,28rem);padding-inline-start:var(--sidebar-w)}
.os-header.os-header--sidebar-left{position:fixed;inset-block:0;inset-inline-start:0;inline-size:var(--sidebar-w);overflow-y:auto;overscroll-behavior:contain}
.os-header--sidebar-left .os-header__bar{flex-direction:column;align-items:flex-start;gap:${v(T.space.sm)};min-height:0;max-inline-size:none;margin:0;padding:clamp(2rem,4vw,4rem) clamp(1.5rem,3.5vw,3.5rem)}
.os-header--sidebar-left .os-header__brand{flex-direction:column;align-items:flex-start;gap:0.75rem;margin:0}
.os-header--sidebar-left .os-header__logo{height:var(--logo-h,auto);max-block-size:var(--logo-h,8rem);max-inline-size:100%;width:auto}
.os-header.os-header--sidebar-left .os-header__title{white-space:normal;max-inline-size:none}
.os-header--sidebar-left .os-header__tagline{display:block;margin:0;font-size:${v(T.type.small["font-size"])};line-height:${v(T.type.small["line-height"])};color:${v(c["text-muted"])}}
.os-header--sidebar-left .os-nav{inline-size:100%;margin-block-start:${v(T.space.sm)}}
.os-header--sidebar-left .os-nav__list{flex-direction:column;align-items:stretch;row-gap:0}
.os-header--sidebar-left .os-nav__link{display:flex;padding-block:0.55rem;border-bottom:1px solid ${v(c.border)};white-space:normal}
.os-header--sidebar-left .os-nav__link::after{display:none}
.os-header--sidebar-left .os-nav .os-nav__sub{position:static;min-width:0;padding:0 0 0 1rem;background:none;box-shadow:none;color:inherit}
.os-header--sidebar-left .os-header__actions{flex-direction:column;align-items:flex-start}
.os-header--logo-center-nav-below,.os-header--stacked{--header-row:3rem}
.os-header--logo-center-nav-below .os-header__bar{display:grid;grid-template-columns:1fr auto 1fr;grid-template-areas:". brand actions" "nav nav nav";row-gap:0;padding-bottom:0}
.os-header--logo-center-nav-below .os-header__brand{grid-area:brand;margin:0}
.os-header--logo-center-nav-below .os-header__actions{grid-area:actions;justify-self:end}
.os-header.os-header--logo-center-nav-below .os-nav{grid-area:nav;justify-self:center;min-height:var(--header-row);display:flex;align-items:center}
.os-header--stacked .os-header__bar{display:grid;grid-template-columns:1fr auto;grid-template-areas:"brand actions" "nav nav";padding-bottom:0}
.os-header--stacked .os-header__brand{grid-area:brand}
.os-header--stacked .os-header__actions{grid-area:actions}
.os-header.os-header--stacked .os-nav{grid-area:nav;min-height:var(--header-row);display:flex;align-items:center;border-top:1px solid ${v(c.border)}}
.os-page:has(.os-header--logo-center-nav-below,.os-header--stacked){--header-h:calc(var(--bar-h) + 3rem)}
.os-header.is-drawer .os-header__actions .os-button{display:none}
.os-header:not(.is-drawer) .os-header__brand{flex:none}
.os-header:not(.is-drawer) .os-header__title{white-space:nowrap;max-inline-size:none}
}
/* A long menu that only fits on large screens: the menu button until then. */
@media (min-width:1024px) and (max-width:1439.98px){
.os-header.os-header--nav-wide .os-nav{display:none}
.os-header.os-header--nav-wide .os-menu{display:block}
.os-js .os-header.os-header--nav-wide .os-header__toggle{display:inline-grid}
}
.os-header__logo{height:var(--mlogo-h,2rem)}
@media (min-width:768px){.os-header__logo{height:var(--tlogo-h,2.5rem)}}
@media (min-width:1200px){.os-header__logo{height:var(--logo-h,2.5rem)}}

/* A raised content card over the page background (Site Styles → layout.surface "card"). */
.os-page.has-surface-card{background:var(--page-bg,${v(c.surface)})}
@media (min-width:768px){
.has-surface-card>.os-main{flex:none;margin:8.3333% 8.3333% 0;padding-block:8.3333% 0;background:${v(c.background)};box-shadow:0 0 1px rgb(0 0 0 / 0.15)}
.has-surface-card>.os-footer{margin:8.3333% 8.3333% 8.3333%;box-shadow:0 0 1px rgb(0 0 0 / 0.15)}
}

/* Footer */
.os-footer{margin-top:auto}
.os-footer .os-footer__section:not(.has-pad){padding-block:${v(T.space["2xl"])}}

/* Popup */
.os-popup{width:min(34rem,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);padding:0;border:0;border-radius:${v(T.radius.card)};background:${v(c.background)};color:${v(c.text)};box-shadow:${v(T.shadow.lg)}}
.os-popup::backdrop{background:rgb(0 0 0 / 0.5)}
.os-popup__body{display:grid;gap:${v(T.space.xs)};padding:${v(T.space.lg)} ${v(T.space.md)} ${v(T.space.md)}}
.os-popup__close{position:absolute;top:0.5rem;inset-inline-end:0.5rem;display:grid;place-items:center;width:2.75rem;height:2.75rem;border:0;border-radius:${v(T.radius.full)};background:transparent;color:inherit}
.os-popup__close:hover{background:${v(c.surface)}}
.os-popup__image{margin:calc(-1 * ${v(T.space.lg)}) calc(-1 * ${v(T.space.md)}) ${v(T.space.xs)};border-radius:${v(T.radius.card)} ${v(T.radius.card)} 0 0;overflow:hidden}
.os-popup__text{color:${v(c["text-muted"])}}
.os-popup__actions{display:flex;flex-wrap:wrap;gap:${v(T.space.xs)};margin-top:${v(T.space.xs)}}
.os-popup .os-block{margin-top:${v(T.space.xs)}}
}

@layer os.behaviors {
/* Carousel: scroll-snap track + buttons */
.os-carousel{position:relative;--slide:85%}
@container block (min-width:40rem){.os-carousel{--slide:calc((100% - ${v(T.space.sm)}) / 2)}}
@container block (min-width:64rem){.os-carousel{--slide:calc((100% - 2 * ${v(T.space.sm)}) / 3)}}
.os-carousel__track{display:grid;grid-auto-flow:column;grid-auto-columns:var(--slide);gap:${v(T.space.sm)};overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.os-carousel__track::-webkit-scrollbar{display:none}
.os-carousel__track>*{scroll-snap-align:start;min-width:0}
.os-carousel__controls{display:flex;justify-content:flex-end;gap:0.5rem;margin-top:${v(T.space.xs)}}
.os-carousel__btn{display:inline-grid;place-items:center;width:2.75rem;height:2.75rem;padding:0;border:1.5px solid ${v(c["text-muted"])};border-radius:${v(T.radius.full)};background:transparent;color:${v(c.text)}}
.os-carousel__btn:hover:not([disabled]){border-color:${v(c.text)};background:${v(c.surface)}}
.os-carousel__btn[disabled]{opacity:0.35;cursor:default}
html:not(.os-js) .os-carousel__controls{display:none}

/* Accordion (native details) */
.os-accordion__item{border-bottom:1px solid ${v(c["text-muted"])}}
.os-accordion__item>summary{display:flex;align-items:center;justify-content:space-between;gap:${v(T.space.xs)};padding-block:${v(T.space.xs)};list-style:none;${typePreset("h4")};color:${v(c.heading)}}
.os-accordion__item>summary::-webkit-details-marker{display:none}
.os-accordion__item>summary::after{content:"";flex:none;width:0.6em;height:0.6em;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;rotate:45deg;translate:0 -0.15em;transition:rotate ${v(M["duration-base"])} ${ease}}
.os-accordion__item[open]>summary::after{rotate:225deg;translate:0 0.15em}
.os-accordion__content{padding-bottom:${v(T.space.sm)};overflow:hidden}

/* Tabs */
.os-tabs__list{display:flex;gap:${v(T.space.sm)};overflow-x:auto;border-bottom:1px solid ${v(c.border)};scrollbar-width:none}
.os-tabs__tab{flex:none;min-height:2.75rem;padding:0.5rem 0.1rem;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;background:none;color:${v(c["text-muted"])};${typePreset("nav")}}
.os-tabs__tab:hover{color:${v(c.text)}}
.os-tabs__tab[aria-selected=true]{color:${v(c.heading)};border-bottom-color:${v(c.accent)}}
.os-tabs__panel{padding-top:${v(T.space.sm)}}
.os-js .os-tabs__panel+.os-tabs__panel{margin:0}

/* Marquee (animates only once the behavior runs; static and wrapped otherwise) */
.os-marquee{overflow:hidden;position:relative}
.os-marquee__track{display:flex;flex-wrap:wrap;gap:${v(T.space.lg)};align-items:center}
.os-marquee.is-running .os-marquee__track{flex-wrap:nowrap;width:max-content;animation:os-marquee var(--marquee-duration,40s) linear infinite}
.os-marquee.is-paused .os-marquee__track{animation-play-state:paused}
.os-marquee__toggle{position:absolute;inset-inline-end:0.25rem;bottom:0.25rem;width:2rem;height:2rem;display:grid;place-items:center;border:0;border-radius:${v(T.radius.full)};background:${v(c.background)};color:${v(c.text)};opacity:0.7}
.os-marquee__toggle:hover,.os-marquee__toggle:focus-visible{opacity:1}
@keyframes os-marquee{to{transform:translateX(-50%)}}

/* Lightbox */
.os-lightbox{width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:${v(c.background)};color:${v(c.text)}}
.os-lightbox::backdrop{background:rgb(0 0 0 / 0.85)}
.os-lightbox__figure{display:grid;place-items:center;height:100%;padding:3.5rem 1rem;margin:0}
.os-lightbox__img{max-width:100%;max-height:calc(100dvh - 8rem);object-fit:contain}
.os-lightbox__caption{margin-top:0.75rem;${typePreset("small")};color:${v(c["text-muted"])};text-align:center}
.os-lightbox__btn{position:absolute;display:grid;place-items:center;width:3rem;height:3rem;border:0;border-radius:${v(T.radius.full)};background:${v(c.surface)};color:${v(c.text)};font-size:1.25rem}
.os-lightbox__btn:hover{background:${v(c["surface-raised"])}}
.os-lightbox__close{top:0.75rem;inset-inline-end:0.75rem}
.os-lightbox__prev{top:50%;inset-inline-start:0.75rem;translate:0 -50%}
.os-lightbox__next{top:50%;inset-inline-end:0.75rem;translate:0 -50%}

/* Video lite */
.os-video{position:relative;aspect-ratio:var(--aspect,16 / 9);overflow:hidden;border-radius:${v(T.radius.image)};background:${v(T.neutral[950])}}
.os-video>img,.os-video>iframe,.os-video>video{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover}
.os-video__play{position:absolute;inset:0;display:grid;place-items:center;width:100%;border:0;background:transparent;color:${v(c["accent-text"])}}
.os-video__play>span{display:grid;place-items:center;width:4.5rem;height:4.5rem;border-radius:${v(T.radius.full)};background:${v(c.accent)};box-shadow:${v(T.shadow.lg)};transition:transform ${v(M["duration-base"])} ${ease}}
.os-video__play:hover>span{transform:scale(1.06)}

/* Before/after: the before image is clipped at --pos; an invisible full-size range input drives it.
   Without JavaScript the two images sit side by side. */
.os-compare{position:relative;--pos:50%}
.os-compare__stage{position:relative;display:grid;overflow:hidden;border-radius:${v(T.radius.image)}}
.os-compare__stage>*{grid-area:1/1;min-width:0}
.os-compare__before{clip-path:inset(0 calc(100% - var(--pos)) 0 0);z-index:1}
.os-compare__handle{position:absolute;z-index:2;top:0;bottom:0;left:var(--pos);width:2px;translate:-1px 0;background:${v(c.background)};pointer-events:none}
.os-compare__handle::after{content:"";position:absolute;top:50%;left:50%;width:2.75rem;height:2.75rem;translate:-50% -50%;border-radius:${v(T.radius.full)};background:${v(c.background)};box-shadow:${v(T.shadow.md)}}
.os-compare__range{position:absolute;z-index:3;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize;appearance:none}
.os-compare__range:focus-visible+.os-compare__handle::after{outline:2px solid ${v(c.focus)};outline-offset:2px}
html:not(.os-js) .os-compare__stage{grid-template-columns:1fr 1fr;gap:${v(T.space["2xs"])}}
html:not(.os-js) .os-compare__before{grid-area:1/1;clip-path:none}
html:not(.os-js) .os-compare__after{grid-area:1/2}
html:not(.os-js) .os-compare__handle,html:not(.os-js) .os-compare__range{display:none}

/* Countdown: numbers need JavaScript; without it the printed date stands alone. */
html:not(.os-js) .os-countdown__units{display:none}

/* Search dialog */
.os-search{width:min(44rem,calc(100vw - 2rem));margin-top:10vh;padding:${v(T.space.sm)};border:0;border-radius:${v(T.radius.card)};background:${v(c.background)};color:${v(c.text)};box-shadow:${v(T.shadow.lg)}}
.os-search::backdrop{background:rgb(0 0 0 / 0.5)}

/* Cart drawer */
.os-cart{position:fixed;inset:0 0 0 auto;width:min(28rem,100vw);height:100dvh;max-height:none;margin:0 0 0 auto;padding:0;border:0;background:${v(c.background)};color:${v(c.text)};box-shadow:${v(T.shadow.lg)}}
.os-cart::backdrop{background:rgb(0 0 0 / 0.45)}
.os-cart__inner{display:flex;flex-direction:column;height:100%}
.os-cart__head{display:flex;align-items:center;justify-content:space-between;padding:${v(T.space.xs)} ${v(T.space.sm)};border-bottom:1px solid ${v(c.border)}}
.os-cart__items{flex:1;overflow-y:auto;padding:${v(T.space.xs)} ${v(T.space.sm)};display:grid;align-content:start;gap:${v(T.space.xs)}}
.os-cart__item{display:grid;grid-template-columns:1fr auto;gap:0.25rem 1rem;padding-bottom:${v(T.space.xs)};border-bottom:1px solid ${v(c.border)}}
.os-cart__qty{display:inline-flex;align-items:center;gap:0.5rem}
.os-cart__qty button{width:2.25rem;height:2.25rem;border:1px solid ${v(c["text-muted"])};border-radius:${v(T.radius.full)};background:transparent}
.os-cart__foot{padding:${v(T.space.sm)};border-top:1px solid ${v(c.border)};display:grid;gap:${v(T.space.xs)}}
.os-cart__total{display:flex;justify-content:space-between;${typePreset("h4")}}
}

/* Motion: entrance reveals only when motion is allowed and the reveal behavior is running.
   Content above the fold is never hidden, and nothing is hidden without JavaScript. */
@media (prefers-reduced-motion:no-preference){
.os-reveal-ready :is(.os-section[data-os-reveal] .os-block,.os-block[data-os-reveal]){transition:opacity ${v(M["reveal-duration"])} ${ease},translate ${v(M["reveal-duration"])} ${ease},scale ${v(M["reveal-duration"])} ${ease},clip-path ${v(M["reveal-duration"])} ${ease};transition-delay:calc(var(--i,0) * ${v(M.stagger)})}
.os-reveal-ready :is(.os-section[data-os-reveal]:not(.is-revealed) .os-block,.os-block[data-os-reveal]:not(.is-revealed)){opacity:0}
.os-reveal-ready :is(.os-section[data-os-reveal=rise]:not(.is-revealed) .os-block,.os-block[data-os-reveal=rise]:not(.is-revealed)){translate:0 ${v(M["reveal-distance"])}}
.os-reveal-ready :is(.os-section[data-os-reveal=slide]:not(.is-revealed) .os-block,.os-block[data-os-reveal=slide]:not(.is-revealed)){translate:calc(-1 * ${v(M["reveal-distance"])}) 0}
.os-reveal-ready :is(.os-section[data-os-reveal=zoom]:not(.is-revealed) .os-block,.os-block[data-os-reveal=zoom]:not(.is-revealed)){scale:0.96}
.os-reveal-ready :is(.os-section[data-os-reveal=clip]:not(.is-revealed) .os-block,.os-block[data-os-reveal=clip]:not(.is-revealed)){clip-path:inset(0 0 100% 0)}
@supports (animation-timeline:view()){
.os-section__bg.is-parallax>.os-img{inset:-12% 0;height:124%;animation:os-parallax linear both;animation-timeline:view();animation-range:cover}
@keyframes os-parallax{from{translate:0 calc(-50% * ${v(M.parallax)})}to{translate:0 calc(50% * ${v(M.parallax)})}}
}
}
@media (prefers-reduced-motion:reduce){
html{scroll-behavior:auto}
*,*::before,*::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important;scroll-behavior:auto!important}
.os-marquee.is-running .os-marquee__track{animation:none;flex-wrap:wrap;width:auto}
.os-marquee [data-os-clone],.os-marquee__toggle{display:none}
}

/* Phones (< 768px): readable, tappable and contained by default, whatever was designed on desktop.
   Phone-only, so tablet and desktop rendering is unchanged; a site's custom CSS (unlayered) still wins. */
@media (max-width:767.98px){
@layer os.base {
/* Long links and addresses wrap instead of widening the page. */
:where(.os-rich) :where(a){overflow-wrap:anywhere}
/* Reading sizes for a phone: body text at most 20px and lead text at most 22px (a big desktop
   intro paragraph stays an intro, not a wall of 34px text); labels, eyebrows and small text never
   shrink below 13–14px. */
body{font-size:min(${v(T.type.body["font-size"])},1.25rem)}
.os-type-lead{font-size:min(${v(T.type.lead["font-size"])},1.375rem)}
.os-type-eyebrow{font-size:max(0.8125rem,${v(T.type.eyebrow["font-size"])})}
.os-type-small{font-size:max(0.875rem,${v(T.type.small["font-size"])})}
/* Wide tables and code scroll inside their block instead of the page. */
.os-rich :where(table){display:block;max-inline-size:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
.os-rich :where(pre){max-inline-size:100%;overflow-x:auto}
.os-rich :where(iframe,video,embed,object){max-inline-size:100%}
}
@layer os.components {
/* Comfortable tap targets: the brand link, social icons and footer links are at least 44px. */
.os-header__brand{min-height:2.75rem}
.os-announcement__close{width:2.75rem;height:2.75rem}
/* Text links get a 44px-tall tap area; inline padding doesn't move the text around them. */
.os-rich a:not(.os-button),.os-announcement__link{padding-block:max(0.875rem,calc((2.75rem - 1em) / 2))}
.os-social__link{width:2.75rem;height:2.75rem}
.os-footer :where(li,p)>a:only-child,.os-footer .os-nav__link{display:inline-flex;align-items:center;min-height:2.75rem}
.os-footer .os-rich li+li{margin-block-start:0}
/* Button labels stay readable (14px or more). */
.os-button{font-size:max(0.875rem,${v(T.type.button["font-size"])})}
/* 16px or larger, so phones don't zoom into a field when it's tapped. */
.os-input,.os-textarea,.os-select{font-size:max(1rem,${v(T.type.body["font-size"])})}
/* Very tall images are cropped to fit the screen (around their focal point). */
.os-block--image .os-img:not(.is-fill,.is-contain){max-block-size:75svh}
}
}

@media print{
.os-header,.os-announcement,.os-popup,.os-skip-link{display:none!important}
.os-section{padding-block:1.5rem;min-height:0}
}
`;
