/**
 * Hub contract for the content, marketing and commerce surfaces (Task 25): forms inbox,
 * subscribers, analytics (Task 16), commerce, members, senders and campaigns (Task 18).
 *
 * Shapes mirror the Hub's documented responses. Money is always in minor units (cents) with an
 * ISO currency. The mock (./growth-mock.ts) implements the same interface offline.
 */

// --- service settings (Task 16) --------------------------------------------------------------

export interface ServiceSettings {
  /** Where form notifications go; null = the owner's account email. */
  notifyEmail: string | null;
  notifications: "instant" | "daily" | "off";
  /** Form entries are deleted after this many months (1–12). */
  retentionMonths: number;
  analyticsEnabled: boolean;
  weeklyDigest: boolean;
}

export interface Quota {
  resource:
    | "formSubmissions"
    | "transactionalEmails"
    | "analyticsPageviews"
    | "mcpOperations"
    | "subscribers"
    | "uploadBytes"
    | "storedSubmissionsMonths"
    | string;
  limit: number;
  used: number;
  period: "month" | "day" | "total" | "retention";
}

// --- forms inbox -----------------------------------------------------------------------------

export interface FormFieldSummary {
  name: string;
  label?: string;
  type?: string;
  [key: string]: unknown;
}

export interface FormSummary {
  id: string;
  name: string;
  fields: FormFieldSummary[];
  notifyOwner: boolean;
  action?: string;
  total: number;
  unread: number;
}

export interface Submission {
  id: string;
  formId: string;
  formName: string;
  data: Record<string, string | string[]>;
  read: boolean;
  spam: boolean;
  /** Page the entry was sent from. */
  source: string | null;
  createdAt: string;
  /** When retention deletes it. */
  purgeAt: string | null;
}

export interface SubmissionQuery {
  form?: string;
  q?: string;
  unread?: boolean;
  spam?: boolean;
  limit?: number;
  cursor?: string | null;
}

export interface SubmissionPage {
  submissions: Submission[];
  nextCursor: string | null;
  total: number;
  unread: number;
}

// --- subscribers -----------------------------------------------------------------------------

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed";

