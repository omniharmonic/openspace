import { BarChart3, Info, Table2 } from "lucide-react";
import { useState } from "react";
import {
  type AnalyticsRange,
  useAnalytics,
  useServiceSettings,
  useUpdateServiceSettings,
} from "../../api";
import { Button, EmptyState, Input, Segmented, Skeleton, toast } from "../../ui";
import { can } from "../site-mgmt/manage-ui";
import { date, number, percent } from "../workspace/format";
import { errorMessage, Stat, WsHeader } from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";
import { BarList, TrendChart } from "./charts";
import "./analytics.css";

type RangeKey = "day" | "week" | "month" | "quarter" | "custom";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function rangeFor(key: RangeKey, custom: { from: string; to: string }): AnalyticsRange {
  if (key === "day" || key === "week" || key === "month") return { range: key };
  if (key === "quarter") {
    const to = new Date();
    return { from: iso(new Date(to.getTime() - 89 * 86_400_000)), to: iso(to) };
  }
  return custom;
}

const DEVICE_ORDER = ["Phone", "Desktop", "Tablet"];

/** Visits, people, pages, where they came from, devices and form sign-ups, with date ranges. */
export function AnalyticsView({ site }: AreaProps) {
  const [key, setKey] = useState<RangeKey>("month");
  const [custom, setCustom] = useState(() => ({
    from: iso(new Date(Date.now() - 13 * 86_400_000)),
    to: iso(new Date()),
  }));
  const range = rangeFor(key, custom);
  const report = useAnalytics(site.id, range);
  const settings = useServiceSettings(site.id);
  const update = useUpdateServiceSettings(site.id);
  const [asTable, setAsTable] = useState(false);
  const r = report.data;
  const off = settings.data?.analyticsEnabled === false;
  const submissions = r?.forms.reduce((s, f) => s + f.submissions, 0) ?? 0;

  return (
    <div className="st-ws-stack st-analytics">
      <WsHeader
        title="Analytics"
        description="Private, cookie-free visit counts. Nobody is tracked across sites and no banner is needed."
        actions={
          <div className="st-analytics__range">
            <Segmented<RangeKey>
              size="sm"
              aria-label="Date range"
              value={key}
              onValueChange={setKey}
              options={[
                { value: "day", label: "Today" },
                { value: "week", label: "7 days" },
                { value: "month", label: "30 days" },
                { value: "quarter", label: "90 days" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {key === "custom" && (
              <span className="st-analytics__custom">
                <Input
                  type="date"
                  size="sm"
                  aria-label="From"
                  value={custom.from}
                  max={custom.to}
                  onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
                />
                <span aria-hidden="true">–</span>
                <Input
                  type="date"
                  size="sm"
                  aria-label="To"
                  value={custom.to}
                  min={custom.from}
                  onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
                />
              </span>
            )}
          </div>
        }
      />

      {off && (
        <div className="st-callout st-callout--pending">
          <Info aria-hidden="true" />
          <span>
            Visit counting is turned off for this site.{" "}
            {can(site, "designer") && (
              <button
                type="button"
                className="st-linklike"
                onClick={() =>
                  update.mutate(
                    { analyticsEnabled: true },
                    {
                      onError: (err) =>
                        toast({
                          tone: "danger",
                          title: "Couldn't turn it on",
                          description: errorMessage(err),
                        }),
                    },
                  )
                }
              >
                Turn it on
              </button>
            )}
          </span>
        </div>
      )}

      {report.isError ? (
        <p className="st-ws-hint" role="alert">
          {errorMessage(report.error)}
        </p>
      ) : !r ? (
        <div className="st-stats">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={84} radius={11} />
          ))}
        </div>
      ) : r.totals.pageviews === 0 ? (
        <div className="st-ws-panel">
          <EmptyState
            className="st-ws-empty"
            icon={<BarChart3 />}
            title="No visits in this period"
            description="Once your site is published and people visit, you'll see them here within a minute. Try a longer range, or share your link to get the first visitors."
          />
        </div>
      ) : (
        <>
          <div className="st-stats" aria-live="polite">
            <Stat
              label="Visits"
              value={number(r.totals.visits)}
              detail={`${date(r.range.from)} – ${date(r.range.to)}`}
            />
            <Stat label="People" value={number(r.totals.uniques)} detail="Unique visitors" />
            <Stat
              label="Pages viewed"
              value={number(r.totals.pageviews)}
              detail={
                r.totals.visits
                  ? `${(r.totals.pageviews / r.totals.visits).toFixed(1)} per visit`
                  : undefined
              }
            />
            <Stat
              label="Form sign-ups"
              value={number(submissions)}
              detail={
                r.totals.visits ? `${percent(submissions / r.totals.visits)} of visits` : undefined
              }
            />
          </div>

          <section className="st-ws-panel" aria-labelledby="an-trend">
            <div className="st-ws-section">
              <div className="st-ws-section__head">
                <h3 id="an-trend" className="st-ws-section__title">
                  Visits per day
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={asTable ? <BarChart3 /> : <Table2 />}
                  onClick={() => setAsTable(!asTable)}
                >
                  {asTable ? "Show chart" : "Show as table"}
                </Button>
              </div>
              {asTable ? (
                <div className="st-ws-scroll st-analytics__table">
                  <table className="st-ws-table">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th className="is-num">Visits</th>
                        <th className="is-num">Pages viewed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.series.map((d) => (
                        <tr key={d.date}>
                          <td>
                            {date(d.date, { weekday: "short", day: "numeric", month: "short" })}
                          </td>
                          <td className="is-num">{number(d.visits)}</td>
                          <td className="is-num">{number(d.pageviews)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <TrendChart
                  label="Visits per day"
                  unit="visits"
                  points={r.series.map((d) => ({ date: d.date, value: d.visits }))}
                />
              )}
              {r.sampled && (
                <p className="st-ws-hint">
                  Busy month: above your plan's monthly visits, 1 in 10 visits is counted and scaled
                  up.
                </p>
              )}
            </div>
          </section>

          <div className="st-analytics__grid">
            <Breakdown
              title="Top pages"
              rows={r.topPages.map((b) => ({ key: b.key, value: b.pageviews }))}
            />
            <Breakdown
              title="Where visitors came from"
              rows={r.sources.map((b) => ({ key: b.key, value: b.visitors }))}
            />
            <Breakdown
              title="Referring sites"
              rows={r.referrers.map((b) => ({ key: b.key, value: b.visitors }))}
            />
            <Breakdown
              title="Devices"
              rows={[...r.devices]
                .sort((a, b) => DEVICE_ORDER.indexOf(a.key) - DEVICE_ORDER.indexOf(b.key))
                .map((b) => ({ key: b.key, value: b.visitors }))}
              format={(n) =>
                percent(
                  n /
                    Math.max(
                      1,
                      r.devices.reduce((s, d) => s + d.visitors, 0),
                    ),
                  0,
                )
              }
            />
            <Breakdown
              title="Countries"
              rows={r.countries.map((b) => ({ key: countryName(b.key), value: b.visitors }))}
            />
            <section className="st-ws-panel" aria-labelledby="an-conv">
              <div className="st-ws-section">
                <h3 id="an-conv" className="st-ws-section__title">
                  Conversions
                </h3>
                {r.forms.length === 0 && r.events.length === 0 ? (
                  <p className="st-ws-hint">Form sign-ups and button goals show up here.</p>
                ) : (
                  <table className="st-ws-table st-analytics__conv">
                    <thead>
                      <tr>
                        <th>Goal</th>
                        <th className="is-num">Count</th>
                        <th className="is-num">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.forms.map((f) => (
                        <tr key={f.formId}>
                          <td>{f.name} form</td>
                          <td className="is-num">{number(f.submissions)}</td>
                          <td className="is-num">{percent(f.conversionRate)}</td>
                        </tr>
                      ))}
                      {r.events.map((e) => (
                        <tr key={e.key}>
                          <td>{e.key}</td>
                          <td className="is-num">{number(e.pageviews)}</td>
                          <td className="is-num">
                            {r.totals.visits ? percent(e.visitors / r.totals.visits) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  format,
}: {
  title: string;
  rows: Array<{ key: string; value: number }>;
  format?: (n: number) => string;
}) {
  const id = `an-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className="st-ws-panel" aria-labelledby={id}>
      <div className="st-ws-section">
        <h3 id={id} className="st-ws-section__title">
          {title}
        </h3>
        <BarList label={title} rows={rows} format={format} />
      </div>
    </section>
  );
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
