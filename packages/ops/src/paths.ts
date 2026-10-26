/** Small, dependency-free helpers for JSON values and dot-path patches. */

export type Obj = Record<string, unknown>;

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

/** The first own key anywhere in a JSON value that could reach a prototype, if any. */
export function findForbiddenKey(value: unknown, depth = 0): string | undefined {
  if (depth > 64 || value === null || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const v of value) {
      const k = findForbiddenKey(v, depth + 1);
      if (k) return k;
    }
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_SEGMENTS.has(key)) return key;
    const k = findForbiddenKey((value as Obj)[key], depth + 1);
    if (k) return k;
  }
  return undefined;
}

/** True for object keys that could reach a prototype (rejected in every op). */
export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_SEGMENTS.has(key);
}

/** True for plain objects (and Immer drafts of them, which proxy a plain object). */
export function isPlainObject(value: unknown): value is Obj {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Structural equality for JSON values (key order ignored, `undefined` keys ignored). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  if (typeof a === "object") {
    const ao = a as Obj;
    const bo = b as Obj;
    const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
    const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.hasOwn(bo, k) || !deepEqual(ao[k], bo[k])) return false;
    }
    return true;
  }
  return false;
}

/** A deep copy of a JSON value (drops `undefined` object values). */
export function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => clone(v)) as T;
  if (isPlainObject(value)) {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = clone(v);
    return out as T;
  }
  return value;
}

export function splitPath(path: string): string[] {
  return path.split(".");
}

/** Problems with a path (forbidden segments) or `undefined` if fine. */
export function checkPath(path: string): string | undefined {
  if (path.length === 0) return "Empty path";
  for (const seg of splitPath(path)) {
    if (seg.length === 0) return `Empty segment in path "${path}"`;
    if (FORBIDDEN_SEGMENTS.has(seg)) return `Forbidden path segment "${seg}"`;
  }
  return undefined;
}

/** True if path `a` equals `b` or is an ancestor of it (segment-wise). */
export function isPathPrefix(a: string, b: string): boolean {
  return a === b || b.startsWith(`${a}.`);
}

export function pathsOverlap(a: string, b: string): boolean {
  return isPathPrefix(a, b) || isPathPrefix(b, a);
}

/** Paths in a patch that overlap one another (each reported once). */
export function overlappingPaths(paths: readonly string[]): string[] {
  const out = new Set<string>();
  for (let i = 0; i < paths.length; i++)
    for (let j = i + 1; j < paths.length; j++) {
      const a = paths[i] as string;
      const b = paths[j] as string;
      if (pathsOverlap(a, b)) out.add(a.length >= b.length ? a : b);
    }
  return [...out];
}

export interface PathLookup {
  /** Whether the full path exists. */
  exists: boolean;
  value: unknown;
  /**
   * The shortest prefix of the path that does not exist (when `exists` is false and the
   * walk only ran through objects), or `undefined` if the walk hit a non-object.
   */
  missingAt?: string;
  /** True if an intermediate segment is not a plain object. */
  blocked: boolean;
}

export function lookupPath(root: unknown, path: string): PathLookup {
  const segs = splitPath(path);
  let cur: unknown = root;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i] as string;
    if (!isPlainObject(cur)) return { exists: false, value: undefined, blocked: true };
    if (!Object.hasOwn(cur, seg) || cur[seg] === undefined) {
      return {
        exists: false,
        value: undefined,
        missingAt: segs.slice(0, i + 1).join("."),
        blocked: false,
      };
    }
    cur = cur[seg];
  }
  return { exists: true, value: cur, blocked: false };
}

export function getPath(root: unknown, path: string): unknown {
  return lookupPath(root, path).value;
}

/**
 * Set a value at a path on a mutable object (an Immer draft), creating intermediate objects.
 * Throws if an intermediate value exists and is not a plain object.
 */