export interface Subscriber {
  id: string;
  email: string;
  firstName: string | null;
  status: SubscriberStatus;
  tags: string[];
  source: string | null;
  createdAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

export interface SubscriberQuery {
  status?: SubscriberStatus;
  tag?: string;
  q?: string;
  limit?: number;
  cursor?: string | null;
}

export interface SubscriberPage {
  subscribers: Subscriber[];
  nextCursor: string | null;
  counts: { total: number; confirmed: number; pending: number; unsubscribed: number };
}

export interface SubscriberImportResult {
  added: number;
  updated: number;
  skipped: Array<{ row: number; email: string; reason: string }>;
}

// --- analytics -------------------------------------------------------------------------------

export type AnalyticsRangeName = "day" | "week" | "month";

export type AnalyticsRange =
  | { range: AnalyticsRangeName }
  | { from: string; to: string /* YYYY-MM-DD */ };

export interface Breakdown {
  key: string;
  pageviews: number;
  visitors: number;
}

export interface AnalyticsReport {
  range: { name: string; from: string; to: string };
  totals: { pageviews: number; visits: number; uniques: number };
  series: Array<{ date: string; pageviews: number; visits: number }>;
  topPages: Breakdown[];
  referrers: Breakdown[];
  devices: Breakdown[];
  countries: Breakdown[];
  sources: Breakdown[];
  events: Breakdown[];
  /** `conversionRate` is null when there were no visits in the range. */
  forms: Array<{
    formId: string;
    name: string;
    submissions: number;
    conversionRate: number | null;
  }>;
  /** Some visits were counted 1-in-10 (above the monthly allowance). */
  sampled: boolean;
  store: "d1" | "analytics-engine" | string;
}

// --- commerce settings and payments ----------------------------------------------------------

export interface ShippingOption {
  id?: string;
  label: string;
  /** Minor units. */
  amount: number;
  minDays?: number;
  maxDays?: number;
  /** Free when the order subtotal (minor units) is at least this. */
  freeOver?: number;
}

export interface GrowthSettings {
  currency: string;
  /** At most 5. */
  shippingOptions: ShippingOption[];
  shippingCountries: string[];
  taxEnabled: boolean;
  allowPromotionCodes: boolean;
  /** Major units. */
  donationMin: number;
  donationMax: number;
  lowStockThreshold: number;
  alertEmail: string | null;
  membersSignup: "open" | "invite";
  autoMergeSecurity: boolean;
}

export interface PaymentsView {
  mode: "connect" | "sovereign";
  provider: "stripe" | "dev" | string;
  account: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  ready: boolean;
  hasSovereignKey: boolean;
  webhookUrl: string | null;
}

export interface CommerceSettingsView {
  settings: GrowthSettings;
  payments: PaymentsView;
}

// --- products and inventory ------------------------------------------------------------------

export interface ProductStock {
  sku: string;
  title: string;
  price: { amount: number; currency: string };
  available: boolean;
  digital: boolean;
  path: string;
  collection: string;
  slug: string;
  tracked: boolean;
  qty: number | null;
  lowStock: number | null;
  /** At or below the low-stock threshold. */
  low: boolean;
  /** A digital file is uploaded for this SKU. */
  hasFile: boolean;
}

export interface InventoryView {
  sku: string;
  qty?: number | null;
  lowStock?: number | null;
  tracked?: boolean;
}

// --- orders ----------------------------------------------------------------------------------

export type OrderStatus =
  | "pending"
  | "processing"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "out_of_stock"
  | "expired"
  | "failed";

export type OrderKind = "order" | "donation" | "membership";

export interface OrderItem {
  sku: string;
  title: string;
  qty: number;
  unitAmount: number;
  digital: boolean;
}

export interface OrderView {
  id: string;
  number: number;
  kind: OrderKind;
  status: OrderStatus;
  fulfillment: "unfulfilled" | "fulfilled";
  email: string | null;
  customerName: string | null;
  currency: string;
  total: number;
  refunded: number;
  amounts: { subtotal: number; shipping: number; tax: number; discount: number; total: number };
  items: OrderItem[];
  shipping: { name: string; address: Record<string, string | null> | string } | null;
  tracking: string | null;
  note: string | null;
  mode?: string;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  /** Something needs the owner's attention (a follow-up kept failing). */
  problem?: { message: string; attempts: number; gaveUp: boolean } | null;
}

export interface OrderQuery {
  status?: OrderStatus;
  kind?: OrderKind;
  fulfillment?: "unfulfilled" | "fulfilled";
  q?: string;
  from?: string;
  to?: string;
  /** Only orders that need attention. */
  problem?: boolean;
  /** Paid or partly refunded orders with something to post that isn't sent yet. */
  toSend?: boolean;
  limit?: number;
  cursor?: string | null;
}

export interface OrderPage {
  orders: OrderView[];
  nextCursor: string | null;
  /** Site-wide badge counts (ignore the filters and paging). */
  counts?: { toSend: number; problem: number };
}

// --- discounts -------------------------------------------------------------------------------

export interface DiscountCode {
  id: string;
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  maxRedemptions: number | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

export interface DiscountInput {
  code: string;
  percentOff?: number;
  amountOff?: number;
  currency?: string;
  maxRedemptions?: number;
  expiresAt?: string;
}

// --- members and tiers -----------------------------------------------------------------------

export interface Member {
  id: string;
  email: string;
  name: string | null;
  /** Tier id, or null for a free member. */
  tier: string | null;
  status: "active" | "blocked";
  source: string | null;
  paid: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface MemberQuery {
  tier?: string;
  status?: "active" | "blocked";
  q?: string;
  limit?: number;
  cursor?: string | null;
}

export interface MemberPage {
  members: Member[];
  total: number;
  nextCursor: string | null;
}

export interface MemberTier {
  id: string;
  name: string;
  description: string | null;
  price: { amount: number; currency: string; interval: "month" | "year" } | null;
  active: boolean;
  position: number;
  members: number;
}

export interface TierInput {
  name: string;
  description?: string | null;
  price?: { amount: number; currency: string; interval: "month" | "year" } | null;
  active?: boolean;
  position?: number;
}

// --- senders and campaigns -------------------------------------------------------------------

export type SenderProvider = "resend" | "postmark" | "ses" | "cloudflare" | "dev";

export interface SenderCheck {
  id: "spf" | "dkim" | "dmarc" | string;
  label: string;
  ok: boolean;
  name: string;
  expected: string;
  found: string[];
  hint?: string;
}

export interface SenderView {
  id: string;
  provider: SenderProvider;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  domain: string;
  dkimSelector: string | null;
  status: "unverified" | "verified" | "failed";
  checks: SenderCheck[];
  verifiedAt: string | null;
  checkedAt: string | null;
  /** Where the provider reports bounces; carries a secret only in the create response. */
  webhookUrl: string | null;
}

export interface SenderInput {
  provider: SenderProvider;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  dkimSelector?: string;
  credentials?: Record<string, string>;
  /** Resend only: the Svix signing secret for bounce webhooks (top level, not a credential). */
  webhookSecret?: string;
}

export interface CampaignSegment {
  tags: string[];
  match: "any" | "all";
}

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "failed" | "canceled";

/** Blocks as stored by the Hub (schema `Block`s; email-safe types only). */
export interface CampaignBody {
  blocks: import("@openspace/schema").Block[];
}

export interface CampaignView {
  id: string;
  subject: string;
  preheader: string | null;
  body: CampaignBody;
  segment: CampaignSegment;
  senderId: string | null;
  trackOpens: boolean;
  status: CampaignStatus;
  sendAt: string | null;
  recipients: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CampaignInput {
  subject: string;
  /** null clears it. */
  preheader?: string | null;
  body: CampaignBody;
  /** No tags = everyone confirmed. Never null (the Hub refuses null). */
  segment?: CampaignSegment;
  senderId?: string | null;
  trackOpens?: boolean;
}

export interface CampaignStats {
  recipients: number;
  sent: number;
  delivered: number;
  failed: number;
  bounced: number;
  complained: number;
  skipped: number;
  queued: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
  trackOpens: boolean;
  links: Array<{ url: string; clicks: number; uniqueClicks: number }>;
}

export interface CampaignPreview {
  subject: string;
  html: string;
  text: string;
  warnings: string[];
  recipients: number;
}

// --- the interface ---------------------------------------------------------------------------

export interface GrowthApi {
  getServiceSettings(siteId: string): Promise<ServiceSettings>;
  updateServiceSettings(siteId: string, patch: Partial<ServiceSettings>): Promise<ServiceSettings>;
  listQuotas(siteId: string): Promise<Quota[]>;

