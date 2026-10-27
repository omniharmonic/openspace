/**
 * Selector matching over parse5 trees (css-select with a parse5 adapter), plus the selector
 * surgery the HTML importer needs: which rules style a section, the shortest selector suffix
 * that still picks the same elements once the section stands alone inside a component, and
 * specificity.
 */
import { compile } from "css-select";

type CompiledQuery<T> = (el: T) => boolean;

import { parse as parseSelector, type Selector, stringify } from "css-what";
import { type Element, isElement, type Node } from "../dom";

type ParentNode = { childNodes?: Node[] };

/** A scope: the section element is the child of a synthetic root (the component's root). */
export interface Scope {
  section: Element;
  root: Element;
}

export function makeScope(section: Element): Scope {
  const root = {
    nodeName: "div",
    tagName: "div",
    attrs: [{ name: "class", value: "os-c" }],
    namespaceURI: "http://www.w3.org/1999/xhtml",
    childNodes: [section],
    parentNode: null,
  } as unknown as Element;
  return { section, root };
}

const children = (n: Node): Node[] => (n as ParentNode).childNodes ?? [];

function adapterFor(scope?: Scope) {
  const parentOf = (n: Node): Node | null => {
    if (scope) {
      if (n === scope.root) return null;
      if (n === scope.section) return scope.root;
    }
    return ((n as { parentNode?: Node | null }).parentNode ?? null) as Node | null;
  };
  const textOf = (n: Node): string => {
    if ((n as { nodeName?: string }).nodeName === "#text") return (n as { value: string }).value;
    return children(n).map(textOf).join("");
  };
  return {
    isTag: (n: Node): n is Element => isElement(n),
    getAttributeValue: (el: Element, name: string) =>
      el.attrs.find((a) => a.name.toLowerCase() === name)?.value,
    getChildren: children,
    getName: (el: Element) => el.tagName.toLowerCase(),
    getParent: (el: Element) => {
      const p = parentOf(el);
      return p && isElement(p) ? p : null;
    },
    getSiblings: (n: Node) => {
      if (scope && (n === scope.section || n === scope.root)) return [n];
      const p = parentOf(n);
      return p ? children(p) : [n];
    },
    getText: textOf,
    hasAttrib: (el: Element, name: string) => el.attrs.some((a) => a.name.toLowerCase() === name),
    removeSubsets: (nodes: Node[]) => {
      const set = new Set(nodes);
      return [...set].filter((n) => {
        let p = parentOf(n);
        while (p) {
          if (set.has(p)) return false;
          p = parentOf(p);
        }
        return true;
      });
    },
    prevElementSibling: (n: Node) => {
      if (scope && (n === scope.section || n === scope.root)) return null;
      const p = parentOf(n);
      if (!p) return null;
      const sibs = children(p);
      for (let i = sibs.indexOf(n) - 1; i >= 0; i--)
        if (isElement(sibs[i])) return sibs[i] as Element;
      return null;
    },
  };
}

const DOC_ADAPTER = adapterFor();

/** Pseudo-classes whose state isn't known statically: ignored when matching, kept in output. */
const DYNAMIC = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "visited",
  "link",
  "any-link",
  "target",
  "target-within",
  "checked",
  "indeterminate",
  "default",
  "disabled",
  "enabled",
  "placeholder-shown",
  "autofill",
  "invalid",
  "valid",
  "user-invalid",
  "user-valid",
  "required",
  "optional",
  "read-only",
  "read-write",
  "in-range",
  "out-of-range",
  "defined",
  "open",
  "closed",
  "popover-open",
  "modal",
  "fullscreen",
  "playing",
  "paused",
  "current",
  "past",
  "future",
  "local-link",
  "scope",
  "host",
]);

export interface ParsedSelector {
  /** css-what tokens of one complex selector (no commas). */
  tokens: Selector[];
  /** Index ranges of compounds in `tokens` (combinators sit between them). */
  compounds: Array<{ start: number; end: number }>;
}

const isCombinator = (t: Selector) =>
  t.type === "descendant" ||
  t.type === "child" ||
  t.type === "sibling" ||
  t.type === "adjacent" ||
  t.type === "parent" ||
  t.type === "column-combinator";

/** Parse a selector list into complex selectors (undefined when css-what can't read it). */
export function parseSelectorList(text: string): ParsedSelector[] | undefined {
  let list: Selector[][];
  try {
    list = parseSelector(text);
  } catch {
    return undefined;
  }
  return list.map((tokens) => {
    const compounds: ParsedSelector["compounds"] = [];
    let start = 0;
    tokens.forEach((t, i) => {
      if (isCombinator(t)) {
        compounds.push({ start, end: i });
        start = i + 1;
      }
    });
    compounds.push({ start, end: tokens.length });
    return { tokens, compounds };
  });
}

