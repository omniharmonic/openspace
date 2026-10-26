import { Hono } from "hono";
import { errorBody } from "../lib/errors";
import { handleGitHubEvent, verifyGitHubSignature } from "../services/webhooks";
import type { AppEnv } from "../types";

/** `POST /webhooks/github` — GitHub App events, HMAC-verified (Global Constraint 12). */
export const webhookRoutes = new Hono<AppEnv>();

webhookRoutes.post("/github", async (c) => {
  const secret = c.var.config.webhookSecret;
  if (!secret)
    return c.json(errorBody("webhooks_not_configured", "Webhook secret is not configured."), 503);
  const body = await c.req.text();
  if (!(await verifyGitHubSignature(secret, body, c.req.header("x-hub-signature-256")))) {
    c.var.log.warn("webhook signature mismatch", { delivery: c.req.header("x-github-delivery") });
    return c.json(errorBody("bad_signature", "Signature doesn't match."), 401);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return c.json(errorBody("invalid_json", "The request body must be JSON."), 400);
  }
  const event = c.req.header("x-github-event") ?? "";
  const result = await handleGitHubEvent(c.env, c.var.services, event, payload, c.var.log);
  return c.json({ ok: true, event, result }, 202);
});
