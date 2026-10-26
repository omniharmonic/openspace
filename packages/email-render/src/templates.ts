import type { Block, Site, Styles } from "@openspace/schema";
import { esc, oneLine, safeUrl } from "./escape";
import { type RenderEmailInput, type RenderedEmail, renderEmail, renderWith } from "./layout";
import { buildEmailTheme } from "./theme";

export interface EmailResult extends RenderedEmail {
  subject: string;
}

interface Common {
  site: Pick<Site, "title" | "tagline" | "logo" | "social" | "locale"> | Site;
  styles?: Styles;
  /** Public origin of the site (e.g. https://maya.example). */
  baseUrl: string;
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

const raw = (html: string, text: string) => blk("os-internal/html", { html, text });

function render(c: Common, blocks: Block[], extra: Partial<RenderEmailInput>): RenderedEmail {
  return renderWith(
    buildEmailTheme(c.styles),
    {
      blocks,
      styles: c.styles,
      site: c.site,
      baseUrl: c.baseUrl,
      ...extra,
    },
    true,
  );
}

function absolute(url: string, baseUrl: string, what: string): string {
  const u = safeUrl(url, baseUrl);
  if (!u || u.startsWith("mailto:")) throw new Error(`${what} must be an absolute http(s) URL`);
  return u;
}

const subjectText = (s: string) => oneLine(s).slice(0, 200);

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
  replyTo?: string;
}

