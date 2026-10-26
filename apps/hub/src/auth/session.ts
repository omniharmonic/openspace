import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { lookupSession, SESSION_TTL_MS } from "../db/sessions";
import type { User } from "../db/users";
import { unauthenticated } from "../lib/errors";
import type { AppEnv } from "../types";

export const SESSION_COOKIE = "os_session";

export function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: number) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: c.var.config.secureCookies,
    sameSite: "Lax",
    path: "/",
    maxAge:
      Math.max(0, Math.floor((expiresAt - c.var.services.now()) / 1000)) || SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: c.var.config.secureCookies });
}

/** Loads the session (if any) into `c.var.user`; renews the cookie when the session slides. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const session = await lookupSession(c.var.services.db, token, c.var.services.now());
    if (session) {
      c.set("user", session.user);
      c.set("log", c.var.log.child({ userId: session.user.id }));
      if (session.renewed) setSessionCookie(c, token, session.expiresAt);
    } else clearSessionCookie(c);
  }
  await next();
};

export function requireUser(c: Context<AppEnv>): User {
  const user = c.var.user;
  if (!user) throw unauthenticated();
  return user;
}
