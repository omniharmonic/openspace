import {
  AlertTriangle,
  ArrowLeft,
  PackageCheck,
  Printer,
  Receipt,
  RotateCcw,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  type OrderKind,
  type OrderQuery,
  type OrderStatus,
  type OrderView,
  useHub,
  useOrder,
  useOrderActions,
  useOrdersPaged,
} from "../../api";
import type { Site } from "../../api/types";
import {
  Badge,
  type BadgeTone,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Segmented,
  Select,
  Skeleton,
  toast,
} from "../../ui";
import { can } from "../site-mgmt/manage-ui";
import { ago, dateTime, money, moneyInput, parseMoney } from "../workspace/format";
import { workspacePath } from "../workspace/routes";
import { errorMessage, SearchField, SwitchRow, useDebounced, WsHeader } from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";
import "./commerce.css";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Not paid yet", tone: "neutral" },
  processing: { label: "Payment processing", tone: "pending" },
  paid: { label: "Paid", tone: "live" },
  partially_refunded: { label: "Partly refunded", tone: "pending" },
  refunded: { label: "Refunded", tone: "neutral" },
  out_of_stock: { label: "Sold out — refund due", tone: "danger" },
  expired: { label: "Abandoned", tone: "neutral" },
  failed: { label: "Payment failed", tone: "danger" },
};

const KIND_LABEL: Record<OrderKind, string> = {
  order: "Order",
  donation: "Donation",
  membership: "Membership",
};

type View = "open" | "all" | "problem" | "fulfilled" | "refunded";

function queryFor(view: View, kind: OrderKind | "", q: string): OrderQuery {
  const base: OrderQuery = { kind: kind || undefined, q: q || undefined };
  switch (view) {
    case "open":
      return { ...base, toSend: true };
    case "problem":
      return { ...base, problem: true };
    case "fulfilled":
      return { ...base, fulfillment: "fulfilled" };
    case "refunded":
      return { ...base, status: "refunded" };
    default:
      return base;
  }
}

/** `/orders` and `/orders/:id`. */
export function OrdersArea({ site, route }: AreaProps) {
  const [id] = route.rest;
  if (id) return <OrderDetail key={id} site={site} orderId={id} />;
  return <OrdersList site={site} />;
}

