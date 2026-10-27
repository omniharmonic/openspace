/**
 * Dev outbox (Global Constraint 8): every email the Hub "sent" while no provider is configured.
 * DEV_MODE only — 404 otherwise; on an https Hub (ALLOW_DEV_MODE) a signed-in session is required.
 *
 * - `GET /dev/outbox`           HTML list with previews
 * - `GET /dev/outbox.json`      `{ messages: [...] }` (`?to=`, `?kind=`, `?siteId=`, `?limit=`) — for tests/Playwright
 * - `GET /dev/outbox/:id`       one message (JSON, with html/text/headers)
 * - `GET /dev/outbox/:id/html`  the HTML body, sandboxed
 * - `DELETE /dev/outbox`        clear
 */
import { esc } from "@omniharmonic/openspace-email-render";
import { Hono } from "hono";
import { notFound, unauthenticated } from "../../lib/errors";
import type { AppEnv } from "../../types";

export const devOutboxRoutes = new Hono<AppEnv>();

interface OutboxRow {
  id: string;
  site_id: string | null;
  to_addr: string;
  from_addr: string | null;
  subject: string;
  html: string | null;
  text: string | null;
  kind: string | null;
  status: string;
  created_at: number;
  reply_to: string | null;
  headers_json: string | null;
}

function toJson(r: OutboxRow, full: boolean) {
  return {
    id: r.id,
    siteId: r.site_id,
    to: r.to_addr,
    from: r.from_addr,
    replyTo: r.reply_to,
    subject: r.subject,
    kind: r.kind,
    createdAt: new Date(r.created_at).toISOString(),
    headers: r.headers_json ? (JSON.parse(r.headers_json) as Record<string, string>) : {},
    text: r.text,
    /** First http(s) links in the text body — handy for tests (confirm/unsubscribe links). */
    links: [...new Set((r.text ?? "").match(/https?:\/\/[^\s<>"')]+/g) ?? [])],
    ...(full ? { html: r.html } : {}),
  };
}

devOutboxRoutes.use("/dev/*", async (c, next) => {
  if (!c.var.config.devMode) throw notFound();
  // A public https Hub running DEV_MODE (ALLOW_DEV_MODE=true) must not expose everyone's mail.
  if (c.var.config.secureCookies && !c.var.user) throw unauthenticated();
  await next();
});

async function list(c: {
  var: AppEnv["Variables"];
  req: { query(k: string): string | undefined };
}) {
  const where: string[] = [];
  const args: unknown[] = [];
  for (const [param, col] of [
    ["to", "to_addr"],
    ["kind", "kind"],
    ["siteId", "site_id"],
  ] as const) {
    const v = c.req.query(param);
    if (v) {
      where.push(`${col} = ?`);
      args.push(v);
    }
  }
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  const rows = await c.var.services.db
    .prepare(
      `SELECT * FROM outbox ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .bind(...args, limit)
    .all<OutboxRow>();
  return rows.results;
}

devOutboxRoutes.get("/dev/outbox.json", async (c) =>
  c.json({ messages: (await list(c)).map((r) => toJson(r, false)) }),
);

devOutboxRoutes.get("/dev/outbox", async (c) => {
  const rows = await list(c);
  const items = rows
    .map(
      (r) => `<li><details><summary><strong>${esc(r.subject)}</strong> → ${esc(r.to_addr)}
<span class="meta">${esc(r.kind ?? "")} · ${esc(new Date(r.created_at).toISOString())}</span></summary>
<iframe sandbox title="${esc(r.subject)}" src="/dev/outbox/${esc(r.id)}/html" loading="lazy"></iframe>
<pre>${esc(r.text ?? "")}</pre></details></li>`,
    )
    .join("");
  return c.html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dev outbox</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:13px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#fafaf9;color:#1c1917}
h1{font-size:16px;margin:0 0 4px}p{color:#57534e;margin:0 0 16px}ul{list-style:none;padding:0;margin:0}
li{border:1px solid #e7e5e4;background:#fff;border-radius:6px;margin:0 0 8px;padding:8px 12px}
summary{cursor:pointer}.meta{color:#78716c;margin-left:8px}
iframe{width:100%;height:520px;border:1px solid #e7e5e4;border-radius:4px;margin:8px 0;background:#fff}
pre{white-space:pre-wrap;background:#f5f5f4;padding:8px;border-radius:4px}</style></head>
<body><h1>Dev outbox</h1><p>${rows.length} message${rows.length === 1 ? "" : "s"} the Hub would have sent. JSON: <a href="/dev/outbox.json">/dev/outbox.json</a></p>
<ul>${items || "<li>No emails yet.</li>"}</ul></body></html>`,
    200,
    { "Cache-Control": "no-store" },
  );
});

devOutboxRoutes.get("/dev/outbox/:id/html", async (c) => {
  const row = await c.var.services.db
    .prepare("SELECT html FROM outbox WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ html: string | null }>();
  if (!row) throw notFound();
  return c.html(row.html ?? "", 200, {
    "Content-Security-Policy":
      "sandbox; default-src 'none'; img-src * data:; style-src 'unsafe-inline'",
    "X-Content-Type-Options": "nosniff",
  });
});

devOutboxRoutes.get("/dev/outbox/:id", async (c) => {
  const row = await c.var.services.db
    .prepare("SELECT * FROM outbox WHERE id = ?")
    .bind(c.req.param("id"))
    .first<OutboxRow>();
  if (!row) throw notFound();
  return c.json(toJson(row, true));
});

devOutboxRoutes.delete("/dev/outbox", async (c) => {
  await c.var.services.db.prepare("DELETE FROM outbox").run();
  return c.json({ ok: true });
});
