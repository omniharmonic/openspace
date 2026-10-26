import { Link } from "react-router";
import "./Wordmark.css";

/** The OpenSpace mark: a square left open at one corner. */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className="st-mark">
      <path d="M10 2.75H4.25a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5h9.5a1.5 1.5 0 0 0 1.5-1.5V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="12.25" y="2" width="3.75" height="3.75" rx="0.9" fill="var(--st-accent)" />
    </svg>
  );
}

export function Wordmark({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="st-wordmark" aria-label="OpenSpace home">
      <Mark />
      <span>OpenSpace</span>
    </Link>
  );
}
