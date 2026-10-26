import type { TemplateSpec } from "../../lib/define";
import { episode, event } from "../../lib/define";
import { pageId } from "../../lib/ids";
import {
  block,
  body,
  formId,
  fromPreset,
  headerFrom,
  heading,
  makePage,
  page,
  photo,
  photoBackground,
  photoUrl,
  rt,
  section,
  url,
} from "../../lib/kit";

/**
 * Encore — musicians, performers and podcasters (doc 04 §7). Expressive and nocturnal: Syne /
 * DM Sans on dark plum with a bright accent; tour dates, an audio player, a press kit and an
 * episode list.
 *
 * Demo owner: Juno Vale, a synth-pop artist from Chicago who also hosts Night Shift Sessions,
 * a podcast of live studio instrumentals.
 */

const T = "encore";
const P = {
  home: pageId(T, "home"),
  music: pageId(T, "music"),
  about: pageId(T, "about"),
  contact: pageId(T, "contact"),
};

const NAME = "Juno Vale";
const TICKETS = "https://tickets.junovale.example";

/** CC0 recordings by Mesostic on Wikimedia Commons (credited in media/LICENSES.json). */
const TRACK_A =
  "https://upload.wikimedia.org/wikipedia/commons/c/c2/Synth_pop_with_4_on_the_floor.ogg";
const TRACK_B =
  "https://upload.wikimedia.org/wikipedia/commons/1/10/Friendly_Evil_Gangsta_Synth_Hip_Hop.ogg";

const audioFile = (src: string, title: string) => ({ kind: "audio", src, title });

const SPOTIFY = "https://open.spotify.com/artist/junovale-example";
const listenLinks = [
  { platform: "spotify", link: url(SPOTIFY) },
  {
    platform: "other",
    label: "Apple Music",
    link: url("https://music.apple.com/artist/junovale-example"),
  },
  { platform: "other", label: "Bandcamp", link: url("https://junovale.bandcamp.example") },
];

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Juno Vale makes late-night synth-pop in Chicago. Listen to the new album Afterglow, see tour dates and catch Night Shift Sessions.",
    [
      fromPreset("hero/photo-corner-text@1", {
        style: {
          background: photoBackground(
            photo("concert", 1440, "original", "A crowd with raised hands at a Juno Vale show"),
            0.58,
            [0.5, 0.4],
          ),
        },
        edit: {
          0: {
            eyebrow: "New album · Afterglow · Out now",
            text: "Songs for driving home after midnight",
            subheading:
              "Afterglow is Juno Vale's second album: ten songs of warm synths, drum machines and city lights, recorded over one long Chicago winter.",
          },
          1: {
            label: "Listen to Afterglow",
            link: page(P.music),
            secondaryLabel: "Tour dates",
            secondaryLink: url("/tour/"),
          },
        },
      }),
      section(
        [
          heading("Neon Tide", {
            eyebrow: "The single",
            sub: "The first song from Afterglow, recorded live to tape in one take.",
            col: 0,
          }),
          block(
            "button",
            {
              label: "Stream everywhere",
              link: url(SPOTIFY, true),
              role: "secondary",
            },
            { col: 0 },
          ),
          block(
            "audio",
            {
              audio: audioFile(TRACK_A, "Neon Tide"),
              title: "Neon Tide",
              show: "Afterglow",
              description:
                "Four on the floor, stepped pads and a melody that won't leave you alone.",
              cover: photo(
                "stageLights",
                320,
                "1:1",
                "Afterglow album cover: a crowd facing a lit stage",
              ),
              links: listenLinks,
            },
            { variant: "card", col: 1 },
          ),
        ],
        { cols: [5, 7], align: "center", gap: "lg" },
        { theme: "dark-accent", label: "Latest single" },
      ),
      fromPreset("events/list@1", {
        theme: "dark",
        collection: "tour",
        edit: {
          0: {
            heading: "Afterglow tour",
            source: { collection: "tour", filter: { upcoming: true }, limit: 6 },
            registerLabel: "Tickets",
            emptyMessage: "New dates are announced to the mailing list first.",
          },
        },
      }),
      fromPreset("testimonials/large-single@1", {
        theme: "brand",
        edit: {
          0: {
            quote: rt.doc(
              rt.p(
                "Afterglow sounds like the last train home: tired, glowing and quietly euphoric. Vale's best work yet.",
              ),
            ),
            name: "Northside Sound",
            role: "Album review, ★★★★½",
            photo: undefined,
          },
        },
      }),
      fromPreset("blog/list@1", {
        theme: "dark",
        collection: "sessions",
        edit: {
          0: {
            heading: "Night Shift Sessions",
            source: { collection: "sessions", sort: "date-desc", limit: 3 },
            linkLabel: "All episodes",
            link: url("/sessions/"),
            emptyMessage: "A new session is being recorded. Subscribe to hear it first.",
          },
        },
      }),
      fromPreset("newsletter/banner@1", {
        edit: {
          0: {
            heading: "Join the night shift",
            description:
              "Presale codes, new music and the occasional voice memo from the studio. Once a month at most.",
            buttonLabel: "Sign up",
            successMessage: "You're on the list. Check your inbox to confirm.",
          },
        },
      }),
    ],
  );
}

