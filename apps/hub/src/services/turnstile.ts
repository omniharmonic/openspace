/** Cloudflare Turnstile verification (FR-31) with a dev bypass (Global Constraint 8). */
import type { FetchLike } from "../github/http";

export interface TurnstileResult {
  ok: boolean;
  codes: string[];
}

export interface TurnstileVerifier {
  readonly kind: "cloudflare" | "dev";
  /** Whether forms must carry a token (real verification is configured). */
  readonly required: boolean;
  /** `hostnames`: where the widget may have been solved (the site's hosts); others fail. */
  verify(token: string | null, ip: string | null, hostnames?: string[]): Promise<TurnstileResult>;
}

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export class CloudflareTurnstile implements TurnstileVerifier {
  readonly kind = "cloudflare" as const;
  readonly required = true;
  constructor(
    private readonly secret: string,
    private readonly fetchFn: FetchLike,
  ) {}

  async verify(
    token: string | null,
    ip: string | null,
    hostnames?: string[],
  ): Promise<TurnstileResult> {
    if (!token) return { ok: false, codes: ["missing-input-response"] };
    const body = new FormData();
    body.set("secret", this.secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);
    try {
      const res = await this.fetchFn(SITEVERIFY_URL, { method: "POST", body });
      const data = (await res.json()) as {
        success?: boolean;
        hostname?: string;
        "error-codes"?: string[];
      };
      if (data.success === true && hostnames?.length && !hostnames.includes(data.hostname ?? ""))
        return { ok: false, codes: ["hostname-mismatch"] };
      return { ok: data.success === true, codes: data["error-codes"] ?? [] };
    } catch {
      // Fail closed: a submission we can't verify isn't accepted (the visitor can retry).
      return { ok: false, codes: ["internal-error"] };
    }
  }
}

/** Dev: always passes, except the literal token "dev-fail" (to demo the rejection path). */
export class DevTurnstile implements TurnstileVerifier {
  readonly kind = "dev" as const;
  readonly required = false;
  async verify(token: string | null): Promise<TurnstileResult> {
    return token === "dev-fail"
      ? { ok: false, codes: ["invalid-input-response"] }
      : { ok: true, codes: [] };
  }
}
