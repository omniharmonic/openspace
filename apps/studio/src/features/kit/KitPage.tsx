import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUpRight,
  Copy,
  Inbox,
  MoveHorizontal,
  PanelLeft,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { TEMPLATE_FIXTURES } from "../../api/fixtures";
import { AppHeader } from "../../app/AppHeader";
import {
  AvatarStack,
  Badge,
  Button,
  ColorPicker,
  ColorSwatch,
  type ColorToken,
  type ColorValue,
  ContextMenu,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Kbd,
  Menu,
  NumberScrubInput,
  Popover,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Slider,
  Spinner,
  Tabs,
  TextArea,
  Toggle,
  Tooltip,
  toast,
  useCommandStore,
} from "../../ui";
import { StatusBadge } from "../dashboard/Dashboard";
import { FirstRunChecklist, useChecklist } from "../editor/FirstRunChecklist";
import { LookPicker } from "../templates/LookPicker";
import { SiteSketch } from "../templates/SiteSketch";
import "./KitPage.css";

const SECTIONS = [
  ["foundations", "Foundations"],
  ["buttons", "Buttons"],
  ["inputs", "Inputs"],
  ["choices", "Choices"],
  ["color", "Color"],
  ["overlays", "Overlays"],
  ["feedback", "Feedback"],
  ["people", "People"],
  ["navigation", "Navigation"],
  ["studio", "Studio pieces"],
] as const;

const SURFACE_TOKENS = [
  "bg",
  "canvas",
  "panel",
  "field",
  "line",
  "line-strong",
  "text",
  "text-2",
  "text-3",
  "accent",
  "live",
  "pending",
  "danger",
];

const SITE_TOKENS: ColorToken[] = [
  { id: "accent", name: "Accent", value: "#6f8461" },
  { id: "ink", name: "Ink", value: "#2e3a2f" },
  { id: "muted", name: "Muted", value: "#6c7466" },
  { id: "surface", name: "Surface", value: "#e7dfd0" },
  { id: "paper", name: "Paper", value: "#f3eee4" },
  { id: "clay", name: "Clay", value: "#b0603f" },
  { id: "sky", name: "Sky", value: "#9cc0d8" },
  { id: "white", name: "White", value: "#ffffff" },
];

const PEOPLE = [
  { id: "u1", name: "Sam Rivera" },
  { id: "u2", name: "Noor Haddad" },
  { id: "u3", name: "Ada Okafor" },
  { id: "u4", name: "Lee Chen" },
  { id: "u5", name: "Mia Novak" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="st-kit__section" aria-labelledby={`kit-${id}`}>
      <h2 id={`kit-${id}`} className="st-kit__h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="st-kit__specimen">
      <div className="st-kit__label">{label}</div>
      <div className="st-kit__row">{children}</div>
    </div>
  );
}