  listForms(siteId: string): Promise<FormSummary[]>;
  listSubmissions(siteId: string, query?: SubmissionQuery): Promise<SubmissionPage>;
  setSubmissionRead(siteId: string, subId: string, read: boolean): Promise<Submission>;
  markSubmissionsRead(
    siteId: string,
    input: { ids?: string[]; all?: boolean; form?: string; read?: boolean },
  ): Promise<{ changed: number }>;
  deleteSubmissions(siteId: string, ids: string[]): Promise<{ deleted: number }>;
  /** CSV of every entry, or one form's (`GET /submissions.csv?form=`). */
  downloadSubmissionsCsv(
    siteId: string,
    form?: string,
  ): Promise<import("./manage-types").DownloadedFile>;

  listSubscribers(siteId: string, query?: SubscriberQuery): Promise<SubscriberPage>;
  importSubscribers(
    siteId: string,
    input: { csv: string; consent: true; tags?: string[] },
  ): Promise<SubscriberImportResult>;
  tagSubscribers(
    siteId: string,
    input: { ids: string[]; add?: string[]; remove?: string[] },
  ): Promise<{ changed: number }>;
  updateSubscriber(
    siteId: string,
    subId: string,
    patch: { tags?: string[]; firstName?: string; status?: "unsubscribed" },
  ): Promise<Subscriber>;
  deleteSubscriber(siteId: string, subId: string): Promise<void>;

  getAnalytics(siteId: string, range: AnalyticsRange): Promise<AnalyticsReport>;

  getCommerceSettings(siteId: string): Promise<CommerceSettingsView>;
  updateCommerceSettings(siteId: string, patch: Partial<GrowthSettings>): Promise<GrowthSettings>;
  /** Start Stripe onboarding; open `url`. `returnUrl` must be on the Studio origin. */
  startStripeConnect(siteId: string, returnUrl?: string): Promise<{ url: string; account: string }>;
  /** Re-read the account from Stripe (after onboarding). */
  refreshStripeConnect(siteId: string): Promise<PaymentsView>;
  setSovereignKeys(
    siteId: string,
    keys: { secretKey: string; webhookSecret: string },
  ): Promise<PaymentsView>;
  clearSovereignKeys(siteId: string): Promise<PaymentsView>;

