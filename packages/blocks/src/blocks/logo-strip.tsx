import { cx, Img, Link } from "@omniharmonic/openspace-renderer";
import { defineBlock, f, type Link as LinkValue } from "@omniharmonic/openspace-schema";
import type { ReactNode } from "react";
import { balancedColumns } from "../shared";

/** Phones: pairs, or threes when that divides the wall evenly and pairs wouldn't (3, 9). */
function narrowColumns(n: number): number {
  return n % 2 !== 0 && n % 3 === 0 ? 3 : Math.min(2, n);
}

export const logoStripBlock = defineBlock({
  type: "logo-strip",
  version: 1,
  category: "social-proof",
  label: "Logo strip",
  icon: "gallery-horizontal",
  description: "Press mentions, clients or partners as a row of logos.",
  fields: {
    label: f.text({ optional: true, maxLength: 60, default: "As featured in" }),
    logos: f.list({
      min: 1,
      max: 24,
      itemLabel: "name",
      fields: {
        name: f.text({ maxLength: 60, help: "Shown as a wordmark when there's no logo image" }),
        logo: f.image({ optional: true, help: "SVG or PNG with a transparent background" }),
        link: f.link({ optional: true }),
      },
      default: [
        { name: "Front Range Living" },
        { name: "The Quiet Issue" },
        { name: "Hearth & Field" },
        { name: "NORTHBOUND" },
        { name: "Pine Street Journal" },
      ],
    }),
    monochrome: f.boolean({ default: true, help: "Show logos in one tone; full color on hover" }),
  },
  variants: ["row", "grid", "marquee"],
  styleSlots: ["colorTheme", "padding", "align", "animation"],
  ai: {
    purpose: "Logos of publications, clients, partners or certifications.",
    whenToUse: "Below a hero or near a call to action as social proof. 4–8 logos reads best.",
    avoid:
      "Logos without permission or for relationships that don't exist; mixing press and clients in one strip.",
  },
  render: ({ fields, variant }) => {
    const items = fields.logos.map((item, i) => {
      const mark: ReactNode = item.logo ? (
        <Img
          src={{ ...item.logo, alt: item.logo.alt || item.name }}
          sizes="200px"
          treatment="none"
          fit="contain"
          aspect="original"
          className="os-logos__img"
        />
      ) : (
        <span className={`os-logos__word os-logos__word--${i % 4}`}>{item.name}</span>
      );
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
        <li key={i} className="os-logos__item">
          {item.link ? (
            <Link to={item.link as LinkValue} className="os-logos__link">
              {mark}
            </Link>
          ) : (
            mark
          )}
        </li>
      );
    });
    const label = fields.label ? <p className="os-logos__label">{fields.label}</p> : null;
    const cls = cx("os-logos", `os-logos--${variant}`, fields.monochrome && "is-mono");
    // Wrapped walls balance their rows (a still marquee wraps too, e.g. with reduced motion).
    const n = fields.logos.length;
    const columns = {
      "--lo-s": narrowColumns(n),
      "--lo-m": balancedColumns(n, 4),
      "--lo-l": balancedColumns(n, 6),
    };
    if (variant === "marquee") {
      return (
        <div className={cls}>
          {label}
          <div className="os-marquee" data-os-behavior="marquee" data-os-speed="30">
            <ul
              className="os-marquee__track os-logos__list"
              aria-label={fields.label || "Logos"}
              style={columns}
            >
              {items}
            </ul>
          </div>
        </div>
      );
    }
    return (
      <div className={cls}>
        {label}
        <ul className="os-logos__list" aria-label={fields.label || "Logos"} style={columns}>
          {items}
        </ul>
      </div>
    );
  },
});

