import { cx } from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";
import type { ReactNode } from "react";
import { sub, typo, useLocale } from "../shared";

/** A "nice" axis for values ≥ 0: a round maximum and 3–6 evenly spaced ticks. */
export function niceScale(max: number): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const pow = 10 ** Math.floor(Math.log10(max));
  const step =
    [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= 5) ??
    pow * 10;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
  return { max: top, ticks };
}

/** Accent shades for pie slices (cycled), all from the theme palette. */
const SLICE_COLORS = [
  "var(--os-color-accent)",
  "var(--os-color-accent-300)",
  "var(--os-color-accent-700)",
  "var(--os-color-neutral-400)",
  "var(--os-color-accent-200)",
  "var(--os-color-accent-900)",
  "var(--os-color-neutral-600)",
  "var(--os-color-accent-500)",
];

export const chartBlock = defineBlock({
  type: "chart",
  version: 1,
  category: "data",
  label: "Chart",
  icon: "chart-pie",
  description:
    "A simple bar, column, line or pie chart drawn from a small table, with the data available as a table.",
  fields: {
    title: f.text({ maxLength: 120, default: "What members come for" }),
    description: f.text({
      optional: true,
      maxLength: 240,
      default: "Share of class bookings by style, January to September 2026.",
      help: "What the chart shows and where the numbers come from",
    }),
    rows: f.list({
      min: 1,
      max: 24,
      itemLabel: "label",
      fields: {
        label: f.text({ maxLength: 40 }),
        value: f.number({ min: 0 }),
      },
      default: [
        { label: "Flow", value: 42 },
        { label: "Foundations", value: 23 },
        { label: "Yin & restore", value: 21 },
        { label: "Online", value: 14 },
      ],
    }),
    prefix: f.text({ optional: true, maxLength: 4, help: "Before each value, e.g. '$'" }),
    suffix: f.text({
      optional: true,
      maxLength: 12,
      default: "%",
      help: "After each value, e.g. '%'",
    }),
    showValues: f.boolean({ default: true, help: "Print each value on the chart" }),
    showTable: f.boolean({
      default: false,
      help: "Offer a 'Show the numbers' table under the chart",
    }),
  },
  variants: ["bar", "column", "line", "pie"],
  styleSlots: ["colorTheme", "padding", "radius", "animation", "typography.title"],
  ai: {
    purpose: "Shows a small set of numbers as a bar, column, line or pie chart.",
    whenToUse:
      "Up to ~12 values that tell one story: results, survey answers, growth over time. `line` for change over time, `pie` for shares of a whole (2–6 slices).",
    avoid:
      "Invented or unsourced figures; pies with many slices; charts that need more than one series.",
  },
  render: ({ id, fields, variant, style }) => {
    const locale = useLocale();
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    const fmt = (v: number) => `${fields.prefix ?? ""}${nf.format(v)}${fields.suffix ?? ""}`;
    const rows = fields.rows;
    const titleId = sub(id, "title");
    const total = rows.reduce((s, r) => s + r.value, 0);
    const scale = niceScale(Math.max(...rows.map((r) => r.value)));
    const pct = (v: number) => (v / scale.max) * 100;

    let plot: ReactNode;
    if (variant === "pie") {
      let offset = 0;
      plot = (
        <div className="os-chart__pie">
          <svg viewBox="0 0 42 42" className="os-chart__svg" aria-hidden="true" focusable="false">
            <circle className="os-chart__ring" cx="21" cy="21" r="15.9155" />
            {rows.map((r, i) => {
              const share = total > 0 ? (r.value / total) * 100 : 0;
              const el = (
                <circle
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                  key={i}
                  className="os-chart__slice"
                  cx="21"
                  cy="21"
                  r="15.9155"
                  style={{ stroke: SLICE_COLORS[i % SLICE_COLORS.length] }}
                  strokeDasharray={`${share} ${100 - share}`}
                  strokeDashoffset={25 - offset}
                />
              );
              offset += share;
              return el;
            })}
          </svg>
          <ul className="os-chart__legend" aria-hidden="true">
            {rows.map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
              <li key={i}>
                <span
                  className="os-chart__swatch"
                  style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                />
                <span className="os-chart__label">{r.label}</span>
                {fields.showValues ? <span className="os-chart__value">{fmt(r.value)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      );
    } else if (variant === "bar") {
      plot = (
        <div className="os-chart__bars" aria-hidden="true">
          {rows.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
            <div key={i} className="os-chart__row">
              <span className="os-chart__label">{r.label}</span>
              <svg
                aria-hidden="true"
                className="os-chart__track"
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                focusable="false"
              >
                <rect
                  className="os-chart__mark"
                  x="0"
                  y="0"
                  height="10"
                  width={pct(r.value)}
                  rx="0"
                />
              </svg>
              {fields.showValues ? <span className="os-chart__value">{fmt(r.value)}</span> : null}
            </div>
          ))}
        </div>
      );
    } else {
      const n = rows.length;
      const slot = 100 / n;
      const pts = rows.map((r, i) => [slot * i + slot / 2, 100 - pct(r.value)] as const);
      plot = (
        <div className="os-chart__xy" aria-hidden="true">
          <div className="os-chart__yaxis">
            {scale.ticks.map((t) => (
              <span key={t} style={{ "--y": `${pct(t)}%` }}>
                {fmt(t)}
              </span>
            ))}
          </div>
          <div className="os-chart__area">
            <svg
              aria-hidden="true"
              className="os-chart__svg"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              focusable="false"
            >
              {scale.ticks.map((t) => (
                <line
                  key={t}
                  className="os-chart__grid"
                  x1="0"
                  x2="100"
                  y1={100 - pct(t)}
                  y2={100 - pct(t)}
                />
              ))}
              {variant === "column" ? (
                rows.map((r, i) => (
                  <rect
                    // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                    key={i}
                    className="os-chart__mark"
                    x={slot * i + slot * 0.18}
                    width={slot * 0.64}
                    y={100 - pct(r.value)}
                    height={pct(r.value)}
                  />
                ))
              ) : (
                <>
                  <polygon
                    className="os-chart__fill"
                    points={`${pts[0]?.[0] ?? 0},100 ${pts.map((p) => p.join(",")).join(" ")} ${pts[n - 1]?.[0] ?? 100},100`}
                  />
                  <polyline
                    className="os-chart__line"
                    points={pts.map((p) => p.join(",")).join(" ")}
                  />
                </>
              )}
            </svg>
            {variant === "line"
              ? pts.map(([x, y], i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                    key={i}
                    className="os-chart__dot"
                    style={{ "--x": `${x}%`, "--y": `${100 - y}%` }}
                  />
                ))
              : null}
            {fields.showValues
              ? rows.map((r, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                    key={i}
                    className="os-chart__point"
                    style={{ "--x": `${slot * i + slot / 2}%`, "--y": `${pct(r.value)}%` }}
                  >
                    {fmt(r.value)}
                  </span>
                ))
              : null}
          </div>
          <div className="os-chart__xaxis" style={{ "--n": n }}>
            {rows.map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
              <span key={i}>{r.label}</span>
            ))}
          </div>
        </div>
      );
    }

    const table = (
      <table className="os-chart__table">
        <caption className="os-visually-hidden">{fields.title}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
            <tr key={i}>
              <th scope="row">{r.label}</th>
              <td>{fmt(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );

    return (
      <figure className={cx("os-chart", `os-chart--${variant}`)} aria-labelledby={titleId}>
        <figcaption className="os-chart__caption">
          <span id={titleId} className={cx("os-chart__title", typo(style, "title", "h4"))}>
            {fields.title}
          </span>
          {fields.description ? <span className="os-chart__desc">{fields.description}</span> : null}
        </figcaption>
        {plot}
        {fields.showTable ? (
          <details className="os-chart__data">
            <summary>Show the numbers</summary>
            {table}
          </details>
        ) : (
          <div className="os-visually-hidden">{table}</div>
        )}
      </figure>
    );
  },
});

export const chartCss = `
.os-chart{display:grid;gap:var(--os-space-sm);margin:0;color:var(--os-color-accent)}
.os-chart__caption{display:grid;gap:0.25em}
.os-chart__title{color:var(--os-color-heading)}
.os-chart__desc{font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height);color:var(--os-color-text-muted)}
.os-chart__label,.os-chart__xaxis,.os-chart__yaxis{font-size:var(--os-type-small-font-size);color:var(--os-color-text)}
.os-chart__value,.os-chart__point{font-size:var(--os-type-small-font-size);font-weight:var(--os-font-weight-strong);color:var(--os-color-heading);font-variant-numeric:lining-nums tabular-nums;white-space:nowrap}
.os-chart__mark{fill:currentColor}
.os-chart__bars{display:grid;gap:var(--os-space-2xs)}
.os-chart__row{display:grid;grid-template-columns:minmax(5rem,30%) minmax(0,1fr) auto;align-items:center;gap:var(--os-space-xs)}
.os-chart__track{display:block;width:100%;height:1.6rem;border-radius:var(--os-radius-sm);overflow:hidden;background:var(--os-color-surface)}
.os-chart__xy{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:14rem auto;column-gap:var(--os-space-2xs)}
@container block (min-width:40rem){.os-chart__xy{grid-template-rows:18rem auto}}
.os-chart__yaxis{position:relative;min-width:2.5rem;color:var(--os-color-text-muted)}
.os-chart__yaxis>span{position:absolute;right:0;bottom:var(--y);translate:0 50%;line-height:1;white-space:nowrap}
.os-chart__area{position:relative}
.os-chart__area>.os-chart__svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.os-chart__grid{stroke:var(--os-color-border);stroke-width:1;vector-effect:non-scaling-stroke}
.os-chart__line{fill:none;stroke:currentColor;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.os-chart__fill{fill:currentColor;fill-opacity:0.12}
.os-chart__dot{position:absolute;left:var(--x);bottom:var(--y);width:0.7rem;height:0.7rem;translate:-50% 50%;border-radius:var(--os-radius-full);background:currentColor;box-shadow:0 0 0 2px var(--os-color-background)}
.os-chart__point{position:absolute;left:var(--x);bottom:var(--y);translate:-50% -0.6rem;line-height:1}
.os-chart__xaxis{grid-column:2;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));padding-top:var(--os-space-2xs);text-align:center}
.os-chart__xaxis>span{overflow-wrap:anywhere;padding-inline:0.15rem}
.os-chart__pie{display:grid;gap:var(--os-space-md);align-items:center}
@container block (min-width:36rem){.os-chart__pie{grid-template-columns:minmax(0,16rem) minmax(0,1fr)}}
.os-chart__pie>.os-chart__svg{width:100%;max-width:16rem;rotate:0deg}
.os-chart__ring{fill:none;stroke:var(--os-color-surface);stroke-width:7}
.os-chart__slice{fill:none;stroke-width:7}
.os-chart__legend{display:grid;gap:var(--os-space-2xs);margin:0;padding:0;list-style:none}
.os-chart__legend li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:var(--os-space-xs);align-items:center}
.os-chart__swatch{width:0.9rem;height:0.9rem;border-radius:var(--os-radius-sm)}
.os-chart__data>summary{cursor:pointer;font-size:var(--os-type-small-font-size);font-weight:var(--os-font-weight-strong);color:var(--os-color-link)}
.os-chart__table{width:100%;margin-top:var(--os-space-xs);border-collapse:collapse;font-size:var(--os-type-small-font-size);color:var(--os-color-text)}
.os-chart__table th,.os-chart__table td{padding:0.4em 0;border-bottom:1px solid var(--os-color-border);text-align:start}
.os-chart__table td{text-align:end;font-variant-numeric:tabular-nums}
`;
