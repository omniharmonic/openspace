import { type PointerEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { compact, date, number } from "../workspace/format";

/**
 * Small, quiet charts for the analytics screen (dataviz method: one series → no legend, 2px
 * line with a 10% wash, hairline grid, crosshair + tooltip on hover, a table view for every
 * chart). Colors come from `--st-viz-*` tokens with light and dark steps.
 */

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const next = Math.round(e?.contentRect.width ?? 0);
      if (next > 0) setW(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** "Nice" ticks: 0, step, 2·step… covering max. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.5 && ticks.length < 8; v += step)
    ticks.push(Math.round(v * 100) / 100);
  if ((ticks.at(-1) ?? 0) < max) ticks.push((ticks.at(-1) ?? 0) + step);
  return ticks;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

/** Visits over time: a single line with a soft wash, crosshair and tooltip. */
export function TrendChart({
  points,
  label,
  unit,
}: {
  points: SeriesPoint[];
  label: string;
  unit: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const pad = { top: 12, right: 12, bottom: 28, left: 40 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks.at(-1) ?? max;
  const x = (i: number) =>
    pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join("");
  const area = points.length
    ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
    : "";
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 80))));
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - pad.left;
    if (points.length === 0) return;
    const i = Math.round((px / innerW) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const hp = hover !== null ? points[hover] : undefined;
  const last = points.at(-1);
  return (
    <div className="st-viz" ref={ref}>
      <svg
        role="img"
        aria-label={`${label}: ${points.length} days, highest ${number(max)} ${unit}`}
        width={width}
        height={height}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              className="st-viz__grid"
              x1={pad.left}
              x2={width - pad.right}
              y1={y(t)}
              y2={y(t)}
            />
            <text className="st-viz__tick" x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {compact(t)}
            </text>
          </g>
        ))}
        <line className="st-viz__axis" x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} />
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={p.date}
              className="st-viz__tick"
              x={x(i)}
              y={height - 8}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            >
              {date(p.date, { day: "numeric", month: "short" })}
            </text>
          ) : null,
        )}
        <path className="st-viz__area" d={area} />
        <path className="st-viz__line" d={line} />
        {last && points.length > 1 && hover === null && (
          <circle className="st-viz__dot" cx={x(points.length - 1)} cy={y(last.value)} r={4} />
        )}
        {hp && hover !== null && (
          <g>
            <line className="st-viz__cross" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={y(0)} />
            <circle className="st-viz__dot" cx={x(hover)} cy={y(hp.value)} r={4} />
          </g>
        )}
      </svg>
      {hp && hover !== null && (
        <div
          className="st-viz__tip"
          role="status"
          style={{
            left: Math.min(Math.max(x(hover), 70), width - 70),
            top: Math.max(0, y(hp.value) - 56),
          }}
        >
          <span>{date(hp.date, { weekday: "short", day: "numeric", month: "short" })}</span>
          <strong>
            {number(hp.value)} {unit}
          </strong>
        </div>
      )}
    </div>
  );
}

/** Ranked bars with the label above and the value at the end (pages, sources, devices…). */
export function BarList({
  rows,
  label,
  format = number,
  max: maxRows = 8,
}: {
  rows: Array<{ key: string; value: number; detail?: string }>;
  label: string;
  format?: (n: number) => string;
  max?: number;
}) {
  const shown = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    if (sorted.length <= maxRows) return sorted;
    const rest = sorted.slice(maxRows - 1);
    return [
      ...sorted.slice(0, maxRows - 1),
      { key: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0) },
    ];
  }, [rows, maxRows]);
  const top = Math.max(1, ...shown.map((r) => r.value));
  if (!shown.length) return <p className="st-ws-hint">No visits in this period yet.</p>;
  return (
    <ul className="st-barlist" aria-label={label}>
      {shown.map((r) => (
        <li key={r.key}>
          <span className="st-barlist__label" title={r.key}>
            {r.key}
          </span>
          <span className="st-barlist__value">{format(r.value)}</span>
          <span className="st-barlist__track" aria-hidden="true">
            <span
              className="st-barlist__bar"
              style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
