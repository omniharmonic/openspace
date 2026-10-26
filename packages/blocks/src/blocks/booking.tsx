import { Button, cx } from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";
import { Icon } from "../icons";
import { EditorNotice, headingLevelField, typo } from "../shared";

export interface BookingEmbed {
  provider: "cal" | "calendly";
  /** The scheduling page itself (no-JS / new-tab fallback). */
  page: string;
  /** The inline embed loaded on click. */
  embed: string;
}

/**
 * Parse a Cal.com (or self-hosted Cal / Cal.diy) or Calendly scheduling link. Only https.
 * `provider: "cal"` accepts any https host (self-hosted Cal); `auto` recognises cal.com and
 * calendly.com.
 */
export function parseBookingUrl(
  input: string | undefined,
  provider: "auto" | "cal" | "calendly" = "auto",
): BookingEmbed | undefined {
  if (!input) return undefined;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password) return undefined;
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "").replace(/\/embed$/, "");
  if (!path || path === "/") return undefined;
  const isCalendly = host === "calendly.com";
  const isCal = host === "cal.com" || host.endsWith(".cal.com");
  const kind =
    provider === "calendly" || (provider === "auto" && isCalendly)
      ? "calendly"
      : provider === "cal" || (provider === "auto" && isCal)
        ? "cal"
        : undefined;
  if (kind === "calendly" && !isCalendly) return undefined;
  if (!kind) return undefined;
  const page = `${url.origin}${path}`;
  if (kind === "calendly")
    return {
      provider: kind,
      page,
      embed: `${page}?embed_type=Inline&hide_gdpr_banner=1`,
    };
  return { provider: kind, page, embed: `${page}/embed?embedType=inline&layout=month_view` };
}

const PROVIDER_LABEL = { cal: "Cal.com", calendly: "Calendly" } as const;

export const bookingBlock = defineBlock({
  type: "booking",
  version: 1,
  category: "embed",
  label: "Booking",
  icon: "calendar-check",
  description: "Your Cal.com or Calendly scheduling page, loaded only when a visitor asks for it.",
  fields: {
    url: f.text({
      maxLength: 300,
      default: "https://cal.com/juniperyoga/private-session",
      label: "Scheduling link",
      help: "Your Cal.com or Calendly event link, e.g. https://cal.com/you/30min",
    }),
    provider: f.select({
      options: [
        { value: "auto", label: "Detect from link" },
        { value: "cal", label: "Cal.com (including self-hosted)" },
        { value: "calendly", label: "Calendly" },
      ],
      default: "auto",
    }),
    heading: f.text({ optional: true, maxLength: 80, default: "Book a private session" }),
    headingLevel: headingLevelField(),
    description: f.text({
      optional: true,
      multiline: true,
      maxLength: 300,
      default:
        "One-to-one sessions in the studio or online, 60 or 90 minutes. Choose a time that suits you — you'll get a confirmation by email.",
    }),
    buttonLabel: f.text({ maxLength: 30, default: "See available times" }),
    height: f.select({
      options: [
        { value: "640", label: "Compact" },
        { value: "760", label: "Standard" },
        { value: "900", label: "Tall" },
      ],
      default: "760",
      display: "segmented",
    }),
  },
  variants: ["inline", "split", "button"],
  styleSlots: [
    "colorTheme",
    "padding",
    "radius",
    "shadow",
    "align",
    "animation",
    "typography.heading",
  ],
  ai: {
    purpose: "Lets visitors book an appointment through the owner's Cal.com or Calendly page.",
    whenToUse:
      "Services, coaching, consultations and classes booked by time slot. The scheduler loads only after a click, so the page stays fast and private. `button` just links out.",
    avoid: "Scheduling links the owner hasn't set up; more than one booking block per page.",
  },
  render: ({ fields, variant, style }) => {
    const HTag = fields.headingLevel;
    const booking = parseBookingUrl(fields.url, fields.provider);
    if (!booking)
      return (
        <EditorNotice>
          Paste your Cal.com or Calendly event link (https) to show your booking calendar.
        </EditorNotice>
      );
    const name = PROVIDER_LABEL[booking.provider];
    const intro =
      fields.heading || fields.description ? (
        <div className="os-booking__intro">
          {fields.heading ? (
            <HTag className={cx("os-booking__heading", typo(style, "heading", "h3"))}>
              {fields.heading}
            </HTag>
          ) : null}
          {fields.description ? <p className="os-booking__text">{fields.description}</p> : null}
        </div>
      ) : null;
    const link = (
      <Button to={{ type: "url", url: booking.page, newTab: true }} className="os-booking__out">
        {fields.buttonLabel}
        <span className="os-visually-hidden"> (opens {name} in a new tab)</span>
      </Button>
    );
    if (variant === "button")
      return (
        <div className={cx("os-booking", "os-booking--button")}>
          {intro}
          <div>{link}</div>
        </div>
      );
    return (
      <div className={cx("os-booking", `os-booking--${variant}`)}>
        {intro}
        {/* The calendar and its fallback link stay together (side by side with the intro in split). */}
        <div className="os-booking__main">
          <div
            className="os-booking__frame"
            style={{ "--bk-h": `${fields.height}px` }}
            data-os-behavior="video-lite"
            data-os-embed={booking.embed}
            data-os-title={`${fields.heading || "Booking calendar"} (${name})`}
          >
            <div className="os-booking__placeholder">
              <Icon name="calendar" size={36} />
              <p className="os-booking__note">
                Times are shown by {name}. Loading the calendar shares your visit with {name}.
              </p>
              <Button className="os-booking__load" attrs={{ "data-os-load": "" }}>
                {fields.buttonLabel}
              </Button>
            </div>
          </div>
          <a className="os-booking__fallback" href={booking.page} target="_blank" rel="noopener">
            Open the booking page
            <span className="os-visually-hidden"> on {name} (opens in a new tab)</span>
          </a>
        </div>
      </div>
    );
  },
});

export const bookingCss = `
.os-booking{display:grid;gap:var(--os-space-sm)}
.os-booking__intro{display:grid;gap:var(--os-space-2xs)}
.os-booking__heading{margin:0;color:var(--os-color-heading)}
.os-booking__text{margin:0;color:var(--os-color-text);max-inline-size:var(--os-measure)}
@container block (min-width:56rem){.os-booking--split{grid-template-columns:minmax(0,0.8fr) minmax(0,1.2fr);gap:var(--os-space-lg);align-items:start}}
.os-booking__main{display:grid;gap:var(--os-space-xs);min-width:0}
.os-booking__frame{position:relative;min-height:22rem;border-radius:var(--os-radius-card);background:var(--os-color-surface);overflow:hidden}
.os-block.has-radius .os-booking__frame{border-radius:var(--radius)}
.os-booking__frame>iframe{display:block;width:100%;height:var(--bk-h,760px);max-height:85vh;border:0;background:var(--os-color-background)}
.os-booking__placeholder{display:grid;justify-items:center;align-content:center;gap:var(--os-space-xs);min-height:22rem;padding:var(--os-space-md);text-align:center;color:var(--os-color-text)}
.os-booking__placeholder>.os-icon{color:var(--os-color-accent)}
.os-booking__note{margin:0;max-inline-size:34ch;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-booking__fallback{justify-self:start;font-size:var(--os-type-small-font-size);color:var(--os-color-link)}
html:not(.os-js) .os-booking__load{display:none}
.os-align-center .os-booking--button,.os-malign-center .os-booking--button{justify-items:center;text-align:center}
`;
