import type { OpBody } from "@openspace/ops";
import {
  HEADER_VARIANTS,
  type HeaderVariant,
  type NavItem,
  type SiteDocument,
} from "@openspace/schema";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { cx, Field, Input, Segmented, Slider } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { ImagePick, LinkField, SwitchRow, ThemePicker, useSiteUpdate } from "./controls";

export const HEADER_LABEL: Record<HeaderVariant, { name: string; hint: string }> = {
  "classic-left": { name: "Classic", hint: "Logo left, menu right" },
  "classic-center": { name: "Centered menu", hint: "Logo left, menu in the middle" },
  "split-nav": { name: "Split", hint: "Menu on both sides of a centered logo" },
  "logo-center-nav-below": { name: "Centered", hint: "Logo centered, menu below" },
  "minimal-burger": { name: "Minimal", hint: "Logo and a menu button" },
  stacked: { name: "Stacked", hint: "Logo above the menu" },
  "sidebar-drawer": { name: "Drawer", hint: "Menu slides in from the side" },
  "transparent-overlay": { name: "Over the photo", hint: "Sits on top of the first section" },
};

/** Wireframe of a header layout (inline SVG, follows the chrome theme). */
export function HeaderThumb({ variant }: { variant: HeaderVariant }) {
  const logo = (x: number, y: number, w = 22) => (
    <rect x={x} y={y} width={w} height={8} rx={2} className="lg" />
  );
  const nav = (x: number, y: number, n = 3, gap = 14) =>
    Array.from({ length: n }, (_, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: static drawing
      <rect key={i} x={x + i * gap} y={y} width={10} height={3} rx={1.5} className="nv" />
    ));
  const burger = (x: number, y: number) => (
    <g className="nv">
      <rect x={x} y={y} width={12} height={2} rx={1} />
      <rect x={x} y={y + 4} width={12} height={2} rx={1} />
      <rect x={x} y={y + 8} width={12} height={2} rx={1} />
    </g>
  );
  const parts: Record<HeaderVariant, React.ReactNode> = {
    "classic-left": (
      <>
        {logo(8, 14)}
        {nav(68, 16.5)}
      </>
    ),
    "classic-center": (
      <>
        {logo(8, 14)}
        {nav(40, 16.5)}
        <rect x={98} y={14} width={14} height={8} rx={4} className="cta" />
      </>
    ),
    "split-nav": (
      <>
        {nav(8, 16.5, 2)}
        {logo(49, 14)}
        {nav(84, 16.5, 2)}
      </>
    ),
    "logo-center-nav-below": (
      <>
        {logo(49, 8)}
        {nav(39, 24)}
      </>
    ),
    "minimal-burger": (
      <>
        {logo(8, 14)}
        {burger(100, 13)}
      </>
    ),
    stacked: (
      <>
        {logo(8, 8)}
        {nav(8, 24)}
      </>
    ),
    "sidebar-drawer": (
      <>
        {burger(8, 13)}
        {logo(26, 14)}
        <rect x={84} y={0} width={36} height={48} className="dr" />
        {nav(90, 10, 1)}
        {nav(90, 17, 1)}
        {nav(90, 24, 1)}
      </>
    ),
    "transparent-overlay": (
      <>
        <rect x={0} y={0} width={120} height={48} className="ph" />
        <g className="on">
          {logo(8, 10)}
          {nav(68, 12.5)}
        </g>
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 120 48"
      className={cx("st-hthumb", `st-hthumb--${variant}`)}
      aria-hidden="true"
    >
      <rect x={0} y={0} width={120} height={48} className="bg" />
      {variant !== "transparent-overlay" &&
        variant !== "logo-center-nav-below" &&
        variant !== "stacked" && <line x1={0} x2={120} y1={36} y2={36} className="ln" />}
      {parts[variant]}
    </svg>
  );
}

function ctaIndex(nav: SiteDocument["site"]["nav"]): number {
  for (let i = nav.length - 1; i >= 0; i--) if (nav[i]?.type === "button") return i;
  return -1;
}

/** Header builder: layout gallery, behaviour, logo and a call-to-action button. */
export function HeaderBuilder() {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const header = doc.site.header;
  const update = useSiteUpdate();
  const nav = doc.site.nav;
  const ci = ctaIndex(nav);
  const cta = ci >= 0 ? (nav[ci] as Extract<NavItem, { type: "button" }>) : undefined;
  const logoH = header.logoHeight;
  const [ctaText, setCtaText] = useState(cta?.label ?? "");
  useEffect(() => setCtaText(cta?.label ?? ""), [cta?.label]);

  const setNav = (tree: NavItem[], label: string, mergeKey?: string) =>
    api
      .getState()
      .commit([{ op: "nav.update", tree } as OpBody], { label, ...(mergeKey ? { mergeKey } : {}) });
  const setCta = (
    patch: Partial<Extract<NavItem, { type: "button" }>>,
    label: string,
    mergeKey?: string,
  ) => {
    if (!cta) return;
    setNav(
      nav.map((it, i) => (i === ci ? ({ ...it, ...patch } as NavItem) : it)),
      label,
      mergeKey,
    );
  };

  return (
    <div className="st-chrome">
      <section className="st-chrome__group" aria-labelledby="hdr-layout">
        <h3 id="hdr-layout" className="st-chrome__title">
          Layout
        </h3>
        <div className="st-hgallery">
          {HEADER_VARIANTS.map((v) => (
            <button
              key={v}
              type="button"
              className={cx("st-hgallery__item", header.variant === v && "is-selected")}
              aria-pressed={header.variant === v}
              title={HEADER_LABEL[v].hint}
              onClick={() =>
                update("Header layout", {
                  set: {
                    "header.variant": v,
                    ...(v === "transparent-overlay" ? { "header.transparentOnHero": true } : {}),
                  },
                })
              }
            >
              <HeaderThumb variant={v} />
              <span>
                {HEADER_LABEL[v].name}
                {header.variant === v && <Check aria-hidden="true" />}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="st-chrome__group" aria-label="Behavior">
        <SwitchRow
          label="Stay at the top when scrolling"
          checked={header.sticky}
          onChange={(v) =>
            update(v ? "Sticky header" : "Header scrolls away", { set: { "header.sticky": v } })
          }
        />
        <SwitchRow
          label="See-through over the first section"
          hint="The header sits on top of a full-width photo at the top of the page."
          checked={header.transparentOnHero}
          onChange={(v) =>
            update("Header over first section", { set: { "header.transparentOnHero": v } })
          }
        />
        <SwitchRow
          label="Show social icons"
          checked={header.showSocial ?? false}
          onChange={(v) =>
            update(
              "Header social icons",
              v ? { set: { "header.showSocial": true } } : { unset: ["header.showSocial"] },
            )
          }
        />
        <Field label="Menu on phones">
          <Segmented
            aria-label="Menu on phones"
            block
            size="sm"
            value={header.mobileMenu}
            onValueChange={(v) => update("Phone menu style", { set: { "header.mobileMenu": v } })}
            options={[
              { value: "slide", label: "Slide in" },
              { value: "fullscreen", label: "Full screen" },
              { value: "dropdown", label: "Drop down" },
            ]}
          />
        </Field>
        <Field label="Colors">
          <ThemePicker
            value={header.colorTheme}
            onChange={(t) => update("Header colors", { set: { "header.colorTheme": t } })}
          />
        </Field>
      </section>

      <section className="st-chrome__group" aria-labelledby="hdr-logo">
        <h3 id="hdr-logo" className="st-chrome__title">
          Logo
        </h3>
        <ImagePick
          title="Choose your logo"
          value={doc.site.logo?.src}
          onChange={(src) => {
            if (!src) return update("Remove logo", { set: { logo: null } });
            const meta = doc.media[src as keyof SiteDocument["media"]];
            update("Change logo", {
              set: {
                logo: {
                  src,
                  alt: doc.site.logo?.alt || doc.site.title,
                  ...(meta?.width && meta.height ? { width: meta.width, height: meta.height } : {}),
                },
              },
            });
          }}
        />
        {doc.site.logo && (
          <Field label="Logo description" hint="Read aloud to people using screen readers.">
            <Input
              size="sm"
              value={doc.site.logo.alt}
              maxLength={200}
              onChange={(e) =>
                update("Logo description", { set: { "logo.alt": e.target.value } }, "logo-alt")
              }
            />
          </Field>
        )}
        <Field label={`Logo height on computers · ${logoH?.d ?? 40}px`}>
          <Slider
            aria-label="Logo height on computers"
            min={16}
            max={120}
            value={logoH?.d ?? 40}
            onValueChange={(d) =>
              update(
                "Logo size",
                { set: { "header.logoHeight": { ...(logoH ?? {}), d } } },
                "logo-d",
              )
            }
          />
        </Field>
        <Field label={`Logo height on phones · ${logoH?.m ?? logoH?.d ?? 40}px`}>
          <Slider
            aria-label="Logo height on phones"
            min={16}
            max={80}
            value={logoH?.m ?? Math.min(80, logoH?.d ?? 40)}
            onValueChange={(m) =>
              update(
                "Logo size on phones",
                {
                  set: {
                    "header.logoHeight": {
                      d: logoH?.d ?? 40,
                      ...(logoH?.t ? { t: logoH.t } : {}),
                      m,
                    },
                  },
                },
                "logo-m",
              )
            }
          />
        </Field>
      </section>

      <section className="st-chrome__group" aria-labelledby="hdr-cta">
        <div className="st-chrome__row">
          <h3 id="hdr-cta" className="st-chrome__title">
            Button
          </h3>
          <SwitchRow
            label="Show a button"
            checked={Boolean(cta)}
            onChange={(on) => {
              if (on && !cta) {
                const first =
                  Object.values(doc.pages).find((p) => p.slug !== "") ??
                  Object.values(doc.pages)[0];
                setNav(
                  [
                    ...nav,
                    {
                      type: "button",
                      label: "Get in touch",
                      style: "primary",
                      link: first ? { type: "page", page: first.id } : { type: "url", url: "/" },
                    },
                  ],
                  "Add header button",
                );
              } else if (!on && cta)
                setNav(
                  nav.filter((_, i) => i !== ci),
                  "Remove header button",
                );
            }}
          />
        </div>
        {cta && (
          <>
            <Field label="Button text">
              <Input
                size="sm"
                value={ctaText}
                maxLength={60}
                onChange={(e) => {
                  setCtaText(e.target.value);
                  if (e.target.value.trim())
                    setCta({ label: e.target.value }, "Button text", "cta-label");
                }}
              />
            </Field>
            <Field label="Goes to">
              <LinkField
                doc={doc}
                value={cta.link}
                onChange={(link) => setCta({ link }, "Button link")}
              />
            </Field>
            <Field label="Style">
              <Segmented
                aria-label="Button style"
                size="sm"
                block
                value={cta.style}
                onValueChange={(style) => setCta({ style }, "Button style")}
                options={[
                  { value: "primary", label: "Solid" },
                  { value: "secondary", label: "Outline" },
                  { value: "tertiary", label: "Text" },
                ]}
              />
            </Field>
          </>
        )}
      </section>
    </div>
  );
}
