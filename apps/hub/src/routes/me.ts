import { Hono } from "hono";
import { requireUser } from "../auth/session";
import type { AppEnv } from "../types";
import { publicUser } from "./auth";

export const meRoutes = new Hono<AppEnv>();

/** GET /api/me — 401 when signed out. */
meRoutes.get("/me", (c) => {
  const user = requireUser(c);
  const { config } = c.var;
  return c.json({
    user: publicUser(user),
    devMode: config.devMode,
    github: { configured: config.github !== null, emulated: config.useDevGitHub },
  });
});