export const logoStripCss = `
.os-logos{display:grid;gap:var(--os-space-sm)}
.os-logos__label{font-family:var(--os-type-eyebrow-font-family);font-size:var(--os-type-eyebrow-font-size);letter-spacing:var(--os-type-eyebrow-letter-spacing);text-transform:var(--os-type-eyebrow-text-transform);font-weight:var(--os-type-eyebrow-font-weight);color:var(--os-color-text-muted);text-align:center}
.os-logos__list{--lo-cols:var(--lo-s,2);display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:var(--os-space-sm) 0;margin:0}
@container block (min-width:40rem){.os-logos__list{--lo-cols:var(--lo-m,4)}}
@container block (min-width:64rem){.os-logos__list{--lo-cols:var(--lo-l,6)}}
.os-logos__item{display:flex;align-items:center;justify-content:center;min-height:3rem;flex:0 0 calc(100% / var(--lo-cols));min-width:0;padding-inline:calc(var(--os-space-sm) / 2);box-sizing:border-box}
.os-logos__link{display:flex;color:inherit;text-decoration:none}
.os-logos__img{width:auto;height:2.25rem;max-width:9rem;aspect-ratio:auto;background:none;border-radius:0;padding:0;clip-path:none}
.os-logos__img>picture{background:none}
.os-logos__img .os-img__img{width:auto;max-width:100%;height:100%;object-fit:contain;filter:none;mix-blend-mode:normal}
.os-logos__img::after{display:none}
.os-logos__word{display:block;color:var(--os-color-heading);line-height:1.1;font-size:1.25rem;text-align:center;text-wrap:balance;overflow-wrap:anywhere}
.os-logos__word--0{font-family:var(--os-font-heading);font-weight:var(--os-font-weight-heading);font-style:italic;font-size:1.4rem}
.os-logos__word--1{font-family:var(--os-font-body);font-weight:600;letter-spacing:0.18em;text-transform:uppercase;font-size:0.95rem}
.os-logos__word--2{font-family:var(--os-font-heading);font-weight:400;letter-spacing:-0.01em;font-size:1.5rem}
.os-logos__word--3{font-family:var(--os-font-body);font-weight:800;letter-spacing:-0.03em;font-size:1.3rem}
@container block (max-width:30rem){.os-logos__list{row-gap:var(--os-space-xs)}.os-logos__item{padding-inline:calc(var(--os-space-xs) / 2)}.os-logos__word{font-size:1rem}.os-logos__word--0,.os-logos__word--2{font-size:1.15rem}.os-logos__word--1{font-size:0.8rem}.os-logos__img{height:1.75rem}}
.os-logos.is-mono .os-logos__item{opacity:0.72;transition:opacity var(--os-motion-duration-base) var(--os-motion-ease)}
.os-logos.is-mono .os-logos__img .os-img__img{filter:grayscale(1)}
.os-logos.is-mono .os-logos__item:hover{opacity:1}
.os-logos.is-mono .os-logos__item:hover .os-img__img{filter:none}
.os-logos--grid .os-logos__list{gap:0;padding:1px}
.os-logos--grid .os-logos__item{min-height:6.5rem;padding:var(--os-space-sm);box-shadow:1px 0 0 0 var(--os-color-border),0 1px 0 0 var(--os-color-border),1px 1px 0 0 var(--os-color-border),inset 1px 0 0 0 var(--os-color-border),inset 0 1px 0 0 var(--os-color-border)}
.os-logos--marquee .os-marquee.is-running{mask-image:linear-gradient(90deg,transparent,currentColor 8%,currentColor 92%,transparent)}
.os-logos--marquee .os-marquee__track{justify-content:center;gap:var(--os-space-sm) 0}
.os-logos--marquee .os-marquee.is-running .os-marquee__track{justify-content:flex-start;gap:var(--os-space-lg);padding-inline-end:var(--os-space-lg)}
.os-logos--marquee .os-marquee.is-running .os-logos__item{flex:0 0 auto;padding-inline:0}
.os-logos--marquee .os-marquee.is-running .os-logos__word{white-space:nowrap}
`;
