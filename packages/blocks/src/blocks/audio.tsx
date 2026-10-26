import { cx, Img, Link, mediaUrl, useRenderContext } from "@openspace/renderer";
import { defineBlock, f, type Link as LinkValue } from "@openspace/schema";
import { DEMO, EditorNotice, formatDate, typo, useLocale } from "../shared";

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
};

/** Audio MIME type from a file name or URL (`undefined` when unknown). */
export function audioMime(src: string): string | undefined {
  const ext = src.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext];
}

const PLATFORMS = [
  { value: "apple", label: "Apple Podcasts" },
  { value: "spotify", label: "Spotify" },
  { value: "youtube", label: "YouTube" },
  { value: "rss", label: "RSS feed" },
  { value: "other", label: "Other" },
] as const;

export const audioBlock = defineBlock({
  type: "audio",
  version: 1,
  category: "media",
  label: "Audio / podcast episode",
  icon: "audio-lines",
  description:
    "An audio player for a track or podcast episode, with cover, notes and listen links.",
  fields: {
    audio: f.media({
      kinds: ["audio"],
      optional: true,
      help: "MP3, M4A, OGG or WAV — uploaded or a public https link",
    }),
    title: f.text({ maxLength: 120, default: "A one-minute bell to begin" }),
    show: f.text({ optional: true, maxLength: 80, help: "Podcast or album name" }),
    episode: f.number({ optional: true, min: 0, max: 9999, integer: true }),
    date: f.text({ optional: true, maxLength: 10, help: "Release date, e.g. 2026-10-20" }),
    description: f.text({ optional: true, multiline: true, maxLength: 600 }),
    cover: f.image({ optional: true, aspect: "1:1" }),
    links: f.list({
      max: 6,
      itemLabel: "platform",
      fields: {
        platform: f.select({ options: PLATFORMS }),
        label: f.text({ optional: true, maxLength: 40, help: "For 'Other'" }),
        link: f.link({ allow: ["url"] }),
      },
      default: [],
    }),
    credit: f.text({ optional: true, maxLength: 200, help: "Recording or music credit" }),
  },
  variants: ["episode", "card", "minimal"],
  styleSlots: ["colorTheme", "padding", "radius", "shadow", "animation", "typography.title"],
  defaults: {
    fields: {
      audio: {
        kind: "audio",
        src: "https://upload.wikimedia.org/wikipedia/commons/1/17/Small_tibetan_singing_bowl.ogg",
        title: "Small Tibetan singing bowl",
      },
      show: "Juniper Practice Notes",
      episode: 12,
      date: "2026-10-20",
      description:
        "Find a comfortable seat and close your eyes. Let the sound of a small singing bowl settle your attention before you practise — or before a difficult meeting.",
      cover: DEMO.beachClass,
      credit: "Recording: Cassa342 via Wikimedia Commons (CC BY-SA 4.0).",
    },
  },
  ai: {
    purpose:
      "Plays one audio file — a podcast episode, track, talk or guided practice — with its notes.",
    whenToUse:
      "Episode pages, music and talks. Add listen links for the podcast apps the show is on. `minimal` is just the player and title.",
    avoid:
      "Autoplay (never supported); audio without a written summary or transcript link for deaf visitors.",
  },
  render: ({ fields, variant, style }) => {
    const { basePath } = useRenderContext();
    const locale = useLocale();
    if (!fields.audio)
      return (
        <EditorNotice>Choose an audio file or paste a public https link to play.</EditorNotice>
      );
    const src = mediaUrl(fields.audio.src, basePath);
    const type = audioMime(fields.audio.src);
    const meta = [
      fields.show,
      fields.episode !== undefined ? `Episode ${fields.episode}` : undefined,
      fields.date && /^\d{4}-\d{2}-\d{2}$/.test(fields.date)
        ? formatDate(fields.date, locale, { dateStyle: "medium" })
        : fields.date,
    ].filter(Boolean);
    const showCover = variant !== "minimal" && fields.cover;
    return (
      <article className={cx("os-audio", `os-audio--${variant}`, showCover && "has-cover")}>
        {showCover && fields.cover ? (
          <Img
            src={fields.cover}
            aspect="1:1"
            sizes={variant === "episode" ? "(min-width: 768px) 240px, 40vw" : "112px"}
            className="os-audio__cover"
          />
        ) : null}
        <div className="os-audio__body">
          {meta.length ? <p className="os-audio__meta">{meta.join(" · ")}</p> : null}
          <h3
            className={cx(
              "os-audio__title",
              typo(style, "title", variant === "episode" ? "h3" : "h4"),
            )}
          >
            {fields.title}
          </h3>
          {fields.description && variant !== "minimal" ? (
            <p className="os-audio__desc">{fields.description}</p>
          ) : null}
          {/* biome-ignore lint/a11y/useMediaCaption: audio has no caption track; notes and transcript links carry the text */}
          <audio className="os-audio__player" controls preload="none">
            <source src={src} type={type} />
            <a href={src}>Download the audio</a>
          </audio>
          {fields.links.length ? (
            <ul className="os-audio__links" aria-label="Listen on">
              {fields.links.map((l, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
                <li key={i}>
                  <Link to={l.link as LinkValue} className="os-audio__link">
                    {l.platform === "other"
                      ? (l.label ?? "Listen")
                      : PLATFORMS.find((p) => p.value === l.platform)?.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {fields.credit ? <p className="os-audio__credit">{fields.credit}</p> : null}
        </div>
      </article>
    );
  },
});

export const audioCss = `
.os-audio{display:grid;gap:var(--os-space-sm);align-items:start}
.os-audio__body{display:grid;gap:var(--os-space-2xs);min-width:0}
.os-audio__cover{width:7rem}
@container block (min-width:36rem){.os-audio.has-cover{grid-template-columns:auto minmax(0,1fr)}}
@container block (min-width:48rem){.os-audio--episode.has-cover{grid-template-columns:minmax(0,15rem) minmax(0,1fr);gap:var(--os-space-md)}.os-audio--episode .os-audio__cover{width:100%}}
.os-audio__meta{margin:0;font-family:var(--os-type-eyebrow-font-family);font-size:var(--os-type-eyebrow-font-size);letter-spacing:var(--os-type-eyebrow-letter-spacing);text-transform:var(--os-type-eyebrow-text-transform);font-weight:var(--os-type-eyebrow-font-weight);color:var(--os-color-link)}
.os-audio__title{margin:0;color:var(--os-color-heading)}
.os-audio__desc{margin:0;color:var(--os-color-text);max-inline-size:var(--os-measure)}
.os-audio__player{display:block;width:100%;height:3rem;margin-top:var(--os-space-2xs);color-scheme:light dark;border-radius:var(--os-radius-full)}
.os-audio__links{display:flex;flex-wrap:wrap;gap:var(--os-space-3xs) var(--os-space-xs);margin:0;padding:0;list-style:none;font-size:var(--os-type-small-font-size);font-weight:var(--os-font-weight-strong)}
.os-audio__link{color:var(--os-color-link)}
.os-audio__credit{margin:0;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-audio--card{padding:var(--os-space-sm);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-block.has-radius .os-audio--card{border-radius:var(--radius)}
.os-block.os-themed .os-audio--card{background:transparent;padding:0}
`;
