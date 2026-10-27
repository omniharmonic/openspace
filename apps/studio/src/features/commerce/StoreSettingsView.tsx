import {
  CreditCard,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  Tag,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type DiscountInput,
  type GrowthSettings,
  type PaymentsView,
  type ShippingOption,
  useCommerceActions,
  useCommerceSettings,
  useDiscountActions,
  useDiscounts,
} from "../../api";
import type { Site } from "../../api/types";
import {
  Badge,
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Skeleton,
  Toggle,
  toast,
} from "../../ui";
import { CURRENCIES } from "../collections/fields";
import { can } from "../site-mgmt/manage-ui";
import { date, money, moneyInput, parseMoney } from "../workspace/format";
import { copyText, errorMessage, SwitchRow, TagInput, WsHeader } from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";
import "./commerce.css";
import { ServiceRequirements } from "./ServiceRequirements";

const fail = (title: string) => (err: unknown) =>
  toast({ tone: "danger", title, description: errorMessage(err) });

/** Store settings: payments (Stripe), shipping, tax, discount codes and stock alerts. */
export function StoreSettingsView({ site }: AreaProps) {
  const q = useCommerceSettings(site.id);
  const actions = useCommerceActions(site.id);
  const designer = can(site, "designer");
  const s = q.data?.settings;
  const save = (patch: Partial<GrowthSettings>, ok?: string) =>
    actions.update.mutate(patch, {
      onSuccess: () => ok && toast({ tone: "success", title: ok }),
      onError: fail("Couldn't save"),
    });
  return (
    <div className="st-ws-stack">
      <WsHeader
        title="Store settings"
        description="How you get paid, what shipping costs, and tax. These apply to products, donations and paid memberships."
      />
      <ServiceRequirements site={site} feature="store" />
      {!designer && (
        <p className="st-ws-hint">
          You can see these settings. The owner or a designer changes them.
        </p>
      )}
      {!q.data || !s ? (
        <Skeleton height={200} />
      ) : (
        <>
          <Payments site={site} payments={q.data.payments} />
          <section className="st-ws-panel" aria-labelledby="ss-basics">
            <div className="st-ws-section">
              <h3 id="ss-basics" className="st-ws-section__title">
                Currency
              </h3>
              <Select
                value={s.currency}
                disabled={!designer}
                onValueChange={(currency) => save({ currency }, "Currency saved")}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
              <p className="st-ws-section__desc">
                Product prices use the currency set on each product.
              </p>
            </div>
          </section>
          <Shipping
            settings={s}
            canEdit={designer}
            onSave={(patch) => save(patch, "Shipping saved")}
            busy={actions.update.isPending}
          />
          <section className="st-ws-panel" aria-labelledby="ss-tax">
            <div className="st-ws-section">
              <h3 id="ss-tax" className="st-ws-section__title">
                Tax
              </h3>
              <SwitchRow
                label={<>Work out sales tax and VAT at checkout</>}
                hint={
                  <>
                    Uses Stripe Tax, based on where the buyer is. Turn it on in your Stripe account
                    first; Stripe charges a small fee per order for it.
                  </>
                }
                checked={s.taxEnabled}
                disabled={!designer}
                onCheckedChange={(taxEnabled) => save({ taxEnabled })}
              />
            </div>
          </section>
          <Discounts site={site} settings={s} onSave={save} />
          <section className="st-ws-panel" aria-labelledby="ss-stock">
            <div className="st-ws-section">
              <h3 id="ss-stock" className="st-ws-section__title">
                Low stock alerts
              </h3>
              <StockAlerts
                settings={s}
                canEdit={designer}
                onSave={(patch) => save(patch, "Saved")}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Payments({ site, payments }: { site: Site; payments: PaymentsView }) {
  const actions = useCommerceActions(site.id);
  const owner = can(site, "owner");
  const [keys, setKeys] = useState(false);
  const sovereign = payments.mode === "sovereign";
  const connect = () =>
    actions.connect.mutate(window.location.href, {
      onSuccess: ({ url }) => {
        // "noopener" makes window.open return null even when the tab opened, so open normally,
        // then cut the link back to Studio. Only a blocked pop-up falls back to this tab.
        const w = window.open(url, "_blank");
        if (w) w.opener = null;
        else window.location.assign(url);
        toast({
          tone: "success",
          title: "Finish in Stripe",
          description: "Come back here and choose “Check again” when you're done.",
        });
      },
      onError: fail("Couldn't start Stripe"),
    });
  return (
    <section className="st-ws-panel" aria-labelledby="ss-pay">
      <div className="st-ws-section">
        <div className="st-ws-section__head">
          <h3 id="ss-pay" className="st-ws-section__title">
            <CreditCard aria-hidden="true" className="st-inline-icon" /> Payments
          </h3>
          {payments.ready ? (
            <Badge tone="live" dot>
              Ready to take payments
            </Badge>
          ) : payments.account ? (
            <Badge tone="pending" dot>
              Stripe needs a few more details
            </Badge>
          ) : (
            <Badge>Not connected</Badge>
          )}
        </div>
        <p className="st-ws-section__desc">
          {sovereign
            ? "Payments use your own Stripe keys directly. OpenSpace never sees card details and takes no fee."
            : "Payments go to your own Stripe account. OpenSpace never sees card details and takes no fee."}
        </p>
        {payments.account && !sovereign && (
          <p className="st-ws-hint">
            Stripe account <code>{payments.account}</code>
            {payments.provider === "dev" ? " (test mode)" : ""}
          </p>
        )}
        <div className="st-ws-actions">
          {!sovereign && owner && !payments.ready && (
            <Button
              variant="primary"
              icon={<ExternalLink />}
              loading={actions.connect.isPending}
              onClick={connect}
            >
              {payments.account ? "Continue in Stripe" : "Connect Stripe"}
            </Button>
          )}
          {!sovereign && payments.account && can(site, "designer") && (
            <Button
              icon={<RefreshCw />}
              loading={actions.refresh.isPending}
              onClick={() => actions.refresh.mutate(undefined, { onError: fail("Couldn't check") })}
            >
              Check again
            </Button>
          )}
          {owner && (
            <Button variant="ghost" icon={<KeyRound />} onClick={() => setKeys(!keys)}>
              {sovereign ? "Your Stripe keys" : "Use my own Stripe keys"}
            </Button>
          )}
        </div>
        {(keys || sovereign) && owner && <SovereignKeys siteId={site.id} payments={payments} />}
      </div>
    </section>
  );
}

function SovereignKeys({ siteId, payments }: { siteId: string; payments: PaymentsView }) {
  const actions = useCommerceActions(siteId);
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="st-sovereign">
      <div className="st-callout st-callout--accent">
        <ShieldCheck aria-hidden="true" />
        <span>
          <strong>Sovereign mode.</strong> Instead of connecting through OpenSpace, checkout uses
          keys from your own Stripe account. Keys are stored encrypted and never shown again. Use a
          restricted key if you can.
        </span>
      </div>
      {payments.mode === "sovereign" ? (
        <>
          {payments.webhookUrl && (
            <Field
              label="Webhook address"
              hint="In Stripe → Developers → Webhooks, add this address so orders are marked paid."
            >
              <div className="st-copyline">
                <code>{payments.webhookUrl}</code>
                <Button
                  size="sm"
                  onClick={async () =>
                    (await copyText(payments.webhookUrl ?? "")) &&
                    toast({ tone: "success", title: "Copied" })
                  }
                >
                  Copy
                </Button>
              </div>
            </Field>
          )}
          <Button
            variant="ghost"
            loading={actions.clearSovereign.isPending}
            onClick={() =>
              actions.clearSovereign.mutate(undefined, {
                onError: fail("Couldn't remove the keys"),
              })
            }
          >
            Remove my keys and go back to connecting
          </Button>
        </>
      ) : (
        <form
          className="st-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            actions.setSovereign.mutate(
              { secretKey: secretKey.trim(), webhookSecret: webhookSecret.trim() },
              {
                onSuccess: () => {
                  setSecretKey("");
                  setWebhookSecret("");
                  toast({ tone: "success", title: "Keys saved" });
                },
                onError: (err) => setError(errorMessage(err)),
              },
            );
          }}
        >
          <Field label="Secret or restricted key" hint="Starts with sk_ or rk_">
            <Input
              type="password"
              autoComplete="off"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
            />
          </Field>
          <Field label="Webhook signing secret" hint="Starts with whsec_">
            <Input
              type="password"
              autoComplete="off"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
          </Field>
          {error && (
            <p className="st-ws-hint" role="alert">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            type="submit"
            disabled={!secretKey || !webhookSecret}
            loading={actions.setSovereign.isPending}
          >
            Save keys
          </Button>
        </form>
      )}
    </div>
  );
}

type ShipKind = "flat" | "weight" | "free" | "pickup";

interface ShipRow extends ShippingOption {
  /** Stable React key for the row (new rows have no Hub id yet). */
  key: string;
  kind: ShipKind;
}

/** The Hub keeps shipping labels to 60 characters. */
export const LABEL_MAX = 60;
let rowKey = 0;
const nextKey = () => `row-${++rowKey}`;

/** Default tiers for a new weight-based option (grams → minor units). */
const DEFAULT_TIERS = [
  { upToGrams: 500, amount: 500 },
  { upToGrams: 2000, amount: 900 },
  { upToGrams: 10_000, amount: 1800 },
];

const kg = (grams: number) =>
  grams >= 1000 ? `${Number((grams / 1000).toFixed(2))} kg` : `${grams} g`;

/** Tiers sorted by weight, without duplicates (what the Hub accepts). */
export function cleanTiers(
  tiers: Array<{ upToGrams: number; amount: number }>,
): Array<{ upToGrams: number; amount: number }> {
  const byWeight = new Map<number, number>();
  for (const t of tiers)
    if (Number.isInteger(t.upToGrams) && t.upToGrams > 0 && t.amount >= 0)
      byWeight.set(t.upToGrams, t.amount);
  return [...byWeight]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 10)
    .map(([upToGrams, amount]) => ({ upToGrams, amount }));
}

function toRows(options: ShippingOption[]): ShipRow[] {
  return options.map((o) => {
    const kind: ShipKind = o.byWeight?.length
      ? "weight"
      : o.amount === 0 && /pick ?up|collect/i.test(o.label)
        ? "pickup"
        : o.freeOver !== undefined
          ? "free"
          : "flat";
    return { ...o, key: o.id ?? nextKey(), kind };
  });
}

function fromRows(rows: ShipRow[]): ShippingOption[] {
  return rows.map(({ kind, key: _key, ...o }) => {
    const out: ShippingOption = { ...o, label: o.label.trim().slice(0, LABEL_MAX) };
    if (kind === "pickup") {
      out.amount = 0;
      delete out.freeOver;
    }
    if (kind !== "free" && kind !== "weight") delete out.freeOver;
    if (kind === "weight") {
      out.byWeight = cleanTiers(o.byWeight ?? DEFAULT_TIERS);
      out.amount = out.byWeight[0]?.amount ?? 0;
    } else delete out.byWeight;
    return out;
  });
}

function Shipping({
  settings,
  canEdit,
  onSave,
  busy,
}: {
  settings: GrowthSettings;
  canEdit: boolean;
  onSave: (patch: Partial<GrowthSettings>) => void;
  busy: boolean;
}) {
  const cur = settings.currency;
  const [rows, setRows] = useState<ShipRow[]>(() => toRows(settings.shippingOptions));
  const [countries, setCountries] = useState(settings.shippingCountries);
  useEffect(() => {
    setRows(toRows(settings.shippingOptions));
    setCountries(settings.shippingCountries);
  }, [settings.shippingOptions, settings.shippingCountries]);
  const set = (i: number, patch: Partial<ShipRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const invalid = rows.some((r) => !r.label.trim()) || countries.some((c) => !/^[A-Z]{2}$/.test(c));
  return (
    <section className="st-ws-panel" aria-labelledby="ss-ship">
      <div className="st-ws-section">
        <h3 id="ss-ship" className="st-ws-section__title">
          Shipping
        </h3>
        <p className="st-ws-section__desc">
          Buyers choose one of these at checkout. Up to 5 options. Digital products never charge
          shipping.
        </p>
        {rows.map((r, i) => (
          <fieldset key={r.key} className="st-ship" disabled={!canEdit}>
            <legend className="st-sr-only">Shipping option {i + 1}</legend>
            <Segmented<ShipKind>
              size="sm"
              aria-label={`Kind of option ${i + 1}`}
              value={r.kind}
              onValueChange={(kind) =>
                set(i, {
                  kind,
                  ...(kind === "pickup" ? { amount: 0, label: r.label || "Pick up" } : {}),
                  ...(kind === "free" ? { freeOver: r.freeOver ?? 5000 } : {}),
                  ...(kind === "weight" ? { byWeight: r.byWeight ?? DEFAULT_TIERS } : {}),
                })
              }
              options={[
                { value: "flat", label: "Flat rate" },
                { value: "weight", label: "By weight" },
                { value: "free", label: "Free over" },
                { value: "pickup", label: "Pickup" },
              ]}
            />
            <div className="st-ship__fields">
              <Field label="Name buyers see">
                <Input
                  value={r.label}
                  maxLength={LABEL_MAX}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
              </Field>
              {r.kind !== "pickup" && r.kind !== "weight" && (
                <Field label="Price">
                  <Input
                    inputMode="decimal"
                    defaultValue={moneyInput(r.amount, cur)}
                    onBlur={(e) => {
                      const v = parseMoney(e.target.value, cur);
                      if (v !== null && v >= 0) set(i, { amount: v });
                    }}
                  />
                </Field>
              )}
              {r.kind === "free" && (
                <Field label="Free on orders over">
                  <Input
                    inputMode="decimal"
                    defaultValue={moneyInput(r.freeOver, cur)}
                    onBlur={(e) => {
                      const v = parseMoney(e.target.value, cur);
                      if (v !== null && v >= 0) set(i, { freeOver: v });
                    }}
                  />
                </Field>
              )}
              {r.kind !== "pickup" && (
                <Field label="Arrives in (days)">
                  <span className="st-ship__days">
                    <Input
                      type="number"
                      min={0}
                      aria-label="Fewest days"
                      value={r.minDays ?? ""}
                      onChange={(e) =>
                        set(i, {
                          minDays: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                    –
                    <Input
                      type="number"
                      min={0}
                      aria-label="Most days"
                      value={r.maxDays ?? ""}
                      onChange={(e) =>
                        set(i, {
                          maxDays: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </span>
                </Field>
              )}
              <IconButton
                size="sm"
                label={`Remove ${r.label || "option"}`}
                icon={<Trash2 />}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              />
            </div>
            {r.kind === "weight" && (
              <WeightTiers
                currency={cur}
                tiers={r.byWeight ?? DEFAULT_TIERS}
                onChange={(byWeight) => set(i, { byWeight })}
              />
            )}
            <p className="st-ws-hint">
              {r.kind === "pickup"
                ? "Free. Buyers collect from you."
                : r.kind === "free"
                  ? `${money(r.amount, cur)}, or free when the order is over ${money(r.freeOver ?? 0, cur)}.`
                  : r.kind === "weight"
                    ? `Priced by the parcel’s weight, worked out from your products’ shipping weights. Parcels over ${kg(cleanTiers(r.byWeight ?? DEFAULT_TIERS).at(-1)?.upToGrams ?? 0)} can’t use this option.`
                    : `${money(r.amount, cur)} per order.`}
            </p>
          </fieldset>
        ))}
        {canEdit && (
          <div className="st-ws-actions">
            {rows.length < 5 && (
              <Button
                size="sm"
                icon={<Plus />}
                onClick={() =>
                  setRows([
                    ...rows,
                    { key: nextKey(), kind: "flat", label: "Standard shipping", amount: 500 },
                  ])
                }
              >
                Add an option
              </Button>
            )}
          </div>
        )}
        <Field label="Ship to these countries" hint="Two-letter codes, like US, CA, GB.">
          <TagInput
            label="Countries"
            value={countries}
            onChange={(c) => setCountries(c.map((x) => x.toUpperCase()))}
          />
        </Field>
        {canEdit && (
          <div className="st-ws-actions st-ws-actions--end">
            <Button
              variant="primary"
              loading={busy}
              disabled={invalid}
              onClick={() =>
                onSave({ shippingOptions: fromRows(rows), shippingCountries: countries })
              }
            >
              Save shipping
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function Discounts({
  site,
  settings,
  onSave,
}: {
  site: Site;
  settings: GrowthSettings;
  onSave: (patch: Partial<GrowthSettings>) => void;
}) {
  const discounts = useDiscounts(site.id);
  const actions = useDiscountActions(site.id);
  const designer = can(site, "designer");
  const [creating, setCreating] = useState(false);
  return (
    <section className="st-ws-panel" aria-labelledby="ss-disc">
      <div className="st-ws-section">
        <div className="st-ws-section__head">
          <h3 id="ss-disc" className="st-ws-section__title">
            <Tag aria-hidden="true" className="st-inline-icon" /> Discount codes
          </h3>
          {designer && (
            <Button size="sm" icon={<Plus />} onClick={() => setCreating(true)}>
              New code
            </Button>
          )}
        </div>
        <SwitchRow
          label={<>Show a “discount code” box at checkout</>}
          checked={settings.allowPromotionCodes}
          disabled={!designer}
          onCheckedChange={(allowPromotionCodes) => onSave({ allowPromotionCodes })}
        />
        {(discounts.data ?? []).length === 0 ? (
          <p className="st-ws-hint">No codes yet. Try one like WELCOME10 for new customers.</p>
        ) : (
          <ul className="st-ws-list st-discounts">
            {(discounts.data ?? []).map((d) => (
              <li key={d.id}>
                <span>
                  <code className="st-code-chip">{d.code}</code>{" "}
                  {d.percentOff
                    ? `${d.percentOff}% off`
                    : `${money(d.amountOff ?? 0, d.currency ?? settings.currency)} off`}
                  <span className="st-ws-hint">
                    {d.maxRedemptions ? ` · up to ${d.maxRedemptions} uses` : ""}
                    {d.expiresAt ? ` · until ${date(d.expiresAt)}` : ""}
                  </span>
                </span>
                <span className="st-ws-check">
                  {d.active ? "On" : "Off"}
                  <Toggle
                    aria-label={`${d.code} ${d.active ? "on" : "off"}`}
                    size="sm"
                    checked={d.active}
                    disabled={!designer}
                    onCheckedChange={(active) =>
                      actions.setActive.mutate(
                        { id: d.id, active },
                        { onError: fail("Couldn't change the code") },
                      )
                    }
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {creating && (
        <DiscountDialog
          currency={settings.currency}
          busy={actions.create.isPending}
          onClose={() => setCreating(false)}
          onCreate={(input, setError) =>
            actions.create.mutate(input, {
              onSuccess: (d) => {
                setCreating(false);
                toast({
                  tone: "success",
                  title: `${d.code} is ready`,
                  description: "Share it anywhere.",
                });
              },
              onError: (err) => setError(errorMessage(err)),
            })
          }
        />
      )}
    </section>
  );
}

function DiscountDialog({
  currency,
  onClose,
  onCreate,
  busy,
}: {
  currency: string;
  onClose: () => void;
  onCreate: (input: DiscountInput, setError: (e: string) => void) => void;
  busy: boolean;
}) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("10");
  const [max, setMax] = useState("");
  const [expires, setExpires] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    setError(null);
    const input: DiscountInput = { code: code.trim().toUpperCase() };
    if (kind === "percent") input.percentOff = Number(value);
    else {
      const minor = parseMoney(value, currency);
      if (minor === null || minor <= 0) return setError("Enter an amount like 5 or 5.50.");
      input.amountOff = minor;
      input.currency = currency;
    }
    if (max.trim()) input.maxRedemptions = Math.max(1, Math.round(Number(max)));
    if (expires) input.expiresAt = new Date(`${expires}T23:59:59`).toISOString();
    onCreate(input, setError);
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New discount code"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={code.trim().length < 3}
            onClick={submit}
          >
            Create code
          </Button>
        </>
      }
    >
      <div className="st-form">
        <Field
          label="Code"
          hint="3–40 letters and numbers. Buyers type this at checkout."
          error={error ?? undefined}
        >
          <Input
            value={code}
            autoFocus
            maxLength={40}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
          />
        </Field>
        <Segmented
          block
          aria-label="Discount type"
          value={kind}
          onValueChange={setKind}
          options={[
            { value: "percent", label: "Percent off" },
            { value: "amount", label: `Amount off (${currency})` },
          ]}
        />
        <Field label={kind === "percent" ? "Percent" : "Amount"}>
          <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <div className="st-ws-cols">
          <Field label="Most uses (optional)">
            <Input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
          </Field>
          <Field label="Ends on (optional)">
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function StockAlerts({
  settings,
  canEdit,
  onSave,
}: {
  settings: GrowthSettings;
  canEdit: boolean;
  onSave: (patch: Partial<GrowthSettings>) => void;
}) {
  const [threshold, setThreshold] = useState(String(settings.lowStockThreshold));
  const [email, setEmail] = useState(settings.alertEmail ?? "");
  return (
    <form
      className="st-form"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Math.max(0, Math.round(Number(threshold) || 0));
        onSave({ lowStockThreshold: n, alertEmail: email.trim() || null });
      }}
    >
      <div className="st-ws-cols">
        <Field label="Warn me when stock drops to">
          <Input
            type="number"
            min={0}
            disabled={!canEdit}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </Field>
        <Field label="Send the warning to" hint="Leave empty for your account email.">
          <Input
            type="email"
            disabled={!canEdit}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>
      {canEdit && (
        <div className="st-ws-actions st-ws-actions--end">
          <Button type="submit">Save alerts</Button>
        </div>
      )}
    </form>
  );
}

/** Weight tiers of a shipping option: "up to 2 kg → $9". */
function WeightTiers({
  currency,
  tiers,
  onChange,
}: {
  currency: string;
  tiers: Array<{ upToGrams: number; amount: number }>;
  onChange: (tiers: Array<{ upToGrams: number; amount: number }>) => void;
}) {
  const setTier = (i: number, patch: Partial<{ upToGrams: number; amount: number }>) =>
    onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <fieldset className="st-ship__tiers" aria-label="Weight tiers">
      {tiers.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tiers have no ids
        <div key={i} className="st-ship__tier">
          <span className="st-ship__tier-label">Up to</span>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            size="sm"
            suffix="kg"
            aria-label={`Tier ${i + 1} weight in kilograms`}
            defaultValue={String(t.upToGrams / 1000)}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setTier(i, { upToGrams: Math.round(v * 1000) });
            }}
          />
          <Input
            inputMode="decimal"
            size="sm"
            aria-label={`Tier ${i + 1} price`}
            defaultValue={moneyInput(t.amount, currency)}
            onBlur={(e) => {
              const v = parseMoney(e.target.value, currency);
              if (v !== null && v >= 0) setTier(i, { amount: v });
            }}
          />
          <IconButton
            size="sm"
            label={`Remove tier ${i + 1}`}
            icon={<Trash2 />}
            disabled={tiers.length === 1}
            onClick={() => onChange(tiers.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {tiers.length < 10 && (
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus />}
          onClick={() =>
            onChange([
              ...tiers,
              {
                upToGrams: (tiers.at(-1)?.upToGrams ?? 0) + 5000,
                amount: tiers.at(-1)?.amount ?? 0,
              },
            ])
          }
        >
          Add a tier
        </Button>
      )}
    </fieldset>
  );
}
