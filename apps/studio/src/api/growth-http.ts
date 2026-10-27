import type {
  AnalyticsReport,
  CampaignLimits,
  CampaignPreview,
  CampaignStats,
  CampaignView,
  CommerceSettingsView,
  DiscountCode,
  FormSummary,
  GrowthApi,
  GrowthSettings,
  InventoryView,
  Member,
  MemberPage,
  MemberTier,
  OrderPage,
  OrderView,
  PaymentsView,
  ProductStock,
  Quota,
  SenderView,
  ServiceSettings,
  Submission,
  SubmissionPage,
  Subscriber,
  SubscriberImportResult,
  SubscriberPage,
} from "./growth-types";
import type { ManageHttpDeps } from "./manage-http";
import { unreachableMessage } from "./resilience";
import { HubError } from "./types";

const enc = encodeURIComponent;
const site = (id: string) => `/api/sites/${enc(id)}`;

/** `?a=1&b=x` from defined values; arrays repeat the key. Booleans become `1` (true only). */
export function queryString(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v)) for (const item of v) q.append(k, String(item));
    else q.set(k, v === true ? "1" : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** HTTP implementation of the Task 25 routes (mixed into `createHttpHub`). */
export function createGrowthHttp({
  request,
  baseUrl,
  fetch: doFetch,
  readError,
}: ManageHttpDeps): GrowthApi {
  async function raw(method: string, path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, { method, credentials: "include", ...init });
    } catch {
      throw new HubError(0, "network", unreachableMessage());
    }
    if (!res.ok) throw await readError(res);
    return res;
  }

  return {
    async getServiceSettings(siteId) {
      const r = await request<{ settings: ServiceSettings }>(
        "GET",
        `${site(siteId)}/services/settings`,
      );
      return r.settings;
    },
    async updateServiceSettings(siteId, patch) {
      const r = await request<{ settings: ServiceSettings }>(
        "PATCH",
        `${site(siteId)}/services/settings`,
        patch,
      );
      return r.settings;
    },
    async listQuotas(siteId) {
      return (await request<{ quotas: Quota[] }>("GET", `${site(siteId)}/quotas`)).quotas;
    },

    async listForms(siteId) {
      return (await request<{ forms: FormSummary[] }>("GET", `${site(siteId)}/forms`)).forms;
    },
    async listSubmissions(siteId, query = {}) {
      return request<SubmissionPage>(
        "GET",
        `${site(siteId)}/submissions${queryString({ ...query })}`,
      );
    },
    async setSubmissionRead(siteId, subId, read) {
      const r = await request<{ submission: Submission }>(
        "PATCH",
        `${site(siteId)}/submissions/${enc(subId)}`,
        { read },
      );
      return r.submission;
    },
    async markSubmissionsRead(siteId, input) {
      return request("POST", `${site(siteId)}/submissions/mark-read`, input);
    },
    async deleteSubmissions(siteId, ids) {
      return request("POST", `${site(siteId)}/submissions/delete`, { ids });
    },
    async downloadSubmissionsCsv(siteId, form) {
      const res = await raw("GET", `${site(siteId)}/submissions.csv${queryString({ form })}`);
      return {
        blob: await res.blob(),
        filename: form ? `${form}-entries.csv` : "form-entries.csv",
      };
    },

    async listSubscribers(siteId, query = {}) {
      return request<SubscriberPage>(
        "GET",
        `${site(siteId)}/subscribers${queryString({ ...query })}`,
      );
    },
    async importSubscribers(siteId, input) {
      return request<SubscriberImportResult>("POST", `${site(siteId)}/subscribers/import`, input);
    },
    async tagSubscribers(siteId, input) {
      return request("POST", `${site(siteId)}/subscribers/tags`, input);
    },
    async updateSubscriber(siteId, subId, patch) {
      const r = await request<{ subscriber: Subscriber }>(
        "PATCH",
        `${site(siteId)}/subscribers/${enc(subId)}`,
        patch,
      );
      return r.subscriber;
    },
    async confirmSubscriber(siteId, subId) {
      const r = await request<{ subscriber: Subscriber }>(
        "POST",
        `${site(siteId)}/subscribers/${enc(subId)}/confirm`,
        { consent: true },
      );
      return r.subscriber;
    },
    async deleteSubscriber(siteId, subId) {
      await request("DELETE", `${site(siteId)}/subscribers/${enc(subId)}`);
    },

    async getAnalytics(siteId, range) {
      return request<AnalyticsReport>(
        "GET",
        `${site(siteId)}/analytics${queryString({ ...range })}`,
      );
    },

    async getCommerceSettings(siteId) {
      return request<CommerceSettingsView>("GET", `${site(siteId)}/commerce/settings`);
    },
    async updateCommerceSettings(siteId, patch) {
      const r = await request<{ settings: GrowthSettings }>(
        "PATCH",
        `${site(siteId)}/commerce/settings`,
        patch,
      );
      return r.settings;
    },
    async startStripeConnect(siteId, returnUrl) {
      return request("POST", `${site(siteId)}/commerce/connect`, returnUrl ? { returnUrl } : {});
    },
    async refreshStripeConnect(siteId) {
      const r = await request<{ payments: PaymentsView }>(
        "POST",
        `${site(siteId)}/commerce/connect/refresh`,
        {},
      );
      return r.payments;
    },
    async setSovereignKeys(siteId, keys) {
      const r = await request<{ payments: PaymentsView }>(
        "PUT",
        `${site(siteId)}/commerce/sovereign`,
        keys,
      );
      return r.payments;
    },
    async clearSovereignKeys(siteId) {
      const r = await request<{ payments: PaymentsView }>(
        "DELETE",
        `${site(siteId)}/commerce/sovereign`,
      );
      return r.payments;
    },

    async listProducts(siteId) {
      return request<{ products: ProductStock[]; source: string }>(
        "GET",
        `${site(siteId)}/products`,
      );
    },
    async setInventory(siteId, input) {
      const r = await request<{ inventory: InventoryView }>(
        "PUT",
        `${site(siteId)}/inventory`,
        input,
      );
      return r.inventory;
    },
    async adjustInventory(siteId, sku, delta) {
      const r = await request<{ inventory: InventoryView }>(
        "POST",
        `${site(siteId)}/inventory/adjust`,
        { sku, delta },
      );
      return r.inventory;
    },
    async uploadProductFile(siteId, sku, file, filename) {
      await raw("PUT", `${site(siteId)}/products/file${queryString({ sku })}`, {
        body: file,
        headers: {
          Accept: "application/json",
          "Content-Type": file.type || "application/octet-stream",
          "X-Filename": encodeURIComponent(filename),
        },
      });
    },
    async deleteProductFile(siteId, sku) {
      await request("DELETE", `${site(siteId)}/products/file${queryString({ sku })}`);
    },

    async listOrders(siteId, query = {}) {
      return request<OrderPage>("GET", `${site(siteId)}/orders${queryString({ ...query })}`);
    },
    async getOrder(siteId, orderId) {
      return (await request<{ order: OrderView }>("GET", `${site(siteId)}/orders/${enc(orderId)}`))
        .order;
    },
    async fulfillOrder(siteId, orderId, input) {
      const r = await request<{ order: OrderView }>(
        "POST",
        `${site(siteId)}/orders/${enc(orderId)}/fulfill`,
        input,
      );
      return r.order;
    },
    async refundOrder(siteId, orderId, input) {
      const r = await request<{ order: OrderView }>(
        "POST",
        `${site(siteId)}/orders/${enc(orderId)}/refund`,
        input,
      );
      return r.order;
    },
    packingSlipUrl(siteId, orderId) {
      return `${baseUrl}${site(siteId)}/orders/${enc(orderId)}/packing-slip`;
    },
    async getPackingSlip(siteId, orderId) {
      const res = await raw("GET", `${site(siteId)}/orders/${enc(orderId)}/packing-slip`);
      return res.text();
    },

    async listDiscounts(siteId) {
      return (await request<{ discounts: DiscountCode[] }>("GET", `${site(siteId)}/discounts`))
        .discounts;
    },
    async createDiscount(siteId, input) {
      return (await request<{ discount: DiscountCode }>("POST", `${site(siteId)}/discounts`, input))
        .discount;
    },
    async setDiscountActive(siteId, discountId, active) {
      const r = await request<{ discount: DiscountCode }>(
        "PATCH",
        `${site(siteId)}/discounts/${enc(discountId)}`,
        { active },
      );
      return r.discount;
    },

    async listMembers(siteId, query = {}) {
      return request<MemberPage>("GET", `${site(siteId)}/members${queryString({ ...query })}`);
    },
    async addMember(siteId, input) {
      return request("POST", `${site(siteId)}/members`, input);
    },
    async updateMember(siteId, memberId, patch) {
      const r = await request<{ member: Member }>(
        "PATCH",
        `${site(siteId)}/members/${enc(memberId)}`,
        patch,
      );
      return r.member;
    },
    async deleteMember(siteId, memberId) {
      await request("DELETE", `${site(siteId)}/members/${enc(memberId)}`);
    },
    async listTiers(siteId) {
      return (await request<{ tiers: MemberTier[] }>("GET", `${site(siteId)}/tiers`)).tiers;
    },
    async createTier(siteId, input) {
      return (await request<{ tier: MemberTier }>("POST", `${site(siteId)}/tiers`, input)).tier;
    },
    async updateTier(siteId, tierId, input) {
      return (
        await request<{ tier: MemberTier }>("PATCH", `${site(siteId)}/tiers/${enc(tierId)}`, input)
      ).tier;
    },
    async deleteTier(siteId, tierId) {
      await request("DELETE", `${site(siteId)}/tiers/${enc(tierId)}`);
    },

    async listSenders(siteId) {
      return (await request<{ senders: SenderView[] }>("GET", `${site(siteId)}/senders`)).senders;
    },
    async createSender(siteId, input) {
      return (await request<{ sender: SenderView }>("POST", `${site(siteId)}/senders`, input))
        .sender;
    },
    async verifySender(siteId, senderId) {
      const r = await request<{ sender: SenderView }>(
        "POST",
        `${site(siteId)}/senders/${enc(senderId)}/verify`,
        {},
      );
      return r.sender;
    },
    async deleteSender(siteId, senderId) {
      await request("DELETE", `${site(siteId)}/senders/${enc(senderId)}`);
    },

    async countSegment(siteId, segment) {
      const r = await request<{ count: number }>(
        "GET",
        `${site(siteId)}/segments/count${queryString({ tag: segment.tags, match: segment.match })}`,
      );
      return r.count;
    },
    async getCampaignLimits(siteId) {
      return request<CampaignLimits>("GET", `${site(siteId)}/campaign-limits`);
    },
    async listCampaigns(siteId) {
      return (await request<{ campaigns: CampaignView[] }>("GET", `${site(siteId)}/campaigns`))
        .campaigns;
    },
    async createCampaign(siteId, input) {
      return (await request<{ campaign: CampaignView }>("POST", `${site(siteId)}/campaigns`, input))
        .campaign;
    },
    async getCampaign(siteId, campaignId) {
      const r = await request<{ campaign: CampaignView; stats?: CampaignStats | null }>(
        "GET",
        `${site(siteId)}/campaigns/${enc(campaignId)}`,
      );
      return { campaign: r.campaign, stats: r.stats ?? null };
    },
    async updateCampaign(siteId, campaignId, patch) {
      const r = await request<{ campaign: CampaignView }>(
        "PATCH",
        `${site(siteId)}/campaigns/${enc(campaignId)}`,
        patch,
      );
      return r.campaign;
    },
    async deleteCampaign(siteId, campaignId) {
      await request("DELETE", `${site(siteId)}/campaigns/${enc(campaignId)}`);
    },
    async previewCampaign(siteId, campaignId) {
      return request<CampaignPreview>(
        "POST",
        `${site(siteId)}/campaigns/${enc(campaignId)}/preview`,
        {},
      );
    },
    async testCampaign(siteId, campaignId, to) {
      await request("POST", `${site(siteId)}/campaigns/${enc(campaignId)}/test`, { to });
    },
    async scheduleCampaign(siteId, campaignId, sendAt) {
      const r = await request<{ campaign: CampaignView }>(
        "POST",
        `${site(siteId)}/campaigns/${enc(campaignId)}/schedule`,
        { sendAt },
      );
      return r.campaign;
    },
    async unscheduleCampaign(siteId, campaignId) {
      const r = await request<{ campaign: CampaignView }>(
        "POST",
        `${site(siteId)}/campaigns/${enc(campaignId)}/unschedule`,
        {},
      );
      return r.campaign;
    },
    async sendCampaign(siteId, campaignId) {
      const r = await request<{ campaign: CampaignView }>(
        "POST",
        `${site(siteId)}/campaigns/${enc(campaignId)}/send`,
        {},
      );
      return r.campaign;
    },
    async getCampaignStats(siteId, campaignId) {
      return (
        await request<{ stats: CampaignStats }>(
          "GET",
          `${site(siteId)}/campaigns/${enc(campaignId)}/stats`,
        )
      ).stats;
    },
  };
}
