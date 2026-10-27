import { occurrenceDates } from "@omniharmonic/openspace-renderer";
import { Repeat as RepeatIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx, Field, Input, Segmented, Select } from "../../ui";
import { date as fmtDate } from "../workspace/format";
import { SwitchRow } from "../workspace/ui";
import {
  defaultRepeat,
  describeRepeat,
  type Freq,
  isSimpleRule,
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
  // Rules the simple controls can't express are shown as text and left exactly as written
  // (nothing is rewritten just by opening the event).
  const custom = Boolean(value && !isSimpleRule(value, start));
  const upcoming = value ? occurrenceDates(value, start, { max: 4 }) : [];
  return (
    <fieldset className="st-fieldset st-repeat">
      <legend>Repeats</legend>
      <SwitchRow
        label={
          <>
            <RepeatIcon aria-hidden="true" className="st-inline-icon" /> Repeating event
          </>
        }
        hint={
          !repeat
            ? "Happens once."
            : custom
              ? "A custom repeat rule"
              : describeRepeat(repeat, start)
        }
        checked={Boolean(repeat)}
        onCheckedChange={(on) => onChange(on ? toRRule(defaultRepeat(start), start) : undefined)}
      />
      {repeat && custom && value && (
        <CustomRule
          value={value}
          onChange={onChange}
          onSimplify={() => onChange(toRRule(defaultRepeat(start), start))}
        />
      )}
      {repeat && !custom && (
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

const RULE_RE = /^FREQ=(?:DAILY|WEEKLY|MONTHLY|YEARLY)(?:;[A-Z]+=[A-Za-z0-9,+-]+)*$/;
/** Same limit as the schema's `recurrence`. */
const RULE_MAX = 300;

/**
 * A rule from another calendar app: edited as text, saved only when it's a valid rule. Rules
 * OpenSpace can't repeat (e.g. hourly) are shown read-only, with a note, and kept as they are.
 */
function CustomRule({
  value,
  onChange,
  onSimplify,
}: {
  value: string;
  onChange: (rule: string) => void;
  onSimplify: () => void;
}) {
  const [text, setText] = useState(value);
  // Follow changes made elsewhere (undo, another person, the AI).
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);
  const supported = RULE_RE.test(value);
  const t = text.trim();
  const bad = !RULE_RE.test(t) || t.length > RULE_MAX;
  const commit = () => {
    if (!bad && t !== value) {
      last.current = t;
      onChange(t);
    }
  };
  if (!supported)
    return (
      <div className="st-form">
        <Field
          label="Repeat rule"
          hint="This rule repeats in a way OpenSpace can't show yet (such as every hour). It's kept exactly as it is."
        >
          <Input className="st-repeat__raw" value={value} readOnly />
        </Field>
        <button type="button" className="st-linklike" onClick={onSimplify}>
          Use a simple weekly rule instead
        </button>
      </div>
    );
  return (
    <div className="st-form">
      <Field
        label="Repeat rule"
        hint="This rule came from another calendar app, so it's shown as written. Change it here, or switch to a simple rule."
        error={
          bad
            ? t.length > RULE_MAX
              ? `Keep it under ${RULE_MAX} characters.`
              : "That isn't a repeat rule (it should start with FREQ=)."
            : undefined
        }
      >
        <Input
          className="st-repeat__raw"
          value={text}
          maxLength={RULE_MAX}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          // Saved when you leave the box (or press Enter), so half-typed rules never count.
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
      </Field>
      <button type="button" className="st-linklike" onClick={onSimplify}>
        Use a simple weekly rule instead
      </button>
    </div>
  );
}
