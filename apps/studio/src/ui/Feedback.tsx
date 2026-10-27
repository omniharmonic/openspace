import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import "./Feedback.css";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  size?: "sm" | "md";
  /** Heading level for the title (default 3; 1 when the empty state is the whole page). */
  level?: 1 | 2 | 3;
}

/** An empty screen is an invitation to act: say what goes here and how to add it. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  size = "md",
  level = 3,
}: EmptyStateProps) {
  const Heading = `h${level}` as const;
  return (
    <div className={cx("st-empty", `st-empty--${size}`, className)}>
      {icon && <div className="st-empty__icon">{icon}</div>}
      <Heading className="st-empty__title">{title}</Heading>
      {description && <p className="st-empty__desc">{description}</p>}
      {action && <div className="st-empty__action">{action}</div>}
    </div>
  );
}

export interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  className?: string;
}

export function Skeleton({ width = "100%", height = 12, radius, className }: SkeletonProps) {
  return (
    <span
      className={cx("st-skeleton", className)}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export type BadgeTone = "neutral" | "accent" | "live" | "pending" | "danger";

export interface BadgeProps {
  tone?: BadgeTone;
  /** Leading status dot. */
  dot?: boolean;
  /** Pulse the dot (in-progress states). */
  pulse?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Badge({ tone = "neutral", dot, pulse, children, className, title }: BadgeProps) {
  return (
    <span className={cx("st-badge", `st-badge--${tone}`, className)} title={title}>
      {dot && (
        <span className={cx("st-badge__dot", pulse && "st-badge__dot--pulse")} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
