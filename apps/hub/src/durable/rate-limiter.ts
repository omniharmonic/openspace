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

/**
 * `RateLimiter` Durable Object (architecture §8.1): one instance per key (e.g. site + hashed IP).
 * Fixed-window counters per rule name, persisted in DO storage so they survive eviction.
 */
export class RateLimiter extends DurableObject {
  async hit(
    rule: string,
    limit: number,
    windowSec: number,
    now = Date.now(),
  ): Promise<RateLimitDecision> {
    const key = `w:${rule}`;
    const windowMs = windowSec * 1000;
    let w = (await this.ctx.storage.get<Window>(key)) ?? { start: now, count: 0 };
    if (now - w.start >= windowMs) w = { start: now, count: 0 };
    if (w.count >= limit) {
      return { ok: false, remaining: 0, retryAfter: Math.ceil((w.start + windowMs - now) / 1000) };
    }
    w.count += 1;
    await this.ctx.storage.put(key, w);
    // Clean up idle instances once the window has passed.
    await this.ctx.storage.setAlarm(w.start + windowMs * 2);
    return { ok: true, remaining: limit - w.count, retryAfter: 0 };
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
