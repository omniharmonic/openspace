import { cx, Img, Link } from "@openspace/renderer";
import { defineBlock, f, type Link as LinkValue } from "@openspace/schema";
import { DEMO, typo } from "../shared";

export const teamBlock = defineBlock({
  type: "team",
  version: 1,
  category: "social-proof",
  label: "Team",
  icon: "users",
  description: "People with photos, roles and short bios.",
  fields: {
    people: f.list({
      min: 1,
      max: 24,
      itemLabel: "name",
      fields: {
        name: f.text({ maxLength: 80 }),
        role: f.text({ optional: true, maxLength: 80 }),
        photo: f.image({ optional: true, aspect: "4:5" }),
        bio: f.text({ optional: true, multiline: true, maxLength: 320 }),
        link: f.link({ optional: true, help: "A profile page, booking link or email" }),
      },
      default: [
        {
          name: "Maya Lindqvist",
          role: "Founder · Foundations & flow",
          photo: DEMO.portraitLake,
          bio: "Maya started Juniper in her living room in 2019. She teaches the Saturday Foundations class and leads our teacher training.",
        },
        {
          name: "Daniel Okafor",
          role: "Vinyasa & breathwork",
          photo: DEMO.portraitDaniel,
          bio: "A former rower who found yoga through a bad back. His early classes are steady, warm and quietly funny.",
        },
        {
          name: "Sam Whitfield",
          role: "Yin & restorative",
          photo: DEMO.portraitSam,
          bio: "Sam trained in Chiang Mai and brings long holds, good blankets and an excellent playlist to Sunday evenings.",
        },
      ],
    }),
    columns: f.select({ options: ["2", "3", "4"], default: "3", display: "segmented" }),
  },
  variants: ["grid", "list", "circles"],
  styleSlots: ["colorTheme", "padding", "align", "radius", "animation", "typography.name"],
  ai: {
    purpose: "Introduces the people behind the business: staff, teachers, partners, a board.",
    whenToUse:
      "About and team pages, and near services where visitors choose a person. `circles` suits large teams; `list` gives each bio more room.",
    avoid:
      "People who haven't agreed to appear; stock photos presented as staff; bios over ~60 words.",
  },
  render: ({ fields, variant, style }) => (
    <ul
      className={cx("os-team", `os-team--${variant}`)}
      style={{ "--t-cols": fields.columns, "--t-tcols": Math.min(Number(fields.columns), 2) }}
    >
      {fields.people.map((person, i) => {
        const name = person.link ? (
          <Link to={person.link as LinkValue} className="os-team__link">
            {person.name}
          </Link>
        ) : (
          person.name
        );
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
          <li key={i} className="os-team__person">
            {person.photo ? (
              <Img
                src={person.photo}
                aspect={variant === "circles" ? "1:1" : "4:5"}
                treatment={variant === "circles" ? "circle" : undefined}
                sizes={
                  variant === "circles"
                    ? "160px"
                    : variant === "list"
                      ? "(min-width: 768px) 240px, 40vw"
                      : "(min-width: 1200px) 30vw, (min-width: 768px) 45vw, 90vw"
                }
                className="os-team__photo"
              />
            ) : null}
            <div className="os-team__text">
              <h3 className={cx("os-team__name", typo(style, "name", "h4"))}>{name}</h3>
              {person.role ? <p className="os-team__role">{person.role}</p> : null}
              {person.bio && variant !== "circles" ? (
                <p className="os-team__bio">{person.bio}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  ),
});

export const teamCss = `
.os-team{display:grid;gap:var(--os-space-md) var(--os-space-sm);grid-template-columns:minmax(0,1fr);margin:0;padding:0;list-style:none}
@container block (min-width:36rem){.os-team{grid-template-columns:repeat(var(--t-tcols,2),minmax(0,1fr))}}
@container block (min-width:60rem){.os-team{grid-template-columns:repeat(var(--t-cols,3),minmax(0,1fr))}}
.os-team__person{display:grid;align-content:start;gap:var(--os-space-xs);min-width:0}
.os-team__text{display:grid;gap:0.2em}
.os-team__name{margin:0;color:var(--os-color-heading)}
.os-team__link{color:inherit;text-decoration:none}
.os-team__link:hover{text-decoration:underline;text-underline-offset:0.2em}
.os-team__role{margin:0;color:var(--os-color-link);font-weight:var(--os-font-weight-strong);font-size:var(--os-type-small-font-size)}
.os-team__bio{margin:0.3em 0 0;color:var(--os-color-text)}
.os-team--list{grid-template-columns:minmax(0,1fr);gap:var(--os-space-md)}
@container block (min-width:36rem){.os-team--list .os-team__person{grid-template-columns:minmax(0,12rem) minmax(0,1fr);gap:var(--os-space-md);align-items:start}}
.os-team--list .os-team__person+.os-team__person{padding-top:var(--os-space-md);border-top:1px solid var(--os-color-border)}
.os-team--circles{grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));text-align:center}
.os-team--circles .os-team__photo{width:min(100%,9rem);margin-inline:auto}
`;
