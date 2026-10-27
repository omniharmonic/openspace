import { Button, type ButtonRole, cx } from "@omniharmonic/openspace-renderer";
import { defineBlock, f } from "@omniharmonic/openspace-schema";

const ROLE_OPTIONS = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "tertiary", label: "Tertiary" },
] as const;

export const buttonBlock = defineBlock({
  type: "button",
  version: 1,
  category: "navigation",
  label: "Button",
  icon: "mouse-pointer-click",
  description: "A call to action using the site's button styles, with an optional second action.",
  fields: {
    label: f.text({
      maxLength: 40,
      default: "Book your first class",
      ai: "2–5 words, starts with a verb: 'Book a table', 'See the schedule'.",
    }),
    link: f.link({ default: { type: "url", url: "/schedule" } }),
    role: f.select({
      options: ROLE_OPTIONS,
      default: "primary",
      display: "segmented",
      label: "Style",
    }),
    secondaryLabel: f.text({ optional: true, maxLength: 40, label: "Second button" }),
    secondaryLink: f.link({ optional: true, label: "Second button link" }),
    note: f.text({
      optional: true,
      maxLength: 120,
      help: "Small reassurance under the buttons",
      ai: "Optional; e.g. 'First class is free'. Never invent offers.",
    }),
  },
  variants: ["default", "large", "full-width"],
  styleSlots: ["align", "padding", "animation"],
  defaults: {
    fields: {
      secondaryLabel: "View pricing",
      secondaryLink: { type: "url", url: "/pricing" },
      note: "Your first class is on us.",
    },
  },
  ai: {
    purpose: "A clear call to action linking to a page, booking tool, email or file.",
    whenToUse:
      "Once per screenful for the main action. Add a second (secondary-style) action only when it's a genuine alternative.",
    avoid:
      "Several primary buttons side by side; vague labels like 'Click here' or 'Learn more' without context.",
  },
  render: ({ fields, variant }) => {
    const role = fields.role as ButtonRole;
    const second: ButtonRole = role === "primary" ? "secondary" : "tertiary";
    return (
      <div className={cx("os-buttons", `os-buttons--${variant}`)}>
        <div className="os-cluster os-buttons__row">
          <Button to={fields.link} role={role}>
            {fields.label}
          </Button>
          {fields.secondaryLabel && fields.secondaryLink ? (
            <Button to={fields.secondaryLink} role={second}>
              {fields.secondaryLabel}
            </Button>
          ) : null}
        </div>
        {fields.note ? <p className="os-buttons__note">{fields.note}</p> : null}
      </div>
    );
  },
});

export const buttonCss = `
.os-buttons{display:grid;gap:var(--os-space-2xs)}
.os-buttons__row{gap:var(--os-space-xs) var(--os-space-sm)}
.os-buttons__note{font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height);color:var(--os-color-text-muted)}
.os-buttons--large .os-button{min-height:3.5rem;padding-inline:calc(var(--b-px) * 1.35);font-size:1.075em}
.os-buttons--full-width .os-buttons__row{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))}
.os-buttons--full-width .os-button{width:100%}
`;
