import { Hono } from "hono";
import { sessionMiddleware } from "./auth/session";
import { readConfig } from "./env";
import { studioCors, studioOrigins } from "./lib/cors";
import { errorBody } from "./lib/errors";
import { handleError } from "./lib/handle-error";
import { createLogger } from "./lib/log";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { previewRoutes } from "./routes/preview";
import { publicAnalyticsRoutes } from "./routes/public/analytics";
import { devOutboxRoutes } from "./routes/public/dev-outbox";
import { publicFormRoutes } from "./routes/public/forms";
import { publicNewsletterRoutes } from "./routes/public/newsletter";
import { domainInfoRoutes, siteServiceRoutes } from "./routes/site-services";
import { siteRoutes } from "./routes/sites";
import { templateRoutes } from "./routes/templates";
import { createServices, type ServiceOverrides } from "./services";
import type { AppEnv } from "./types";

export interface CreateAppOptions {
  /** Swap services (templates, renderer, GitHub access, fetch, clock) — tests and later tasks. */
  services?: ServiceOverrides;
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<AppEnv>();

  // Request context: id, config, logger, services. Everything is per request.
  app.use("*", async (c, next) => {
    const config = readConfig(c.env);
    const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
    const log = createLogger(config.logLevel, { requestId });
    c.set("requestId", requestId);
    c.set("config", config);
    c.set("log", log);
    c.set("services", createServices(c.env, config, options.services));
    if (config.devModeRefused)
      log.warn("DEV_MODE ignored: HUB_URL is https and ALLOW_DEV_MODE is not set");
    const started = Date.now();
    await next();
    c.header("X-Request-Id", requestId);
    log.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
    });
  });

  // Studio APIs: credentialed CORS + a same-origin check on state-changing requests.
  for (const prefix of ["/api/*", "/auth/*"]) {
    app.use(prefix, async (c, next) => studioCors(c.var.config)(c, next));
    app.use(prefix, async (c, next) => {
      const origin = c.req.header("origin");
      if (UNSAFE.has(c.req.method) && origin && !studioOrigins(c.var.config).includes(origin))
        return c.json(
          errorBody("forbidden_origin", "Requests from this origin are not allowed."),
          403,
        );
      await next();
    });
  }

  app.use("*", sessionMiddleware);

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/auth", authRoutes);
  app.route("/api", meRoutes);
  app.route("/api/templates", templateRoutes);
  app.route("/api/sites", siteRoutes);
  // Task 16: Studio APIs for forms, newsletter, analytics, domains, quotas, audit, export.
  app.route("/api/sites", siteServiceRoutes);
  app.route("/api/domains", domainInfoRoutes);
  // Task 16: public endpoints called from published sites, and the dev outbox.
  app.route("/", publicFormRoutes);
  app.route("/", publicNewsletterRoutes);
  app.route("/", publicAnalyticsRoutes);
  app.route("/", devOutboxRoutes);
  app.route("/", previewRoutes);

  app.notFound((c) => c.json(errorBody("not_found", "Not found."), 404));
  app.onError(handleError);
  return app;
}

export const app = createApp();
