import type { Link as LinkValue, SocialProfile } from "@openspace/schema";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Link } from "./link";

export type ButtonRole = "primary" | "secondary" | "tertiary";

export interface ButtonProps {
  /** Link target; omit for a `<button>` (e.g. a form submit). */
  to?: LinkValue;
  role?: ButtonRole;
  type?: "button" | "submit";
  className?: string;
  children: ReactNode;
  /** Extra attributes (data-os-*, aria-*). */
  attrs?: Record<string, string | undefined>;
}

/**
 * A button styled by the Site Styles button system (`--os-button-<role>-*`). Renders an `<a>`
 * for links, a `<button>` otherwise.
 */
export function Button({ to, role = "primary", type = "button", className, children, attrs }: ButtonProps) {
  const cls = cx("os-button", `os-button--${role}`, className);
  const label = <span className="os-button__label">{children}</span>;
  if (to)
    return (
      <Link to={to} className={cls} {...attrs}>
        {label}
      </Link>
    );
  return (
    <button type={type} className={cls} {...attrs}>
      {label}
    </button>
  );
}

const ICONS: Record<string, ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </>
  ),
  facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v7h4v-7h3l1-4h-4V8z" />,
  x: <path d="M4 4l16 16M20 4L4 20" />,
  threads: <path d="M16 11c-1-4-8-4-8 1s7 5 7 1-5-3-5-1M12 21a9 9 0 1 1 8-12" />,
  bluesky: <path d="M12 11C10 7 6 4 4 5s0 7 4 8c-3 1-3 4 0 5s4-3 4-5c0 2 1 6 4 5s3-4 0-5c4-1 6-7 4-8s-6 2-8 6z" />,
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" />
    </>
  ),
  youtube: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="M10 9l5 3-5 3z" fill="currentColor" />
    </>
  ),
  tiktok: <path d="M14 3v11a4 4 0 1 1-4-4M14 3c0 3 2 5 5 5" />,
  email: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  github: (
    <path d="M9 19c-4 1.5-4-2-6-2m12 4v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  ),
};

const GENERIC_ICON = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>
);

const NETWORK_LABEL: Partial<Record<string, string>> = {
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  github: "GitHub",
  soundcloud: "SoundCloud",
  tripadvisor: "Tripadvisor",
};

export function networkLabel(network: string): string {
  return NETWORK_LABEL[network] ?? network.charAt(0).toUpperCase() + network.slice(1);
}

/** Small outline icon for a social network (inherits `currentColor`). */
export function SocialIcon({ network }: { network: string }) {
  return (
    <svg
      className="os-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[network] ?? GENERIC_ICON}
    </svg>
  );
}

/** A row of social profile links with accessible names. */
export function SocialLinks({ profiles, className }: { profiles: readonly SocialProfile[]; className?: string }) {
  if (profiles.length === 0) return null;
  return (
    <ul className={cx("os-social", className)}>
      {profiles.map((p) => (
        <li key={p.url}>
          <a href={p.url} className="os-social__link" rel="me noopener" target={p.network === "email" ? undefined : "_blank"}>
            <SocialIcon network={p.network} />
            <span className="os-visually-hidden">{networkLabel(p.network)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