export function setPath(root: Obj, path: string, value: unknown): void {
  const segs = splitPath(path);
  let cur: Obj = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i] as string;
    const next = cur[seg];
    if (next === undefined) {
      const created: Obj = {};
      cur[seg] = created;
      cur = cur[seg] as Obj;
    } else if (isPlainObject(next)) {
      cur = next as Obj;
    } else {
      throw new Error(`Cannot set "${path}": "${segs.slice(0, i + 1).join(".")}" is not an object`);
    }
  }
  cur[segs[segs.length - 1] as string] = clone(value);
}

/** Remove the value at a path (no-op if missing). */
export function unsetPath(root: Obj, path: string): void {
  const segs = splitPath(path);
  let cur: unknown = root;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!isPlainObject(cur)) return;
    cur = (cur as Obj)[segs[i] as string];
  }
  if (isPlainObject(cur)) delete cur[segs[segs.length - 1] as string];
}

/** Apply a patch (unset first, then set) to a mutable object. */
export function applyPatch(root: Obj, patch: { set?: Obj; unset?: readonly string[] }): void {
  for (const p of patch.unset ?? []) unsetPath(root, p);
  for (const [p, v] of Object.entries(patch.set ?? {})) setPath(root, p, v);
}

/**
 * The patch that undoes `patch` on `root` (computed before applying). For a set into missing
 * parents, the inverse unsets the shallowest missing ancestor, so the original shape is restored
 * exactly.
 */
export function invertPatch(
  root: unknown,
  patch: { set?: Obj; unset?: readonly string[] },
): { set: Obj; unset: string[] } {
  const set: Obj = {};
  const unset = new Set<string>();
  for (const p of patch.unset ?? []) {
    const l = lookupPath(root, p);
    if (l.exists) set[p] = clone(l.value);
  }
  for (const p of Object.keys(patch.set ?? {})) {
    const l = lookupPath(root, p);
    if (l.exists) set[p] = clone(l.value);
    else if (l.missingAt !== undefined) unset.add(l.missingAt);
  }
  return { set, unset: [...unset] };
}

/**
 * Leaf-level differences between two objects as a patch: nested plain objects are recursed into,
 * arrays and primitives are compared whole. `skip` lists top-level keys to ignore.
 */
export function diffObjects(
  before: Obj,
  after: Obj,
  skip: readonly string[] = [],
  prefix = "",
): { set: Obj; unset: string[] } {
  const set: Obj = {};
  const unset: string[] = [];
  const walk = (a: Obj, b: Obj, base: string, top: boolean) => {
    for (const k of Object.keys(a)) {
      if (top && skip.includes(k)) continue;
      if (a[k] === undefined) continue;
      if (b[k] === undefined) unset.push(base + k);
    }
    for (const k of Object.keys(b)) {
      if (top && skip.includes(k)) continue;
      const bv = b[k];
      if (bv === undefined) continue;
      const av = a[k];
      if (av === undefined) set[base + k] = clone(bv);
      else if (isPlainObject(av) && isPlainObject(bv)) walk(av, bv, `${base + k}.`, false);
      else if (!deepEqual(av, bv)) set[base + k] = clone(bv);
    }
  };
  walk(before, after, prefix, true);
  return { set, unset };
}

export function isEmptyPatch(patch: { set?: Obj; unset?: readonly string[] }): boolean {
  return Object.keys(patch.set ?? {}).length === 0 && (patch.unset ?? []).length === 0;
}

/** All paths a patch touches. */
export function patchPaths(patch: { set?: Obj; unset?: readonly string[] }): string[] {
  return [...(patch.unset ?? []), ...Object.keys(patch.set ?? {})];
}

/**
 * True if `value` survives a JSON round trip unchanged: null, booleans, finite numbers, strings,
 * arrays and plain objects of those (no `undefined`, functions, class instances, NaN).
 */
export function isJson(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null) return true;
  switch (typeof value) {
    case "boolean":
    case "string":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      if (Array.isArray(value)) return value.every((v) => isJson(v, depth + 1));
      if (!isPlainObject(value)) return false;
      return Object.values(value).every((v) => isJson(v, depth + 1));
    default:
      return false;
  }
}
