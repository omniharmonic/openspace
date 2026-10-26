import type { Block } from "./block";
import type { AnyBlockDefinition } from "./define-block";

/**
 * Migrations (arch §3.1) are pure functions `(oldData) => newData`, run by `openspace migrate`,
 * by the Hub update bot and lazily in Studio on load.
 *
 * - Site-level migrations upgrade the whole content tree from `schemaVersion` n to n + 1.
 * - Block-level migrations upgrade a block's `fields` from version n to n + 1 (`defineBlock`'s
 *   `migrate` map).
 */

/** The schema version this library reads and writes. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Raw (unvalidated) site content shaped like a `SiteDocument`; at least `config.schemaVersion`. */
export interface SiteContentLike {
  config: { schemaVersion: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface SiteMigration {
  /** Upgrades content at `from` to `from + 1`. */
  from: number;
  description: string;
  up: (content: SiteContentLike) => SiteContentLike;
}

/** Built-in site migrations, keyed by the version they upgrade from. Empty at version 1. */
export const SITE_MIGRATIONS: ReadonlyMap<number, SiteMigration> = new Map();

export interface MigrateSiteOptions {
  migrations?: ReadonlyMap<number, SiteMigration>;
  /** Version to migrate to; defaults to `CURRENT_SCHEMA_VERSION`. */
  target?: number;
}

export interface MigrateSiteResult<T extends SiteContentLike = SiteContentLike> {
  content: T;
  from: number;
  to: number;
  /** Descriptions of applied migrations, in order. */
  applied: string[];
}

/** Build a registry from a list of migrations, checking there's at most one per version. */
export function siteMigrationRegistry(
  list: readonly SiteMigration[],
): ReadonlyMap<number, SiteMigration> {
  const map = new Map<number, SiteMigration>();
  for (const m of list) {
    if (!Number.isInteger(m.from) || m.from < 1)
      throw new Error(`Invalid migration version ${m.from}`);
    if (map.has(m.from)) throw new Error(`Two migrations upgrade from schemaVersion ${m.from}`);
    map.set(m.from, m);
  }
  return map;
}

/**
 * Upgrade site content to the target schema version. Input is never mutated (each step gets a
 * deep clone). Throws if the content is newer than the target or a step is missing.
 */
export function migrateSite<T extends SiteContentLike>(
  content: T,
  options: MigrateSiteOptions = {},
): MigrateSiteResult<T> {
  const migrations = options.migrations ?? SITE_MIGRATIONS;
  const target = options.target ?? CURRENT_SCHEMA_VERSION;
  const from = content?.config?.schemaVersion;
  if (!Number.isInteger(from) || from < 1)
    throw new Error("Site content has no valid config.schemaVersion");
  if (from > target) {
    throw new Error(
      `Site uses schemaVersion ${from}, newer than this library supports (${target}); update OpenSpace`,
    );
  }
  let current: SiteContentLike = content;
  const applied: string[] = [];
  for (let v = from; v < target; v++) {
    const step = migrations.get(v);
    if (!step) throw new Error(`No migration from schemaVersion ${v} to ${v + 1}`);
    const next = step.up(structuredClone(current));
    next.config = { ...next.config, schemaVersion: v + 1 };
    current = next;
    applied.push(`${v} → ${v + 1}: ${step.description}`);
  }
  return { content: current as T, from, to: target, applied };
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/**
 * Upgrade a block instance to its definition's version by running `migrate[v]` for each
 * intermediate version (missing steps are treated as no-ops). Returns the block unchanged if it
 * is current; throws if it is newer than the definition.
 */
export function migrateBlock(def: AnyBlockDefinition, block: Block): Block {
  if (block.type !== def.type)
    throw new Error(`Cannot migrate a ${block.type} block with the ${def.type} definition`);
  if (block.v > def.version) {
    throw new Error(
      `Block ${block.id} is version ${block.v}, newer than ${def.type}@${def.version}`,
    );
  }
  if (block.v === def.version) return block;
  let fields = structuredClone(block.fields);
  for (let v = block.v; v < def.version; v++) {
    const step = def.migrate?.[v];
    if (step) fields = stripUndefined(step(fields));
  }
  return { ...block, v: def.version, fields };
}
