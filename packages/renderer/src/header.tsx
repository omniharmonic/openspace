import type {
  ColorTheme,
  Header as HeaderConfig,
  HeaderVariant,
  NavItem,
  NavLeaf,
  Page,
  Site,
  SiteDocument,
} from "@omniharmonic/openspace-schema";
import { themeClass } from "@omniharmonic/openspace-theme";
import type { ReactNode } from "react";
import { useRenderContext } from "./context";
import { cx } from "./cx";
import { Img } from "./image";
import { normalizeBasePath, pagePath } from "./link";
import { Button, SocialLinks } from "./primitives";

/** Header variants whose navigation is always behind the menu button. */
export const DRAWER_VARIANTS: readonly HeaderVariant[] = ["minimal-burger", "sidebar-drawer"];

export interface EffectiveHeader extends HeaderConfig {
  hidden: boolean;
  /** The header overlays the first section (variant `transparent-overlay` or transparent-on-hero). */
  overlay: boolean;
}

/** Merge the site header with a page's override. */
export function effectiveHeader(site: Site, page: Page | undefined): EffectiveHeader {
  const o = page?.header;
  const variant = o?.variant ?? site.header.variant;
  const transparentOnHero = o?.transparentOnHero ?? site.header.transparentOnHero;
  const hasHero = (page?.sections.filter((s) => !s.hidden).length ?? 0) > 0;
  return {
    ...site.header,
    variant,
    transparentOnHero,
    hidden: o?.hidden ?? false,
    overlay: hasHero && (variant === "transparent-overlay" || transparentOnHero),
  };
}

interface ResolvedNavLeaf {
  kind: "leaf";
  label: string;
  href: string;
  current: boolean;
  newTab: boolean;
}
interface ResolvedNavFolder {
  kind: "folder";
  label: string;
  current: boolean;
  items: ResolvedNavLeaf[];
}
type ResolvedNav = ResolvedNavLeaf | ResolvedNavFolder;

function resolveLeaf(
  item: NavLeaf,
  doc: SiteDocument | undefined,
  basePath: string,
  currentId: string | undefined,
): ResolvedNavLeaf | null {
  if (item.hidden) return null;
  switch (item.type) {
    case "page": {
      const page = doc?.pages[item.page];
      if (doc && !page) return null;
      return {
        kind: "leaf",
        label: item.label ?? page?.title ?? "Page",
        href: page ? pagePath(page, basePath) : `${normalizeBasePath(basePath)}/`,
        current: item.page === currentId,
        newTab: false,
      };
    }
    case "collection":
      return {
        kind: "leaf",
        label: item.label,
        href: `${normalizeBasePath(basePath)}/${item.collection}/`,
        current: false,
        newTab: false,
      };
    case "link":
      return {
        kind: "leaf",
        label: item.label,
        href: item.href,
        current: false,
        newTab: item.newTab ?? false,
      };
  }
}

/** Resolve the nav tree (hidden entries and dangling pages dropped; buttons excluded). */
export function resolveNav(
  nav: readonly NavItem[],
  doc: SiteDocument | undefined,
  basePath: string,
  currentId: string | undefined,
): ResolvedNav[] {
  const out: ResolvedNav[] = [];
  for (const item of nav) {
    if (item.hidden || item.type === "button") continue;
    if (item.type === "folder") {
      const items: ResolvedNavLeaf[] = [];
      if (item.page) {
        const landing = resolveLeaf({ type: "page", page: item.page }, doc, basePath, currentId);
        if (landing) items.push(landing);
      }
      for (const leaf of item.items) {
        const r = resolveLeaf(leaf, doc, basePath, currentId);
        if (r) items.push(r);
      }
      if (items.length)
        out.push({
          kind: "folder",
          label: item.label,
          current: items.some((i) => i.current),
          items,
        });
      continue;
    }
    const r = resolveLeaf(item, doc, basePath, currentId);
    if (r) out.push(r);
  }
  return out;
}

/** Where a header's navigation fits inline: from 1024px, from 1440px, or never (menu button). */
export type NavFit = "lg" | "xl" | "menu";

// Rough widths in px at the nav type preset (~16px), measured on published sites.
const NAV_CHAR = 8.6;
const NAV_ITEM_GAP = 30;
const NAV_CHEVRON = 18;
const TITLE_CHAR = 12;
const BUTTON_PAD = 56;
const BAR_GAP = 16;
/** Content width of the header bar at 1024px and 1440px (viewport minus the widest gutters). */
const BAR_LG = 1024 - 96;
const BAR_XL = 1440 - 96;