  listProducts(siteId: string): Promise<{ products: ProductStock[]; source: string }>;
  setInventory(
    siteId: string,
    input: { sku: string; qty: number | null; lowStock?: number | null },
  ): Promise<InventoryView>;
  adjustInventory(siteId: string, sku: string, delta: number): Promise<InventoryView>;
  uploadProductFile(
    siteId: string,
    sku: string,
    file: File | Blob,
    filename: string,
  ): Promise<void>;
  deleteProductFile(siteId: string, sku: string): Promise<void>;

  listOrders(siteId: string, query?: OrderQuery): Promise<OrderPage>;
  getOrder(siteId: string, orderId: string): Promise<OrderView>;
  fulfillOrder(
    siteId: string,
    orderId: string,
    input: { tracking?: string; notify?: boolean; fulfilled?: boolean },
  ): Promise<OrderView>;
  refundOrder(
    siteId: string,
    orderId: string,
    input: { amount?: number; restock?: boolean },
  ): Promise<OrderView>;
  /** Printable HTML (the Hub serves it under a strict CSP). */
  packingSlipUrl(siteId: string, orderId: string): string;
  getPackingSlip(siteId: string, orderId: string): Promise<string>;

  listDiscounts(siteId: string): Promise<DiscountCode[]>;
  createDiscount(siteId: string, input: DiscountInput): Promise<DiscountCode>;
  setDiscountActive(siteId: string, discountId: string, active: boolean): Promise<DiscountCode>;

  listMembers(siteId: string, query?: MemberQuery): Promise<MemberPage>;
  addMember(
    siteId: string,
    input: { email: string; name?: string; tier?: string | null; invite?: boolean },
  ): Promise<{ member: Member; invited: boolean }>;
  updateMember(
    siteId: string,
    memberId: string,
    patch: { name?: string; tier?: string | null; status?: "active" | "blocked" },
  ): Promise<Member>;
  deleteMember(siteId: string, memberId: string): Promise<void>;
  listTiers(siteId: string): Promise<MemberTier[]>;
  createTier(siteId: string, input: TierInput): Promise<MemberTier>;
  updateTier(siteId: string, tierId: string, input: TierInput): Promise<MemberTier>;
  deleteTier(siteId: string, tierId: string): Promise<void>;

  listSenders(siteId: string): Promise<SenderView[]>;
  createSender(siteId: string, input: SenderInput): Promise<SenderView>;
  verifySender(siteId: string, senderId: string): Promise<SenderView>;
  deleteSender(siteId: string, senderId: string): Promise<void>;

  countSegment(siteId: string, segment: CampaignSegment): Promise<number>;
  listCampaigns(siteId: string): Promise<CampaignView[]>;
  createCampaign(siteId: string, input: CampaignInput): Promise<CampaignView>;
  getCampaign(
    siteId: string,
    campaignId: string,
  ): Promise<{ campaign: CampaignView; stats: CampaignStats | null }>;
  updateCampaign(
    siteId: string,
    campaignId: string,
    patch: Partial<CampaignInput>,
  ): Promise<CampaignView>;
  deleteCampaign(siteId: string, campaignId: string): Promise<void>;
  previewCampaign(siteId: string, campaignId: string): Promise<CampaignPreview>;
  testCampaign(siteId: string, campaignId: string, to: string): Promise<void>;
  scheduleCampaign(siteId: string, campaignId: string, sendAt: string): Promise<CampaignView>;
  unscheduleCampaign(siteId: string, campaignId: string): Promise<CampaignView>;
  sendCampaign(siteId: string, campaignId: string): Promise<CampaignView>;
  getCampaignStats(siteId: string, campaignId: string): Promise<CampaignStats>;
  /** Today's sending limit (warm-up) and whether sending is paused. */
  getCampaignLimits(siteId: string): Promise<CampaignLimits>;
}

/** Campaign volume cap with warm-up (PRD §9.3). */
export interface CampaignLimits {
  limit: number;
  sentToday: number;
  remaining: number;
  cleanDays: number;
  window: { sent: number; bounced: number; complained: number };
  paused: { reason: "bounces" | "complaints"; rate: number; message: string } | null;
  /** The Hub operator's abuse-report address (shown in every email's footer). */
  abuseEmail: string | null;
}
