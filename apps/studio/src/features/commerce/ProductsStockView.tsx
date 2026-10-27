import { Minus, Package, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  type ProductStock,
  useCommerceSettings,
  useInventoryActions,
  useProducts,
} from "../../api";
import { Badge, Button, EmptyState, IconButton, Input, Skeleton, toast } from "../../ui";
import { money } from "../workspace/format";
import { workspacePath } from "../workspace/routes";
import { errorMessage, SearchField, WsHeader } from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";
import "./commerce.css";
import { ServiceRequirements } from "./ServiceRequirements";

/** Every product and variant with its stock: track, adjust, set a low-stock warning. */
export function ProductsStockView({ site }: AreaProps) {
  const navigate = useNavigate();
  const products = useProducts(site.id);
  const settings = useCommerceSettings(site.id);
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const list = (products.data?.products ?? []).filter(
    (p) =>
      (!q || `${p.title} ${p.sku}`.toLowerCase().includes(q.toLowerCase())) && (!onlyLow || p.low),
  );
  const low = (products.data?.products ?? []).filter((p) => p.low).length;
  const threshold = settings.data?.settings.lowStockThreshold ?? 3;
  return (
    <div className="st-ws-stack">
      <WsHeader
        title="Products & stock"
        description={`How many of each thing you have. We email you when something drops to ${threshold} or fewer, and never sell more than you have.`}
        actions={
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => navigate(workspacePath(site.id, "content"))}
          >
            Add or edit products
          </Button>
        }
      />
      <ServiceRequirements site={site} feature="store" />
      {products.isPending ? (
        <Skeleton height={160} />
      ) : (products.data?.products.length ?? 0) === 0 ? (
        <div className="st-ws-panel">
          <EmptyState
            className="st-ws-empty"
            icon={<Package />}
            title="No products yet"
            description="Products live in your Shop collection. Add one there, publish your site, and its stock shows up here."
            action={
              <Button onClick={() => navigate(workspacePath(site.id, "content", "new"))}>
                Add a shop
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="st-ws-toolbar">
            <SearchField value={q} onChange={setQ} label="Search products" />
            <label className="st-ws-check">
              <input
                type="checkbox"
                checked={onlyLow}
                onChange={(e) => setOnlyLow(e.target.checked)}
              />
              Only low stock{low ? ` (${low})` : ""}
            </label>
          </div>
          <div className="st-ws-panel st-ws-scroll">
            <table className="st-ws-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="st-hide-sm">Price</th>
                  <th>In stock</th>
                  <th className="st-hide-sm">Warn at</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <StockRow
                    key={p.sku}
                    siteId={site.id}
                    p={p}
                    onOpen={() => navigate(workspacePath(site.id, "content", p.collection, p.slug))}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="st-ws-hint">
            Stock reflects your published shop. New products appear here after you publish.
          </p>
        </>
      )}
    </div>
  );
}

function StockRow({ siteId, p, onOpen }: { siteId: string; p: ProductStock; onOpen: () => void }) {
  const actions = useInventoryActions(siteId);
  const [qty, setQty] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const err = (title: string) => (e: unknown) =>
    toast({ tone: "danger", title, description: errorMessage(e) });
  const save = () => {
    if (qty === null) return;
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 0) return setQty(null);
    actions.set.mutate(
      { sku: p.sku, qty: n, lowStock: p.lowStock },
      { onError: err("Couldn't update stock"), onSettled: () => setQty(null) },
    );
  };
  return (
    <tr>
      <td>
        <button type="button" className="st-linkrow" onClick={onOpen}>
          <span className="st-ws-row__title">{p.title}</span>
          <span className="st-ws-row__meta">
            {p.sku}
            {p.digital ? (p.hasFile ? " · Download ready" : " · Download file missing") : ""}
            {!p.available ? " · Not for sale" : ""}
          </span>
        </button>
      </td>
      <td className="st-hide-sm">{money(p.price.amount, p.price.currency)}</td>
      <td>
        {p.digital ? (
          <span className="st-ws-hint">Unlimited</span>
        ) : p.tracked ? (
          <span className="st-stock">
            <IconButton
              size="sm"
              label={`One less ${p.title}`}
              icon={<Minus />}
              disabled={(p.qty ?? 0) <= 0}
              onClick={() =>
                actions.adjust.mutate(
                  { sku: p.sku, delta: -1 },
                  { onError: err("Couldn't update stock") },
                )
              }
            />
            <Input
              size="sm"
              type="number"
              min={0}
              aria-label={`Stock for ${p.title}`}
              className="st-stock__input"
              value={qty ?? String(p.qty ?? 0)}
              onChange={(e) => setQty(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
            <IconButton
              size="sm"
              label={`One more ${p.title}`}
              icon={<Plus />}
              onClick={() =>
                actions.adjust.mutate(
                  { sku: p.sku, delta: 1 },
                  { onError: err("Couldn't update stock") },
                )
              }
            />
            {p.low && (
              <Badge tone={p.qty === 0 ? "danger" : "pending"}>
                {p.qty === 0 ? "Sold out" : "Low"}
              </Badge>
            )}
            <button
              type="button"
              className="st-linklike"
              onClick={() =>
                actions.set.mutate(
                  { sku: p.sku, qty: null },
                  { onError: err("Couldn't change tracking") },
                )
              }
            >
              Stop tracking
            </button>
          </span>
        ) : (
          <Button
            size="sm"
            onClick={() =>
              actions.set.mutate({ sku: p.sku, qty: 0 }, { onError: err("Couldn't track stock") })
            }
          >
            Track stock
          </Button>
        )}
      </td>
      <td className="st-hide-sm">
        {p.tracked && !p.digital ? (
          <Input
            size="sm"
            type="number"
            min={0}
            aria-label={`Warn when ${p.title} is at`}
            className="st-stock__input"
            placeholder="Default"
            value={warn ?? (p.lowStock === null ? "" : String(p.lowStock))}
            onChange={(e) => setWarn(e.target.value)}
            onBlur={() => {
              if (warn === null) return;
              const v = warn.trim() === "" ? null : Number(warn);
              if (v !== null && (!Number.isInteger(v) || v < 0)) return setWarn(null);
              actions.set.mutate(
                { sku: p.sku, qty: p.qty ?? 0, lowStock: v },
                { onError: err("Couldn't save"), onSettled: () => setWarn(null) },
              );
            }}
          />
        ) : (
          <span className="st-ws-hint">—</span>
        )}
      </td>
    </tr>
  );
}