/** `/kit` — every Studio UI component in one place, for building and design review. */
export function KitPage() {
  const [width, setWidth] = useState<number | null>(1200);
  const [radius, setRadius] = useState<number | null>(8);
  const [select, setSelect] = useState<string>("comfortable");
  const [align, setAlign] = useState("left");
  const [device, setDevice] = useState("desktop");
  const [on, setOn] = useState(true);
  const [slider, setSlider] = useState(40);
  const [color, setColor] = useState<ColorValue | null>({ kind: "token", token: "accent" });
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [look, setLook] = useState("oat");
  const checklist = useChecklist("kit-demo");
  const openPalette = useCommandStore((s) => s.setOpen);
  const meadow = TEMPLATE_FIXTURES[0];
  const meadowLook = meadow?.looks.find((l) => l.id === look) ?? meadow?.looks[0];

  return (
    <div className="st-page">
      <AppHeader />
      <div className="st-kit">
        <nav className="st-kit__nav" aria-label="Kit sections">
          <p className="st-kit__nav-title">UI kit</p>
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="st-kit__nav-link">
              {label}
            </a>
          ))}
        </nav>
        <main className="st-kit__main">
          <h1 className="st-kit__title">Studio UI kit</h1>
          <p className="st-kit__lede">
            Every chrome component, in both themes. Tokens live in{" "}
            <code>src/styles/tokens.css</code> as <code>--st-*</code>; site content uses{" "}
            <code>--os-*</code>.
          </p>

          <Section id="foundations" title="Foundations">
            <Specimen label="Surface and text tokens">
              <div className="st-kit__tokens">
                {SURFACE_TOKENS.map((t) => (
                  <div key={t} className="st-kit__token">
                    <span className="st-kit__token-chip" style={{ background: `var(--st-${t})` }} />
                    <code>--st-{t}</code>
                  </div>
                ))}
              </div>
            </Specimen>
            <Specimen label="Type scale (13px base)">
              <div className="st-kit__type">
                <span
                  style={{
                    fontSize: "var(--st-fs-display)",
                    fontWeight: 650,
                    letterSpacing: "-0.035em",
                  }}
                >
                  Display 40
                </span>
                <span
                  style={{ fontSize: "var(--st-fs-xl)", fontWeight: 650, letterSpacing: "-0.03em" }}
                >
                  Title 28
                </span>
                <span style={{ fontSize: "var(--st-fs-lg)", fontWeight: 600 }}>Heading 20</span>
                <span style={{ fontSize: "var(--st-fs-md)", fontWeight: 600 }}>Subhead 15</span>
                <span>Body 13 — the default for every control and label.</span>
                <span style={{ fontSize: "var(--st-fs-sm)", color: "var(--st-text-2)" }}>
                  Small 12 for hints and meta.
                </span>
                <span style={{ fontSize: "var(--st-fs-xs)", color: "var(--st-text-3)" }}>
                  Micro 11 for shortcuts and canvas labels.
                </span>
              </div>
            </Specimen>
          </Section>

          <Section id="buttons" title="Buttons">
            <Specimen label="Variants">
              <Button variant="primary">Publish</Button>
              <Button variant="secondary">Preview</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="danger" icon={<Trash2 />}>
                Delete page
              </Button>
            </Specimen>
            <Specimen label="Sizes and states">
              <Button size="sm">Small</Button>
              <Button>Medium</Button>
              <Button size="lg" variant="primary">
                Large
              </Button>
              <Button loading variant="primary">
                Publishing
              </Button>
              <Button disabled>Disabled</Button>
              <Button icon={<Plus />}>New site</Button>
              <Button trailing={<ArrowUpRight />} variant="ghost">
                View live site
              </Button>
            </Specimen>
            <Specimen label="Icon buttons with tooltips and shortcuts">
              <IconButton label="Copy" icon={<Copy />} shortcut="mod+c" />
              <IconButton label="Search" icon={<Search />} shortcut="mod+k" />
              <IconButton
                label="Hide panels"
                icon={<PanelLeft />}
                shortcut="mod+backslash"
                active
              />
              <IconButton label="Delete" icon={<Trash2 />} shortcut="backspace" size="sm" />
              <IconButton label="Add section" icon={<Plus />} size="lg" />
              <IconButton label="Can’t move" icon={<MoveHorizontal />} disabled />
            </Specimen>
            <Specimen label="Keyboard hints">
              <Kbd shortcut="mod+k" tone="key" />
              <Kbd shortcut="shift+mod+z" tone="key" />
              <Kbd shortcut="alt+arrowup" tone="key" />
              <Kbd shortcut="?" tone="key" />
              <Kbd shortcut="mod+d" />
            </Specimen>
          </Section>

          <Section id="inputs" title="Inputs">
            <div className="st-kit__grid">
              <Field label="Site name" hint="Shown in the browser tab and search results.">
                <Input placeholder="Willow Street Yoga" />
              </Field>
              <Field label="Page address" error="That address is already used by “About”.">
                <Input prefix="/" defaultValue="about" />
              </Field>
              <Field label="Search" aside="Optional">
                <Input prefix={<Search />} placeholder="Find a block" size="sm" />
              </Field>
              <Field label="Description">
                <TextArea placeholder="Small group classes in a sunlit room above the bakery." />
              </Field>
            </div>
            <Specimen label="Number scrub inputs (drag the letter, ⇧ ×10, ⌥ ×0.1; type math like 24*2)">
              <div className="st-kit__scrubs">
                <NumberScrubInput
                  label="Width"
                  handle="W"
                  value={width}
                  onChange={setWidth}
                  min={0}
                  max={2400}
                  unit="px"
                />
                <NumberScrubInput
                  label="Radius"
                  handle="R"
                  value={radius}
                  onChange={setRadius}
                  min={0}
                  max={64}
                />
                <NumberScrubInput
                  label="Opacity"
                  handle="O"
                  value={null}
                  onChange={() => undefined}
                  min={0}
                  max={100}
                  unit="%"
                />
              </div>
            </Specimen>
            <Specimen label="Select">
              <div style={{ width: 200 }}>
                <Select
                  aria-label="Spacing"
                  value={select}
                  onValueChange={setSelect}
                  options={[
                    { value: "compact", label: "Compact" },
                    { value: "comfortable", label: "Comfortable" },
                    { value: "airy", label: "Airy" },
                  ]}
                />
              </div>
            </Specimen>
          </Section>

          <Section id="choices" title="Choices">
            <Specimen label="Segmented">
              <Segmented
                aria-label="Alignment"
                value={align}
                onValueChange={setAlign}
                options={[
                  { value: "left", label: <AlignLeft />, ariaLabel: "Align left" },
                  { value: "center", label: <AlignCenter />, ariaLabel: "Align center" },
                  { value: "right", label: <AlignRight />, ariaLabel: "Align right" },
                ]}
              />
              <Segmented
                aria-label="Device"
                value={device}
                onValueChange={setDevice}
                options={[
                  { value: "desktop", label: "Desktop" },
                  { value: "tablet", label: "Tablet" },
                  { value: "mobile", label: "Phone" },
                ]}
              />
            </Specimen>
            <Specimen label="Toggle and slider">
              <span className="st-kit__inline">
                <Toggle checked={on} onCheckedChange={setOn} aria-label="Show in navigation" />
                Show in navigation
              </span>
              <Toggle
                checked={false}
                onCheckedChange={() => undefined}
                size="sm"
                aria-label="Small toggle"
              />
              <div style={{ width: 200 }}>
                <Slider value={slider} onValueChange={setSlider} aria-label="Overlay strength" />
              </div>
              <span className="st-num">{slider}%</span>
            </Specimen>
          </Section>

          <Section id="color" title="Color">
            <Specimen label="Swatches">
              {SITE_TOKENS.slice(0, 6).map((t, i) => (
                <ColorSwatch key={t.id} color={t.value} label={t.name} selected={i === 0} />
              ))}
              <ColorSwatch color={null} label="None" />
            </Specimen>
            <Specimen label="Picker: site colors first, exact color as escape hatch">
              <div style={{ width: 200 }}>
                <ColorPicker
                  label="Background"
                  tokens={SITE_TOKENS}
                  value={color}
                  onChange={setColor}
                />
              </div>
            </Specimen>
          </Section>

          <Section id="overlays" title="Overlays">
            <Specimen label="Popover, dialog, sheet, menus, palette">
              <Popover title="Spacing" trigger={<Button>Popover</Button>}>
                <div className="st-kit__stack">
                  <NumberScrubInput label="Top" handle="T" value={radius} onChange={setRadius} />
                  <NumberScrubInput label="Bottom" handle="B" value={radius} onChange={setRadius} />
                </div>
              </Popover>
              <Button onClick={() => setDialog(true)}>Dialog</Button>
              <Button onClick={() => setSheet(true)}>Bottom sheet</Button>
              <Menu
                trigger={<Button>Menu</Button>}
                items={[
                  { label: "Duplicate", shortcut: "mod+d", icon: <Copy /> },
                  { label: "Move up", shortcut: "alt+arrowup" },
                  {
                    label: "Show on mobile",
                    type: "checkbox",
                    checked: on,
                    onCheckedChange: setOn,
                  },
                  { type: "separator" },
                  { label: "Delete", shortcut: "backspace", icon: <Trash2 />, danger: true },
                ]}
              />
              <ContextMenu
                items={[
                  { label: "Copy", shortcut: "mod+c" },
                  { label: "Paste", shortcut: "mod+v" },
                  { type: "separator" },
                  { label: "Delete", danger: true },
                ]}
              >
                <div className="st-kit__context">Right-click here</div>
              </ContextMenu>
              <Button
                icon={<Search />}
                onClick={() => openPalette(true)}
                trailing={<Kbd shortcut="mod+k" />}
              >
                Command palette
              </Button>
            </Specimen>
            <Dialog
              open={dialog}
              onOpenChange={setDialog}
              title="Delete “About”?"
              description="The page and its sections are removed from the draft. You can undo this, or restore it from history later."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setDialog(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={() => setDialog(false)}>
                    Delete page
                  </Button>
                </>
              }
            />
            <Sheet open={sheet} onOpenChange={setSheet} title="Layers">
              <div className="st-kit__stack">
                <Skeleton height={12} width="60%" />
                <Skeleton height={12} width="80%" />
                <Skeleton height={12} width="50%" />
              </div>
            </Sheet>
          </Section>

          <Section id="feedback" title="Feedback">
            <Specimen label="Toasts">
              <Button onClick={() => toast({ title: "Saved to your draft" })}>Neutral</Button>
              <Button
                onClick={() =>
                  toast({
                    tone: "success",
                    title: "Published",
                    description: "willow.github.io is up to date.",
                  })
                }
              >
                Success
              </Button>
              <Button
                onClick={() =>
                  toast({
                    tone: "danger",
                    title: "Couldn’t publish",
                    description: "The connection dropped. Your edits are safe.",
                    action: { label: "Retry", onClick: () => undefined },
                  })
                }
              >
                Error
              </Button>
              <Button
                onClick={() =>
                  toast({
                    tone: "celebrate",
                    title: "Your site is live",
                    description: "sam-rivera.github.io/willow-street-yoga",
                    action: { label: "Copy link", keepOpen: true, onClick: () => undefined },
                  })
                }
              >
                Celebrate
              </Button>
            </Specimen>
            <Specimen label="Badges and status">
              <Badge>Draft</Badge>
              <Badge tone="accent">
                <Inbox size={11} aria-hidden="true" />3 new entries
              </Badge>
              <StatusBadge status="live" />
              <StatusBadge status="building" />
              <StatusBadge status="failed" />
              <Spinner />
            </Specimen>
            <Specimen label="Skeleton">
              <div className="st-kit__stack" style={{ width: 240 }}>
                <Skeleton height={12} width="70%" />
                <Skeleton height={12} />
                <Skeleton height={64} radius={8} />
              </div>
            </Specimen>
            <div className="st-kit__panel">
              <EmptyState
                icon={<Inbox />}
                title="No form entries yet"
                description="When someone fills in a form on your site, their message lands here."
                action={<Button>Add a contact form</Button>}
              />
            </div>
          </Section>

          <Section id="people" title="People">
            <Specimen label="Presence">
              <AvatarStack people={PEOPLE.slice(0, 2)} />
              <AvatarStack people={PEOPLE} max={3} size={28} />
            </Specimen>
          </Section>

          <Section id="navigation" title="Navigation">
            <div className="st-kit__panel st-kit__panel--narrow">
              <Tabs
                aria-label="Inspector demo"
                items={[
                  {
                    value: "design",
                    label: "Design",
                    content: <p className="st-kit__muted">Spacing, color, type.</p>,
                  },
                  {
                    value: "content",
                    label: "Content",
                    content: <p className="st-kit__muted">Words and images.</p>,
                  },
                  {
                    value: "motion",
                    label: "Motion",
                    content: <p className="st-kit__muted">Entrance and hover effects.</p>,
                  },
                ]}
              />
            </div>
            <Tabs
              variant="pill"
              aria-label="Pill tabs demo"
              items={[
                { value: "all", label: "All", content: null },
                { value: "live", label: "Live", content: null },
                { value: "attention", label: "Needs attention", content: null },
              ]}
            />
          </Section>

          <Section id="studio" title="Studio pieces">
            {meadow && meadowLook && (
              <Specimen label="Site sketch + look picker">
                <div className="st-kit__sketch">
                  <SiteSketch
                    styles={meadowLook.styles}
                    name="Willow Street Yoga"
                    tagline="Slow classes for busy people"
                  />
                  <LookPicker
                    looks={meadow.looks}
                    value={look}
                    onValueChange={setLook}
                    label="Meadow looks"
                    showNames
                  />
                </div>
              </Specimen>
            )}
            <Specimen label="First-run checklist">
              <FirstRunChecklist checklist={checklist} />
              {checklist.state.dismissed && (
                <Button onClick={checklist.show}>Show checklist</Button>
              )}
            </Specimen>
            <Specimen label="Tooltip on any element">
              <Tooltip
                content="Publishing sends your draft to the live site"
                shortcut="shift+mod+p"
              >
                <Button variant="primary">Hover me</Button>
              </Tooltip>
            </Specimen>
          </Section>
        </main>
      </div>
    </div>
  );
}