function music() {
  return makePage(
    P.music,
    "Music",
    "music",
    "Listen to Juno Vale's albums Afterglow and Paper Moons, singles and live sessions, on every streaming service or on vinyl.",
    [
      section(
        [
          heading("Music", {
            level: 1,
            size: "display",
            eyebrow: "Albums, singles & sessions",
            sub: "Stream everything below, or buy vinyl and downloads on Bandcamp, where most of the money reaches the artist.",
          }),
        ],
        {},
        { theme: "dark", padding: { d: "xl", m: "lg" } },
      ),
      section(
        [
          heading("From Afterglow", { eyebrow: "Listen" }),
          block(
            "audio",
            {
              audio: audioFile(TRACK_A, "Neon Tide"),
              title: "Neon Tide",
              show: "Afterglow (2026)",
              episode: 1,
              description:
                "The opening track and first single. Stepped pads, a four-on-the-floor kick and a melody written on a hotel keyboard.",
              cover: photo("stageLights", 320, "1:1", "Afterglow album cover"),
              links: listenLinks,
            },
            { variant: "episode" },
          ),
          block(
            "audio",
            {
              audio: audioFile(TRACK_B, "Slow Static"),
              title: "Slow Static",
              show: "Afterglow (2026)",
              episode: 7,
              description:
                "A slow, heavy instrumental built around a broken drum machine and a borrowed Juno-60.",
              cover: photo("stageLights", 320, "1:1", "Afterglow album cover"),
              links: listenLinks,
            },
            { variant: "episode" },
          ),
        ],
        { width: "content" },
        { theme: "dark-accent", label: "Tracks" },
      ),
      fromPreset("gallery/project-cards@1", {
        theme: "dark",
        edit: {
          0: { eyebrow: "Discography", text: "Records" },
          1: {
            items: [
              {
                image: photo("stageLights", 420, "4:5", "Afterglow album artwork"),
                heading: "Afterglow",
                body: body("Album, 2026. Ten songs recorded over one Chicago winter."),
                link: url("https://junovale.bandcamp.example/album/afterglow"),
                linkLabel: "Buy on Bandcamp",
              },
              {
                image: photo(
                  "microphone",
                  420,
                  "4:5",
                  "Paper Moons album artwork: a vintage microphone",
                ),
                heading: "Paper Moons",
                body: body("Album, 2023. The debut, made in a bedroom on Kedzie Avenue."),
                link: url("https://junovale.bandcamp.example/album/paper-moons"),
                linkLabel: "Buy on Bandcamp",
              },
              {
                image: photo(
                  "headphones",
                  420,
                  "4:5",
                  "Night Shift EP artwork: headphones on yellow",
                ),
                heading: "Night Shift EP",
                body: body("EP, 2021. Four songs and a cover of a song you'd never guess."),
                link: url("https://junovale.bandcamp.example/album/night-shift"),
                linkLabel: "Buy on Bandcamp",
              },
            ],
          },
        },
      }),
    ],
  );
}

