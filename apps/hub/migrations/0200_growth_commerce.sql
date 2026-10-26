-- Task 18: Hub growth + commerce — campaigns with owner senders, members (magic links, tiers,
-- JWKS), products/inventory/orders, Stripe Checkout (Connect + sovereign), discount codes and
-- the update bot. Additive only. Times are ms since the Unix epoch; JSON columns end in _json.

-- ---------------------------------------------------------------------------------------------
-- Campaigns (arch §9.2): the owner's own sender, segments by tag, tracking, bounces.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE sender_connections (
  id                 TEXT PRIMARY KEY,                    -- snd_…
  site_id            TEXT NOT NULL,
  provider           TEXT NOT NULL,                       -- resend | postmark | ses | cloudflare | dev
  from_email         TEXT NOT NULL,
  from_name          TEXT,
  reply_to           TEXT,
  domain             TEXT NOT NULL,                       -- domain of from_email (checked via DoH)
  dkim_selector      TEXT,
  credentials_enc    TEXT,                                -- AES-GCM sealed JSON (TOKEN_ENC_KEY)
  webhook_secret_enc TEXT,                                -- provider webhook signing secret, sealed
  status             TEXT NOT NULL DEFAULT 'unverified',  -- unverified | verified | failed
  dns_json           TEXT,                                -- last SPF/DKIM/DMARC checklist
  verified_at        INTEGER,
  checked_at         INTEGER,
  created_by         TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX sender_connections_site ON sender_connections(site_id);

ALTER TABLE campaigns ADD COLUMN preheader TEXT;
ALTER TABLE campaigns ADD COLUMN segment_json TEXT;        -- {"tags":[…],"match":"any"|"all"}
ALTER TABLE campaigns ADD COLUMN sender_id TEXT;
ALTER TABLE campaigns ADD COLUMN links_json TEXT;          -- tracked links frozen at send time
ALTER TABLE campaigns ADD COLUMN recipients INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN error TEXT;
ALTER TABLE campaigns ADD COLUMN created_by TEXT;
ALTER TABLE campaigns ADD COLUMN updated_at INTEGER;
ALTER TABLE campaigns ADD COLUMN started_at INTEGER;
ALTER TABLE campaigns ADD COLUMN finished_at INTEGER;
CREATE INDEX campaigns_due ON campaigns(status, send_at);

CREATE TABLE campaign_recipients (
  id            TEXT PRIMARY KEY,                         -- rcp_…
  campaign_id   TEXT NOT NULL,
  site_id       TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  email         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',           -- queued | sending | sent | failed | bounced | complained
  message_id    TEXT,
  error         TEXT,
  sent_at       INTEGER,
  opened_at     INTEGER,
  clicked_at    INTEGER,
  UNIQUE (campaign_id, subscriber_id)
);
CREATE INDEX campaign_recipients_status ON campaign_recipients(campaign_id, status);
CREATE INDEX campaign_recipients_message ON campaign_recipients(message_id);
CREATE INDEX campaign_recipients_site ON campaign_recipients(site_id, email);

CREATE TABLE campaign_clicks (
  campaign_id  TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  link_idx     INTEGER NOT NULL,
  at           INTEGER NOT NULL
);
CREATE INDEX campaign_clicks_campaign ON campaign_clicks(campaign_id, link_idx);

-- Hard bounces and complaints suppress the address (status = 'unsubscribed' + the reason).
ALTER TABLE subscribers ADD COLUMN suppressed_reason TEXT;  -- bounce | complaint

-- ---------------------------------------------------------------------------------------------
-- Members (arch §9.4): magic links, tiers, Hub-signed ES256 tokens, page passwords.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE members ADD COLUMN name TEXT;
ALTER TABLE members ADD COLUMN subscription_id TEXT;        -- Stripe subscription for paid tiers
ALTER TABLE members ADD COLUMN source TEXT;                 -- signup | invite | checkout | import
ALTER TABLE members ADD COLUMN last_login_at INTEGER;
ALTER TABLE members ADD COLUMN updated_at INTEGER;
CREATE INDEX members_site ON members(site_id, created_at);
CREATE INDEX members_subscription ON members(subscription_id);

ALTER TABLE member_tokens ADD COLUMN return_to TEXT;        -- site path to land on after sign-in
CREATE INDEX member_tokens_member ON member_tokens(member_id, kind, created_at);

