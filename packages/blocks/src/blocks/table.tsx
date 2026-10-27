import { cx } from "@omniharmonic/openspace-renderer";
import { defineBlock, f } from "@omniharmonic/openspace-schema";
import { Icon } from "../icons";

/** Comparison / spec table: plans or options across, features down. */

const YES = /^(yes|✓|✔|included|true)$/i;
const NO = /^(no|—|-|–|x|✗|not included|false)$/i;

function Cell({ value }: { value: string }) {
  const v = value.trim();
  if (YES.test(v))
    return (
      <span className="os-table__mark is-yes">
        <Icon name="check" size={20} />
        <span className="os-visually-hidden">Included</span>
      </span>
    );
  if (NO.test(v))
    return (
      <span className="os-table__mark is-no">
        <Icon name="minus" size={20} />
        <span className="os-visually-hidden">Not included</span>
      </span>
    );
  return <>{v}</>;
}

export const tableBlock = defineBlock({
  type: "table",
  version: 1,
  category: "data",
  label: "Comparison table",
  icon: "table",
  description: "A real table: plans, options or products across, features or specs down.",
  fields: {
    caption: f.text({
      optional: true,
      maxLength: 120,
      help: "Says what the table compares; read first by screen readers",
      default: "What each membership includes",
    }),
    corner: f.text({
      optional: true,
      maxLength: 40,
      help: "Heading above the row labels, e.g. 'Features'",
    }),
    columns: f.list({
      min: 1,
      max: 6,
      itemLabel: "label",
      fields: {
        label: f.text({ maxLength: 40 }),
        detail: f.text({ optional: true, maxLength: 40, help: "A price or short note" }),
        highlight: f.boolean({ default: false, help: "Tint this column (one at most)" }),
      },
      default: [
        { label: "Drop-in", detail: "$24 a class", highlight: false },
        { label: "Unlimited", detail: "$129 a month", highlight: true },
        { label: "Ten classes", detail: "$190", highlight: false },
      ],
    }),
    rows: f.list({
      min: 1,
      max: 40,
      itemLabel: "label",
      fields: {
        label: f.text({ maxLength: 80 }),
        group: f.boolean({
          default: false,
          help: "A heading row that starts a group (its cells are ignored)",
        }),
        cells: f.list({
          max: 6,
          itemLabel: "value",
          fields: {
            value: f.text({
              maxLength: 60,
              help: "Text, or 'yes' / 'no' for a check or a dash",
            }),
          },
        }),
      },
      default: [
        {
          label: "Group classes",
          group: false,
          cells: [{ value: "yes" }, { value: "yes" }, { value: "yes" }],
        },
        {
          label: "Guest passes",
          group: false,
          cells: [{ value: "no" }, { value: "2 a month" }, { value: "no" }],
        },
        {
          label: "Workshop discount",
          group: false,
          cells: [{ value: "no" }, { value: "10%" }, { value: "no" }],
        },
        {
          label: "Pause your plan",
          group: false,
          cells: [{ value: "no" }, { value: "yes" }, { value: "no" }],
        },
      ],
    }),
    note: f.text({ optional: true, maxLength: 200 }),
  },
  variants: ["lines", "striped", "boxed"],
  styleSlots: ["colorTheme", "padding", "radius", "animation"],
  ai: {
    purpose:
      "Compares plans, packages, products or options feature by feature in a real, accessible table.",
    whenToUse:
      "Under a pricing section (full plan comparison), for specs, or 'us vs. the usual way'. 2–4 columns and 4–12 rows read best; use 'yes'/'no' for checks and dashes, group rows to break long lists.",
    avoid:
      "Layout tables; more than five columns (phones scroll sideways); claims about competitors the owner can't back up; comparisons with named rival brands.",
  },
  render: ({ fields, variant }) => {
    const cols = fields.columns;
    const width = cols.length + 1;
    return (
      <div className={cx("os-table", `os-table--${variant}`)}>
        <p className="os-table__hint" aria-hidden="true">
          Swipe sideways to see every column →
        </p>
        <div className="os-table__frame">
          <div
            className="os-table__scroll"
            // biome-ignore lint/a11y/useSemanticElements: a named group, not a form fieldset or a landmark
            role="group"
            aria-label={`${fields.caption || "Comparison table"} (scrolls sideways on small screens)`}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable so keyboard users can scroll it
            tabIndex={0}
          >
            <table className="os-table__table" style={{ "--cols": cols.length }}>
              {fields.caption ? (
                <caption className="os-table__caption">{fields.caption}</caption>
              ) : null}
              <thead>
                <tr>
                  {fields.corner ? (
                    <th scope="col" className="os-table__corner">
                      {fields.corner}
                    </th>
                  ) : (
                    <td className="os-table__corner" />
                  )}
                  {cols.map((c, i) => (
                    <th
                      // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
                      key={i}
                      scope="col"
                      className={cx("os-table__colhead", c.highlight && "is-highlight")}
                    >
                      <span className="os-table__label">{c.label}</span>
                      {c.detail ? <span className="os-table__detail">{c.detail}</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.rows.map((row, i) =>
                  row.group ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
                    <tr key={i} className="os-table__group">
                      <th scope="colgroup" colSpan={width}>
                        {row.label}
                      </th>
                    </tr>
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
                    <tr key={i}>
                      <th scope="row" className="os-table__rowhead">
                        {row.label}
                      </th>
                      {cols.map((c, j) => (
                        <td
                          // biome-ignore lint/suspicious/noArrayIndexKey: cells have no ids
                          key={j}
                          className={cx(c.highlight && "is-highlight")}
                        >
                          <Cell value={row.cells[j]?.value ?? ""} />
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
        {fields.note ? <p className="os-table__note">{fields.note}</p> : null}
      </div>
    );
  },
});

export const tableCss = `
.os-table{display:grid;gap:var(--os-space-xs);min-width:0}
.os-table__scroll{overflow-x:auto;min-width:0;border-radius:var(--os-radius-card);overscroll-behavior-x:contain}
.os-table__scroll:focus-visible{outline:2px solid var(--os-color-focus);outline-offset:2px}
.os-table__frame{position:relative;min-width:0;timeline-scope:--os-table-x}
.os-table__frame>.os-table__scroll{scroll-timeline:--os-table-x inline}
.os-table__frame::after{content:"";position:absolute;inset-block:0;inset-inline-end:0;width:1.75rem;pointer-events:none;border-radius:0 var(--os-radius-card) var(--os-radius-card) 0;background:linear-gradient(to left,color-mix(in srgb,var(--os-color-heading) 18%,transparent),transparent);opacity:0}
@supports (animation-timeline:scroll()){.os-table__frame::after{animation:os-table-cue linear both;animation-timeline:--os-table-x}}
@keyframes os-table-cue{0%,90%{opacity:1}100%{opacity:0}}
.os-table__hint{display:none;margin:0;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
@media (max-width:40em){.os-table__hint{display:block}}
.os-table__table{width:100%;min-width:calc(10rem + var(--cols,3) * 7.5rem);border-collapse:collapse;font-variant-numeric:tabular-nums}
.os-table__caption{caption-side:top;text-align:start;padding:0 0 var(--os-space-xs);color:var(--os-color-text-muted);font-size:var(--os-type-small-font-size)}
.os-table th,.os-table td{padding:0.85em 1em;text-align:center;vertical-align:middle;border-bottom:1px solid var(--os-color-border)}
.os-table .os-table__rowhead,.os-table .os-table__corner,.os-table .os-table__group th{text-align:start}
.os-table .os-table__rowhead{font-weight:var(--os-font-weight-body);color:var(--os-color-text)}
.os-table thead th{vertical-align:bottom;color:var(--os-color-heading);font-weight:var(--os-font-weight-strong)}
.os-table__corner{color:var(--os-color-text-muted);font-size:var(--os-type-small-font-size)}
.os-table__label{display:block;font-family:var(--os-font-heading);font-size:var(--os-type-h4-font-size);line-height:1.2}
.os-table__detail{display:block;margin-top:0.25em;font-weight:var(--os-font-weight-body);color:var(--os-color-text-muted);font-size:var(--os-type-small-font-size)}
.os-table .is-highlight{background:var(--os-color-surface-raised)}
.os-table thead .is-highlight{box-shadow:inset 0 3px 0 var(--os-color-accent)}
.os-table__group th{padding-top:1.6em;color:var(--os-color-heading);font-weight:var(--os-font-weight-strong);font-size:var(--os-type-small-font-size);letter-spacing:0.06em;text-transform:uppercase}
.os-table__mark{display:inline-flex;align-items:center;justify-content:center}
.os-table__mark.is-yes{color:var(--os-color-heading)}
.os-table__mark.is-yes .os-icon{color:var(--os-color-accent)}
.os-table__mark.is-no{color:var(--os-color-text-muted)}
.os-table__note{margin:0;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-table--striped tbody tr:not(.os-table__group):nth-child(odd){background:var(--os-color-surface)}
.os-table--striped th,.os-table--striped td{border-bottom:0}
.os-table--boxed .os-table__scroll{background:var(--os-color-surface);border:1px solid var(--os-color-border)}
.os-table--boxed tbody tr:last-child>*{border-bottom:0}
`;
