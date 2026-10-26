import { cx, Img, mediaUrl, useRenderContext } from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";
import type { ReactNode } from "react";

const ASPECTS = [
  { value: "16:9", label: "Wide 16:9" },
  { value: "21:9", label: "Cinematic 21:9" },
  { value: "4:3", label: "Classic 4:3" },
  { value: "1:1", label: "Square 1:1" },
  { value: "9:16", label: "Vertical 9:16" },
] as const;

export interface VideoEmbed {
  provider: "youtube" | "vimeo" | "peertube";
  /** Player URL loaded on click (privacy-enhanced where the provider offers it). */
  embed: string;
  /** The page to watch on the provider's site (no-JS fallback). */
  watch: string;
  /** Provider thumbnail when one is available without an API call. */
  thumbnail?: { src: string; srcset?: string; width: number; height: number };
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Parse a YouTube, Vimeo or PeerTube URL into lite-embed parts; `undefined` if unsupported. */
export function parseVideoUrl(input: string | undefined): VideoEmbed | undefined {
  if (!input) return undefined;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  const host = url.hostname.replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  let yt: string | undefined;
  if (host === "youtu.be") yt = parts[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") yt = url.searchParams.get("v") ?? undefined;
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) yt = parts[1];
  }
  if (yt && YT_ID.test(yt)) {
    const start = Number.parseInt(
      url.searchParams.get("t") ?? url.searchParams.get("start") ?? "",
      10,
    );
    const q = Number.isFinite(start) && start > 0 ? `&start=${start}` : "";
    return {
      provider: "youtube",
      embed: `https://www.youtube-nocookie.com/embed/${yt}?rel=0${q}`,
      watch: `https://www.youtube.com/watch?v=${yt}`,
      thumbnail: {
        src: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
        srcset: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg 480w, https://i.ytimg.com/vi/${yt}/sddefault.jpg 640w`,
        width: 480,
        height: 360,
      },
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parts.find((p) => /^\d{5,12}$/.test(p));
    if (id)
      return {
        provider: "vimeo",
        embed: `https://player.vimeo.com/video/${id}?dnt=1`,
        watch: `https://vimeo.com/${id}`,
      };
  }

  // PeerTube instances: /w/<id>, /videos/watch/<id>, /videos/embed/<id>
  let pt: string | undefined;
  if (parts[0] === "w" && parts[1] && parts[1] !== "p") pt = parts[1];
  else if (parts[0] === "videos" && (parts[1] === "watch" || parts[1] === "embed")) pt = parts[2];
  if (pt && /^[A-Za-z0-9-]{8,40}$/.test(pt)) {
    return {
      provider: "peertube",
      embed: `https://${url.host}/videos/embed/${pt}?peertubeLink=0&warningTitle=0`,
      watch: `https://${url.host}/w/${pt}`,
    };
  }
  return undefined;
}

const PROVIDER_NAME = { youtube: "YouTube", vimeo: "Vimeo", peertube: "PeerTube" } as const;

export const videoBlock = defineBlock({
  type: "video",
  version: 1,
  category: "media",
  label: "Video",
  icon: "play",
  description:
    "YouTube, Vimeo and PeerTube embeds that load only on click, or a self-hosted video file.",
  fields: {
    source: f.select({
      options: [
        { value: "embed", label: "YouTube, Vimeo or PeerTube" },
        { value: "file", label: "Video file" },
      ],
      default: "embed",
      display: "segmented",
    }),
    url: f.text({
      optional: true,
      maxLength: 500,
      label: "Video link",
      placeholder: "https://www.youtube.com/watch?v=…",
      help: "Paste the address of the video page",
    }),
    file: f.media({ optional: true, kinds: ["video"], label: "Video file" }),
    title: f.text({
      maxLength: 120,
      default: "Big Buck Bunny — an open movie from the Blender Foundation",
      help: "Read by screen readers and shown on the cover",
      ai: "Describe the video in a few words; required for accessibility.",
    }),
    poster: f.image({
      optional: true,
      aspect: "16:9",
      help: "Cover image (YouTube covers are used automatically)",
    }),
    caption: f.text({ optional: true, maxLength: 200 }),
    aspect: f.select({ options: ASPECTS, default: "16:9", label: "Aspect ratio" }),
    background: f.boolean({
      default: false,
      label: "Play silently on loop",
      help: "Video files only. Never plays for visitors who prefer reduced motion.",
    }),
  },
  variants: ["default", "framed", "cinematic"],
  styleSlots: ["radius", "shadow", "padding", "animation"],
  defaults: {
    fields: {
      url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      caption: "Ten minutes of open-source animation, released under Creative Commons.",
    },
  },
  ai: {
    purpose: "A video from YouTube, Vimeo or PeerTube, or an uploaded video file.",
    whenToUse:
      "Walkthroughs, talks, trailers and atmosphere. The player loads only when a visitor presses play, so pages stay fast.",
    avoid:
      "Autoplaying sound; background loops longer than ~20 seconds; using a video where a photo says the same thing.",
  },
  render: ({ fields, variant }) => <Video fields={fields} variant={variant} />,
});

type VideoFields = Parameters<typeof videoBlock.render>[0]["fields"];

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
    <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
  </svg>
);

