/**
 * Evaluates a tiny arithmetic expression ("12*2", "(100-8)/4", "-3.5").
 * Supports + - * / and parentheses only; returns null for anything else.
 * Used so number fields accept Figma-style math.
 */
export function evaluateExpression(input: string): number | null {
  const src = input.replace(/\s+/g, "");
  if (src === "" || !/^[\d.+\-*/()]+$/.test(src)) return null;
  let pos = 0;

  const peek = () => src[pos];
  const parseNumber = (): number | null => {
    const m = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(pos));
    if (!m) return null;
    pos += m[0].length;
    return Number.parseFloat(m[0]);
  };
  const parseFactor = (): number | null => {
    const c = peek();
    if (c === "-" || c === "+") {
      pos++;
      const v = parseFactor();
      return v == null ? null : c === "-" ? -v : v;
    }
    if (c === "(") {
      pos++;
      const v = parseSum();
      if (peek() !== ")") return null;
      pos++;
      return v;
    }
    return parseNumber();
  };
  const parseProduct = (): number | null => {
    let left = parseFactor();
    while (left != null && (peek() === "*" || peek() === "/")) {
      const op = src[pos++];
      const right = parseFactor();
      if (right == null) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  };
  function parseSum(): number | null {
    let left = parseProduct();
    while (left != null && (peek() === "+" || peek() === "-")) {
      const op = src[pos++];
      const right = parseProduct();
      if (right == null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  const result = parseSum();
  if (result == null || pos !== src.length || !Number.isFinite(result)) return null;
  return result;
}

export function decimalsOf(step: number): number {
  const s = String(step);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

export function clamp(v: number, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  return Math.min(max, Math.max(min, v));
}

export function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