function about() {
  return makePage(
    P.about,
    "About & press",
    "about",
    "Juno Vale biography, press photos, quotes and contacts for promoters and journalists. Download the electronic press kit.",
    [
      fromPreset("about/story-split@1", {
        theme: "dark",
        edit: {
          0: {
            image: photo("portraitIris", 520, "4:5", "Portrait of Juno Vale against a violet wall"),
          },
          1: { eyebrow: "About", text: "Juno Vale", level: "h1", size: "h1" },
          2: {
            content: rt.doc(
              rt.p(
                "Juno Vale grew up in Rockford, Illinois, playing church organ on Sundays and her brother's synthesizers the rest of the week. She moved to Chicago at nineteen and spent five years playing keys in other people's bands before releasing the Night Shift EP in 2021.",
              ),
              rt.p(
                "Her debut album Paper Moons (2023) was made in a bedroom on Kedzie Avenue and found its way onto late-night radio across the Midwest. Afterglow, her second album, was recorded live to tape with a four-piece band and has taken her on her first headline tour of North America and Europe.",
              ),
            ),
          },
          3: {
            label: "Download the press kit",
            link: url("https://junovale.example/press-kit.zip"),
            role: "secondary",
          },
        },
      }),
      fromPreset("testimonials/carousel@1", {
        theme: "dark-accent",
        edit: {
          0: {
            label: "Press",
            quotes: [
              {
                quote:
                  "Afterglow sounds like the last train home: tired, glowing and quietly euphoric.",
                name: "Northside Sound",
                role: "Album review",
              },
              {
                quote:
                  "The rare live synth act that makes a room of strangers dance like they know each other.",
                name: "The Lakeshore Reader",
                role: "Live review, Thalia Hall",
              },
              {
                quote: "One of the twenty Midwest artists to watch this year.",
                name: "Prairie Radio",
                role: "Feature, 2026",
              },
            ],
          },
        },
      }),
      fromPreset("gallery/grid@1", {
        theme: "dark",
        edit: {
          0: {
            eyebrow: "Press photos",
            text: "Photos for press",
            subheading: "High-resolution images for editorial use. Please credit Lena Ortiz.",
          },
          1: {
            images: [
              { image: photo("portraitIris", 400, "1:1", "Juno Vale portrait, violet background") },
              { image: photo("concert", 400, "1:1", "Juno Vale live, crowd with hands raised") },
              { image: photo("stageLights", 400, "1:1", "A lit stage before a Juno Vale show") },
              {
                image: photo(
                  "microphone",
                  400,
                  "1:1",
                  "A vintage microphone under warm stage light",
                ),
              },
              {
                image: photo(
                  "headphones",
                  400,
                  "1:1",
                  "Headphones on a yellow background, Night Shift EP",
                ),
              },
              {
                image: photo(
                  "conference",
                  400,
                  "1:1",
                  "The audience facing the stage at a sold-out show",
                ),
              },
            ],
            lightbox: true,
          },
        },
      }),
    ],
  );
}

function contact() {
  return makePage(
    P.contact,
    "Contact",
    "contact",
    "Booking, press and licensing contacts for Juno Vale, plus a form for promoters, venues, journalists and music supervisors.",
    [
      fromPreset("contact/form-split@1", {
        theme: "dark",
        edit: {
          0: {
            eyebrow: "Contact",
            text: "Booking, press and licensing",
            level: "h1",
            subheading:
              "For shows, interviews and sync requests. Fan mail is welcome too; it all gets read.",
          },
          1: {
            name: "Management · Lakefront Artists",
            address: "Chicago, Illinois",
            phone: undefined,
            email: "team@junovale.example",
          },
          2: {
            form: {
              id: formId(),
              name: "Booking enquiry",
              fields: [
                { type: "text", name: "name", label: "Name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "select",
                  name: "type",
                  label: "Enquiry",
                  width: "half",
                  options: [
                    "Live booking",
                    "Press & interviews",
                    "Sync & licensing",
                    "Something else",
                  ],
                },
                {
                  type: "text",
                  name: "organisation",
                  label: "Venue or publication",
                  width: "half",
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "Details",
                  required: true,
                  maxLength: 3000,
                },
              ],
              submitLabel: "Send enquiry",
              success: {
                type: "message",
                message: "Thanks! The team replies within three working days.",
              },
              notifyOwner: true,
            },
          },
        },
      }),
    ],
  );
}

