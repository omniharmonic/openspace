import { HandHeart } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useCommerceActions, useCommerceSettings, useOrdersPaged } from "../../api";
import { Button, Field, Input, Skeleton, toast } from "../../ui";
import { can } from "../site-mgmt/manage-ui";
import { date, money, number } from "../workspace/format";
import { workspacePath } from "../workspace/routes";
import { errorMessage, Stat, WsHeader } from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";
import "./commerce.css";

/** Donations: the smallest and largest gift, plus a summary of gifts received. */
export function DonationsView({ site }: AreaProps) {
  const navigate = useNavigate();
  const q = useCommerceSettings(site.id);
  const actions = useCommerceActions(site.id);
  const gifts = useOrdersPaged(site.id, { kind: "donation", limit: 50 });
  const s = q.data?.settings;
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (s) {
      setMin(String(s.donationMin));
      setMax(String(s.donationMax));
    }
  }, [s]);
  const designer = can(site, "designer");
  const list = (gifts.data?.pages ?? [])
    .flatMap((p) => p.orders)
    .filter((o) => o.status === "paid" || o.status === "partially_refunded");
  // Gifts can come in several currencies: one total each, never added together.
  const totals = new Map<string, number>();
  for (const o of list)
    totals.set(o.currency, (totals.get(o.currency) ?? 0) + o.total - o.refunded);
  const totalText = totals.size
    ? [...totals].map(([cur, minor]) => money(minor, cur)).join(" + ")
    : money(0, s?.currency ?? "USD");
  return (
    <div className="st-ws-stack">
      <WsHeader
        title="Donations"
        description="Add a Donation section to any page. Gifts go to your Stripe account, one-off or monthly, and you choose the limits."
        actions={
          <Button icon={<HandHeart />} onClick={() => navigate(workspacePath(site.id, "orders"))}>
            See all gifts
          </Button>
        }
      />
      <div className="st-stats">
        <Stat label="Gifts received" value={number(list.length)} />
        <Stat
          label="Total given"
          value={totalText}
          detail={gifts.hasNextPage ? `From the ${list.length} most recent gifts` : undefined}
        />
        <Stat
          label="Payments"
          value={q.data?.payments.ready ? "Ready" : "Not set up"}
          detail={q.data?.payments.ready ? undefined : "Connect Stripe in Store settings"}
        />
      </div>
      {list.length > 0 && (
        <section className="st-ws-panel st-ws-scroll" aria-labelledby="dn-gifts">
          <div className="st-ws-section">
            <h3 id="dn-gifts" className="st-ws-section__title">
              Recent gifts
            </h3>
          </div>
          <table className="st-ws-table">
            <tbody>
              {list.map((o) => (
                <tr key={o.id}>
                  <td>{o.customerName ?? o.email ?? "Anonymous"}</td>
                  <td>{date(o.paidAt ?? o.createdAt)}</td>
                  <td className="is-num">{money(o.total - o.refunded, o.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {gifts.hasNextPage && (
            <div className="st-ws-more">
              <Button
                size="sm"
                variant="ghost"
                loading={gifts.isFetchingNextPage}
                onClick={() => void gifts.fetchNextPage()}
              >
                Show more
              </Button>
            </div>
          )}
        </section>
      )}
      {!s ? (
        <Skeleton height={120} />
      ) : (
        <section className="st-ws-panel" aria-labelledby="dn-limits">
          <form
            className="st-ws-section"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const lo = Number(min);
              const hi = Number(max);
              if (!(lo > 0) || !(hi > 0)) return setError("Enter amounts above zero.");
              if (lo > hi) return setError("The smallest gift must be less than the largest.");
              actions.update.mutate(
                { donationMin: lo, donationMax: hi },
                {
                  onSuccess: () => toast({ tone: "success", title: "Donation limits saved" }),
                  onError: (err) => setError(errorMessage(err)),
                },
              );
            }}
          >
            <h3 id="dn-limits" className="st-ws-section__title">
              Gift limits ({s.currency})
            </h3>
            <p className="st-ws-section__desc">
              Visitors can pick a suggested amount on the Donation section or type their own within
              these limits. The suggested amounts are set on the section itself.
            </p>
            <div className="st-ws-cols">
              <Field label="Smallest gift">
                <Input
                  inputMode="decimal"
                  disabled={!designer}
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                />
              </Field>
              <Field label="Largest gift">
                <Input
                  inputMode="decimal"
                  disabled={!designer}
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                />
              </Field>
            </div>
            {error && (
              <p className="st-ws-hint" role="alert">
                {error}
              </p>
            )}
            {designer && (
              <div className="st-ws-actions st-ws-actions--end">
                <Button variant="primary" type="submit" loading={actions.update.isPending}>
                  Save limits
                </Button>
              </div>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