function Video({ fields, variant }: { fields: VideoFields; variant: string }) {
  const ctx = useRenderContext();
  const aspect = fields.aspect.replace(":", " / ");
  const caption =
    fields.caption || variant === "framed" ? (
      <figcaption className="os-videoblock__caption">
        {variant === "framed" ? <span className="os-videoblock__title">{fields.title}</span> : null}
        {fields.caption ? <span>{fields.caption}</span> : null}
      </figcaption>
    ) : null;
  const wrap = (player: ReactNode) => (
    <figure className={cx("os-videoblock", `os-videoblock--${variant}`)}>
      {player}
      {caption}
    </figure>
  );

  if (fields.source === "file") {
    if (!fields.file)
      return wrap(<Missing mode={ctx.mode} text="Choose a video file" aspect={aspect} />);
    const src = mediaUrl(fields.file.src, ctx.basePath);
    const posterSrc = fields.poster?.src ?? fields.file.poster;
    const poster = posterSrc ? mediaUrl(posterSrc, ctx.basePath) : undefined;
    const bg = fields.background;
    return wrap(
      <div className="os-video os-video--file" style={{ "--aspect": aspect }}>
        <video
          controls
          playsInline
          preload={bg ? "none" : "metadata"}
          poster={poster}
          title={fields.title}
          loop={bg || fields.file.loop || undefined}
          muted={bg || undefined}
          data-os-behavior={bg ? "video-lite" : undefined}
          data-os-autoplay={bg ? "" : undefined}
        >
          <source src={src} />
          {fields.file.captions ? (
            <track
              kind="captions"
              src={mediaUrl(fields.file.captions, ctx.basePath)}
              srcLang={ctx.doc?.site.locale.split("-")[0] ?? "en"}
              label="Captions"
              default
            />
          ) : null}
          <a href={src}>Download the video</a>
        </video>
      </div>,
    );
  }

  const embed = parseVideoUrl(fields.url);
  if (!embed)
    return wrap(
      <Missing
        mode={ctx.mode}
        aspect={aspect}
        text={
          fields.url
            ? "This video link isn't supported yet"
            : "Paste a YouTube, Vimeo or PeerTube link"
        }
      />,
    );
  const provider = PROVIDER_NAME[embed.provider];
  return wrap(
    <div
      className="os-video os-video--lite"
      style={{ "--aspect": aspect }}
      data-os-behavior="video-lite"
      data-os-embed={embed.embed}
      data-os-title={fields.title}
    >
      {fields.poster ? (
        <Img
          src={fields.poster}
          sizes="(min-width: 1200px) 60vw, 100vw"
          treatment="none"
          className="os-video__poster"
        />
      ) : embed.thumbnail ? (
        <img
          src={embed.thumbnail.src}
          srcSet={embed.thumbnail.srcset}
          sizes="(min-width: 768px) 60vw, 100vw"
          width={embed.thumbnail.width}
          height={embed.thumbnail.height}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="os-video__blank" aria-hidden="true" />
      )}
      {variant === "cinematic" ? <span className="os-video__label">{fields.title}</span> : null}
      <button type="button" className="os-video__play" aria-label={`Play video: ${fields.title}`}>
        <span>
          <PlayIcon />
        </span>
      </button>
      <a className="os-video__fallback" href={embed.watch} rel="noopener" target="_blank">
        <span>Watch on {provider}</span>
      </a>
    </div>,
  );
}

