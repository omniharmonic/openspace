import { useEffect } from "react";
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
