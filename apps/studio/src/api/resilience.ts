import { create } from "zustand";
import { HubError } from "./types";

/**
 * Riding out a Hub that's briefly unavailable. The platform in front of the Hub sometimes answers
 * 502/503/504 with an HTML page that carries no CORS headers, which the browser reports as a
 * network failure (`TypeError: Failed to fetch`). Requests that are safe to repeat — reads, and
 * writes that carry an `Idempotency-Key` — are retried with backoff and jitter, and while that
 * happens Studio shows a calm "Reconnecting…" instead of an error.
 */

export const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/** Copy for a Hub that isn't answering (offline, or a temporary server problem). */
export function unreachableMessage(): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return "You’re offline. Your changes are kept on this device until you’re back.";
  return "OpenSpace isn’t answering right now. We’ll keep trying.";
}

export const BUSY_MESSAGE = "OpenSpace is busy for a moment. Trying again…";

/** A failure that's likely to go away on its own: no answer at all, or a 502/503/504. */
export function isTransientError(err: unknown): boolean {
  if (err instanceof HubError) return err.status === 0 || TRANSIENT_STATUSES.has(err.status);
  return (
    err instanceof TypeError &&
    /failed to fetch|networkerror|load failed|network request failed/i.test(err.message)
  );
}

/** How many requests are currently waiting to retry (drives the "Reconnecting…" pill). */
export const useConnection = create<{ retrying: number }>(() => ({ retrying: 0 }));

const bump = (by: number) =>
  useConnection.setState((s) => ({ retrying: Math.max(0, s.retrying + by) }));

export interface RetryOptions {
  /** Extra attempts after the first (default 4). */
  retries?: number;
  /** First backoff step in ms (default 400); doubles each attempt. */
  baseMs?: number;
  /** Cap for one wait (default 5000). */
  maxMs?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hasIdempotencyKey(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("Idempotency-Key");
  if (Array.isArray(headers)) return headers.some(([k]) => k.toLowerCase() === "idempotency-key");
  return Object.keys(headers).some((k) => k.toLowerCase() === "idempotency-key");
}

/** True when repeating the request can't do anything twice. */
export function isRetryableRequest(init: RequestInit | undefined): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  return IDEMPOTENT_METHODS.has(method) || hasIdempotencyKey(init?.headers);
}

/** Full-jitter exponential backoff: a random wait up to `base·2^attempt`, capped. */
export function backoffMs(attempt: number, opts: RetryOptions = {}): number {
  const base = opts.baseMs ?? 400;
  const max = opts.maxMs ?? 5000;
  const ceiling = Math.min(max, base * 2 ** attempt);
  const random = opts.random ?? Math.random;
  // Never retry instantly: at least a quarter of the step.
  return Math.round(ceiling * (0.25 + 0.75 * random()));
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wrap `fetch` so idempotent requests retry through network errors and 502/503/504. */
export function withRetry(doFetch: typeof fetch, opts: RetryOptions = {}): typeof fetch {
  const retries = opts.retries ?? 4;
  const sleep = opts.sleep ?? defaultSleep;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isRetryableRequest(init)) return doFetch(input, init);
    let waiting = false;
    try {
      for (let attempt = 0; ; attempt++) {
        const last = attempt >= retries;
        try {
          const res = await doFetch(input, init);
          if (last || !TRANSIENT_STATUSES.has(res.status)) return res;
        } catch (err) {
          if (last || (init?.signal?.aborted ?? false)) throw err;
        }
        if (!waiting) {
          waiting = true;
          bump(1);
        }
        await sleep(backoffMs(attempt, opts));
      }
    } finally {
      if (waiting) bump(-1);
    }
  }) as typeof fetch;
}

/** A fresh key for one logical create (reused on every retry of it). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
