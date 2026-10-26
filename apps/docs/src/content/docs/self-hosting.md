---
title: Self-hosting the Hub
description: Run your own OpenSpace Hub on Cloudflare Workers — deploy, configure GitHub, secrets and environment variables, and point Studio and sites at it.
---

The OpenSpace Hub is one Cloudflare Workers project (`apps/hub`, AGPL-3.0). Anyone can run their own, and every site names its Hub in `openspace.json`, so nothing depends on the public one.

:::caution[Turn DEV_MODE off]
The Hub's default configuration sets `DEV_MODE="true"`, which replaces GitHub with a local emulation and enables a **sign-in form that lets anyone sign in as anyone**. It's meant for local development and tests only. A Hub whose `HUB_URL` is `https://…` refuses DEV_MODE unless you also set `ALLOW_DEV_MODE="true"` — **never do that for a real Hub**. Deploy with the `production` environment, or set `DEV_MODE="false"`.
:::

## What you need

- A Cloudflare account on the **Workers Paid** plan ($5/month) — Durable Objects, Queues and the volume of a shared service need it. Small personal Hubs fit easily.
- A **GitHub App** of your own (below).
- Optionally: an email provider (Cloudflare Email Service, Resend or Postmark), Cloudflare Turnstile keys, and a Stripe platform account for Connect.

## Deploy

**One click:** use **Deploy to Cloudflare** with the Hub's folder:

```
https://deploy.workers.cloudflare.com/?url=https://github.com/omniharmonic/openspace/tree/main/apps/hub
```

Cloudflare forks the repository into your account, creates the D1 database, KV namespaces and R2 bucket the Worker needs, and deploys it. The one-click deploy uses the default (development) settings, so before using it **set `DEV_MODE` to `false` and `HUB_URL` to the Worker's `https://` address** under the Worker's Settings → Variables, add the secrets below, and redeploy.

**By hand:**

```sh
git clone https://github.com/omniharmonic/openspace && cd openspace
pnpm install
cd apps/hub
npx wrangler d1 create openspace-hub          # put the id in wrangler.jsonc
npx wrangler kv namespace create CACHE        # and OAUTH_KV
npx wrangler r2 bucket create openspace-hub-uploads
npx wrangler d1 migrations apply openspace-hub --remote --env production
npx wrangler deploy --env production
```

Replace the placeholder ids in `wrangler.jsonc`'s `production` environment with your own, and set `HUB_URL` and `STUDIO_ORIGIN` there.

## Create the GitHub App

In GitHub → Settings → Developer settings → **GitHub Apps → New GitHub App**:

- **Callback URL**: `https://<your-hub>/auth/github/callback`; turn on "Request user authorization (OAuth) during installation" and expiring user tokens.
- **Webhook URL**: `https://<your-hub>/webhooks/github`, with a secret.
- **Repository permissions**: Contents, Workflows, Pages, Administration, Secrets, Variables and Pull requests — read & write; Actions and Metadata — read. (Variables carry the public Turnstile site key to site builds.) **Account permissions**: Email addresses — read.
- **Events**: installation, installation repositories, GitHub app authorization, workflow run, push.

Note the App ID, client id and secret, and generate a private key.

## Variables

Set in `wrangler.jsonc` (`vars`):

| Variable | Meaning |
|---|---|
| `DEV_MODE` | `"false"` for any real Hub (see the warning above). |
| `HUB_URL` | The Hub's public `https://` address. Also the OAuth issuer and MCP resource (`${HUB_URL}/mcp`). |
| `STUDIO_ORIGIN` | Where your Studio is served, e.g. `https://studio.example.org`. |
| `GITHUB_APP_SLUG` | Your GitHub App's slug. |
| `LOG_LEVEL` | `debug`, `info`, `warn` or `error`. |
| `MCP_ALLOWED_ORIGINS` | Optional extra browser origins allowed to call `/mcp`. |

## Secrets

Set with `npx wrangler secret put NAME --env production`:

| Secret | Needed for |
|---|---|
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` | Acting on site repositories. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Signing people in. |
| `GITHUB_WEBHOOK_SECRET` | Verifying GitHub webhooks. |
| `TOKEN_ENC_KEY` | Encrypting tokens and secrets at rest — 32 random bytes, base64 (`openssl rand -base64 32`). |
| `HUB_SECRET` | Signing unsubscribe and similar links (falls back to `TOKEN_ENC_KEY`). |
| `EMAIL_FROM`, and `EMAIL_PROVIDER` with `RESEND_API_KEY` or `POSTMARK_TOKEN` | Transactional email (confirmations, sign-in links, notifications). With Cloudflare Email Service, the `EMAIL` binding is used. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Spam protection on forms and signups. |
| `CF_ACCOUNT_ID`, `CF_ANALYTICS_TOKEN` | Reading analytics from Analytics Engine. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe Connect checkout (no platform fee). |
| `MEMBER_JWT_PRIVATE_KEY` | Optional signing key for member sign-in tokens (otherwise generated and stored encrypted). |
| `QUOTAS_JSON` | Optional limit overrides, e.g. `{"formSubmissions":5000}`. |
| `ABUSE_EMAIL` | The abuse-report address shown in every campaign email ([details](/operators/budget-and-abuse/)). |
| `ALERT_EMAIL` | Who gets [budget alerts](/operators/budget-and-abuse/) at 80% of the plan allowances. |
| `PLAN_ALLOWANCES_JSON` | Optional plan allowances for budget alerts, e.g. `{"emails":200000}`. |
| `CAMPAIGN_DAILY_BASE`, `CAMPAIGN_DAILY_MAX` | Optional campaign warm-up: daily recipients for new senders, and the ceiling. |

Without the optional ones, those features are simply unavailable on a production Hub — it never fakes payments or email.

## Bindings and schedules

`wrangler.jsonc` declares: D1 `HUB_DB`, KV `CACHE` and `OAUTH_KV`, R2 `UPLOADS`, Durable Objects `DraftRoom` and `RateLimiter`, a rate limiter for analytics beacons, Analytics Engine `ANALYTICS`, the email-sending binding `EMAIL`, and cron triggers for scheduled publishes and campaigns (every minute), retention and digests (daily) and weekly analytics digests. An optional Queue speeds up large campaign sends.

## Point Studio and sites at your Hub

- Build Studio (`apps/studio`) with `VITE_HUB_URL=https://<your-hub>` and serve it at `STUDIO_ORIGIN`.
- Sites name their Hub in `openspace.json` (`"hub": "https://<your-hub>"`); `openspace new --hub <url>` sets it.
- MCP clients connect to `https://<your-hub>/mcp`.

## Running locally

```sh
pnpm install
pnpm --filter @openspace/hub dev     # applies local migrations, starts wrangler dev on :8787
pnpm --filter @openspace/studio dev  # Studio on :5173
```

Locally, DEV_MODE is on: GitHub is emulated, emails go to an outbox at `/dev/outbox`, checkout uses a fake Stripe page, and nothing needs an account.
