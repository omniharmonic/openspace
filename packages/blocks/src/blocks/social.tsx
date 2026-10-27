import {
  cx,
  networkLabel,
  pagePath,
  SocialIcon,
  siteUrlFor,
  useRenderContext,
} from "@omniharmonic/openspace-renderer";
import {
  defineBlock,
  f,
  SOCIAL_NETWORKS,
  type SocialProfile,
} from "@omniharmonic/openspace-schema";
import { Icon } from "../icons";

const NETWORK_OPTIONS = SOCIAL_NETWORKS.map((value) => ({ value, label: networkLabel(value) }));

export const socialLinksBlock = defineBlock({
  type: "social-links",
  version: 1,
  category: "navigation",
  label: "Social links",
  icon: "at-sign",
  description: "Links to your social profiles — from Site settings or a custom list.",
  fields: {
    source: f.select({
      options: [
        { value: "site", label: "Site profiles" },
        { value: "custom", label: "Custom list" },
      ],
      default: "site",
      display: "segmented",
      help: "Site profiles are edited once in Site settings and reused everywhere",
    }),
    profiles: f.list({
      max: 20,
      itemLabel: "network",
      fields: {
        network: f.select({ options: NETWORK_OPTIONS }),
        url: f.text({ maxLength: 300, placeholder: "https://…" }),
      },
      default: [
        { network: "instagram", url: "https://instagram.com/juniperyoga" },
        { network: "youtube", url: "https://youtube.com/@juniperyoga" },
        { network: "email", url: "mailto:hello@juniperyoga.com" },
      ],
    }),
    label: f.text({ optional: true, maxLength: 60, help: "Optional heading, e.g. 'Follow along'" }),
  },
  variants: ["icons", "labels", "pills"],
  styleSlots: ["align", "padding", "animation"],
  ai: {
    purpose: "Links to the owner's social media and email.",
    whenToUse:
      "Footers, contact and about pages. Prefer `source: site` so profiles stay in sync across the site.",
    avoid: "Linking to inactive accounts; more than ~6 networks.",
  },
  render: ({ fields, variant }) => {
    const { doc } = useRenderContext();
    const profiles: SocialProfile[] =
      fields.source === "site" && doc?.site.social?.length
        ? doc.site.social
        : (fields.profiles.filter((p) => /^(https:\/\/|mailto:)/.test(p.url)) as SocialProfile[]);
    if (profiles.length === 0) return null;
    return (
      <div className={cx("os-socialblock", `os-socialblock--${variant}`)}>
        {fields.label ? <p className="os-socialblock__label">{fields.label}</p> : null}
        <ul className="os-socialblock__list" aria-label={fields.label || "Social media"}>
          {profiles.map((p) => (
            <li key={p.url}>
              <a
                href={p.url}
                className="os-socialblock__link"
                rel="me noopener"
                target={p.network === "email" ? undefined : "_blank"}
              >
                <SocialIcon network={p.network} />
                <span
                  className={variant === "icons" ? "os-visually-hidden" : "os-socialblock__name"}
                >
                  {networkLabel(p.network)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  },
});

// --- share buttons --------------------------------------------------------------------------------

const SHARE_TARGETS = {
  x: { label: "X", url: (u: string, t: string) => `https://x.com/intent/post?url=${u}&text=${t}` },
  facebook: {
    label: "Facebook",
    url: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${u}`,
  },
  linkedin: {
    label: "LinkedIn",
    url: (u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
  },
  bluesky: {
    label: "Bluesky",
    url: (u: string, t: string) => `https://bsky.app/intent/compose?text=${t}%20${u}`,
  },
  threads: {
    label: "Threads",
    url: (u: string, t: string) => `https://www.threads.net/intent/post?text=${t}%20${u}`,
  },
  pinterest: {
    label: "Pinterest",
    url: (u: string, t: string) =>
      `https://www.pinterest.com/pin/create/button/?url=${u}&description=${t}`,
  },
  email: { label: "Email", url: (u: string, t: string) => `mailto:?subject=${t}&body=${u}` },
} as const;
type ShareTarget = keyof typeof SHARE_TARGETS;
const SHARE_NAMES = Object.keys(SHARE_TARGETS) as ShareTarget[];

export const shareButtonsBlock = defineBlock({
  type: "share-buttons",
  version: 1,
  category: "navigation",
  label: "Share buttons",
  icon: "share-2",
  description: "Let visitors share the current page — plain links, no tracking scripts.",
  fields: {
    label: f.text({ optional: true, maxLength: 40, default: "Share this page" }),
    networks: f.list({
      min: 1,
      max: SHARE_NAMES.length,
      itemLabel: "network",
      fields: {
        network: f.select({
          options: SHARE_NAMES.map((value) => ({ value, label: SHARE_TARGETS[value].label })),
        }),
      },
      default: [
        { network: "facebook" },
        { network: "x" },
        { network: "linkedin" },
        { network: "email" },
      ],
    }),
  },
  variants: ["icons", "labels", "pills"],
  styleSlots: ["align", "padding", "animation"],
  ai: {
    purpose: "Share links for the page being viewed (blog posts, events, announcements).",
    whenToUse: "At the end of articles and event pages.",
    avoid: "Putting share buttons on every page; more than four or five networks.",
  },
  render: ({ fields, variant }) => {
    const ctx = useRenderContext();
    const pageUrl =
      ctx.doc && ctx.page
        ? new URL(pagePath(ctx.page).replace(/^\//, ""), siteUrlFor(ctx.doc)).toString()
        : ctx.doc
          ? siteUrlFor(ctx.doc)
          : "";
    const title =
      ctx.page && ctx.doc
        ? `${ctx.page.title} — ${ctx.doc.site.title}`
        : (ctx.doc?.site.title ?? "");
    const u = encodeURIComponent(pageUrl);
    const t = encodeURIComponent(title);
    const seen = new Set<string>();
    const targets = fields.networks
      .map((n) => n.network as ShareTarget)
      .filter((n) => SHARE_TARGETS[n] && !seen.has(n) && seen.add(n));
    return (
      <div
        className={cx(
          "os-share",
          `os-share--${variant}`,
          "os-socialblock",
          `os-socialblock--${variant}`,
        )}
      >
        {fields.label ? <p className="os-socialblock__label">{fields.label}</p> : null}
        <ul className="os-socialblock__list" aria-label={fields.label || "Share this page"}>
          {targets.map((n) => {
            const target = SHARE_TARGETS[n];
            return (
              <li key={n}>
                <a
                  href={target.url(u, t)}
                  className="os-socialblock__link"
                  rel="noopener nofollow"
                  target={n === "email" ? undefined : "_blank"}
                >
                  {n === "email" ? <Icon name="mail" size={20} /> : <SocialIcon network={n} />}
                  <span
                    className={variant === "icons" ? "os-visually-hidden" : "os-socialblock__name"}
                  >
                    {variant === "icons" ? `Share on ${target.label}` : target.label}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    );
  },
});

export const socialCss = `
.os-socialblock{display:flex;flex-wrap:wrap;align-items:center;gap:var(--os-space-2xs) var(--os-space-xs)}
.os-socialblock__label{font-size:var(--os-type-small-font-size);font-weight:var(--os-font-weight-strong);color:var(--os-color-heading)}
.os-socialblock__list{display:flex;flex-wrap:wrap;gap:var(--os-space-3xs);margin:0}
.os-socialblock__link{display:inline-flex;align-items:center;gap:0.45em;min-height:2.75rem;min-width:2.75rem;justify-content:center;border-radius:var(--os-radius-full);color:var(--os-color-text);text-decoration:none;transition:background-color var(--os-motion-duration-fast) var(--os-motion-ease),color var(--os-motion-duration-fast) var(--os-motion-ease)}
.os-socialblock__link:hover{background:var(--os-color-surface);color:var(--os-color-heading)}
.os-socialblock--labels .os-socialblock__list{gap:var(--os-space-3xs) var(--os-space-sm)}
.os-socialblock--labels .os-socialblock__link{padding-inline:0.4rem 0.7rem;justify-content:flex-start}
.os-socialblock--pills .os-socialblock__list{gap:var(--os-space-2xs)}
.os-socialblock--pills .os-socialblock__link{padding-inline:0.85rem 1.05rem;border:1px solid var(--os-color-text-muted)}
.os-socialblock--pills .os-socialblock__link:hover{border-color:var(--os-color-heading)}
.os-socialblock__name{font-size:var(--os-type-small-font-size)}
.os-malign-center .os-socialblock{justify-content:center}
.os-malign-end .os-socialblock{justify-content:flex-end}
@media (min-width:1200px){.os-align-start .os-socialblock{justify-content:flex-start}.os-align-center .os-socialblock{justify-content:center}.os-align-end .os-socialblock{justify-content:flex-end}}
`;