function OrdersList({ site }: { site: Site }) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("open");
  const [kind, setKind] = useState<OrderKind | "">("");
  const [q, setQ] = useState("");
  const query = useDebounced(q);
  const orders = useOrdersPaged(site.id, queryFor(view, kind, query));
  const pages = orders.data?.pages ?? [];
  const list = pages.flatMap((p) => p.orders);
  // Badge counts come from the Hub (site-wide), not from the page on screen.
  const problemCount = pages[0]?.counts?.problem ?? 0;
  return (
    <div className="st-ws-stack">
      <WsHeader
        title="Orders"
        description="Purchases, donations and paid memberships. Payments go straight to your Stripe account; OpenSpace never takes a cut."
      />
      {problemCount > 0 && view !== "problem" && (
        <div className="st-callout st-callout--danger">
          <AlertTriangle aria-hidden="true" />
          <span>
            <strong>
              {problemCount === 1 ? "1 order needs" : `${problemCount} orders need`} your attention.
            </strong>{" "}
            <button type="button" className="st-linklike" onClick={() => setView("problem")}>
              Show {problemCount === 1 ? "it" : "them"}
            </button>
          </span>
        </div>
      )}
      <div className="st-ws-toolbar">
        <SearchField value={q} onChange={setQ} label="Search by name, email or #number" />
        <Segmented<View>
          size="sm"
          aria-label="Show"
          value={view}
          onValueChange={setView}
          options={[
            { value: "open", label: "To send" },
            { value: "fulfilled", label: "Sent" },
            { value: "refunded", label: "Refunded" },
            { value: "problem", label: `Needs attention${problemCount ? ` ${problemCount}` : ""}` },
            { value: "all", label: "All" },
          ]}
        />
        <Select
          size="sm"
          value={kind || "__all"}
          onValueChange={(v) => setKind(v === "__all" ? "" : (v as OrderKind))}
          options={[
            { value: "__all", label: "Everything" },
            { value: "order", label: "Orders" },
            { value: "donation", label: "Donations" },
            { value: "membership", label: "Memberships" },
          ]}
        />
      </div>
      <div className="st-ws-panel st-ws-scroll">
        {orders.isPending ? (
          <div className="st-ws-section">
            <Skeleton height={14} />
            <Skeleton height={14} width="60%" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            className="st-ws-empty"
            icon={<Receipt />}
            title={
              view === "open"
                ? "Nothing to send"
                : view === "problem"
                  ? "Nothing needs attention"
                  : "No orders here"
            }
            description={
              view === "open"
                ? "Paid orders waiting to be packed show up here. Digital downloads are sent automatically."
                : "Add a Product section to a page and connect Stripe in Store settings to start selling."
            }
          />
        ) : (
          <table className="st-ws-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th className="st-hide-sm">Items</th>
                <th className="is-num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr
                  key={o.id}
                  className="is-clickable"
                  tabIndex={0}
                  onClick={() => navigate(workspacePath(site.id, "orders", o.id))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate(workspacePath(site.id, "orders", o.id));
                  }}
                  aria-label={`Order #${o.number}`}
                >
                  <td>
                    <div className="st-ws-row__main">
                      <span className="st-ws-row__title">#{o.number}</span>
                      <span className="st-ws-row__meta">
                        {KIND_LABEL[o.kind]} · {ago(o.createdAt)}
                      </span>
                    </div>
                  </td>
                  <td>{o.customerName ?? o.email ?? "—"}</td>
                  <td className="st-hide-sm">
                    {o.items.map((i) => `${i.qty}× ${i.title}`).join(", ")}
                  </td>
                  <td className="is-num">{money(o.total, o.currency)}</td>
                  <td>
                    <span className="st-ws-actions">
                      <Badge tone={ORDER_STATUS[o.status].tone}>
                        {ORDER_STATUS[o.status].label}
                      </Badge>
                      {o.status === "paid" && o.kind === "order" && (
                        <Badge tone={o.fulfillment === "fulfilled" ? "neutral" : "accent"}>
                          {o.fulfillment === "fulfilled" ? "Sent" : "To send"}
                        </Badge>
                      )}
                      {o.problem && (
                        <AlertTriangle className="st-order__warn" aria-label="Needs attention" />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {orders.hasNextPage && (
          <div className="st-ws-more">
            <Button
              size="sm"
              variant="ghost"
              loading={orders.isFetchingNextPage}
              onClick={() => void orders.fetchNextPage()}
            >
              Show more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function address(o: OrderView): string[] {
  if (!o.shipping) return [];
  const a = o.shipping.address;
  if (typeof a === "string") return [o.shipping.name, a];
  const city = [a.city, a.state, a.postal_code].filter(Boolean).join(" ");
  return [o.shipping.name, a.line1, a.line2, city, a.country].filter(Boolean) as string[];
}

function OrderDetail({ site, orderId }: { site: Site; orderId: string }) {
  const navigate = useNavigate();
  const hub = useHub();
  const order = useOrder(site.id, orderId);
  const actions = useOrderActions(site.id);
  const [fulfilling, setFulfilling] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const designer = can(site, "designer");
  const o = order.data;
  const back = () => navigate(workspacePath(site.id, "orders"));

  const printSlip = async () => {
    try {
      const html = await hub.getPackingSlip(site.id, orderId);
      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.setAttribute("sandbox", "allow-modals allow-same-origin");
      frame.srcdoc = html;
      document.body.append(frame);
      frame.onload = () => {
        try {
          frame.contentWindow?.print();
        } finally {
          setTimeout(() => frame.remove(), 1000);
        }
      };
    } catch (err) {
      toast({
        tone: "danger",
        title: "Couldn't open the packing slip",
        description: errorMessage(err),
      });
    }
  };

  if (order.isPending) return <Skeleton height={240} />;
  if (!o) return <p className="st-ws-hint">That order isn't here.</p>;
  const physical = o.items.some((i) => !i.digital) && o.kind === "order";
  const refundable = ["paid", "partially_refunded", "out_of_stock"].includes(o.status);
  const canFulfill = (o.status === "paid" || o.status === "partially_refunded") && physical;

  return (
    <div className="st-ws-stack">
      <button type="button" className="st-ws-back" onClick={back}>
        <ArrowLeft aria-hidden="true" /> Orders
      </button>
      <WsHeader
        title={`${KIND_LABEL[o.kind]} #${o.number}`}
        description={`${dateTime(o.createdAt)}${o.email ? ` · ${o.email}` : ""}`}
        actions={
          <>
            <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
            {physical && (
              <Button icon={<Printer />} onClick={printSlip}>
                Packing slip
              </Button>
            )}
            {canFulfill &&
              (o.fulfillment === "fulfilled" ? (
                <Button
                  icon={<RotateCcw />}
                  onClick={() =>
                    actions.fulfill.mutate(
                      { id: o.id, fulfilled: false },
                      {
                        onError: (err) =>
                          toast({
                            tone: "danger",
                            title: "Couldn't change it",
                            description: errorMessage(err),
                          }),
                      },
                    )
                  }
                >
                  Mark as not sent
                </Button>
              ) : (
                <Button variant="primary" icon={<Truck />} onClick={() => setFulfilling(true)}>
                  Mark as sent
                </Button>
              ))}
            {designer && refundable && (
              <Button
                variant={o.status === "out_of_stock" ? "primary" : "ghost"}
                onClick={() => setRefunding(true)}
              >
                Refund
              </Button>
            )}
          </>
        }
      />
      {o.problem && (
        <div className="st-callout st-callout--danger" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span>
            <strong>Needs attention:</strong> {o.problem.message}
            {o.problem.gaveUp
              ? " We stopped retrying automatically."
              : ` Tried ${o.problem.attempts} times so far.`}
          </span>
        </div>
      )}
      {o.status === "out_of_stock" && !o.problem && (
        <div className="st-callout st-callout--pending">
          <AlertTriangle aria-hidden="true" />
          <span>
            Someone else bought the last one at the same moment. This order is refunded in full
            automatically.
          </span>
        </div>
      )}
      <div className="st-order">
        <section className="st-ws-panel" aria-labelledby="ord-items">
          <div className="st-ws-section">
            <h3 id="ord-items" className="st-ws-section__title">
              Items
            </h3>
            <table className="st-ws-table st-order__items">
              <tbody>
                {o.items.map((it) => (
                  <tr key={it.sku}>
                    <td>
                      <div className="st-ws-row__main">
                        <span>{it.title}</span>
                        <span className="st-ws-row__meta">
                          {it.sku}
                          {it.digital ? " · Download" : ""}
                        </span>
                      </div>
                    </td>
                    <td className="is-num">× {it.qty}</td>
                    <td className="is-num">{money(it.unitAmount * it.qty, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="st-ws-kv st-order__totals">
              <dt>Subtotal</dt>
              <dd>{money(o.amounts.subtotal, o.currency)}</dd>
              {o.amounts.discount > 0 && (
                <>
                  <dt>Discount</dt>
                  <dd>−{money(o.amounts.discount, o.currency)}</dd>
                </>
              )}
              {o.amounts.shipping > 0 && (
                <>
                  <dt>Shipping</dt>
                  <dd>{money(o.amounts.shipping, o.currency)}</dd>
                </>
              )}
              {o.amounts.tax > 0 && (
                <>
                  <dt>Tax</dt>
                  <dd>{money(o.amounts.tax, o.currency)}</dd>
                </>
              )}
              <dt>
                <strong>Total</strong>
              </dt>
              <dd>
                <strong>{money(o.total, o.currency)}</strong>
              </dd>
              {o.refunded > 0 && (
                <>
                  <dt>Refunded</dt>
                  <dd>−{money(o.refunded, o.currency)}</dd>
                </>
              )}
            </dl>
          </div>
        </section>
        <section className="st-ws-panel" aria-labelledby="ord-cust">
          <div className="st-ws-section">
            <h3 id="ord-cust" className="st-ws-section__title">
              Customer
            </h3>
            <p className="st-order__address">
              {o.customerName && <strong>{o.customerName}</strong>}
              {o.email && <a href={`mailto:${o.email}`}>{o.email}</a>}
            </p>
            {physical && (
              <>
                <h3 className="st-ws-section__title">Ship to</h3>
                <p className="st-order__address">
                  {address(o).map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </p>
              </>
            )}
            {o.fulfillment === "fulfilled" && (
              <p className="st-ws-hint">
                <PackageCheck aria-hidden="true" className="st-inline-icon" /> Sent{" "}
                {dateTime(o.fulfilledAt)}
                {o.tracking ? ` · tracking ${o.tracking}` : ""}
              </p>
            )}
          </div>
        </section>
      </div>
      {fulfilling && (
        <FulfillDialog
          busy={actions.fulfill.isPending}
          onClose={() => setFulfilling(false)}
          onSave={(tracking, notify) =>
            actions.fulfill.mutate(
              { id: o.id, tracking: tracking || undefined, notify },
              {
                onSuccess: () => {
                  setFulfilling(false);
                  toast({
                    tone: "success",
                    title: "Marked as sent",
                    description: notify ? "We emailed the customer." : undefined,
                  });
                },
                onError: (err) =>
                  toast({
                    tone: "danger",
                    title: "Couldn't mark it",
                    description: errorMessage(err),
                  }),
              },
            )
          }
        />
      )}
      {refunding && (
        <RefundDialog
          order={o}
          busy={actions.refund.isPending}
          onClose={() => setRefunding(false)}
          onRefund={(amount, restock) =>
            actions.refund.mutate(
              { id: o.id, amount, restock },
              {
                onSuccess: (r) => {
                  setRefunding(false);
                  toast({
                    tone: "success",
                    title: "Refunded",
                    description: `${money(r.refunded, r.currency)} in total.`,
                  });
                },
                onError: (err) =>
                  toast({
                    tone: "danger",
                    title: "Couldn't refund",
                    description: errorMessage(err),
                  }),
              },
            )
          }
        />
      )}
    </div>
  );
}

function FulfillDialog({
  onClose,
  onSave,
  busy,
}: {
  onClose: () => void;
  onSave: (tracking: string, notify: boolean) => void;
  busy: boolean;
}) {
  const [tracking, setTracking] = useState("");
  const [notify, setNotify] = useState(true);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Mark as sent"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onSave(tracking.trim(), notify)}>
            Mark as sent
          </Button>
        </>
      }
    >
      <div className="st-form">
        <Field label="Tracking number (optional)">
          <Input value={tracking} onChange={(e) => setTracking(e.target.value)} autoFocus />
        </Field>
        <SwitchRow
          label={<>Email the customer that it's on its way</>}
          checked={notify}
          onCheckedChange={setNotify}
        />
      </div>
    </Dialog>
  );
}

function RefundDialog({
  order,
  onClose,
  onRefund,
  busy,
}: {
  order: OrderView;
  onClose: () => void;
  onRefund: (amount: number | undefined, restock: boolean) => void;
  busy: boolean;
}) {
  const rest = order.total - order.refunded;
  const soldOut = order.status === "out_of_stock";
  const [full, setFull] = useState(true);
  const [text, setText] = useState(moneyInput(rest, order.currency));
  const [restock, setRestock] = useState(true);
  const amount = full ? rest : parseMoney(text, order.currency);
  const bad = !full && (amount === null || amount <= 0 || amount > rest);
  const physical = order.items.some((i) => !i.digital);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Refund order #${order.number}`}
      description={
        soldOut
          ? "This order sold out, so it's refunded in full."
          : `${money(rest, order.currency)} can still be refunded. The money goes back to the card they paid with.`
      }
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={bad}
            onClick={() =>
              onRefund(
                full || soldOut ? undefined : (amount ?? undefined),
                physical && (full || soldOut) && restock,
              )
            }
          >
            Refund{" "}
            {amount !== null && !bad ? money(full || soldOut ? rest : amount, order.currency) : ""}
          </Button>
        </>
      }
    >
      <div className="st-form">
        {!soldOut && (
          <Segmented
            block
            aria-label="Refund amount"
            value={full ? "full" : "part"}
            onValueChange={(v) => setFull(v === "full")}
            options={[
              { value: "full", label: "Full refund" },
              { value: "part", label: "Part of it" },
            ]}
          />
        )}
        {!full && !soldOut && (
          <Field
            label="Amount"
            error={bad ? `Between 0.01 and ${money(rest, order.currency)}` : undefined}
          >
            <Input
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </Field>
        )}
        {physical && (full || soldOut) && (
          <SwitchRow
            label={<>Put the items back in stock</>}
            hint={<>Only for full refunds.</>}
            checked={restock}
            onCheckedChange={setRestock}
          />
        )}
      </div>
    </Dialog>
  );
}
