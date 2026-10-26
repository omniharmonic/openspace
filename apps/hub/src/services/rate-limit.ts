/** Per-IP + per-site rate limiting for public endpoints. */
import type { RateLimitDecision, RateLimiter } from "../durable/rate-limiter";

export interface RateRule {
  name: string;
  limit: number;
  windowSec: number;
}

/** Defaults for public endpoints (per visitor IP, per site). */
export const RATE_RULES = {
  form: { name: "form", limit: 10, windowSec: 600 },
  subscribe: { name: "subscribe", limit: 5, windowSec: 600 },
} satisfies Record<string, RateRule>;

export interface RateLimitService {
  hit(key: string, rule: RateRule): Promise<RateLimitDecision>;
}

/** Durable Object–backed limiter: one DO per key. */
export class DurableRateLimiter implements RateLimitService {
  constructor(
    private readonly ns: DurableObjectNamespace,
    private readonly now: () => number,
  ) {}

  async hit(key: string, rule: RateRule): Promise<RateLimitDecision> {
    const stub = this.ns.get(this.ns.idFromName(key)) as unknown as DurableObjectStub<RateLimiter>;
    return stub.hit(rule.name, rule.limit, rule.windowSec, this.now());
  }
}

/**
 * In-memory limiter for tests / Hubs without the DO binding. State is per instance only (the
 * caller owns the instance's lifetime), so it never leaks across requests implicitly.
 */
export class MemoryRateLimiter implements RateLimitService {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, rule: RateRule): Promise<RateLimitDecision> {
    const k = `${key}|${rule.name}`;
    const now = this.now();
    let w = this.windows.get(k);
    if (!w || now - w.start >= rule.windowSec * 1000) w = { start: now, count: 0 };
    if (w.count >= rule.limit) {
      this.windows.set(k, w);
      return {
        ok: false,
        remaining: 0,
        retryAfter: Math.ceil((w.start + rule.windowSec * 1000 - now) / 1000),
      };
    }
    w.count += 1;
    this.windows.set(k, w);
    return { ok: true, remaining: rule.limit - w.count, retryAfter: 0 };
  }
}

/** A limiter that never limits (no DO binding configured, e.g. some self-hosted setups). */
export class NoRateLimiter implements RateLimitService {
  async hit(_key: string, rule: RateRule): Promise<RateLimitDecision> {
    return { ok: true, remaining: rule.limit, retryAfter: 0 };
  }
}
