import type { Block, Site, Styles } from "@openspace/schema";
import { EmailRenderError } from "./diag";
import { esc, oneLine, safeUrl } from "./escape";
import { type RenderEmailInput, type RenderedEmail, renderWith } from "./layout";
import { buildEmailTheme, type EmailTheme } from "./theme";

export interface EmailResult extends RenderedEmail {
  subject: string;
}

interface Common {
  site: Pick<Site, "title" | "tagline" | "logo" | "social" | "locale"> | Site;
  styles?: Styles;
  /** Public origin of the site (e.g. https://maya.example). */
  baseUrl: string;
  /** Postal address lines for the footer. */
  postalAddress?: string | readonly string[];
}

let n = 0;
const blk = (type: string, fields: Record<string, unknown>): Block => {
  n += 1;
  return { id: `blk_t${n}` as Block["id"], type, v: 1, fields };
};
const doc = (...paras: string[]) => ({
  type: "doc",
  content: paras.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })),
});
const heading = (t: string) => blk("heading", { text: t, level: 1 });
const para = (...t: string[]) => blk("text", { content: doc(...t) });
const button = (label: string, href: string) =>
  blk("button", { label, link: { type: "url", url: href } });
const raw = (r: { html: string; text: string }) => blk("os-internal/html", r);

function render(c: Common, blocks: Block[], extra: Partial<RenderEmailInput>): RenderedEmail {
  return renderWith(
    {
      blocks,
      styles: c.styles,
      site: c.site,
      baseUrl: c.baseUrl,
      postalAddress: c.postalAddress,
      ...extra,
    },
    true,
  );
}

function absolute(url: string, baseUrl: string, what: string): string {
  const u = safeUrl(url, baseUrl);
  if (!u || u.startsWith("mailto:")) {
    throw new EmailRenderError(`${what} must be an absolute http(s) URL`);
  }
  return u;
}

const subjectText = (s: string) => oneLine(s).slice(0, 200);

/** Inline typography for table cells (clients do not inherit reliably into td/th). */
const cell = (t: EmailTheme, cls: "os-text" | "os-muted", extra = "") =>
  `font-family:${t.bodyFont};color:${cls === "os-text" ? t.light.text : t.light.muted};${extra}`;

// ---- double opt-in ------------------------------------------------------------------------

export interface ConfirmSubscriptionInput extends Common {
  confirmUrl: string;
}

export function confirmSubscriptionEmail(i: ConfirmSubscriptionInput): EmailResult {
  const title = oneLine(i.site.title);
  const url = absolute(i.confirmUrl, i.baseUrl, "confirmUrl");
  const r = render(
    i,
    [
      heading("Confirm your subscription"),
      para(
        `Thanks for signing up to ${title}. Please confirm your email address to start receiving updates.`,
      ),
      button("Confirm subscription", url),
      para("If the button does not work, copy and paste this link into your browser:", url),
      para(
        "If you did not sign up, you can safely ignore this email and you will not be subscribed.",
      ),
    ],
    {
      preheader: `Confirm your subscription to ${title}`,
      title: `Confirm your subscription to ${title}`,
      footerNote: "You are receiving this because this address was used to sign up.",
    },
  );
  return { subject: subjectText(`Confirm your subscription to ${title}`), ...r };
}

// ---- form notification --------------------------------------------------------------------

export interface FormNotificationInput extends Common {
  formName: string;
  entries: { label: string; value: string }[];
  /** Absolute link to the inbox entry in Studio. */
  entryUrl?: string;
  submittedAt?: string;
  /** Submitter's email address; adds a "Reply" button (mailto:). */
  replyTo?: string;
}

