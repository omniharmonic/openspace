import { Button, cx } from "@omniharmonic/openspace-renderer";
import { defineBlock, f, type Link as LinkValue } from "@omniharmonic/openspace-schema";
import { EditorNotice, formatDate, headingLevelField, sub, typo, useLocale } from "../shared";

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;

const UNITS = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Minutes" },
  { key: "seconds", label: "Seconds" },
] as const;

export const countdownBlock = defineBlock({
  type: "countdown",
  version: 1,
  category: "data",
  label: "Countdown",
  icon: "timer",
  description: "Days, hours and minutes until a launch, sale or event.",
  fields: {
    heading: f.text({
      optional: true,
      maxLength: 80,
      default: "Spring retreat in Taos opens for booking",
    }),
    headingLevel: headingLevelField(),
    target: f.text({
      maxLength: 32,
      default: "2027-03-01T09:00:00-07:00",
      label: "Counts down to",
      help: "Date, time and UTC offset, e.g. 2027-03-01T09:00:00-07:00",
      ai: "ISO 8601 date-time with an offset or Z.",
    }),
    showSeconds: f.boolean({ default: false }),
    doneMessage: f.text({
      maxLength: 160,
      default: "Booking is open — places are limited to twenty.",
      help: "Shown once the time has passed",
    }),
    buttonLabel: f.text({ optional: true, maxLength: 30, default: "Join the waitlist" }),
    link: f.link({ optional: true, default: { type: "url", url: "/retreats" } }),
  },
  variants: ["boxes", "inline", "large"],
  styleSlots: ["colorTheme", "padding", "align", "radius", "animation", "typography.heading"],
  ai: {
    purpose: "A live countdown to a moment: a launch, a sale ending, an event starting.",
    whenToUse:
      "Time-bound announcements near a call to action. The exact date is always printed too, so it still works without JavaScript.",
    avoid: "Fake urgency (timers that reset); countdowns to dates that have long passed.",
  },
  render: ({ id, fields, variant, style }) => {
    const HTag = fields.headingLevel;
    const locale = useLocale();
    const valid = ISO_DATETIME.test(fields.target) && !Number.isNaN(Date.parse(fields.target));
    if (!valid)
      return (
        <EditorNotice>
          Set the countdown time as a date, time and offset, e.g. 2027-03-01T09:00:00-07:00.
        </EditorNotice>
      );
    const units = fields.showSeconds ? UNITS : UNITS.slice(0, 3);
    const when = formatDate(fields.target, locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    return (
      <div
        className={cx("os-countdown", `os-countdown--${variant}`)}
        data-os-behavior="countdown"
        data-os-target={fields.target}
      >
        {fields.heading ? (
          <HTag
            className={cx(
              "os-countdown__heading",
              typo(style, "heading", variant === "large" ? "h2" : "h3"),
            )}
          >
            {fields.heading}
          </HTag>
        ) : null}
        <p className="os-countdown__when">
          <time dateTime={fields.target}>{when}</time>
        </p>
        <div className="os-countdown__units" role="timer" aria-labelledby={sub(id, "when")}>
          <span className="os-visually-hidden" id={sub(id, "when")}>
            Time remaining
          </span>
          {units.map((u) => (
            <span key={u.key} className="os-countdown__unit">
              <span className="os-countdown__num" data-os-unit={u.key}>
                00
              </span>
              <span className="os-countdown__label">{u.label}</span>
            </span>
          ))}
        </div>
        <p className="os-countdown__done" hidden>
          {fields.doneMessage}
        </p>
        {fields.buttonLabel && fields.link ? (
          <div className="os-countdown__action">
            <Button to={fields.link as LinkValue}>{fields.buttonLabel}</Button>
          </div>
        ) : null}
      </div>
    );
  },
});

export const countdownCss = `
.os-countdown{display:grid;gap:var(--os-space-xs);justify-items:start}
.os-countdown__heading{margin:0;color:var(--os-color-heading);text-wrap:balance}
.os-countdown__when{margin:0;color:var(--os-color-text-muted)}
.os-countdown__units{flex-wrap:wrap;gap:var(--os-space-2xs);margin-block:var(--os-space-2xs)}
.os-js .os-countdown__units{display:flex}
.os-countdown__unit{display:grid;justify-items:center;gap:0.15em;min-width:4.5rem;padding:var(--os-space-xs) var(--os-space-2xs);border-radius:var(--os-radius-card);background:var(--os-color-surface)}
.os-block.has-radius .os-countdown__unit{border-radius:var(--radius)}
.os-countdown__num{font-family:var(--os-font-heading);font-weight:var(--os-font-weight-heading);font-size:var(--os-type-h2-font-size);line-height:1;color:var(--os-color-heading);font-variant-numeric:lining-nums tabular-nums}
.os-countdown__label{font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-countdown__done{margin:0;font-weight:var(--os-font-weight-strong);color:var(--os-color-heading)}
.os-countdown__done[hidden],.os-countdown__units[hidden]{display:none}
.os-countdown__action{margin-top:var(--os-space-2xs)}
.os-countdown--inline .os-countdown__unit{background:none;padding:0;min-width:0;grid-auto-flow:column;align-items:baseline;gap:0.3em}
.os-countdown--inline .os-countdown__unit+.os-countdown__unit::before{content:"·";color:var(--os-color-text-muted);margin-inline-end:0.4em}
.os-countdown--inline .os-countdown__num{font-size:var(--os-type-h3-font-size)}
.os-countdown--large{justify-items:center;text-align:center}
.os-countdown--large .os-countdown__units{justify-content:center;gap:var(--os-space-sm)}
.os-countdown--large .os-countdown__unit{background:none;min-width:5.5rem}
.os-countdown--large .os-countdown__num{font-size:var(--os-type-display-font-size);color:var(--os-color-accent)}
.os-align-center .os-countdown,.os-malign-center .os-countdown{justify-items:center;text-align:center}
.os-align-center .os-countdown__units,.os-malign-center .os-countdown__units{justify-content:center}
`;
