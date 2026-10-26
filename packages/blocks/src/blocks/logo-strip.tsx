import { cx, Img, Link } from "@openspace/renderer";
import { defineBlock, f, type Link as LinkValue } from "@openspace/schema";
import type { ReactNode } from "react";

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
    if (variant === "marquee") {
      return (
        <div className={cls}>
          {label}
          <div className="os-marquee" data-os-behavior="marquee" data-os-speed="30">
            <ul className="os-marquee__track os-logos__list" aria-label={fields.label ?? "Logos"}>
              {items}
            </ul>
          </div>
        </div>
      );
    }
    return (
      <div className={cls}>
        {label}
        <ul className="os-logos__list" aria-label={fields.label ?? "Logos"}>
          {items}
        </ul>
      </div>
    );
  },
});

export const logoStripCss = `
.os-logos{display:grid;gap:var(--os-space-sm)}
.os-logos__label{font-family:var(--os-type-eyebrow-font-family);font-size:var(--os-type-eyebrow-font-size);letter-spacing:var(--os-type-eyebrow-letter-spacing);text-transform:var(--os-type-eyebrow-text-transform);font-weight:var(--os-type-eyebrow-font-weight);color:var(--os-color-text-muted);text-align:center}
.os-logos__list{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:var(--os-space-sm) var(--os-space-lg);margin:0}
.os-logos__item{display:flex;align-items:center;justify-content:center;min-height:3rem}
.os-logos__link{display:flex;color:inherit;text-decoration:none}
.os-logos__img{width:auto;height:2.25rem;max-width:9rem;aspect-ratio:auto;background:none;border-radius:0;padding:0;clip-path:none}
.os-logos__img>picture{background:none}
.os-logos__img .os-img__img{width:auto;max-width:100%;height:100%;object-fit:contain;filter:none;mix-blend-mode:normal}
.os-logos__img::after{display:none}
.os-logos__word{display:block;color:var(--os-color-heading);white-space:nowrap;line-height:1;font-size:1.25rem}
.os-logos__word--0{font-family:var(--os-font-heading);font-weight:var(--os-font-weight-heading);font-style:italic;font-size:1.4rem}
.os-logos__word--1{font-family:var(--os-font-body);font-weight:600;letter-spacing:0.18em;text-transform:uppercase;font-size:0.95rem}
.os-logos__word--2{font-family:var(--os-font-heading);font-weight:400;letter-spacing:-0.01em;font-size:1.5rem}
.os-logos__word--3{font-family:var(--os-font-body);font-weight:800;letter-spacing:-0.03em;font-size:1.3rem}
.os-logos.is-mono .os-logos__item{opacity:0.72;transition:opacity var(--os-motion-duration-base) var(--os-motion-ease)}
.os-logos.is-mono .os-logos__img .os-img__img{filter:grayscale(1)}
.os-logos.is-mono .os-logos__item:hover{opacity:1}
.os-logos.is-mono .os-logos__item:hover .os-img__img{filter:none}
.os-logos--grid .os-logos__list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--os-color-border);border:1px solid var(--os-color-border);border-radius:var(--os-radius-card);overflow:hidden}
@container block (min-width:40rem){.os-logos--grid .os-logos__list{grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))}}
.os-logos--grid .os-logos__item{min-height:6.5rem;padding:var(--os-space-sm);background:var(--os-color-background)}
.os-logos--marquee .os-marquee{mask-image:linear-gradient(90deg,transparent,currentColor 8%,currentColor 92%,transparent)}
.os-logos--marquee .os-marquee__track{justify-content:center}
.os-logos--marquee .os-marquee.is-running .os-marquee__track{justify-content:flex-start;padding-inline-end:var(--os-space-lg)}
.os-block.os-themed .os-logos--grid .os-logos__item{background:var(--os-color-background)}
`;