const show = (
  slug: string,
  date: string,
  city: string,
  venue: string,
  address: string,
  tz: string,
  note: string,
) =>
  event(
    slug,
    {
      title: `${city} · ${venue}`,
      start: date,
      timezone: tz,
      location: { name: venue, address },
      registrationUrl: `${TICKETS}/${slug}`,
      price: "Tickets from $28",
      image: photoUrl("stageLights", 1600),
      imageAlt: `${venue} stage`,
      excerpt: note,
    },
    `${note}\n\nDoors one hour before the show. All ages unless the venue says otherwise.\n`,
  );

export const encore: TemplateSpec = {
  id: T,
  name: "Encore",
  description:
    "An expressive, nocturnal site for musicians, performers and podcasters, with an audio player, tour dates, a press kit and an episode list.",
  persona: "Musicians, performers, podcasters",
  mood: "Expressive, nocturnal",
  tags: ["music", "band", "podcast", "tour", "press kit", "audio"],
  sample: { name: NAME, tagline: "Songs for driving home after midnight." },
  thumbnail: P.home,
  media: [
    {
      kind: "audio",
      src: TRACK_A,
      title: "Synth pop with 4 on the floor",
      author: "Mesostic",
      authorUrl: "https://commons.wikimedia.org/wiki/User:Mesostic",
      source: "Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Synth_pop_with_4_on_the_floor.ogg",
      license: "CC0 1.0 (public domain dedication)",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    {
      kind: "audio",
      src: TRACK_B,
      title: "Friendly Evil Gangsta Synth Hip Hop",
      author: "Mesostic",
      authorUrl: "https://commons.wikimedia.org/wiki/User:Mesostic",
      source: "Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Friendly_Evil_Gangsta_Synth_Hip_Hop.ogg",
      license: "CC0 1.0 (public domain dedication)",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
  ],
  looks: [
    {
      id: "night-plum",
      name: "Night Plum",
      description: "Dark plum with a vivid magenta edge and wide Syne headings.",
      choices: {
        palette: {
          brand: "oklch(0.45 0.14 330)",
          neutral: "cool",
          contrast: "standard",
          source: "curated",
        },
        pairing: "syne-dm-sans",
        density: "comfortable",
        shape: "sharp",
        buttons: "solid",
        motion: "expressive",
        imageTreatment: "none",
      },
    },
    {
      id: "afterglow",
      name: "Afterglow",
      description: "Hot coral on warm black with Unbounded headings and pill buttons.",
      choices: {
        palette: {
          brand: "oklch(0.65 0.2 25)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "unbounded-figtree",
        density: "comfortable",
        shape: "round",
        buttons: "pill-solid",
        motion: "expressive",
        imageTreatment: "grain",
      },
    },
    {
      id: "chrome",
      name: "Chrome",
      description: "Monochrome with electric cyan and Archivo, for a colder, club-night feel.",
      choices: {
        palette: {
          brand: "oklch(0.62 0.13 210)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "archivo",
        density: "compact",
        shape: "sharp",
        buttons: "outline",
        motion: "subtle",
        imageTreatment: "duotone",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: NAME,
        tagline: "Songs for driving home after midnight.",
        nav: [
          { type: "page", page: P.music, label: "Music" },
          { type: "collection", collection: "tour", label: "Tour" },
          { type: "collection", collection: "sessions", label: "Podcast" },
          { type: "page", page: P.about, label: "Press" },
          { type: "page", page: P.contact, label: "Contact" },
          { type: "button", label: "Tickets", link: url("/tour/"), style: "primary" },
        ],
        header: headerFrom("header/overlay@1", { sticky: true, colorTheme: "dark" }),
        footer: fromPreset("footer/big-name@1", {
          theme: "dark-accent",
          edit: {
            0: { text: NAME },
            2: {
              content: rt.doc(
                rt.p([rt.link("Music", "/music/")]),
                rt.p([rt.link("Tour", "/tour/")]),
                rt.p([rt.link("Press kit", "/about/")]),
              ),
            },
            3: { profiles: [] },
            4: {
              content: rt.doc(
                rt.p("© 2026 Juno Vale · Management: Lakefront Artists, Chicago", "small"),
              ),
            },
          },
        }),
        social: [
          { network: "instagram", url: "https://instagram.com/junovale.example" },
          { network: "youtube", url: "https://youtube.com/@junovale.example" },
          { network: "email", url: "mailto:team@junovale.example" },
        ],
        seo: {
          titleTemplate: "%s · Juno Vale",
          description: "Late-night synth-pop from Chicago. New album Afterglow out now.",
          image: photoUrl("concert", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), music(), about(), contact()],
      collectionConfigs: {
        tour: {
          kind: "events",
          label: "Tour",
          itemLabel: "Show",
          list: { layout: "list", pageSize: 30, sort: "date-asc" },
          itemPage: { layout: "split" },
        },
        sessions: {
          kind: "podcast",
          label: "Night Shift Sessions",
          itemLabel: "Episode",
          list: { layout: "list", pageSize: 20, sort: "date-desc" },
          itemPage: { layout: "article", showDate: true },
          feed: {
            enabled: true,
            title: "Night Shift Sessions",
            description: "Live studio instrumentals and the stories behind them, from Juno Vale.",
          },
        },
      },
      collections: {
        tour: [
          show(
            "chicago-thalia-hall",
            "2026-11-21T20:00:00-06:00",
            "Chicago",
            "Thalia Hall",
            "1807 S Allport St, Chicago, IL",
            "America/Chicago",
            "Hometown album release show with a full band and strings.",
          ),
          show(
            "minneapolis-first-avenue",
            "2026-12-04T20:00:00-06:00",
            "Minneapolis",
            "First Avenue",
            "701 N 1st Ave, Minneapolis, MN",
            "America/Chicago",
            "With special guests The Lantern Kids.",
          ),
          show(
            "toronto-danforth",
            "2027-01-15T20:00:00-05:00",
            "Toronto",
            "The Danforth Music Hall",
            "147 Danforth Ave, Toronto, ON",
            "America/Toronto",
            "First Canadian headline show.",
          ),
          show(
            "brooklyn-elsewhere",
            "2027-01-22T20:00:00-05:00",
            "Brooklyn",
            "Elsewhere",
            "599 Johnson Ave, Brooklyn, NY",
            "America/New_York",
            "Late show: doors at 10pm, Juno on at 11:30.",
          ),
          show(
            "london-electric-ballroom",
            "2027-02-18T19:30:00+00:00",
            "London",
            "Electric Ballroom",
            "184 Camden High St, London",
            "Europe/London",
            "First UK headline date.",
          ),
        ],
        sessions: [
          episode(
            "session-12-slow-static",
            {
              title: "Session 12: Slow Static",
              date: "2026-10-16",
              audio: { src: TRACK_B, duration: 375, mime: "audio/ogg" },
              episode: 12,
              season: 2,
              image: photoUrl("microphone", 1600),
              imageAlt: "A vintage microphone in warm light",
              excerpt:
                "A slow instrumental built on a broken drum machine, and why I kept the mistakes in.",
            },
            "This session started with a drum machine that skips every eighth bar. Instead of fixing it, we built the song around it.\n",
          ),
          episode(
            "session-11-neon-tide",
            {
              title: "Session 11: Neon Tide, live to tape",
              date: "2026-10-02",
              audio: { src: TRACK_A, duration: 198, mime: "audio/ogg" },
              episode: 11,
              season: 2,
              image: photoUrl("stageLights", 1600),
              imageAlt: "A crowd facing a lit stage",
              excerpt:
                "The single, recorded in one take with the touring band, plus the story of the hotel keyboard.",
            },
            "We tracked this in one take at the end of a long day. You can hear Marco counting us in.\n",
          ),
          episode(
            "session-10-headphones-on",
            {
              title: "Session 10: Headphones on",
              date: "2026-09-18",
              audio: { src: TRACK_B, duration: 375, mime: "audio/ogg" },
              episode: 10,
              season: 2,
              image: photoUrl("headphones", 1600),
              imageAlt: "Over-ear headphones on a yellow background",
              excerpt: "A late-night mix of the instrumentals that didn't make the album.",
            },
            "Three sketches from the Afterglow sessions, stitched into one long piece for headphones.\n",
          ),
        ],
      },
    };
  },
};
