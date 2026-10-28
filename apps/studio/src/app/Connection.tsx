import { useEffect, useState } from "react";
import { isTransientError, useConnection } from "../api/resilience";
import { Button, EmptyState, Spinner } from "../ui";
import "./Connection.css";

/** While requests are riding out a Hub hiccup: a small, calm "Reconnecting…" pill. */
export function ConnectionStatus() {
  const retrying = useConnection((s) => s.retrying > 0);
  if (!retrying) return null;
  return (
    <div className="st-connection" role="status">
      <Spinner size={12} />
      Reconnecting…
    </div>
  );
}

export interface LoadErrorProps {
  /** Title for a real failure ("Your sites didn’t load"). */
  title: string;
  error: unknown;
  onRetry: () => void;
  /** Extra action next to "Try again" (e.g. back to your sites). */
  secondary?: React.ReactNode;
  /** How often to try again by itself while the failure looks temporary (ms). */
  everyMs?: number;
}

/**
 * The error state for something that didn't load. A temporary failure (no answer, 502/503/504)
 * reads as "Reconnecting…" and tries again by itself; anything else says what went wrong.
 */
export function LoadError({ title, error, onRetry, secondary, everyMs = 8000 }: LoadErrorProps) {
  const transient = isTransientError(error);
  useEffect(() => {
    if (!transient) return;
    const t = setInterval(onRetry, everyMs);
    return () => clearInterval(t);
  }, [transient, onRetry, everyMs]);

  if (transient) {
    return (
      <EmptyState
        icon={<Spinner size={18} />}
        title="Reconnecting to OpenSpace…"
        description="OpenSpace is taking a moment to answer. We’ll keep trying — nothing you’ve done is lost."
        action={
          <>
            <Button onClick={onRetry}>Try now</Button>
            {secondary}
          </>
        }
      />
    );
  }
  return (
    <EmptyState
      title={title}
      description={error instanceof Error ? error.message : undefined}
      action={
        <>
          <Button onClick={onRetry}>Try again</Button>
          {secondary}
        </>
      }
    />
  );
}

/** When a loading screen starts offering a way out. */
export const SLOW_LOADING_MS = 8000;

export interface SlowLoadingProps {
  label: string;
  /** Default {@link SLOW_LOADING_MS}. */
  afterMs?: number;
  /** "Try again" (default: reload the page). */
  onRetry?: () => void;
}

/**
 * A full-screen spinner that never leaves someone stuck: after a few seconds it says it's taking
 * longer than usual and offers to try again or go back to their sites.
 */
export function SlowLoading({ label, afterMs = SLOW_LOADING_MS, onRetry }: SlowLoadingProps) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(t);
  }, [afterMs]);
  if (!slow)
    return (
      <div className="st-center">
        <Spinner size={18} label={label} />
      </div>
    );
  return (
    <main className="st-center">
      <EmptyState
        level={1}
        icon={<Spinner size={18} />}
        title="This is taking longer than usual"
        description="OpenSpace may be slow to answer, or your connection dropped for a moment. We’ll keep trying — nothing you’ve done is lost."
        action={
          <>
            <Button variant="primary" onClick={onRetry ?? (() => window.location.reload())}>
              Try again
            </Button>
            <Button variant="ghost" onClick={() => window.location.assign("/sites")}>
              Back to your sites
            </Button>
          </>
        }
      />
    </main>
  );
}
