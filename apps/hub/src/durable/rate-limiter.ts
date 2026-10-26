import { DurableObject } from "cloudflare:workers";

export interface RateLimitDecision {
  ok: boolean;
  remaining: number;
  /** Seconds until another request is allowed (0 when ok). */
  retryAfter: number;
}

interface Window {
  start: number;
  count: number;
}

/** The storage calls the limiter needs (a subset of `DurableObjectStorage`). */
export interface LimiterStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  setAlarm(time: number): Promise<void>;
}

/** Fixed-window counting for one rule; persisted so it survives eviction. */
export async function hitWindow(
  storage: LimiterStorage,
  rule: string,
  limit: number,
  windowSec: number,
  now: number,
): Promise<RateLimitDecision> {
  const key = `w:${rule}`;
  const windowMs = windowSec * 1000;
  let w = (await storage.get<Window>(key)) ?? { start: now, count: 0 };
  if (now - w.start >= windowMs) w = { start: now, count: 0 };
  if (w.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((w.start + windowMs - now) / 1000) };
  }
  w.count += 1;
  await storage.put(key, w);
  // Clean up idle instances once the window has passed.
  await storage.setAlarm(w.start + windowMs * 2);
  return { ok: true, remaining: limit - w.count, retryAfter: 0 };
}

/**
 * `RateLimiter` Durable Object (architecture §8.1): one instance per key (e.g. site + hashed IP),
 * with a fixed-window counter per rule name.
 */
export class RateLimiter extends DurableObject {
  async hit(
    rule: string,
    limit: number,
    windowSec: number,
    now = Date.now(),
  ): Promise<RateLimitDecision> {
    return hitWindow(this.ctx.storage, rule, limit, windowSec, now);
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
