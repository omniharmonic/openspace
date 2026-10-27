import { cx, Img, Link, SocialLinks, useRenderContext } from "@omniharmonic/openspace-renderer";
import { defineBlock, f, type Link as LinkValue } from "@omniharmonic/openspace-schema";
import { ICON_OPTIONS, Icon, type IconName } from "../icons";
import { DEMO } from "../shared";

export const linkListBlock = defineBlock({
  type: "link-list",
  version: 1,
  category: "navigation",
  label: "Link list",
  icon: "link",
  description: "A stack of large links with a photo and short bio — a link-in-bio page.",
  fields: {
    photo: f.image({ optional: true, aspect: "1:1" }),
    name: f.text({ optional: true, maxLength: 60, default: "Juniper Yoga" }),
    bio: f.text({
      optional: true,
      multiline: true,
      maxLength: 200,
      default: "Slow, grounded yoga on Pearl Street, Boulder. New here? Start with Foundations.",
    }),
    links: f.list({
      min: 1,
      max: 20,
      itemLabel: "label",
      fields: {
        label: f.text({ maxLength: 60 }),
        link: f.link(),
        icon: f.select({ optional: true, options: ICON_OPTIONS }),
        highlight: f.boolean({ default: false, help: "Stand out from the other links" }),
      },
      default: [
        {
          label: "Book a class",
          link: { type: "url", url: "/schedule" },
          icon: "calendar",
          highlight: true,
        },
        {
          label: "New here? Start with Foundations",
          link: { type: "url", url: "/foundations" },
          icon: "sprout",
          highlight: false,
        },
        {
          label: "Spring retreat in Taos — join the waitlist",
          link: { type: "url", url: "/retreats" },
          icon: "mountain",
          highlight: false,
        },
        {
          label: "Gift a class pass",
          link: { type: "url", url: "/gift" },
          icon: "gift",
          highlight: false,
        },
      ],
    }),
    showSocial: f.boolean({ default: true, label: "Show social profiles" }),
  },
  variants: ["stacked", "outline", "cards"],
  styleSlots: ["colorTheme", "padding", "radius", "animation"],
  defaults: { fields: { photo: DEMO.yogaDeck } },
  ai: {
    purpose: "A link-in-bio list: a few large, tappable links under a photo and one-line bio.",
    whenToUse:
      "On a dedicated links page shared from social profiles, or a compact 'start here' list. Put the most important link first and highlight at most one.",
    avoid: "More than ~8 links; vague labels like 'Click here'; duplicating the main navigation.",
  },
  render: ({ fields, variant }) => {
    const { doc } = useRenderContext();
    const social = fields.showSocial ? (doc?.site.social ?? []) : [];
    return (
      <div className={cx("os-linklist", `os-linklist--${variant}`)}>
        {fields.photo || fields.name || fields.bio ? (
          <div className="os-linklist__intro">
            {fields.photo ? (
              <Img
                src={fields.photo}
                aspect="1:1"
                treatment="circle"
                sizes="112px"
                className="os-linklist__photo"
              />
            ) : null}
            {fields.name ? <p className="os-linklist__name os-type-h3">{fields.name}</p> : null}
            {fields.bio ? <p className="os-linklist__bio">{fields.bio}</p> : null}
          </div>
        ) : null}
        <ul className="os-linklist__links">
          {fields.links.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
            <li key={i}>
              <Link
                to={item.link as LinkValue}
                className={cx("os-linklist__link", item.highlight && "is-highlight")}
              >
                {item.icon ? <Icon name={item.icon as IconName} size={20} /> : null}
                <span>{item.label}</span>
                <Icon name="arrow-right" size={18} className="os-linklist__arrow" />
              </Link>
            </li>
          ))}
        </ul>
        {social.length ? <SocialLinks profiles={social} className="os-linklist__social" /> : null}
      </div>
    );
  },
});

export const linkListCss = `
.os-linklist{display:grid;gap:var(--os-space-md);max-inline-size:34rem;margin-inline:auto;width:100%}
.os-linklist__intro{display:grid;justify-items:center;gap:var(--os-space-2xs);text-align:center}
.os-linklist__photo{width:7rem;height:7rem}
.os-linklist__name{margin:0;color:var(--os-color-heading)}
.os-linklist__bio{margin:0;color:var(--os-color-text);text-wrap:balance}
.os-linklist__links{display:grid;gap:var(--os-space-2xs);margin:0;padding:0;list-style:none}
.os-linklist__link{display:flex;align-items:center;gap:0.75em;min-height:3.5rem;padding:0.85rem 1.1rem;border-radius:var(--os-radius-button);background:var(--os-color-surface);color:var(--os-color-heading);font-weight:var(--os-font-weight-strong);text-decoration:none;transition:background-color var(--os-motion-duration-fast) var(--os-motion-ease),transform var(--os-motion-duration-fast) var(--os-motion-ease)}
.os-block.has-radius .os-linklist__link{border-radius:var(--radius)}
.os-linklist__link>span{flex:1}
.os-linklist__link .os-icon{flex:none;color:var(--os-color-accent)}
.os-linklist__link:hover{background:var(--os-color-surface-raised);transform:translateY(-1px)}
.os-linklist__link:focus-visible{outline:2px solid var(--os-color-focus);outline-offset:2px}
.os-linklist__arrow{opacity:0.6}
.os-linklist__link.is-highlight{background:var(--os-color-accent);color:var(--os-color-accent-text)}
.os-linklist__link.is-highlight .os-icon{color:currentColor}
.os-linklist__link.is-highlight:hover{background:var(--os-color-accent-hover)}
.os-linklist--outline .os-linklist__link{background:transparent;border:1.5px solid var(--os-color-text-muted)}
.os-linklist--outline .os-linklist__link:hover{border-color:var(--os-color-heading);background:transparent}
.os-linklist--outline .os-linklist__link.is-highlight{background:var(--os-color-accent);border-color:var(--os-color-accent)}
.os-linklist--cards .os-linklist__link{background:var(--os-color-surface-raised);box-shadow:var(--os-shadow-sm);border-radius:var(--os-radius-card)}
.os-linklist__social{justify-content:center}
`;
