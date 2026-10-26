import { z } from "zod";
import { PageIdSchema } from "./ids";
import {
  CollectionNameSchema,
  HttpsUrlSchema,
  HttpUrlSchema,
  LinkSchema,
  MediaSrcSchema,
} from "./primitives";
import { named } from "./registry";
import { responsive } from "./responsive";
import { SectionSchema } from "./section";
import { ColorThemeSchema } from "./tokens";

/** The eight header layouts (PRD: "Header layouts (8 presets)"). */
export const HEADER_VARIANTS = [
  /** Logo left, navigation right. */
  "logo-left",
  /** Logo left, navigation centered, actions right. */
  "logo-left-nav-center",
  /** Logo centered, navigation in a row below. */
  "logo-center",
  /** Navigation split either side of a centered logo. */
  "logo-center-split",
  /** Navigation left, logo right. */
  "logo-right",
  /** Logo above navigation, both left-aligned. */
  "stacked-left",
  /** Centered logo, menu button left, actions right. */
  "logo-center-menu",
  /** Logo and a menu button at every width. */
  "minimal",
] as const;
export const HeaderVariantSchema = z.enum(HEADER_VARIANTS);
export type HeaderVariant = z.infer<typeof HeaderVariantSchema>;

export const MOBILE_MENU_STYLES = [
  "drawer-right",
  "drawer-left",
  "fullscreen",
  "dropdown",
] as const;

export const ButtonStyleRoleSchema = z.enum(["primary", "secondary", "tertiary"]);

export const HeaderSchema = named(
  "Header",
  "Site header: one of eight layouts plus sticky, transparent-on-hero and mobile menu options.",
  z.strictObject({
    variant: HeaderVariantSchema,
    sticky: z.boolean(),
    transparentOnHero: z.boolean(),
    mobileMenu: z.enum(MOBILE_MENU_STYLES),
    colorTheme: ColorThemeSchema.optional(),
    showSocial: z.boolean().optional(),
    /** Logo height in px per breakpoint. */
    logoHeight: responsive(z.int().min(16).max(240)).optional(),
  }),
);
export type Header = z.infer<typeof HeaderSchema>;

/** Per-page header override: any subset of the site header options, plus hiding it. */
export const HeaderOverrideSchema = z.strictObject({
  variant: HeaderVariantSchema.optional(),
  sticky: z.boolean().optional(),
  transparentOnHero: z.boolean().optional(),
  colorTheme: ColorThemeSchema.optional(),
  hidden: z.boolean().optional(),
});
export type HeaderOverride = z.infer<typeof HeaderOverrideSchema>;

// --- navigation -----------------------------------------------------------------------------

const NavLabelSchema = z.string().min(1).max(60);

const NavPageSchema = z.strictObject({
  type: z.literal("page"),
  page: PageIdSchema,
  /** Defaults to the page title. */
  label: NavLabelSchema.optional(),
  hidden: z.boolean().optional(),
});
const NavCollectionSchema = z.strictObject({
  type: z.literal("collection"),
  collection: CollectionNameSchema,
  label: NavLabelSchema,
  hidden: z.boolean().optional(),
});
const NavExternalSchema = z.strictObject({
  type: z.literal("link"),
  label: NavLabelSchema,
  href: HttpUrlSchema,
  newTab: z.boolean().optional(),
  hidden: z.boolean().optional(),
});
const NavButtonSchema = z.strictObject({
  type: z.literal("button"),
  label: NavLabelSchema,
  link: LinkSchema,
  style: ButtonStyleRoleSchema,
  hidden: z.boolean().optional(),
});

export const NavLeafSchema = z.discriminatedUnion("type", [
  NavPageSchema,
  NavCollectionSchema,
  NavExternalSchema,
]);
export type NavLeaf = z.infer<typeof NavLeafSchema>;

/** Folders hold one level of pages/collections/links (no nested folders). */
const NavFolderSchema = z.strictObject({
  type: z.literal("folder"),
  label: NavLabelSchema,
  /** Optional landing page when the folder label itself is clicked. */
  page: PageIdSchema.optional(),
  items: z.array(NavLeafSchema).max(30),
  hidden: z.boolean().optional(),
});

export const NavItemSchema = named(
  "NavItem",
  "A navigation entry: page, collection, external link, button, or a folder of entries.",
  z.discriminatedUnion("type", [
    NavPageSchema,
    NavCollectionSchema,
    NavExternalSchema,
    NavButtonSchema,
    NavFolderSchema,
  ]),
);
export type NavItem = z.infer<typeof NavItemSchema>;

