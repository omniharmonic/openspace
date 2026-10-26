import { Repeat as RepeatIcon } from "lucide-react";
import { useMemo } from "react";
import { cx, Field, Input, Segmented, Select } from "../../ui";
import { date as fmtDate } from "../workspace/format";
import { SwitchRow } from "../workspace/ui";
import {
  defaultRepeat,
  describeRepeat,
  type Freq,
  nextDates,
  parseRRule,
  type Repeat,
  toRRule,
  WEEKDAY_NAMES,
  WEEKDAYS,
} from "./rrule";
import "./collections.css";

const FREQ_LABEL: Record<Freq, string> = {
  DAILY: "Days",
  WEEKLY: "Weeks",
  MONTHLY: "Months",
  YEARLY: "Years",
};

/**
 * "Repeats": every N days/weeks/months/years, weekdays, monthly by date or weekday, and when it
 * stops, with the next dates shown so people can check it does what they meant.
 */
export function RepeatEditor({
  start,
  value,
  onChange,
}: {
  start: string;
  value: string | undefined;
  onChange: (rule: string | undefined) => void;
}) {
  const repeat = useMemo(
    () => (value ? (parseRRule(value, start) ?? defaultRepeat(start)) : null),
    [value, start],
  );
  const set = (patch: Partial<Repeat>) => {
    const base = repeat ?? defaultRepeat(start);
    onChange(toRRule({ ...base, ...patch }, start));
  };
  const upcoming = repeat ? nextDates(repeat, start, 4) : [];
  return (
    <fieldset className="st-fieldset st-repeat">
      <legend>Repeats</legend>
      <SwitchRow
        label={
          <>
            <RepeatIcon aria-hidden="true" className="st-inline-icon" /> Repeating event
          </>
        }
        hint={repeat ? describeRepeat(repeat, start) : "Happens once."}
        checked={Boolean(repeat)}
        onCheckedChange={(on) => onChange(on ? toRRule(defaultRepeat(start), start) : undefined)}
      />
      {repeat && (
        <>
          <div className="st-repeat__every">
            <span>Every</span>
            <Input
              type="number"
              min={1}
              max={99}
              aria-label="Repeat every"
              value={repeat.interval}
              onChange={(e) =>
                set({ interval: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })
              }
            />
            <Select<Freq>
              size="sm"
              value={repeat.freq}
              onValueChange={(freq) => set({ freq })}
              options={(Object.keys(FREQ_LABEL) as Freq[]).map((f) => ({
                value: f,
                label: repeat.interval === 1 ? FREQ_LABEL[f].replace(/s$/, "") : FREQ_LABEL[f],
              }))}
            />
          </div>
          {repeat.freq === "WEEKLY" && (
            <fieldset className="st-repeat__days">
              <legend className="st-sr-only">On these days</legend>
              {WEEKDAYS.map((d) => {
                const on = repeat.byDay.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={WEEKDAY_NAMES[d]}
                    className={cx("st-repeat__day", on && "is-on")}
                    onClick={() => {
                      const next = on ? repeat.byDay.filter((x) => x !== d) : [...repeat.byDay, d];
                      if (next.length) set({ byDay: next });
                    }}
                  >
                    {WEEKDAY_NAMES[d].slice(0, 2)}
                  </button>
                );
              })}
            </fieldset>
          )}
          {repeat.freq === "MONTHLY" && (
            <Segmented
              aria-label="Repeat on"
              size="sm"
              value={repeat.monthMode}
              onValueChange={(monthMode) => set({ monthMode })}
              options={[
                { value: "date", label: "Same date" },
                { value: "weekday", label: "Same weekday" },
              ]}
            />
          )}
          <Field label="Ends">
            <div className="st-repeat__end">
              <Select
                size="sm"
                value={repeat.end.type}
                onValueChange={(type) =>
                  set({
                    end:
                      type === "count"
                        ? { type, count: 10 }
                        : type === "until"
                          ? {
                              type,
                              date:
                                nextDates({ ...repeat, end: { type: "never" } }, start, 8).at(-1) ??
                                start.slice(0, 10),
                            }
                          : { type: "never" },
                  })
                }
                options={[
                  { value: "never", label: "Never" },
                  { value: "count", label: "After a number of times" },
                  { value: "until", label: "On a date" },
                ]}
              />
              {repeat.end.type === "count" && (
                <Input
                  type="number"
                  min={1}
                  max={999}
                  aria-label="Number of times"
                  value={repeat.end.count}
                  onChange={(e) =>
                    set({ end: { type: "count", count: Math.max(1, Number(e.target.value) || 1) } })
                  }
                />
              )}
              {repeat.end.type === "until" && (
                <Input
                  type="date"
                  aria-label="Last date"
                  value={repeat.end.date}
                  onChange={(e) =>
                    e.target.value && set({ end: { type: "until", date: e.target.value } })
                  }
                />
              )}
            </div>
          </Field>
          {upcoming.length > 0 && (
            <p className="st-ws-hint">
              Next:{" "}
              {upcoming
                .map((d) => fmtDate(d, { weekday: "short", day: "numeric", month: "short" }))
                .join(" · ")}
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