function Missing({ mode, text, aspect }: { mode: string; text: string; aspect: string }) {
  if (mode === "production") return null;
  return (
    <div className="os-video os-video--empty" style={{ "--aspect": aspect }} role="note">
      <span>{text}</span>
    </div>
  );
}

export const videoCss = `
.os-videoblock{display:grid;gap:var(--os-space-2xs);margin:0}
.os-videoblock__caption{display:grid;gap:var(--os-space-3xs);font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height);color:var(--os-color-text-muted)}
.os-videoblock__title{font-family:var(--os-font-heading);font-weight:var(--os-font-weight-heading);font-size:var(--os-type-h4-font-size);line-height:var(--os-type-h4-line-height);color:var(--os-color-heading)}
.os-block.has-radius .os-video{border-radius:var(--radius)}
.os-video>.os-img{position:absolute;inset:0;height:100%;aspect-ratio:auto;border-radius:0;padding:0;clip-path:none}
.os-video__blank{position:absolute;inset:0;background:radial-gradient(120% 90% at 30% 20%,var(--os-color-neutral-700),var(--os-color-neutral-950))}
.os-video--lite>img{transition:transform var(--os-motion-duration-slow) var(--os-motion-ease),filter var(--os-motion-duration-base) var(--os-motion-ease)}
.os-video--lite:hover>img{transform:scale(var(--os-motion-hover-scale))}
.os-video__play{z-index:2;cursor:pointer}
.os-video__play::before{content:"";position:absolute;inset:0;background:linear-gradient(to top,color-mix(in oklab,var(--os-color-neutral-950) 35%,transparent),color-mix(in oklab,var(--os-color-neutral-950) 0%,transparent) 55%)}
.os-video__play>span{position:relative}
.os-video__fallback{position:absolute;inset:0;z-index:3;display:none;place-items:center;color:var(--os-color-neutral-50);text-decoration:none}
.os-video__fallback>span{padding:0.6em 1.1em;border-radius:var(--os-radius-full);background:color-mix(in oklab,var(--os-color-neutral-950) 65%,transparent)}
html:not(.os-js) .os-video__play{display:none}
html:not(.os-js) .os-video__fallback{display:grid}
.os-video__label{position:absolute;inset:auto auto var(--os-space-sm) var(--os-space-sm);z-index:3;max-width:min(36rem,80%);font-family:var(--os-font-heading);font-weight:var(--os-font-weight-heading);font-size:var(--os-type-h3-font-size);line-height:var(--os-type-h3-line-height);color:var(--os-color-neutral-50);text-wrap:balance;pointer-events:none}
.os-video--empty{display:grid;place-items:center;padding:var(--os-space-sm);color:var(--os-color-neutral-200);font-size:var(--os-type-small-font-size);text-align:center}
.os-video--file>video{object-fit:contain;background:var(--os-color-neutral-950)}
.os-videoblock--framed{padding:var(--os-space-xs);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-videoblock--framed .os-videoblock__caption{padding:var(--os-space-2xs) var(--os-space-3xs) var(--os-space-3xs)}
.os-videoblock--cinematic .os-video{border-radius:0;box-shadow:var(--os-shadow-lg)}
.os-videoblock--cinematic .os-video__play{place-items:end end;padding:var(--os-space-sm)}
.os-videoblock--cinematic .os-video__play>span{width:4rem;height:4rem}
.os-videoblock--cinematic .os-videoblock__caption{text-align:center}
`;