export function formNotificationEmail(i: FormNotificationInput): EmailResult {
  const form = oneLine(i.formName) || "form";
  const rows = i.entries
    .map(
      (e) =>
        `<tr><td class="os-muted os-rule" valign="top" width="35%" style="padding:10px 12px 10px 0;border-bottom:1px solid #e4e4e7;font-size:14px;line-height:20px;font-weight:700;">${esc(oneLine(e.label))}</td><td class="os-text os-rule" valign="top" style="padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:15px;line-height:22px;white-space:pre-wrap;">${esc(String(e.value ?? ""))}</td></tr>`,
    )
    .join("");
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">${rows}</table>`;
  const entryUrl = i.entryUrl ? absolute(i.entryUrl, i.baseUrl, "entryUrl") : null;
  const textEntries = i.entries
    .map((e) => `${oneLine(e.label)}: ${String(e.value ?? "")}`)
    .join("\n");
  const { html } = render(
    i,
    [
      heading(`New ${form} submission`),
      ...(i.submittedAt ? [para(`Received ${oneLine(i.submittedAt)}`)] : []),
      raw(table, textEntries),
      ...(entryUrl ? [button("View in inbox", entryUrl)] : []),
    ],
    {
      preheader: `New submission from ${form}`,
      title: `New ${form} submission`,
      footerNote: "You are receiving this because form notifications are on for your site.",
    },
  );
  const text = [
    `New ${form} submission`,
    i.submittedAt ? `Received ${oneLine(i.submittedAt)}` : "",
    i.entries.map((e) => `${oneLine(e.label)}: ${String(e.value ?? "")}`).join("\n"),
    entryUrl ? `View in inbox: ${entryUrl}` : "",
    "--\nYou are receiving this because form notifications are on for your site.",
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat("\n");
  return { subject: subjectText(`New ${form} submission`), html, text };
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
  const mins = i.expiresInMinutes ?? 15;
  const r = render(
    i,
    [
      heading(`Sign in to ${title}`),
      para(
        `Use the button below to sign in. This link expires in ${mins} minutes and can only be used once.`,
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
  /** Amounts in minor units (cents). */
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

function money(amount: number, currency: string, locale = "en-US"): string {
  const code = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "USD";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(
      amount / 100,
    );
  } catch {
    return `${(amount / 100).toFixed(2)} ${code}`;
  }
}

export function orderReceiptEmail(i: OrderReceiptInput): EmailResult {
  const title = oneLine(i.site.title);
  const order = oneLine(i.orderNumber);
  const m = (a: number) => money(a, i.currency, i.locale);
  const td = "padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:15px;line-height:22px;";
  const itemRows = i.items
    .map(
      (it) =>
        `<tr><td class="os-text os-rule" style="${td}">${esc(oneLine(it.name))}${it.variant ? `<br><span class="os-muted" style="font-size:13px;">${esc(oneLine(it.variant))}</span>` : ""}</td><td class="os-text os-rule" align="center" style="${td}">${Math.max(0, Math.floor(it.quantity))}</td><td class="os-text os-rule" align="right" style="${td}">${m(it.unitAmount * it.quantity)}</td></tr>`,
    )
    .join("");
  const sumRow = (label: string, amt: number, bold = false) =>
    `<tr><td colspan="2" class="os-text" align="right" style="padding:6px 12px 0 0;font-size:15px;line-height:22px;${bold ? "font-weight:700;" : ""}">${label}</td><td class="os-text" align="right" style="padding:6px 0 0 0;font-size:15px;line-height:22px;${bold ? "font-weight:700;" : ""}">${m(amt)}</td></tr>`;
  const sums = [
    i.subtotal != null ? sumRow("Subtotal", i.subtotal) : "",
    i.discount ? sumRow("Discount", -Math.abs(i.discount)) : "",
    i.shipping != null ? sumRow("Shipping", i.shipping) : "",
    i.tax != null ? sumRow("Tax", i.tax) : "",
    sumRow("Total", i.total, true),
  ].join("");
  const head = `<tr><th class="os-muted" align="left" style="padding:0 0 8px 0;font-size:13px;">Item</th><th class="os-muted" align="center" style="padding:0 0 8px 0;font-size:13px;">Qty</th><th class="os-muted" align="right" style="padding:0 0 8px 0;font-size:13px;">Price</th></tr>`;
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">${head}${itemRows}${sums}</table>`;
  const orderUrl = i.orderUrl ? absolute(i.orderUrl, i.baseUrl, "orderUrl") : null;
  const addr = i.shippingAddress?.map((l) => oneLine(l)).filter(Boolean) ?? [];
  const itemsText = i.items
    .map(
      (it) =>
        `${it.quantity} x ${oneLine(it.name)}${it.variant ? ` (${oneLine(it.variant)})` : ""} - ${m(it.unitAmount * it.quantity)}`,
    )
    .join("\n");
  const { html } = render(
    i,
    [
      heading("Thank you for your order"),
      para(`Order ${order} from ${title} is confirmed. Here is your receipt.`),
      raw(table, itemsText),
      ...(addr.length ? [blk("text", { content: doc(`Shipping to: ${addr.join(", ")}`) })] : []),
      ...(orderUrl ? [button("View your order", orderUrl)] : []),
    ],
    {
      preheader: `Receipt for order ${order}: ${m(i.total)}`,
      title: `Receipt for order ${order}`,
      footerNote: "This is a receipt for your records.",
    },
  );
  const text = [
    "Thank you for your order",
    `Order ${order} from ${title} is confirmed.`,
    i.items
      .map(
        (it) =>
          `${it.quantity} x ${oneLine(it.name)}${it.variant ? ` (${oneLine(it.variant)})` : ""} - ${m(it.unitAmount * it.quantity)}`,
      )
      .join("\n"),
    [
      i.subtotal != null ? `Subtotal: ${m(i.subtotal)}` : "",
      i.discount ? `Discount: ${m(-Math.abs(i.discount))}` : "",
      i.shipping != null ? `Shipping: ${m(i.shipping)}` : "",
      i.tax != null ? `Tax: ${m(i.tax)}` : "",
      `Total: ${m(i.total)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    addr.length ? `Shipping to:\n${addr.join("\n")}` : "",
    orderUrl ? `View your order: ${orderUrl}` : "",
    `--\nSent by ${title}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat("\n");
  return { subject: subjectText(`Your ${title} order ${order}`), html, text };
}

// ---- campaign wrapper ---------------------------------------------------------------------

export interface CampaignEmailInput extends Common {
  subject: string;
  blocks: readonly Block[];
  preheader?: string;
  unsubscribeUrl: string;
  viewInBrowserUrl?: string;
}

export function campaignEmail(i: CampaignEmailInput): EmailResult {
  const unsub = absolute(i.unsubscribeUrl, i.baseUrl, "unsubscribeUrl");
  const r = renderEmail({
    blocks: i.blocks,
    styles: i.styles,
    site: i.site,
    baseUrl: i.baseUrl,
    preheader: i.preheader,
    unsubscribeUrl: unsub,
    viewInBrowserUrl: i.viewInBrowserUrl,
    title: i.subject,
    footerNote: "You are receiving this because you subscribed to our newsletter.",
  });
  return { subject: subjectText(i.subject), ...r };
}