/**
 * Estimate the width of the header's single row (brand, inline menu, buttons, social, cart) and
 * say from which breakpoint it fits. A long menu used to squeeze the site name into a narrow
 * column ("os-/eze-/editor-/1") and wrap itself onto two rows; it now stays behind the menu
 * button until there is room. Pure: depends on the document only.
 */
export function navFit(opts: {
  variant: HeaderVariant;
  nav: readonly ResolvedNav[];
  title: string;
  logo?: { width?: number | undefined; height?: number | undefined } | null | undefined;
  buttons: readonly { label: string }[];
  social: number;
  cart: boolean;
}): NavFit {
  if (!opts.nav.length) return "lg";
  const navWidth = opts.nav.reduce(
    (w, item) =>
      w + item.label.length * NAV_CHAR + NAV_ITEM_GAP + (item.kind === "folder" ? NAV_CHEVRON : 0),
    0,
  );
  const logo = opts.logo;
  const brand = logo
    ? logo.width && logo.height
      ? Math.min(240, (40 * logo.width) / logo.height)
      : 160
    : Math.min(opts.title.length, 30) * TITLE_CHAR;
  const actions =
    opts.buttons.reduce((w, b) => w + b.label.length * NAV_CHAR + BUTTON_PAD + BAR_GAP, 0) +
    opts.social * 40 +
    (opts.cart ? 44 : 0);
  // Layouts with the menu on its own row only need the menu to fit that row.
  const ownRow = opts.variant === "logo-center-nav-below" || opts.variant === "stacked";
  const need = ownRow
    ? Math.max(navWidth, brand + actions + 2 * BAR_GAP)
    : navWidth + brand + actions + 3 * BAR_GAP;
  if (need <= BAR_LG) return "lg";
  if (need <= BAR_XL) return "xl";
  return "menu";
}

function NavLeafLink({ item, className }: { item: ResolvedNavLeaf; className: string }) {
  return (
    <a
      className={className}
      href={item.href}
      aria-current={item.current ? "page" : undefined}
      target={item.newTab ? "_blank" : undefined}
      rel={item.newTab ? "noopener" : undefined}
    >
      {item.label}
    </a>
  );
}