export function formNotificationEmail(i: FormNotificationInput): EmailResult {
  const form = oneLine(i.formName) || "form";
  const t = buildEmailTheme(i.styles).theme;
  const rule = `border-bottom:1px solid ${t.light.border};`;
  const rows = i.entries
    .map(
      (e) =>
        `<tr><td class="os-muted os-rule" valign="top" width="35%" style="padding:10px 12px 10px 0;${rule}${cell(t, "os-muted", "font-size:14px;line-height:20px;font-weight:700;")}">${esc(oneLine(e.label))}</td><td class="os-text os-rule" valign="top" style="padding:10px 0;${rule}${cell(t, "os-text", "font-size:15px;line-height:22px;white-space:pre-wrap;")}">${esc(String(e.value ?? ""))}</td></tr>`,
    )
    .join("");
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">${rows}</table>`;
  const entryUrl = i.entryUrl ? absolute(i.entryUrl, i.baseUrl, "entryUrl") : null;
  const reply =
    i.replyTo && /^[^\s@<>"?,]+@[^\s@<>"?,]+$/.test(i.replyTo) ? `mailto:${i.replyTo}` : null;
  if (i.replyTo && !reply) throw new EmailRenderError("replyTo must be a valid email address");
  const r = render(
    i,
    [
      heading(`New ${form} submission`),
      ...(i.submittedAt ? [para(`Received ${oneLine(i.submittedAt)}`)] : []),
      raw({
        html: table,
        text: i.entries.map((e) => `${oneLine(e.label)}: ${String(e.value ?? "")}`).join("\n"),
      }),
      ...(entryUrl ? [button("View in inbox", entryUrl)] : []),
      ...(reply
        ? [blk("button", { label: "Reply", link: { type: "url", url: reply }, role: "secondary" })]
        : []),
    ],
    {
      preheader: `New submission from ${form}`,
      title: `New ${form} submission`,
      footerNote: "You are receiving this because form notifications are on for your site.",
    },
  );
  return { subject: subjectText(`New ${form} submission`), ...r };
}

// ---- magic link ---------------------------------------------------------------------------

export interface MagicLinkInput extends Common {
  url: string;
  /** Minutes until the link expires. */
  expiresInMinutes?: number;
}

export function magicLinkEmail(i: MagicLinkInput): EmailResult {
  const title = oneLine(i.site.title);
  const url = absolute(i.url, i.baseUrl, "url");
  const mins = Math.max(1, Math.round(i.expiresInMinutes ?? 15));
  const r = render(
    i,
    [
      heading(`Sign in to ${title}`),
      para(
        `Use the button below to sign in. This link expires in ${mins} ${mins === 1 ? "minute" : "minutes"} and can only be used once.`,
      ),
      button("Sign in", url),
      para("If the button does not work, copy and paste this link into your browser:", url),
      para(
        "If you did not request this, you can ignore this email. Nobody can sign in without this link.",
      ),
    ],
    { preheader: `Your sign-in link for ${title}`, title: `Sign in to ${title}` },
  );
  return { subject: subjectText(`Your sign-in link for ${title}`), ...r };
}

// ---- order receipt ------------------------------------------------------------------------

export interface OrderReceiptInput extends Common {
  orderNumber: string;
  currency: string;
  /** Amounts in the currency's minor unit (cents; yen for JPY; fils for BHD). */
  items: { name: string; quantity: number; unitAmount: number; variant?: string }[];
  subtotal?: number;
  shipping?: number;
  tax?: number;
  discount?: number;
  total: number;
  shippingAddress?: string[];
  orderUrl?: string;
  locale?: string;
}

/** Minor-unit exponent for a currency (USD 2, JPY 0, BHD 3), from Intl. */
export function currencyExponent(currency: string, locale = "en-US"): number {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits as number;
  } catch {
    return 2;
  }
}

function formatMoney(amount: number, currency: string, locale = "en-US"): string {
  const code = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "USD";
  const exp = currencyExponent(code, locale);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(
      amount / 10 ** exp,
    );
  } catch {
    return `${(amount / 10 ** exp).toFixed(exp)} ${code}`;
  }
}

