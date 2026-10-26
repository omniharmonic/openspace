import { Button, type ButtonRole, cx } from "@openspace/renderer";
import { defineBlock, f, type Link as LinkValue } from "@openspace/schema";
import { Icon } from "../icons";
import { EditorNotice, headingLevelField, sub, typo, useHub } from "../shared";
import { Honeypot, TurnstileSlot, useSourcePath } from "./form";

/** Button role (a variable keeps the a11y role lint off the Button prop). */
const TERTIARY: ButtonRole = "tertiary";

/**
 * Member sign-in and the gated-content notice (arch §9.4). Sign-in is passwordless: the form
 * asks the Hub to email a magic link (`POST ${hub}/m/:siteId/login`), which lands back on the
 * site's own domain. No passwords are ever collected.
 */
export const memberLoginBlock = defineBlock({
  type: "member-login",
  version: 1,
  category: "forms",
  label: "Member sign-in",
  icon: "key-round",
  description: "A passwordless sign-in form for members, or a notice that content is members-only.",
  fields: {
    heading: f.text({ optional: true, maxLength: 80, default: "Members, welcome back" }),
    headingLevel: headingLevelField(),
    description: f.text({
      optional: true,
      multiline: true,
      maxLength: 300,
      default:
        "Enter your email and we'll send you a sign-in link — no password needed. Class recordings and the members' calendar are waiting.",
    }),
    buttonLabel: f.text({ maxLength: 30, default: "Email me a link" }),
    successMessage: f.text({
      maxLength: 200,
      default: "Check your inbox — your sign-in link is on its way. It works for 15 minutes.",
    }),
    signInLink: f.link({
      optional: true,
      default: { type: "url", url: "/members/" },
      help: "Gated variant: where members sign in",
    }),
    joinLabel: f.text({ optional: true, maxLength: 40, default: "Become a member" }),
    joinLink: f.link({ optional: true, default: { type: "url", url: "/membership" } }),
  },
  variants: ["form", "gated", "banner"],
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
    purpose:
      "Lets members sign in with an emailed link, or tells visitors that content is members-only.",
    whenToUse:
      "On the members' sign-in page (`form`), at the top of a members-only page's public teaser (`gated`), or as a slim prompt (`banner`). Members need the Cloudflare hosting option.",
    avoid: "Putting the members-only content itself on a public page; asking for passwords.",
  },
  render: ({ id, fields, variant, style }) => {
    const HTag = fields.headingLevel;
    const { hub, siteId } = useHub();
    const source = useSourcePath();
    const heading = fields.heading ? (
      <HTag
        className={cx(
          "os-members__heading",
          typo(style, "heading", variant === "banner" ? "h4" : "h3"),
        )}
      >
        {fields.heading}
      </HTag>
    ) : null;
    const join =
      fields.joinLabel && fields.joinLink ? (
        <Button to={fields.joinLink as LinkValue} role={TERTIARY} className="os-members__join">
          {fields.joinLabel}
        </Button>
      ) : null;

    if (variant !== "form") {
      return (
        <div className={cx("os-members", `os-members--${variant}`)}>
          <span className="os-members__icon" aria-hidden="true">
            <Icon name="lock" size={variant === "banner" ? 20 : 28} />
          </span>
          <div className="os-members__intro">
            {heading}
            {fields.description && variant === "gated" ? (
              <p className="os-members__text">{fields.description}</p>
            ) : null}
          </div>
          <div className="os-members__actions">
            {fields.signInLink ? (
              <Button to={fields.signInLink as LinkValue}>Sign in</Button>
            ) : (
              <EditorNotice>Link to the page where members sign in.</EditorNotice>
            )}
            {join}
          </div>
        </div>
      );
    }

    const emailId = sub(id, "email");
    return (
      <div className={cx("os-members", "os-members--form")}>
        <div className="os-members__intro">
          {heading}
          {fields.description ? <p className="os-members__text">{fields.description}</p> : null}
        </div>
        <form
          className="os-members__form"
          method="post"
          action={`${hub}/m/${siteId}/login`}
          acceptCharset="utf-8"
          data-os-behavior="newsletter"
          data-os-success={fields.successMessage}
        >
          <div className="os-field">
            <label className="os-label" htmlFor={emailId}>
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
            />
          </div>
          <input type="hidden" name="return_to" value={source} />
          <input type="hidden" name="_source" value={source} />
          <input type="hidden" name="_anchor" value={sub(id, "sent")} />
          <Honeypot />
          <TurnstileSlot />
          <div className="os-members__row">
            <Button type="submit">{fields.buttonLabel}</Button>
            {join}
          </div>
          <div className="os-form__status" role="status" aria-live="polite" />
          <p className="os-members__sent" id={sub(id, "sent")} tabIndex={-1}>
            {fields.successMessage}
          </p>
        </form>
      </div>
    );
  },
});

export const membersCss = `
.os-members{display:grid;gap:var(--os-space-sm)}
.os-members__intro{display:grid;gap:var(--os-space-2xs)}
.os-members__heading{margin:0;color:var(--os-color-heading)}
.os-members__text{margin:0;color:var(--os-color-text);max-inline-size:var(--os-measure)}
.os-members__form{display:grid;gap:var(--os-space-xs);max-inline-size:28rem}
.os-members__row,.os-members__actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--os-space-xs)}
.os-members__sent{display:none;margin:0;padding:var(--os-space-xs) var(--os-space-sm);border:1.5px solid currentColor;border-radius:var(--os-radius-input);color:var(--os-color-success)}
.os-members__sent:target{display:block}
.os-members__icon{display:inline-grid;place-items:center;width:3.25rem;height:3.25rem;border-radius:var(--os-radius-full);background:var(--os-color-surface);color:var(--os-color-accent)}
.os-members--form{padding:var(--os-space-md);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-block.has-radius .os-members--form,.os-block.has-radius .os-members--gated{border-radius:var(--radius)}
.os-block.os-themed .os-members--form{background:transparent;padding:0}
.os-members--gated{justify-items:center;text-align:center;padding:var(--os-space-lg) var(--os-space-md);border:1px dashed var(--os-color-text-muted);border-radius:var(--os-radius-card)}
.os-members--gated .os-members__intro{justify-items:center}
.os-members--gated .os-members__actions{justify-content:center}
.os-members--banner{grid-template-columns:auto minmax(0,1fr);align-items:center;padding:var(--os-space-xs) var(--os-space-sm);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-members--banner .os-members__icon{width:2.5rem;height:2.5rem;background:var(--os-color-background)}
.os-members--banner .os-members__actions{grid-column:1 / -1}
@container block (min-width:44rem){.os-members--banner{grid-template-columns:auto minmax(0,1fr) auto}.os-members--banner .os-members__actions{grid-column:auto}}
`;
