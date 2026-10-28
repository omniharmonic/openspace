import { Hono } from "hono";
import { sessionMiddleware } from "./auth/session";
import { readConfig } from "./env";
import { studioCors, studioOrigins } from "./lib/cors";
import { errorBody } from "./lib/errors";
import { handleError } from "./lib/handle-error";
import { createLogger, redactSecrets } from "./lib/log";
import { securityHeaders } from "./lib/security-headers";
import { authRoutes } from "./routes/auth";
import { ciRoutes } from "./routes/ci";
import { collaboratorRoutes, invitationRoutes } from "./routes/collaborators";
import { devGitHubRoutes, githubInstallRoutes } from "./routes/github-install";
import { growthRoutes } from "./routes/growth";
import { hostingRoutes } from "./routes/hosting";
import { importRoutes, siteImportRoutes } from "./routes/imports";
import { mcpGrantRoutes, mcpRoutes, mcpTokenRoutes } from "./routes/mcp";
import { meRoutes } from "./routes/me";
import { mediaRoutes } from "./routes/media";
import { previewRoutes } from "./routes/preview";
import { publicAnalyticsRoutes } from "./routes/public/analytics";
import { campaignTrackingRoutes } from "./routes/public/campaign-tracking";
import { publicCheckoutRoutes } from "./routes/public/checkout";
import { devOutboxRoutes } from "./routes/public/dev-outbox";
import { devStripeRoutes } from "./routes/public/dev-stripe";
import { publicFormRoutes } from "./routes/public/forms";
import { publicMemberRoutes } from "./routes/public/members";
import { publicNewsletterRoutes } from "./routes/public/newsletter";
import { publishingRoutes } from "./routes/publishing";
import { roomRoutes } from "./routes/room";
import { setupRoutes } from "./routes/setup";
import { domainInfoRoutes, siteServiceRoutes } from "./routes/site-services";
import { siteRoutes } from "./routes/sites";
import { startRoutes } from "./routes/start";
import { templateRoutes } from "./routes/templates";
import { webhookRoutes } from "./routes/webhooks";
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
      path: redactSecrets(c.req.path),
      status: c.res.status,
      ms: Date.now() - started,
    });
  });

  app.use("*", securityHeaders());

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
  app.route("/auth", githubInstallRoutes);
  app.route("/", devGitHubRoutes);
  app.route("/api", meRoutes);
  app.route("/api/templates", templateRoutes);
  app.route("/api/sites", siteRoutes);
  // Hosted imports ("Move my site") and in-place conversions of GitHub Pages repositories.
  app.route("/api/imports", importRoutes);
  app.route("/api/start", startRoutes);
  app.route("/api/sites", siteImportRoutes);
  // Task 16: Studio APIs for forms, newsletter, analytics, domains, quotas, audit, export.
  app.route("/api/sites", siteServiceRoutes);
  app.route("/api/domains", domainInfoRoutes);
  // Task 16: public endpoints called from published sites, and the dev outbox.
  app.route("/", publicFormRoutes);
  app.route("/", publicNewsletterRoutes);
  app.route("/", publicAnalyticsRoutes);
  app.route("/", devOutboxRoutes);
  // Task 18: growth + commerce — checkout, Stripe webhooks, members, campaign tracking, Studio APIs.
  app.route("/", publicCheckoutRoutes);
  app.route("/", publicMemberRoutes);
  app.route("/", campaignTrackingRoutes);
  app.route("/", devStripeRoutes);
  app.route("/api/sites", growthRoutes);
  app.route("/api/sites", roomRoutes);
  app.route("/api/sites", publishingRoutes);
  app.route("/api/sites", collaboratorRoutes);
  app.route("/api/invitations", invitationRoutes);
  app.route("/webhooks", webhookRoutes);
  // Task 17: remote MCP server, its OAuth authorization server, and Studio's connection APIs.
  app.route("/api/mcp", mcpGrantRoutes);
  app.route("/api/sites", mcpTokenRoutes);
  app.route("/api/sites", mediaRoutes);
  app.route("/api/sites", hostingRoutes);
  app.route("/api/sites", setupRoutes);
  app.route("/", mcpRoutes);
  // The site's own publish workflow (GitHub Actions OIDC): gated content for Cloudflare deploys.
  app.route("/ci", ciRoutes);
  app.route("/", previewRoutes);

  app.notFound((c) => c.json(errorBody("not_found", "Not found."), 404));
  app.onError(handleError);
  return app;
}

export const app = createApp();
