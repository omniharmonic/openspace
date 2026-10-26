import { env } from "cloudflare:test";
import { type CreateAppOptions, createApp } from "../src/app";

export const STUDIO = "http://localhost:5173";

export type TestApp = ReturnType<typeof createApp>;

export function makeApp(options: CreateAppOptions = {}) {
  return createApp(options);
}

export function call(
  app: TestApp,
  path: string,
  init: RequestInit & { cookie?: string; json?: unknown } = {},
  bindings: Record<string, unknown> = env as unknown as Record<string, unknown>,
) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("Cookie", init.cookie);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const { cookie: _c, json: _j, ...rest } = init;
  return app.request(path, { ...rest, headers, body }, bindings);
}

/** `name=value` from a Set-Cookie header. */
export function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw.split(";")[0] ?? "";
}

export async function devLogin(app: TestApp, name = "Maya Lin"): Promise<string> {
  const res = await call(app, "/auth/dev/login", { method: "POST", json: { name } });
  if (res.status !== 200) throw new Error(`dev login failed: ${res.status} ${await res.text()}`);
  return cookieFrom(res);
}