export function orderReceiptEmail(i: OrderReceiptInput): EmailResult {
  const title = oneLine(i.site.title);
  const order = oneLine(i.orderNumber);
  const t = buildEmailTheme(i.styles).theme;
  const m = (a: number) => formatMoney(a, i.currency, i.locale);
  const items = i.items.map((it) => ({
    name: oneLine(it.name),
    variant: it.variant ? oneLine(it.variant) : "",
    qty: Math.max(0, Math.floor(Number(it.quantity) || 0)),
    unit: it.unitAmount,
  }));
  const td = `padding:10px 0;border-bottom:1px solid ${t.light.border};${cell(t, "os-text", "font-size:15px;line-height:22px;")}`;
  const th = cell(
    t,
    "os-muted",
    "padding:0 0 8px 0;font-size:13px;line-height:20px;font-weight:700;",
  );
  const itemRows = items
    .map(
      (it) =>
        `<tr><td class="os-text os-rule" style="${td}">${esc(it.name)}${it.variant ? `<br><span class="os-muted" style="${cell(t, "os-muted", "font-size:13px;")}">${esc(it.variant)}</span>` : ""}</td><td class="os-text os-rule" align="center" style="${td}">${it.qty}</td><td class="os-text os-rule" align="right" style="${td}">${m(it.unit * it.qty)}</td></tr>`,
    )
    .join("");
  const sumStyle = (bold: boolean) =>
    cell(
      t,
      "os-text",
      `padding:6px 0 0 0;font-size:15px;line-height:22px;${bold ? "font-weight:700;" : ""}`,
    );
  const sums: [string, number, boolean][] = [];
  if (i.subtotal != null) sums.push(["Subtotal", i.subtotal, false]);
  if (i.discount) sums.push(["Discount", -Math.abs(i.discount), false]);
  if (i.shipping != null) sums.push(["Shipping", i.shipping, false]);
  if (i.tax != null) sums.push(["Tax", i.tax, false]);
  sums.push(["Total", i.total, true]);
  const sumRows = sums
    .map(
      ([l, a, b]) =>
        `<tr><td colspan="2" class="os-text" align="right" style="${sumStyle(b)}padding-right:12px;">${l}</td><td class="os-text" align="right" style="${sumStyle(b)}">${m(a)}</td></tr>`,
    )
    .join("");
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><th class="os-muted" align="left" style="${th}">Item</th><th class="os-muted" align="center" style="${th}">Qty</th><th class="os-muted" align="right" style="${th}">Price</th></tr>${itemRows}${sumRows}</table>`;
  const tableText = [
    items
      .map(
        (it) =>
          `${it.qty} x ${it.name}${it.variant ? ` (${it.variant})` : ""} - ${m(it.unit * it.qty)}`,
      )
      .join("\n"),
    sums.map(([l, a]) => `${l}: ${m(a)}`).join("\n"),
  ].join("\n\n");
  const orderUrl = i.orderUrl ? absolute(i.orderUrl, i.baseUrl, "orderUrl") : null;
  const addr = i.shippingAddress?.map(oneLine).filter(Boolean) ?? [];
  const r = render(
    i,
    [
      heading("Thank you for your order"),
      para(`Order ${order} from ${title} is confirmed. Here is your receipt.`),
      raw({ html: table, text: tableText }),
      ...(addr.length ? [para(`Shipping to: ${addr.join(", ")}`)] : []),
      ...(orderUrl ? [button("View your order", orderUrl)] : []),
    ],
    {
      preheader: `Receipt for order ${order}: ${m(i.total)}`,
      title: `Receipt for order ${order}`,
      footerNote: "This is a receipt for your records.",
    },
  );
  return { subject: subjectText(`Your ${title} order ${order}`), ...r };
}

// ---- campaign wrapper ---------------------------------------------------------------------

export interface CampaignEmailInput extends Common {
  subject: string;
  blocks: readonly Block[];
  preheader?: string;
  /** Usable http(s) URL or `{ mergeTag }`; throws otherwise. */
  unsubscribeUrl: string | { mergeTag: string };
  viewInBrowserUrl?: string;
  resolveLink?: RenderEmailInput["resolveLink"];
}

export function campaignEmail(i: CampaignEmailInput): EmailResult {
  const r = renderWith(
    {
      blocks: i.blocks,
      styles: i.styles,
      site: i.site,
      baseUrl: i.baseUrl,
      preheader: i.preheader,
      unsubscribeUrl: i.unsubscribeUrl,
      viewInBrowserUrl: i.viewInBrowserUrl,
      title: i.subject,
      footerNote: "You are receiving this because you subscribed to our newsletter.",
      postalAddress: i.postalAddress,
      resolveLink: i.resolveLink,
    },
    false,
  );
  return { subject: subjectText(i.subject), ...r };
}
