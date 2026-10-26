import {
  Button,
  type ButtonRole,
  cx,
  feedKey,
  Img,
  networkLabel,
  type SocialFeedPost,
  SocialIcon,
  useCollections,
  useRenderContext,
} from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";
import { EditorNotice, typo } from "../shared";

/** Button role (a variable keeps the a11y role lint off the Button prop). */
const SECONDARY: ButtonRole = "secondary";

const NETWORKS = ["instagram", "bluesky", "mastodon", "pinterest", "tiktok", "youtube"] as const;
type Network = (typeof NETWORKS)[number];

/** Public profile URL for a handle (`juniperyoga`, `@maya@social.coop`). */
export function profileUrl(network: Network, handle: string): string | undefined {
  const h = handle.trim().replace(/^@/, "");
  if (!h || /[\s/?#]/.test(h.replace(/@[^@]+$/, ""))) return undefined;
  switch (network) {
    case "instagram":
      return `https://www.instagram.com/${encodeURIComponent(h)}/`;
    case "bluesky":
      return `https://bsky.app/profile/${encodeURIComponent(h)}`;
    case "mastodon": {
      const [user, host] = h.split("@");
      return user && host && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)
        ? `https://${host}/@${encodeURIComponent(user)}`
        : undefined;
    }
    case "pinterest":
      return `https://www.pinterest.com/${encodeURIComponent(h)}/`;
    case "tiktok":
      return `https://www.tiktok.com/@${encodeURIComponent(h)}`;
    case "youtube":
      return `https://www.youtube.com/@${encodeURIComponent(h)}`;
  }
}

export const socialFeedBlock = defineBlock({
  type: "social-feed",
  version: 1,
  category: "social-proof",
  label: "Social feed",
  icon: "images",
  description: "Your latest Instagram (or other) posts, fetched when the site is published.",
  fields: {
    heading: f.text({ optional: true, maxLength: 80, default: "Life at the studio" }),
    network: f.select({
      options: NETWORKS.map((n) => ({ value: n, label: networkLabel(n) })),
      default: "instagram",
    }),
    handle: f.text({
      maxLength: 80,
      default: "juniperyoga",
      help: "Your username on that network",
    }),
    count: f.select({ options: ["3", "4", "6", "8"], default: "6", display: "segmented" }),
    followLabel: f.text({ maxLength: 40, default: "Follow along" }),
    posts: f.list({
      max: 12,
      itemLabel: "caption",
      label: "Pinned posts",
      help: "Used when there's no feed connection: add posts by hand",
      fields: {
        image: f.image({ aspect: "1:1" }),
        url: f.link({ allow: ["url"] }),
        caption: f.text({ optional: true, maxLength: 200 }),
      },
      default: [],
    }),
  },
  variants: ["grid", "row", "mosaic"],
  styleSlots: ["colorTheme", "padding", "radius", "align", "animation", "typography.heading"],
  ai: {
    purpose: "A grid of recent posts from the owner's social profile, linking to each post.",
    whenToUse:
      "Near the footer or on about pages to show everyday life. Posts are fetched at publish time with the owner's permission, so no third-party scripts load.",
    avoid: "Embedding other people's posts; feeds as the main content of a page.",
  },
  render: ({ fields, variant, style }) => {
    const { doc } = useRenderContext();
    const { feeds } = useCollections();
    const count = Number(fields.count);
    const network = fields.network as Network;
    const fromSite = doc?.site.social?.find((s) => s.network === network)?.url;
    const profile = profileUrl(network, fields.handle) ?? fromSite;
    const fetched = feeds[feedKey(network, fields.handle)];
    const manual: SocialFeedPost[] = fields.posts.flatMap((p) =>
      p.url.type === "url" ? [{ url: p.url.url, image: p.image, caption: p.caption }] : [],
    );
    const posts = (fetched?.length ? fetched : manual).slice(0, count);
    const handle = `@${fields.handle.replace(/^@/, "").split("@")[0]}`;
    const name = networkLabel(network);

    const follow = profile ? (
      <Button
        to={{ type: "url", url: profile, newTab: true }}
        role={SECONDARY}
        className="os-feed__follow"
      >
        <SocialIcon network={network} />
        {fields.followLabel} {handle}
        <span className="os-visually-hidden"> on {name} (opens in a new tab)</span>
      </Button>
    ) : null;

    return (
      <div
        className={cx("os-feed", `os-feed--${variant}`)}
        style={{ "--f-cols": variant === "grid" && count > 4 ? count / 2 : Math.min(count, 6) }}
      >
        {fields.heading ? (
          <h3 className={cx("os-feed__heading", typo(style, "heading", "h3"))}>{fields.heading}</h3>
        ) : null}
        {posts.length ? (
          <ul className="os-feed__grid" aria-label={`Recent posts by ${handle} on ${name}`}>
            {posts.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: posts are positional
              <li key={i} className="os-feed__post">
                <a className="os-feed__link" href={p.url} target="_blank" rel="noopener">
                  <Img
                    src={{ ...p.image, alt: p.image.alt || p.caption || `Post by ${handle}` }}
                    aspect="1:1"
                    sizes={`(min-width: 1200px) ${Math.round(100 / Math.min(count, 6))}vw, 33vw`}
                    className="os-feed__img"
                  />
                  <span className="os-visually-hidden"> (opens {name})</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="os-feed__placeholder">
            <ul className="os-feed__grid" aria-hidden="true">
              {Array.from({ length: count }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: decorative tiles
                <li key={i} className={`os-feed__tile os-feed__tile--${i % 4}`}>
                  <SocialIcon network={network} />
                </li>
              ))}
            </ul>
            <p className="os-feed__invite">New photos from {handle} appear here.</p>
            <EditorNotice>
              Posts are fetched from {name} each time the site is published once the feed is
              connected; until then, visitors see this panel. You can also pin posts by hand.
            </EditorNotice>
          </div>
        )}
        {follow ? <div className="os-feed__foot">{follow}</div> : null}
      </div>
    );
  },
});

export const socialFeedCss = `
.os-feed{display:grid;gap:var(--os-space-sm)}
.os-feed__heading{margin:0;color:var(--os-color-heading)}
.os-feed__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--os-space-3xs);margin:0;padding:0;list-style:none}
@container block (min-width:56rem){.os-feed__grid{grid-template-columns:repeat(var(--f-cols,6),minmax(0,1fr))}}
.os-feed--row .os-feed__grid{grid-auto-flow:column;grid-auto-columns:minmax(9rem,1fr);grid-template-columns:none;overflow-x:auto;scrollbar-width:thin}
.os-feed--mosaic .os-feed__post:first-child,.os-feed--mosaic .os-feed__tile:first-child{grid-column:span 2;grid-row:span 2}
.os-feed__link{position:relative;display:block;overflow:hidden;border-radius:var(--os-radius-sm)}
.os-block.has-radius .os-feed__link,.os-block.has-radius .os-feed__tile{border-radius:var(--radius)}
.os-feed__img{border-radius:0;transition:transform var(--os-motion-duration-slow) var(--os-motion-ease)}
.os-feed__link:hover .os-feed__img{transform:scale(var(--os-motion-hover-scale))}
.os-feed__link:focus-visible{outline:2px solid var(--os-color-focus);outline-offset:2px}
.os-feed__placeholder{display:grid;gap:var(--os-space-xs)}
.os-feed__tile{display:grid;place-items:center;aspect-ratio:1;border-radius:var(--os-radius-sm);color:var(--os-color-accent-text)}
.os-feed__tile .os-icon{width:28%;height:28%;opacity:0.55}
.os-feed__tile--0{background:var(--os-color-accent)}
.os-feed__tile--1{background:var(--os-color-accent-300);color:var(--os-color-accent-900)}
.os-feed__tile--2{background:var(--os-color-accent-700);color:var(--os-color-accent-100)}
.os-feed__tile--3{background:var(--os-color-accent-200);color:var(--os-color-accent-800)}
.os-feed__invite{margin:0;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-feed__follow .os-icon{margin-inline-end:0.4em}
.os-align-center .os-feed,.os-malign-center .os-feed{text-align:center}
.os-align-center .os-feed__foot,.os-malign-center .os-feed__foot{justify-self:center}
`;
