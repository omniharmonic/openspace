import type { Announcement, ColorTheme, Site } from "@openspace/schema";
import { themeClass } from "@openspace/theme";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Link } from "./link";
import { SectionView } from "./section";

/** Small stable hash (FNV-1a, base36) used for dismissal / frequency keys. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Site-wide announcement bar; dismissal (per message) is remembered by the `announcement` behavior. */
export function AnnouncementBar({
  announcement,
}: {
  announcement: Announcement | null | undefined;
}) {
  if (!announcement?.enabled) return null;
  const dismissible = announcement.dismissible ?? true;
  return (
    <aside
      className={cx("os-announcement", themeClass(announcement.colorTheme ?? "dark-accent"))}
      aria-label="Announcement"
      data-os-behavior={dismissible ? "announcement" : undefined}
      data-os-key={shortHash(announcement.message)}
    >
      <p className="os-announcement__text">
        {announcement.link ? (
          <Link to={announcement.link} className="os-announcement__link">
            {announcement.message}
          </Link>
        ) : (
          announcement.message
        )}
      </p>
      {dismissible && (
        <button type="button" className="os-announcement__close" data-os-dismiss="">
          <CloseIcon />
          <span className="os-visually-hidden">Dismiss announcement</span>
        </button>
      )}
    </aside>
  );
}

/** Site footer: the site's footer section inside a `<footer>` landmark, plus optional extras. */
export function Footer({ site, children }: { site: Site; children?: ReactNode }) {
  return (
    <footer className="os-footer">
      <SectionView section={site.footer} as="div" className="os-footer__section" />
      {children}
    </footer>
  );
}

export type PopupTrigger =
  | { type: "time"; seconds: number }
  | { type: "scroll"; percent: number }
  | { type: "exit" };

export interface PopupProps {
  /** Stable id; also the frequency-cap storage key. */
  id: string;
  trigger: PopupTrigger;
  /** Show at most once every N days per visitor (default 7; 0 = every visit). */
  frequencyDays?: number;
  /** Accessible title (rendered as the dialog heading). */
  title: string;
  colorTheme?: ColorTheme;
  children?: ReactNode;
}

/**
 * Promotional popup as a native `<dialog>` opened by the `popup` behavior on a time, scroll or
 * exit-intent trigger, capped per visitor via localStorage. Esc and the close button dismiss it.
 */
export function Popup({
  id,
  trigger,
  frequencyDays = 7,
  title,
  colorTheme = "light",
  children,
}: PopupProps) {
  const triggerAttrs: Record<string, string> = { "data-os-trigger": trigger.type };
  if (trigger.type === "time") triggerAttrs["data-os-delay"] = String(trigger.seconds);
  if (trigger.type === "scroll") triggerAttrs["data-os-scroll"] = String(trigger.percent);
  const titleId = `${id}-title`;
  return (
    <dialog
      id={id}
      className={cx("os-popup", themeClass(colorTheme))}
      aria-labelledby={titleId}
      data-os-behavior="popup"
      data-os-frequency={String(frequencyDays)}
      {...triggerAttrs}
    >
      <div className="os-popup__body">
        <h2 id={titleId} className="os-popup__title os-type-h3">
          {title}
        </h2>
        {children}
      </div>
      <button type="button" className="os-popup__close" data-os-close="">
        <CloseIcon />
        <span className="os-visually-hidden">Close</span>
      </button>
    </dialog>
  );
}
