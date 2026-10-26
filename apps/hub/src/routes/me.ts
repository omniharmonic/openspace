import { Hono } from "hono";
import type { AppEnv } from "../types";
import { publicUser } from "./auth";

export const meRoutes = new Hono<AppEnv>();

/**
 * GET /api/me — `{ user, auth }`. Signed out is not an error: `user` is null and `auth` still
 * says which sign-in methods this Hub offers.
 */
meRoutes.get("/me", (c) => {
  const user = c.var.user;
  const { config } = c.var;
  return c.json({
    user: user ? publicUser(user) : null,
    auth: { github: config.github !== null, dev: config.devMode },
    devMode: config.devMode,
    github: { configured: config.github !== null, emulated: config.useDevGitHub },
  });
});
