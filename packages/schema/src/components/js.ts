/**
 * Component behaviour JavaScript (ADR custom-components §4). The source is the body of
 * `function (root, ctx)`, run once per instance on published pages (never in the Studio canvas).
 *
 * `checkComponentJs` is a static guard rail against accidents and prompt-injected output — no
 * network, no dynamic code, no HTML injection, no storage, no navigation. It is not a sandbox:
 * only owners and designers can author component code (enforced by the ops role rules).
 */

export interface JsIssue {
  message: string;
  line: number;
}

/** Hard size limit (the lint budget is lower). */
export const MAX_JS_CHARS = 12_000;

const RULES: Array<[RegExp, string]> = [
  [/\bfetch\s*\(/, "fetch() isn't allowed: components can't use the network"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest isn't allowed: components can't use the network"],
  [/\bWebSocket\b/, "WebSocket isn't allowed: components can't use the network"],
  [/\bEventSource\b/, "EventSource isn't allowed: components can't use the network"],
  [/\bsendBeacon\b/, "sendBeacon isn't allowed: components can't use the network"],
  [
    /\bimport\s*\(|^\s*import\s|\bimport\s*\{|\bimportScripts\b/m,
    "Components can't load other code",
  ],
  [/\brequire\s*\(/, "Components can't load other code"],
  [/\beval\s*\(/, "eval isn't allowed"],
  [/\bFunction\s*\(|\bnew\s+Function\b/, "Creating functions from text isn't allowed"],
  [/\bset(?:Timeout|Interval)\s*\(\s*['"`]/, "Timers must be given a function, not text"],
  [/\b(?:Shared)?Worker\s*\(|\bserviceWorker\b/, "Workers aren't allowed"],
  [/\bpostMessage\b/, "postMessage isn't allowed"],
  [
    /\.(?:inner|outer)HTML\b|\binsertAdjacentHTML\b|\bdocument\s*\.\s*write/,
    "Writing HTML isn't allowed; change classes, attributes or textContent instead",
  ],
  [/\bcreateContextualFragment\b|\bDOMParser\b|\bsrcdoc\b/, "Writing HTML isn't allowed"],
  [
    /\bdocument\s*\.\s*cookie\b|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bcaches\b/,
    "Components can't read or store data in the browser",
  ],
  [
    /\blocation\s*(?:\.\s*(?:href|assign|replace)\s*[=(]|=)|\bwindow\s*\.\s*open\b|\bhistory\s*\.\s*(?:push|replace)State\b/,
    "Components can't navigate away from the page",
  ],
  [
    /\bnavigator\s*\.\s*(?:clipboard|geolocation|mediaDevices|credentials|share)\b/,
    "Components can't use device features",
  ],
  [
    /\bdocument\s*\.\s*(?:createElement\s*\(\s*['"`](?:script|iframe|link|style|object|embed|form)|head\b)/i,
    "Components can't add scripts, frames or styles to the page",
  ],
  [
    /\bsetAttribute\s*\(\s*['"`](?:on\w+|src|srcdoc|href|style)['"`]/i,
    "Setting event handlers, sources or links from JavaScript isn't allowed",
  ],
  [/<\/script|<!--/i, "The code can't contain </script or <!--"],
  [/\bwindow\s*\[|\bglobalThis\s*\[|\bself\s*\[/, "Dynamic global access isn't allowed"],
  [/\bdebugger\b/, "Remove debugger statements"],
];

/** Static checks for a component's JavaScript. */
export function checkComponentJs(src: string): JsIssue[] {
  const issues: JsIssue[] = [];
  if (src.length > MAX_JS_CHARS)
    return [{ message: `The JavaScript is longer than ${MAX_JS_CHARS} characters`, line: 1 }];
  // Strip comments and string contents so rules match code (quotes kept for the timer rule).
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p: string) => p + " ".repeat(m.length - p.length));
  const lines = code.split("\n");
  lines.forEach((text, n) => {
    for (const [re, message] of RULES)
      if (re.test(text) && !issues.some((x) => x.message === message && x.line === n + 1))
        issues.push({ message, line: n + 1 });
  });
  // Multi-line constructs (e.g. `fetch\n(`) — check the whole text once more.
  for (const [re, message] of RULES)
    if (re.test(code.replace(/\s+/g, " ")) && !issues.some((x) => x.message === message))
      issues.push({ message, line: 1 });
  return issues;
}

/** True when the code reads `ctx.reducedMotion` (lint: animating code must honour it). */
export const readsReducedMotion = (src: string) => /\breducedMotion\b/.test(src);

/** True when the code looks like it animates (lint uses it with `readsReducedMotion`). */
export const looksAnimated = (src: string) =>
  /\b(?:requestAnimationFrame|animate\s*\(|scrollTo|scrollBy|setInterval|transition|transform)\b/.test(
    src,
  );