// --- misc -----------------------------------------------------------------------------------

export const SOCIAL_NETWORKS = [
  "instagram",
  "facebook",
  "x",
  "threads",
  "bluesky",
  "mastodon",
  "linkedin",
  "youtube",
  "tiktok",
  "pinterest",
  "github",
  "spotify",
  "soundcloud",
  "bandcamp",
  "vimeo",
  "behance",
  "dribbble",
  "substack",
  "patreon",
  "yelp",
  "tripadvisor",
  "email",
  "website",
] as const;

export const SocialProfileSchema = z.strictObject({
  network: z.enum(SOCIAL_NETWORKS),
  url: z.union([HttpsUrlSchema, z.string().regex(/^mailto:[^\s@]+@[^\s@]+$/)]),
});
export type SocialProfile = z.infer<typeof SocialProfileSchema>;

export const AnnouncementSchema = z.strictObject({
  enabled: z.boolean(),
  message: z.string().min(1).max(200),
  link: LinkSchema.optional(),
  colorTheme: ColorThemeSchema.optional(),
  dismissible: z.boolean().optional(),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

export const SeoDefaultsSchema = z.strictObject({
  /** Page title template; `%s` is replaced by the page title, e.g. `%s — Maya Yoga`. */
  titleTemplate: z.string().max(120).optional(),
  description: z.string().max(320).optional(),
  image: MediaSrcSchema.optional(),
  noindex: z.boolean().optional(),
});
export type SeoDefaults = z.infer<typeof SeoDefaultsSchema>;

/** BCP 47 language tag such as `en`, `en-US`, `pt-BR`, `zh-Hant-TW`. */
export const LocaleSchema = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/, {
    message: "Expected a locale like en or en-US",
  });

export const IntegrationsSchema = z.strictObject({
  analytics: z.boolean(),
  bookingUrl: HttpsUrlSchema.nullable(),
  /** Whether Stripe is connected in the Hub. The account itself is never stored in content. */
  stripeConnected: z.boolean(),
});
export type Integrations = z.infer<typeof IntegrationsSchema>;

const SitePathSchema = z
  .string()
  .regex(/^\/(?!\/)[^\s?#]*$/, { message: "Expected a site path starting with /" });

export const RedirectSchema = z.strictObject({
  from: SitePathSchema,
  to: z.union([SitePathSchema, HttpUrlSchema]),
  status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
});
export type Redirect = z.infer<typeof RedirectSchema>;

export const LogoSchema = z.strictObject({
  src: MediaSrcSchema,
  alt: z.string().max(200),
  width: z.int().positive().optional(),
  height: z.int().positive().optional(),
});

/** `content/site.json` (arch §3.4). No secrets — ever. */
export const SiteSchema = named(
  "Site",
  "content/site.json: title, logo, navigation, header, footer, announcement, social, SEO, locale, integrations.",
  z
    .strictObject({
      $schema: z.string().optional(),
      title: z.string().min(1).max(120),
      tagline: z.string().max(200).optional(),
      logo: LogoSchema.nullable().optional(),
      favicon: MediaSrcSchema.nullable().optional(),
      nav: z.array(NavItemSchema).max(60),
      header: HeaderSchema,
      /** The footer is a section (usually grid mode) rendered on every page. */
      footer: SectionSchema,
      announcement: AnnouncementSchema.nullable().optional(),
      social: z.array(SocialProfileSchema).max(30).optional(),
      seo: SeoDefaultsSchema.optional(),
      locale: LocaleSchema,
      integrations: IntegrationsSchema.optional(),
      customCss: z.string().max(100_000).optional(),
      headInjection: z.string().max(50_000).optional(),
      footerInjection: z.string().max(50_000).optional(),
      redirects: z.array(RedirectSchema).max(1000).optional(),
    })
    .superRefine((site, ctx) => {
      const froms = new Set<string>();
      site.redirects?.forEach((r, i) => {
        if (froms.has(r.from)) {
          ctx.addIssue({
            code: "custom",
            path: ["redirects", i, "from"],
            message: `Duplicate redirect from ${r.from}`,
          });
        }
        froms.add(r.from);
      });
    }),
);
export type Site = z.infer<typeof SiteSchema>;