function NavList({ items, className }: { items: ResolvedNav[]; className?: string }) {
  return (
    <ul className={cx("os-nav__list", className)}>
      {items.map((item, i) =>
        item.kind === "leaf" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: nav order is positional
          <li key={i} className="os-nav__item">
            <NavLeafLink item={item} className="os-nav__link" />
          </li>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: nav order is positional
          <li key={i} className="os-nav__item os-nav__item--folder">
            <details className="os-nav__folder" data-os-folder="">
              <summary className={cx("os-nav__link", item.current && "is-current")}>
                {item.label}
                <svg
                  className="os-nav__chevron"
                  viewBox="0 0 12 12"
                  width="12"
                  height="12"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </summary>
              <ul className="os-nav__sub">
                {item.items.map((leaf, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: nav order is positional
                  <li key={j}>
                    <NavLeafLink item={leaf} className="os-nav__sublink" />
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ),
      )}
    </ul>
  );
}

function Brand({ site, className }: { site: Site; className?: string }) {
  const { basePath } = useRenderContext();
  const logo = site.logo;
  return (
    <a className={cx("os-header__brand", className)} href={`${normalizeBasePath(basePath)}/`}>
      {logo ? (
        <Img
          src={logo.src}
          alt={logo.alt || site.title}
          {...(logo.width ? { width: logo.width } : {})}
          {...(logo.height ? { height: logo.height } : {})}
          sizes="240px"
          treatment="none"
          priority
          className="os-header__logo"
        />
      ) : (
        <span className="os-header__title">{site.title}</span>
      )}
    </a>
  );
}

function MenuIcon() {
  return (
    <svg
      className="os-header__burger"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 7h16M4 12h16M4 17h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CartButton() {
  return (
    <button
      type="button"
      className="os-header__cart"
      data-os-behavior="cart"
      data-os-cart-toggle=""
      aria-label="Cart"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path
          d="M5 7h14l-1.5 12h-11zM9 7a3 3 0 0 1 6 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span className="os-header__cart-count" data-os-cart-count="" />
    </button>
  );
}

export interface HeaderProps {
  site: Site;
  page?: Page | undefined;
  /** Color theme of the first section; used when the header overlays it. */
  heroTheme?: ColorTheme | undefined;
  /** Show the cart button (sites with commerce). */
  cart?: boolean;
}

/**
 * Site header in one of eight layouts, with sticky / transparent-on-hero modes, nav folders
 * (`<details>`, so they work without JavaScript) and a mobile menu (slide, fullscreen or
 * dropdown) driven by the `menu` behavior. Without JavaScript the mobile menu is shown inline.
 */
export function Header({ site, page, heroTheme, cart }: HeaderProps) {
  const ctx = useRenderContext();
  const h = effectiveHeader(site, page);
  if (h.hidden) return null;
  const nav = resolveNav(site.nav, ctx.doc, ctx.basePath, page?.id ?? ctx.page?.id);
  const buttons = site.nav.filter(
    (i): i is Extract<NavItem, { type: "button" }> => i.type === "button" && !i.hidden,
  );
  const social = h.showSocial ? (site.social ?? []) : [];
  const theme: ColorTheme = h.overlay && heroTheme ? heroTheme : (h.colorTheme ?? "light");
  const drawer = DRAWER_VARIANTS.includes(h.variant);
  const split = h.variant === "split-nav";
  const half = Math.ceil(nav.length / 2);
  const menuId = "os-menu";
  const fit = drawer
    ? null
    : navFit({
        variant: h.variant,
        nav,
        title: site.title,
        logo: site.logo,
        buttons,
        social: social.length,
        cart: cart ?? false,
      });

  const actions = (
    <div className="os-header__actions">
      {social.length > 0 && <SocialLinks profiles={social} className="os-header__social" />}
      {buttons.map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: nav order is positional
        <Button key={i} to={b.link} role={b.style} className="os-header__button">
          {b.label}
        </Button>
      ))}
    </div>
  );

  let desktopNav: ReactNode = null;
  if (!drawer && nav.length) {
    desktopNav = split ? (
      <nav className="os-nav os-nav--split" aria-label="Main">
        <NavList items={nav.slice(0, half)} className="os-nav__list--start" />
        <Brand site={site} className="os-header__brand--split" />
        <NavList items={nav.slice(half)} className="os-nav__list--end" />
      </nav>
    ) : (
      <nav className="os-nav" aria-label="Main">
        <NavList items={nav} />
      </nav>
    );
  }

  return (
    <header
      className={cx(
        "os-header",
        `os-header--${h.variant}`,
        themeClass(theme),
        h.sticky && "is-sticky",
        h.overlay && "is-overlay",
        drawer && "is-drawer",
        fit === "lg" && "is-nav-lg",
        fit === "xl" && "is-nav-xl",
        `has-menu-${h.variant === "sidebar-drawer" ? "drawer" : h.mobileMenu}`,
      )}
      data-os-header=""
      data-os-behavior="menu"
    >
      <div className="os-header__bar">
        <Brand site={site} className={split ? "os-header__brand--main" : undefined} />
        {desktopNav}
        {actions}
        {cart && <CartButton />}
        <button
          type="button"
          className="os-header__toggle"
          aria-expanded="false"
          aria-controls={menuId}
          data-os-menu-toggle=""
        >
          <MenuIcon />
          <span className="os-visually-hidden">Menu</span>
        </button>
      </div>
      <div
        id={menuId}
        className={cx(
          "os-menu",
          `os-menu--${h.variant === "sidebar-drawer" ? "drawer" : h.mobileMenu}`,
          themeClass(h.colorTheme ?? "light"),
        )}
        data-os-menu=""
      >
        <div className="os-menu__head">
          <span className="os-menu__title">{site.title}</span>
          <button type="button" className="os-menu__close" data-os-menu-close="">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <span className="os-visually-hidden">Close menu</span>
          </button>
        </div>
        <nav className="os-menu__nav" aria-label="Menu">
          <NavList items={nav} className="os-menu__list" />
        </nav>
        {(buttons.length > 0 || (site.social?.length ?? 0) > 0) && (
          <div className="os-menu__foot">
            {buttons.map((b, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: nav order is positional
              <Button key={i} to={b.link} role={b.style}>
                {b.label}
              </Button>
            ))}
            {site.social && <SocialLinks profiles={site.social} />}
          </div>
        )}
      </div>
    </header>
  );
}
