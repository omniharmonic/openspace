/**
 * Secret scanner (Global Constraint 12, arch §3.4): site content must never contain secrets.
 * Used by `openspace check` and the Hub before accepting content. Detects API-key-shaped
 * strings; publishable keys (Stripe `pk_`) are deliberately not flagged.
 */

export interface SecretFinding {
  /** Rule id, e.g. `stripe-secret-key`. */
  rule: string;
  description: string;
  /** Offset of the match in the scanned text. */
  index: number;
  /** 1-based line and column. */
  line: number;
  column: number;
  /** Redacted preview, safe to log: first 4 characters + length. */
  preview: string;
}

interface Rule {
  id: string;
  description: string;
  pattern: RegExp;
  /** Capture group holding the secret (default: whole match). */
  group?: number;
  /** Extra check on the captured secret. */
  accept?: (secret: string) => boolean;
}

/** Shannon entropy in bits per character. */
export function shannonEntropy(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const c of value) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / value.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Heuristic for "looks random": long, high-entropy, mixes letters and digits, not a path/URL. */
function looksRandom(value: string): boolean {
  if (value.length < 16) return false;
  if (/^(?:https?:|media\/|\/|\.\/)/.test(value)) return false;
  if (!/[0-9]/.test(value) || !/[A-Za-z]/.test(value)) return false;
  // Plain words joined by separators ("primary-button-color-2") aren't secrets.
  if (/^[a-z]+(?:[-_.][a-z0-9]+)+$/.test(value) && shannonEntropy(value) < 4) return false;
  return shannonEntropy(value) >= 3.5;
}

const KEY_NAME =
  "(?:api[_-]?key|apikey|secret(?:[_-]?key)?|client[_-]?secret|access[_-]?(?:key|token)|auth[_-]?token|private[_-]?key|bearer|token|password|passwd|pwd|key)";

export const SECRET_RULES: readonly Rule[] = [
  {
    id: "stripe-secret-key",
    description: "Stripe secret or restricted key",
    pattern: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/g,
  },
  {
    id: "stripe-webhook-secret",
    description: "Stripe webhook signing secret",
    pattern: /\bwhsec_[0-9A-Za-z]{24,}\b/g,
  },
  {
    id: "github-token",
    description: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36,}\b/g,
  },
  {
    id: "github-fine-grained-token",
    description: "GitHub fine-grained personal access token",
    pattern: /\bgithub_pat_[0-9A-Za-z_]{40,}\b/g,
  },
  {
    id: "aws-access-key-id",
    description: "AWS access key id",
    pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
  },
  {
    id: "anthropic-api-key",
    description: "Anthropic API key",
    pattern: /\bsk-ant-[0-9A-Za-z_-]{20,}/g,
  },
  {
    id: "openai-api-key",
    description: "OpenAI API key",
    pattern: /\bsk-(?:proj-|svcacct-)?[0-9A-Za-z_-]{32,}/g,
    accept: (s) => !s.startsWith("sk-ant-"),
  },
  {
    id: "google-api-key",
    description: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: "slack-token",
    description: "Slack token",
    pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}/g,
  },
  {
    id: "private-key",
    description: "PEM private key",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g,
  },
  {
    id: "generic-secret-assignment",
    description: "High-entropy value assigned to a key/secret/token/password name",
    // `apiKey = "…"`, `"client_secret": "…"`, `token: …`, `?api_key=…`
    pattern: new RegExp(
      `(?:^|[^A-Za-z0-9])["']?[A-Za-z0-9_-]*${KEY_NAME}["']?\\s*[:=]\\s*["']?([A-Za-z0-9_\\-+/=.~!@#$%^*]{16,})`,
      "gi",
    ),
    group: 1,
    accept: looksRandom,
  },
];

function position(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, column: index - last };
}

function redact(secret: string): string {
  return `${secret.slice(0, 4)}…(${secret.length} chars)`;
}

/** Find API-key-shaped strings in `text`. Overlapping matches are reported once. */
export function scanForSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const covered: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) => covered.some(([s, e]) => start < e && end > s);
  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    for (const m of text.matchAll(rule.pattern)) {
      const secret = rule.group !== undefined ? m[rule.group] : m[0];
      if (!secret || m.index === undefined) continue;
      const start = m.index + (rule.group !== undefined ? m[0].lastIndexOf(secret) : 0);
      const end = start + secret.length;
      if (overlaps(start, end)) continue;
      if (rule.accept && !rule.accept(secret)) continue;
      covered.push([start, end]);
      findings.push({
        rule: rule.id,
        description: rule.description,
        index: start,
        ...position(text, start),
        preview: redact(secret),
      });
    }
  }
  return findings.sort((a, b) => a.index - b.index);
}

/** Convenience: scan any JSON-serializable value (e.g. a SiteDocument). */
export function scanValueForSecrets(value: unknown): SecretFinding[] {
  return scanForSecrets(JSON.stringify(value, null, 2) ?? "");
}
