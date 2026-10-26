import type { CSSProperties } from "react";
import type { LookStyles } from "../../api/types";
import { luminance } from "../../ui/color";
import { cx } from "../../ui/cx";
import "./SiteSketch.css";

export interface SiteSketchProps {
  styles: LookStyles;
  name: string;
  tagline?: string | null;
  /** Logo image (data: or https URL). */
  logo?: string | null;
  /** Brand color override for the accent. */
  accent?: string | null;
  /**
   * How many parts are drawn, top to bottom: navigation, hero, features, footer.
   * Used by the "Setting up your site…" screen to assemble the page. Default: all.
   */
  reveal?: number;
  /** "page" draws a taller, full-page sketch (editor canvas). */
  variant?: "card" | "page";
  className?: string;
}

/**
 * A typographic sketch of a site in a template look — palette, type pairing,
 * radius and image shape — drawn with plain HTML. Stands in for the real
 * renderer preview until `@openspace/renderer` is wired in (Tasks 21/26).
 */
export function SiteSketch({
  styles,
  name,
  tagline,
  logo,
  accent,
  reveal = 4,
  variant = "card",
  className,
}: SiteSketchProps) {
  const c = styles.colors;
  const accentColor = accent || c.accent;
  const onAccent = accent ? (luminance(accent) > 0.45 ? "#111111" : "#ffffff") : c.onAccent;
  const vars = {
    "--k-bg": c.background,
    "--k-surface": c.surface,
    "--k-text": c.text,
    "--k-muted": c.muted,
    "--k-accent": accentColor,
    "--k-on-accent": onAccent,
    "--k-heading": styles.fonts.heading,
    "--k-body": styles.fonts.body,
    "--k-radius": `${Math.min(styles.radius, 999)}px`,
  } as CSSProperties;
  const shape = styles.imageShape ?? "rect";
  const part = (i: number) => ({ "data-shown": reveal > i ? "true" : "false" });

  return (
    <div
      className={cx("st-sketch", `st-sketch--${variant}`, className)}
      style={vars}
      role="img"
      aria-label={`Preview of ${name}`}
    >
      <div className="st-sketch__nav st-sketch__part" {...part(0)}>
        <span className="st-sketch__brand">
          {logo ? <img src={logo} alt="" className="st-sketch__logo" /> : null}
          <span>{name}</span>
        </span>
        <span className="st-sketch__links" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="st-sketch__btn st-sketch__btn--sm" aria-hidden="true" />
      </div>
      <div className="st-sketch__hero st-sketch__part" {...part(1)}>
        <div className="st-sketch__copy">
          <p className="st-sketch__title">{name}</p>
          {tagline ? <p className="st-sketch__tagline">{tagline}</p> : null}
          <span className="st-sketch__btn" aria-hidden="true" />
        </div>
        <div className={cx("st-sketch__image", `st-sketch__image--${shape}`)} aria-hidden="true" />
      </div>
      <div className="st-sketch__row st-sketch__part" {...part(2)} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="st-sketch__card">
            <span className="st-sketch__thumb" />
            <i />
            <i />
          </div>
        ))}
      </div>
      <div className="st-sketch__foot st-sketch__part" {...part(3)} aria-hidden="true">
        <i />
        <i />
      </div>
    </div>
  );
}