/** The selector without dynamic pseudo-classes and pseudo-elements (for static matching). */
function matchable(tokens: Selector[]): Selector[] {
  return tokens.filter(
    (t) => t.type !== "pseudo-element" && !(t.type === "pseudo" && DYNAMIC.has(t.name)),
  );
}

const compiledCache = new Map<string, CompiledQuery<Element> | null>();
const scopedCache = new WeakMap<Scope, Map<string, CompiledQuery<Element> | null>>();

function compiled(tokens: Selector[], scope?: Scope): CompiledQuery<Element> | null {
  const key = stringify([matchable(tokens)]);
  const cache = scope
    ? (scopedCache.get(scope) ?? scopedCache.set(scope, new Map()).get(scope))
    : compiledCache;
  const map = cache as Map<string, CompiledQuery<Element> | null>;
  if (map.has(key)) return map.get(key) ?? null;
  let fn: CompiledQuery<Element> | null = null;
  try {
    const m = matchable(tokens);
    if (m.length && !isCombinator(m[m.length - 1] as Selector))
      fn = compile([m.length && isCombinator(m[0] as Selector) ? m.slice(1) : m], {
        adapter: scope ? adapterFor(scope) : DOC_ADAPTER,
        xmlMode: false,
      } as never) as unknown as CompiledQuery<Element>;
  } catch {
    fn = null;
  }
  map.set(key, fn);
  return fn;
}

/** Elements under (and including) `root`, depth first. */
export function elementsIn(root: Element): Element[] {
  const out: Element[] = [];
  const visit = (n: Node) => {
    if (!isElement(n)) return;
    out.push(n);
    for (const c of children(n)) visit(c);
  };
  visit(root);
  return out;
}

/** Elements of `within` the selector matches in the full document. */
export function matchesIn(sel: ParsedSelector, within: readonly Element[]): Element[] {
  const fn = compiled(sel.tokens);
  if (!fn) return [];
  return within.filter((el) => {
    try {
      return fn(el);
    } catch {
      return false;
    }
  });
}

/**
 * The shortest tail of `sel` (from the subject leftwards) that, with the section standing alone
 * in its component, picks exactly the elements the whole selector picks in the page. Returns
 * the tokens to write (dynamic pseudo-classes and pseudo-elements kept).
 */
export function scopedTail(
  sel: ParsedSelector,
  scope: Scope,
  within: readonly Element[],
  expected: readonly Element[],
): Selector[] {
  const want = new Set(expected);
  const n = sel.compounds.length;
  for (let k = 0; k < n; k++) {
    const start = (sel.compounds[k] as { start: number }).start;
    const tail = sel.tokens.slice(start);
    // A tail starting at the scope root's own compound can't name anything outside.
    const fn = compiled(tail, scope);
    if (!fn) continue;
    let ok = true;
    let count = 0;
    for (const el of within) {
      let hit = false;
      try {
        hit = fn(el);
      } catch {
        hit = false;
      }
      if (hit) count++;
      if (hit !== want.has(el)) {
        ok = false;
        break;
      }
    }
    if (ok && count === want.size) return tail;
  }
  // Nothing equivalent (e.g. a sibling of something outside): the subject compound alone.
  const last = sel.compounds[n - 1] as { start: number; end: number };
  return sel.tokens.slice(last.start, last.end);
}

/** Specificity [ids, classes, types] of a complex selector's tokens. */
export function specificity(tokens: readonly Selector[]): [number, number, number] {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const t of tokens) {
    if (t.type === "attribute") {
      if (t.name === "id" && t.action === "equals") a++;
      else b++;
    } else if (t.type === "pseudo") {
      if (t.name === "where") continue;
      if (
        Array.isArray(t.data) &&
        (t.name === "not" || t.name === "is" || t.name === "has" || t.name === "matches")
      ) {
        let best: [number, number, number] = [0, 0, 0];
        for (const inner of t.data as Selector[][]) {
          const s = specificity(inner);
          if (cmpSpec(s, best) > 0) best = s;
        }
        a += best[0];
        b += best[1];
        c += best[2];
      } else b++;
    } else if (t.type === "tag" || t.type === "pseudo-element") c++;
  }
  return [a, b, c];
}

export const cmpSpec = (x: readonly number[], y: readonly number[]) =>
  (x[0] ?? 0) - (y[0] ?? 0) || (x[1] ?? 0) - (y[1] ?? 0) || (x[2] ?? 0) - (y[2] ?? 0);

export const selectorText = (tokens: Selector[]) => stringify([tokens]);

export type { Selector };
