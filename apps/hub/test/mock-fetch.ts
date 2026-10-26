export interface RecordedCall {
  method: string;
  url: string;
  path: string;
  headers: Headers;
  body: unknown;
}

type Handler = (
  call: RecordedCall,
  match: RegExpMatchArray,
) => unknown | Response | Promise<unknown>;

/**
 * A tiny fetch mock: routes are `[method, regex over pathname+search, handler]`. Handlers return
 * a Response or a JSON-able value (200). Unmatched requests fail the test loudly.
 */
export function mockFetch(routes: Array<[string, RegExp, Handler]>) {
  const calls: RecordedCall[] = [];
  const fetchFn = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const text = req.method === "GET" ? "" : await req.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      /* keep text */
    }
    const call: RecordedCall = {
      method: req.method,
      url: req.url,
      path: `${url.host === "api.github.com" ? "" : url.host}${url.pathname}${url.search}`,
      headers: req.headers,
      body,
    };
    calls.push(call);
    for (const [method, re, handler] of routes) {
      if (method !== req.method) continue;
      const m = call.path.match(re);
      if (!m) continue;
      const out = await handler(call, m);
      if (out instanceof Response) return out;
      return Response.json(out ?? {});
    }
    return new Response(JSON.stringify({ message: `unmocked ${req.method} ${call.path}` }), {
      status: 599,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fetchFn, calls };
}

export const status = (code: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status: code,
    headers: { "content-type": "application/json" },
  });