CREATE TABLE member_tiers (
  id           TEXT PRIMARY KEY,                          -- tier_…
  site_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  price_amount INTEGER,                                   -- minor units; NULL = free tier
  currency     TEXT,
  interval     TEXT,                                      -- month | year (paid tiers)
  active       INTEGER NOT NULL DEFAULT 1,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX member_tiers_site ON member_tiers(site_id, position);

-- Hub signing keys for member tokens (ES256). Public JWKs are published at /.well-known/jwks.json.
CREATE TABLE hub_keys (
  kid         TEXT PRIMARY KEY,
  alg         TEXT NOT NULL,
  public_jwk  TEXT NOT NULL,
  private_jwk TEXT NOT NULL,                              -- sealed with TOKEN_ENC_KEY ("plain." only in DEV_MODE)
  created_at  INTEGER NOT NULL,
  retired_at  INTEGER
);

-- Shared page passwords (PBKDF2 hashes, the site-kit `pbkdf2$…` format). Never in content.
CREATE TABLE page_passwords (
  site_id    TEXT NOT NULL,
  page_id    TEXT NOT NULL,
  hash       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (site_id, page_id)
);

-- ---------------------------------------------------------------------------------------------
-- Commerce (arch §9.5)
-- ---------------------------------------------------------------------------------------------

CREATE TABLE commerce_settings (
  site_id               TEXT PRIMARY KEY,
  settings_json         TEXT NOT NULL DEFAULT '{}',
  mode                  TEXT NOT NULL DEFAULT 'connect',  -- connect | sovereign
  stripe_account        TEXT UNIQUE,                      -- connected Standard account (acct_…)
  charges_enabled       INTEGER NOT NULL DEFAULT 0,
  details_submitted     INTEGER NOT NULL DEFAULT 0,
  sovereign_key_enc     TEXT,                             -- owner's restricted key, sealed
  sovereign_webhook_enc TEXT,                             -- owner's webhook signing secret, sealed
  updated_at            INTEGER NOT NULL
);

ALTER TABLE inventory ADD COLUMN low_stock INTEGER;          -- per-SKU alert threshold (NULL = site default)
ALTER TABLE inventory ADD COLUMN alerted_at INTEGER;         -- low-stock alert sent (reset on restock)
ALTER TABLE inventory ADD COLUMN updated_at INTEGER;

-- Stock can never go below zero: a decrement that would oversell aborts its whole batch
-- (D1 batches are transactions), so multi-item orders are all-or-nothing.
CREATE TRIGGER inventory_no_oversell BEFORE UPDATE OF qty ON inventory
WHEN NEW.qty < 0
BEGIN
  SELECT RAISE(ABORT, 'insufficient_stock');
END;

ALTER TABLE orders ADD COLUMN number INTEGER;               -- per-site order number (#1001…)
ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'order';  -- order | donation | membership
ALTER TABLE orders ADD COLUMN mode TEXT;                    -- connect | sovereign | dev
ALTER TABLE orders ADD COLUMN stripe_account TEXT;
ALTER TABLE orders ADD COLUMN payment_intent TEXT;
ALTER TABLE orders ADD COLUMN subscription_id TEXT;
ALTER TABLE orders ADD COLUMN email TEXT;
ALTER TABLE orders ADD COLUMN customer_name TEXT;
ALTER TABLE orders ADD COLUMN amounts_json TEXT;            -- subtotal, shipping, tax, discount
ALTER TABLE orders ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN fulfillment TEXT NOT NULL DEFAULT 'unfulfilled';  -- unfulfilled | fulfilled
ALTER TABLE orders ADD COLUMN fulfilled_at INTEGER;
ALTER TABLE orders ADD COLUMN tracking TEXT;
ALTER TABLE orders ADD COLUMN refunded INTEGER NOT NULL DEFAULT 0;  -- minor units refunded
ALTER TABLE orders ADD COLUMN note TEXT;
ALTER TABLE orders ADD COLUMN meta_json TEXT;               -- tier id, interval, return paths
ALTER TABLE orders ADD COLUMN paid_at INTEGER;
ALTER TABLE orders ADD COLUMN updated_at INTEGER;
CREATE UNIQUE INDEX orders_stripe_session ON orders(stripe_session) WHERE stripe_session IS NOT NULL;
CREATE UNIQUE INDEX orders_number ON orders(site_id, number) WHERE number IS NOT NULL;
CREATE INDEX orders_site_status ON orders(site_id, status, created_at);

-- Processed webhook events (idempotency; Stripe retries and may deliver twice).
CREATE TABLE stripe_events (
  id          TEXT PRIMARY KEY,
  site_id     TEXT,
  type        TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE discount_codes (
  id                    TEXT PRIMARY KEY,                 -- dsc_…
  site_id               TEXT NOT NULL,
  code                  TEXT NOT NULL,
  percent_off           REAL,
  amount_off            INTEGER,
  currency              TEXT,
  max_redemptions       INTEGER,
  expires_at            INTEGER,
  stripe_coupon         TEXT,
  stripe_promotion_code TEXT,
  active                INTEGER NOT NULL DEFAULT 1,
  created_at            INTEGER NOT NULL,
  UNIQUE (site_id, code)
);

-- DevStripe (Global Constraint 8): checkout sessions and objects of the fake Stripe.
CREATE TABLE dev_stripe_objects (
  id         TEXT PRIMARY KEY,                            -- cs_dev_… | acct_dev_… | re_dev_… | …
  kind       TEXT NOT NULL,                               -- session | account | refund | coupon | promotion_code
  account    TEXT,
  status     TEXT,
  data_json  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------------------------
-- Update bot (arch §11.2)
-- ---------------------------------------------------------------------------------------------

CREATE TABLE site_updates (
  id             TEXT PRIMARY KEY,                        -- upd_…
  site_id        TEXT NOT NULL,
  from_version   TEXT NOT NULL,
  to_version     TEXT NOT NULL,
  changelog_json TEXT NOT NULL,
  security       INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending',         -- pending | applied | dismissed | failed | superseded
  branch         TEXT,
  pr_number      INTEGER,
  pr_url         TEXT,
  error          TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  applied_at     INTEGER,
  UNIQUE (site_id, to_version)
);
CREATE INDEX site_updates_site ON site_updates(site_id, status);
