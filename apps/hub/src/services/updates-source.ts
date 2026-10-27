/**
 * Where the update bot learns about new `@omniharmonic/openspace-site-kit` releases (arch §11.2).
 *
 * - `NpmUpdateSource`: the npm registry packument. Changelog lines come from each version's
 *   `openspace.changelog` (string[]) and `openspace.security` (boolean) package.json fields.
 * - `StaticUpdateSource`: a pinned latest version (`SITE_KIT_LATEST`) or, in DEV_MODE, a
 *   built-in release so the whole update flow can be demonstrated offline.
 */
import type { FetchLike } from "../github/http";

export interface ChangelogEntry {
  version: string;
  notes: string[];
  security?: boolean;
}

export interface Release {
  version: string;
  /** Entries newer than the site's version, newest first. */
  changelog: ChangelogEntry[];
  /** Any entry is a security fix (eligible for auto-merge unless the owner opted out). */
  security: boolean;
}

export interface UpdateSource {
  /** The newest compatible (same-major) release newer than `current`, or null. */
  latest(current: string): Promise<Release | null>;
}

export function parseVersion(v: string): [number, number, number] | null {
  const m = v.trim().match(/^[\^~=v]*(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareSemver(a: string, b: string): number {
  const pa = parseVersion(a) ?? [0, 0, 0];
  const pb = parseVersion(b) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] as number) - (pb[i] as number);
    if (d) return d;
  }
  return 0;
}

const sameMajor = (a: string, b: string) => parseVersion(a)?.[0] === parseVersion(b)?.[0];

function pick(current: string, entries: ChangelogEntry[]): Release | null {
  const newer = entries
    .filter((e) => parseVersion(e.version) && sameMajor(e.version, current))
    .filter((e) => compareSemver(e.version, current) > 0)
    .sort((a, b) => compareSemver(b.version, a.version));
  const top = newer[0];
  if (!top) return null;
  return { version: top.version, changelog: newer, security: newer.some((e) => e.security) };
}

/** Built-in dev release notes (plain language — they are shown to site owners). */
export const DEV_RELEASES: ChangelogEntry[] = [
  {
    version: "0.2.0",
    notes: [
      "New gallery layouts: masonry and filmstrip",
      "Faster image loading on phones",
      "Shop pages show “only a few left” when stock is low",
    ],
  },
];

export class StaticUpdateSource implements UpdateSource {
  private readonly entries: ChangelogEntry[];
  constructor(latest?: string, changelogJson?: string) {
    let parsed: ChangelogEntry[] | null = null;
    if (changelogJson) {
      try {
        const v = JSON.parse(changelogJson) as unknown;
        if (Array.isArray(v))
          parsed = v.filter(
            (e): e is ChangelogEntry =>
              !!e &&
              typeof (e as ChangelogEntry).version === "string" &&
              Array.isArray((e as ChangelogEntry).notes),
          );
      } catch {
        parsed = null;
      }
    }
    const entries = parsed ?? DEV_RELEASES;
    this.entries =
      latest && !entries.some((e) => e.version === latest)
        ? [...entries, { version: latest, notes: [`OpenSpace update ${latest}`] }]
        : entries;
    if (latest) this.entries = this.entries.filter((e) => compareSemver(e.version, latest) <= 0);
  }

  async latest(current: string): Promise<Release | null> {
    return pick(current, this.entries);
  }
}

export class NpmUpdateSource implements UpdateSource {
  constructor(
    private readonly fetchFn: FetchLike,
    private readonly registry = "https://registry.npmjs.org",
  ) {}

  async latest(current: string): Promise<Release | null> {
    const res = await this.fetchFn(
      `${this.registry.replace(/\/+$/, "")}/@omniharmonic%2fopenspace-site-kit`,
      {
        headers: { Accept: "application/json" },
      },
    );
    if (!res.ok) throw new Error(`npm registry returned ${res.status}`);
    const body = (await res.json()) as {
      versions?: Record<string, { openspace?: { changelog?: unknown; security?: unknown } }>;
    };
    const entries: ChangelogEntry[] = Object.entries(body.versions ?? {})
      .filter(([v]) => parseVersion(v))
      .map(([version, meta]) => {
        const log = meta.openspace?.changelog;
        const notes = Array.isArray(log)
          ? log.filter((n): n is string => typeof n === "string")
          : [];
        return {
          version,
          notes: notes.length ? notes.slice(0, 20) : [`OpenSpace update ${version}`],
          ...(meta.openspace?.security === true ? { security: true } : {}),
        };
      });
    return pick(current, entries);
  }
}
