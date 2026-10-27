import { Button, cx } from "@omniharmonic/openspace-renderer";
import { defineBlock, f } from "@omniharmonic/openspace-schema";
import { sub, typo, useHub } from "../shared";
import { Honeypot, TurnstileSlot, useSourcePath } from "./form";

export const newsletterBlock = defineBlock({
  type: "newsletter",
  version: 1,
  category: "forms",
  label: "Newsletter signup",
  icon: "mail",
  description: "Email signup with double opt-in; subscribers appear in your Audience list.",
  fields: {
    heading: f.text({ optional: true, maxLength: 80, default: "Letters from the studio" }),
    description: f.text({
      optional: true,
      multiline: true,
      maxLength: 240,
      default:
        "One short note a month: new classes, retreat dates and the occasional recipe. No spam, ever.",
    }),
    askName: f.boolean({ default: false, label: "Ask for first name" }),
    placeholder: f.text({ maxLength: 60, default: "you@example.com" }),
    buttonLabel: f.text({ maxLength: 30, default: "Subscribe" }),
    successMessage: f.text({
      maxLength: 200,
      default: "Almost there — check your inbox to confirm your subscription.",
    }),
    note: f.text({
      optional: true,
      maxLength: 160,
      default: "Unsubscribe with one click, any time.",
      help: "Small print under the form",
    }),
  },
  variants: ["inline", "stacked", "card", "banner"],
  styleSlots: [
    "colorTheme",
    "padding",
    "radius",
    "border",
    "shadow",
    "align",
    "animation",
    "typography.heading",
  ],
  ai: {
    purpose: "Collects email subscribers (double opt-in) for the owner's newsletter.",
    whenToUse:
      "Footers, the end of blog posts, and dedicated 'stay in touch' sections. Say what subscribers get and how often.",
    avoid:
      "Promising content or frequency the owner hasn't agreed to; more than one signup per page.",
  },
  render: ({ id, fields, variant, style }) => {
    const { hub, siteId } = useHub();
    const source = useSourcePath();
    const emailId = sub(id, "email");
    const nameId = sub(id, "name");
    const visibleLabels = variant === "stacked" || variant === "card";
    return (
      <div className={cx("os-newsletter", `os-newsletter--${variant}`)}>
        {fields.heading || fields.description ? (
          <div className="os-newsletter__intro">
            {fields.heading ? (
              <h2
                className={cx(
                  "os-newsletter__heading",
                  typo(style, "heading", variant === "banner" ? "h2" : "h3"),
                )}
              >
                {fields.heading}
              </h2>
            ) : null}
            {fields.description ? (
              <p className="os-newsletter__text">{fields.description}</p>
            ) : null}
          </div>
        ) : null}
        <form
          className="os-newsletter__form"
          method="post"
          action={`${hub}/n/${siteId}/subscribe`}
          acceptCharset="utf-8"
          data-os-behavior="newsletter"
          data-os-success={fields.successMessage}
        >
          <div className="os-newsletter__row">
            {fields.askName ? (
              <div className="os-field os-newsletter__field">
                <label
                  className={visibleLabels ? "os-label" : "os-visually-hidden"}
                  htmlFor={nameId}
                >
                  First name
                </label>
                <input
                  className="os-input"
                  id={nameId}
                  name="first_name"
                  type="text"
                  autoComplete="given-name"
                  placeholder={visibleLabels ? undefined : "First name"}
                />
              </div>
            ) : null}
            <div className="os-field os-newsletter__field os-newsletter__field--email">
              <label
                className={visibleLabels ? "os-label" : "os-visually-hidden"}
                htmlFor={emailId}
              >
                Email address
              </label>
              <input
                className="os-input"
                id={emailId}
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder={fields.placeholder}
              />
            </div>
            <Button type="submit" className="os-newsletter__submit">
              {fields.buttonLabel}
            </Button>
          </div>
          <input type="hidden" name="_source" value={source} />
          <input type="hidden" name="_anchor" value={sub(id, "sent")} />
          <Honeypot />
          <TurnstileSlot />
          <div className="os-form__status" role="status" aria-live="polite" />
          {fields.note ? <p className="os-newsletter__note">{fields.note}</p> : null}
          <p className="os-newsletter__sent" id={sub(id, "sent")} tabIndex={-1}>
            {fields.successMessage}
          </p>
        </form>
      </div>
    );
  },
});

export const newsletterCss = `
.os-newsletter{display:grid;gap:var(--os-space-sm)}
.os-newsletter__intro{display:grid;gap:var(--os-space-2xs)}
.os-newsletter__text{color:var(--os-color-text);max-inline-size:var(--os-measure)}
.os-newsletter__form{display:grid;gap:var(--os-space-2xs)}
.os-newsletter__row{display:flex;flex-wrap:wrap;gap:var(--os-space-2xs);align-items:stretch}
.os-newsletter__field{flex:1 1 14rem}
.os-newsletter__submit{flex:none}
.os-newsletter__sent{display:none;padding:var(--os-space-xs) var(--os-space-sm);border:1.5px solid currentColor;border-radius:var(--os-radius-input);color:var(--os-color-success)}
.os-newsletter__sent:target{display:block}
.os-newsletter__note{font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-newsletter--stacked .os-newsletter__row,.os-newsletter--card .os-newsletter__row{display:grid}
.os-newsletter--stacked .os-newsletter__submit,.os-newsletter--card .os-newsletter__submit{justify-self:start}
.os-newsletter--card{padding:var(--os-space-md);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-block.has-radius .os-newsletter--card{border-radius:var(--radius)}
.os-block.os-themed .os-newsletter--card{background:transparent;padding:0}
.os-newsletter--banner{align-items:center}
@container block (min-width:52rem){.os-newsletter--banner{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:var(--os-space-lg)}}
.os-malign-center .os-newsletter__row{justify-content:center}
.os-malign-center .os-newsletter__text{margin-inline:auto}
@media (min-width:1200px){.os-align-center .os-newsletter__row{justify-content:center}.os-align-center .os-newsletter__text{margin-inline:auto}}
`;
