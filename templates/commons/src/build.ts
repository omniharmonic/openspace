import type { TemplateSpec } from "../../lib/define";
import { event } from "../../lib/define";
import {
  block,
  collectionPath,
  definePages,
  formId,
  fromPreset,
  headerFrom,
  heading,
  linkColumn,
  makePage,
  page,
  photo,
  photoUrl,
  rt,
  section,
} from "../../lib/kit";

/**
 * Commons — coalitions, cooperatives and movements (doc 04 §7). Grounded and collective:
 * Spectral / Epilogue in earth greens under an open sky; a partner directory, a map, events and
 * a join form.
 *
 * Demo owner: the Hudson Valley Food Commons, a cooperative of 42 farms, kitchens and food
 * banks that share storage, trucks and buying power.
 */

const T = "commons";
const PAGES = definePages(T, {
  home: "",
  // Not "members": `/members/` is members-only by definition (gated, never on GitHub Pages),
  // and this is the public member directory.
  members: "directory",
  join: "join",
  about: "about",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Hudson Valley Food Commons";
const EMAIL = "hello@hvfoodcommons.example";

/** One member line in the directory: name, town and what they bring. */
const member = (name: string, town: string, what: string) =>
  rt.p([rt.bold(name), ` · ${town}. ${what}`]);

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "The Hudson Valley Food Commons is a cooperative of 42 farms, kitchens and food banks sharing cold storage, trucks and buying power.",
    [
      fromPreset("hero/image-below@1", {
        edit: {
          heading: {
            eyebrow: "A cooperative of 42 farms, kitchens and food banks",
            text: "Feeding the valley, together",
            subheading:
              "We share cold storage, delivery trucks and buying power so that small farms stay in business and good food reaches every town from Kingston to Beacon.",
          },
          button: {
            label: "Join the commons",
            link: page(P.join),
            secondaryLabel: "Meet our members",
            secondaryLink: page(P.members),
          },
          image: {
            image: photo(
              "autumnFarm",
              1280,
              "21:9",
              "A member farm among autumn trees below the mountains",
            ),
          },
        },
      }),
      fromPreset("stats/with-image@1", {
        edit: {
          image: {
            image: photo("seedlings", 480, "4:5", "Seedlings sprouting in a tray at a member farm"),
          },
          heading: { eyebrow: "Since 2019", text: "What we've built by sharing" },
          stats: {
            items: [
              { value: "42", label: "Member organizations" },
              { value: "1.2M lbs", label: "Food moved in 2025" },
              { value: "9", label: "Counties served" },
            ],
          },
        },
      }),
      fromPreset("services/icon-grid@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "How it works",
            text: "Shared infrastructure, owned in common",
            subheading:
              "Every member owns one share and gets one vote. Together we own what none of us could afford alone.",
          },
          "icon-list": {
            items: [
              {
                icon: "home",
                title: "Cold storage",
                text: "A 6,000-square-foot cooler in Kingston, open to members around the clock.",
              },
              {
                icon: "truck",
                title: "Shared trucks",
                text: "Three refrigerated trucks run routes four days a week.",
              },
              {
                icon: "shopping-bag",
                title: "Bulk buying",
                text: "Seed, packaging and fuel bought together at wholesale prices.",
              },
              {
                icon: "graduation-cap",
                title: "Training",
                text: "Food-safety, bookkeeping and grant-writing workshops every season.",
              },
              {
                icon: "heart-handshake",
                title: "Food access",
                text: "Surplus goes to member food banks within 24 hours.",
              },
              {
                icon: "globe",
                title: "A shared voice",
                text: "We speak together at county and state hearings on farmland.",
              },
            ],
          },
        },
      }),
      section(
        [
          heading("Where our members are", {
            eyebrow: "The map",
            sub: "From orchards in Ulster County to kitchens in Poughkeepsie and pantries in Newburgh. The cooperative's hub is the shared cooler in Kingston.",
          }),
          block(
            "map",
            {
              name: "Food Commons hub",
              address: "61 Prince Street, Kingston, NY 12401",
              latitude: 41.9271,
              longitude: -73.9974,
              zoom: 9,
              details: "Member deliveries Monday to Thursday, 6am to 2pm.",
              linkLabel: "Open in Maps",
              aspect: "16:9",
            },
            { variant: "split" },
          ),
        ],
        {},
        { theme: "light", label: "Map" },
      ),
      fromPreset("logos/grid@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Members",
            text: "Some of the 42 members",
            subheading:
              "Farms, kitchens, food banks and grocers, from one-acre market gardens to a 400-family pantry.",
          },
          "logo-strip": {
            logos: [
              { name: "Rondout Valley Growers" },
              { name: "Esopus Creek Farm" },
              { name: "Kingston Community Kitchen" },
              { name: "Newburgh Food Pantry" },
              { name: "Wallkill Orchards" },
              { name: "Catskill Grain Co." },
              { name: "Shawangunk Dairy" },
            ],
          },
        },
      }),
      fromPreset("events/list@1", {
        collection: "gatherings",
        edit: {
          events: {
            heading: "Gatherings & assemblies",
            source: { collection: "gatherings", filter: { upcoming: true }, limit: 4 },
            registerLabel: "RSVP",
            emptyMessage: "The next general assembly will be announced to members soon.",
          },
        },
      }),
      fromPreset("cta/card-over-photo@1", {
        edit: {
          image: {
            image: photo(
              "friendsSunset",
              1100,
              "original",
              "Members of the cooperative together at sunset",
            ),
          },
          text: {
            content: rt.doc(
              rt.h(2, "There's room at the table", "h2"),
              rt.p(
                "Farms, kitchens, pantries and grocers in the Hudson Valley can join for a one-time share and a sliding-scale yearly fee.",
              ),
            ),
          },
          button: { label: "Apply to join", link: page(P.join) },
        },
      }),
    ],
  );
}

function members() {
  return makePage(
    P.members,
    "Members",
    PAGES.slug.members,
    "The directory of Hudson Valley Food Commons members: farms, kitchens, food banks and grocers across nine counties.",
    [
      fromPreset("hero/centered@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Directory",
            text: "Our members",
            subheading:
              "Forty-two organizations who own the commons together. Buy from them, volunteer with them, or ask them what membership has changed.",
          },
          button: {
            label: "Become a member",
            link: page(P.join),
            secondaryLabel: "How we govern",
            secondaryLink: page(P.about),
          },
        },
      }),
      section(
        [
          heading("Member directory", {
            eyebrow: "By type",
            sub: "A selection from the full directory, which members can download as a spreadsheet.",
          }),
          block(
            "tabs",
            {
              label: "Member types",
              items: [
                {
                  label: "Farms",
                  content: rt.doc(
                    member(
                      "Rondout Valley Growers",
                      "Accord",
                      "Twelve acres of vegetables and a winter CSA.",
                    ),
                    member(
                      "Esopus Creek Farm",
                      "Saugerties",
                      "Pastured eggs and poultry; runs the egg-washing line in the hub.",
                    ),
                    member(
                      "Wallkill Orchards",
                      "New Paltz",
                      "Heirloom apples, pears and fresh cider.",
                    ),
                    member(
                      "Shawangunk Dairy",
                      "Gardiner",
                      "Grass-fed milk, yogurt and a cheese cave.",
                    ),
                  ),
                },
                {
                  label: "Kitchens",
                  content: rt.doc(
                    member(
                      "Kingston Community Kitchen",
                      "Kingston",
                      "Shared commercial kitchen and incubator for 30 food businesses.",
                    ),
                    member(
                      "Catskill Grain Co.",
                      "Catskill",
                      "Stone-milled flour from member grain.",
                    ),
                    member(
                      "Hearth & Harvest Catering",
                      "Hudson",
                      "Cooks surplus into 600 school lunches a week.",
                    ),
                  ),
                },
                {
                  label: "Food access",
                  content: rt.doc(
                    member(
                      "Newburgh Food Pantry",
                      "Newburgh",
                      "Serves 400 families weekly; first stop for surplus produce.",
                    ),
                    member(
                      "Beacon Free Fridge",
                      "Beacon",
                      "Six community fridges restocked daily by volunteers.",
                    ),
                    member(
                      "Ulster Senior Meals",
                      "Kingston",
                      "Delivers 900 meals a week to homebound neighbors.",
                    ),
                  ),
                },
                {
                  label: "Grocers",
                  content: rt.doc(
                    member(
                      "Main Street Market",
                      "Rosendale",
                      "A worker-owned grocery stocking 60 member products.",
                    ),
                    member(
                      "Hudson Co-op Grocery",
                      "Hudson",
                      "Member-owned since 1974; hosts the Saturday market.",
                    ),
                  ),
                },
              ],
            },
            { variant: "underline" },
          ),
        ],
        { width: "content" },
        { theme: "light", label: "Member directory", preset: "faq/by-topic@1" },
      ),
      fromPreset("testimonials/pair@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "In their words", text: "What membership changed" },
          "testimonial:1": {
            quote: rt.doc(
              rt.p(
                "The shared cooler let us sell to schools for the first time. That contract kept the farm open through a terrible August.",
              ),
            ),
            name: "Lena Morales",
            role: "Rondout Valley Growers",
            photo: photo("portraitMaya", 160, "1:1", "Portrait of Lena Morales"),
          },
          "testimonial:2": {
            quote: rt.doc(
              rt.p(
                "We used to throw out produce on Mondays. Now it reaches the pantry by Tuesday morning, still cold.",
              ),
            ),
            name: "Andre Wallace",
            role: "Newburgh Food Pantry",
            photo: photo("portraitMarcus", 160, "1:1", "Portrait of Andre Wallace"),
          },
        },
      }),
    ],
  );
}

function join() {
  return makePage(
    P.join,
    "Join",
    "join",
    "Apply to join the Hudson Valley Food Commons. One member share, one vote and a sliding-scale yearly fee for farms, kitchens and pantries.",
    [
      fromPreset("hero/split-image@1", {
        theme: "light",
        edit: {
          heading: {
            eyebrow: "Membership",
            text: "Own a share of the valley's food system",
            subheading:
              "Any farm, kitchen, food bank or grocer in our nine counties can join. Members buy one share, get one vote at the general assembly and use everything the commons owns.",
          },
          button: {
            label: "Apply now",
            link: page(P.join, "apply"),
            secondaryLabel: "Read the bylaws",
            secondaryLink: page(P.about),
            note: "Applications are reviewed at the next monthly members' meeting.",
          },
          image: {
            image: photo(
              "gardenTrowel",
              600,
              "4:5",
              "Gloved hands planting seedlings at a member farm",
            ),
          },
        },
      }),
      fromPreset("pricing/compact-list@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Dues", text: "Sliding-scale membership" },
          pricing: {
            plans: [
              {
                name: "Member share",
                price: "$250",
                period: "one time",
                description: "Refundable if you leave. Payable over twelve months.",
                features: [],
                buttonLabel: "Apply",
                link: page(P.join, "apply"),
                featured: false,
              },
              {
                name: "Yearly dues, small",
                price: "$120",
                period: "per year",
                description: "Revenue under $250,000, or any food bank or pantry.",
                features: [],
                buttonLabel: "Apply",
                link: page(P.join, "apply"),
                featured: false,
              },
              {
                name: "Yearly dues, larger",
                price: "$480",
                period: "per year",
                description: "Revenue over $250,000. Helps keep dues low for everyone else.",
                features: [],
                buttonLabel: "Apply",
                link: page(P.join, "apply"),
                featured: false,
              },
            ],
            note: "Storage and trucking are billed at cost, by the pallet and by the mile.",
          },
        },
      }),
      fromPreset("contact/form-split@1", {
        anchor: "apply",
        edit: {
          heading: {
            eyebrow: "Apply",
            text: "Tell us about your organization",
            subheading:
              "A member of the steering committee will call you within two weeks to talk it through.",
          },
          "contact-info": {
            name: NAME,
            address: "61 Prince Street\nKingston, NY 12401",
            phone: "+1 (845) 555-0119",
            email: EMAIL,
          },
          form: {
            form: {
              id: formId(),
              name: "Membership application",
              fields: [
                { type: "text", name: "name", label: "Your name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "text",
                  name: "organization",
                  label: "Organization",
                  required: true,
                  width: "half",
                },
                {
                  type: "select",
                  name: "type",
                  label: "Type",
                  required: true,
                  width: "half",
                  options: [
                    "Farm",
                    "Kitchen or food business",
                    "Food bank or pantry",
                    "Grocer",
                    "Other",
                  ],
                },
                { type: "text", name: "county", label: "County", width: "half" },
                {
                  type: "textarea",
                  name: "needs",
                  label: "What would you use the commons for?",
                  required: true,
                  maxLength: 3000,
                },
              ],
              submitLabel: "Send application",
              success: {
                type: "message",
                message: "Thank you! The steering committee will call you within two weeks.",
              },
              notifyOwner: true,
            },
          },
        },
      }),
    ],
  );
}

function about() {
  return makePage(
    P.about,
    "About",
    "about",
    "How the Hudson Valley Food Commons began in 2019, how members govern it together and who serves on the steering committee.",
    [
      fromPreset("about/story-editorial@1", {
        edit: {
          heading: {
            eyebrow: "About",
            text: "Owned together, run in the open",
            level: "h1",
            size: "h1",
          },
          text: {
            content: rt.doc(
              rt.p(
                "In the spring of 2019, eleven farmers met in the back room of the Kingston library to talk about a problem none of them could solve alone. Each had lost a wholesale buyer because they couldn't keep produce cold long enough to deliver it. Together, they could afford a cooler. Within a year they had a cooler, a truck and twenty more members.",
              ),
              rt.p(
                "The Food Commons is a cooperative: every member owns one share and has one vote. A steering committee of seven, elected each January, runs the day-to-day; big decisions go to the general assembly, which meets four times a year in a different member's barn. Our budget, minutes and bylaws are published for every member to read.",
              ),
            ),
          },
        },
      }),
      fromPreset("about/milestones@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "History",
            text: "Six years of sharing",
            subheading: "From a borrowed back room to the valley's largest food cooperative.",
          },
          timeline: {
            items: [
              {
                date: "2019",
                title: "Eleven farmers, one cooler",
                text: "The founding members buy a used walk-in cooler and park it behind a church in Kingston.",
              },
              {
                date: "2021",
                title: "The first truck",
                text: "A state grant buys a refrigerated truck; food banks join as members.",
              },
              {
                date: "2023",
                title: "The Prince Street hub",
                text: "Members buy a former bakery warehouse together and build a shared cold store.",
              },
              {
                date: "2025",
                title: "1.2 million pounds",
                text: "Forty-two members move more food together than any of them could alone.",
              },
            ],
          },
        },
      }),
      fromPreset("team/circles@1", {
        edit: {
          heading: { eyebrow: "Steering committee", text: "Elected by members" },
          team: {
            people: [
              {
                name: "Lena Morales",
                role: "Chair · Rondout Valley Growers",
                photo: photo("portraitMaya", 280, "1:1", "Portrait of Lena Morales"),
              },
              {
                name: "Andre Wallace",
                role: "Treasurer · Newburgh Food Pantry",
                photo: photo("portraitMarcus", 280, "1:1", "Portrait of Andre Wallace"),
              },
              {
                name: "Ruth Okonkwo",
                role: "Secretary · Catskill Grain Co.",
                photo: photo("portraitOwen", 280, "1:1", "Portrait of Ruth Okonkwo"),
              },
            ],
          },
        },
      }),
    ],
  );
}

export const commons: TemplateSpec = {
  id: T,
  name: "Commons",
  description:
    "A grounded, collective site for coalitions, cooperatives and movements, with a member directory, a map, gatherings and a join form.",
  persona: "Coalitions, cooperatives, movements",
  mood: "Grounded, collective",
  tags: ["cooperative", "coalition", "movement", "directory", "membership", "events"],
  sample: { name: NAME, tagline: "Feeding the valley, together." },
  thumbnail: P.home,
  looks: [
    {
      id: "earth-sky",
      name: "Earth & Sky",
      description: "Grounded greens under an open sky, with Spectral headings and soft corners.",
      choices: {
        palette: {
          brand: "oklch(0.5 0.1 140)",
          neutral: "cool",
          contrast: "standard",
          source: "curated",
        },
        pairing: "spectral-epilogue",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
      overrides: {
        color: {
          "light-accent": { background: { $value: "oklch(0.95 0.025 235)", $type: "color" } },
        },
      },
    },
    {
      id: "forest",
      name: "Forest",
      description: "Old-growth green with Lora and Inter, calmer and more traditional.",
      choices: {
        palette: {
          brand: "oklch(0.4 0.07 150)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "lora-inter",
        density: "comfortable",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "assembly",
      name: "Assembly",
      description: "A bold poster red with Archivo and sharp shapes, for campaigns and movements.",
      choices: {
        palette: {
          brand: "oklch(0.55 0.19 28)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "archivo",
        density: "compact",
        shape: "sharp",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: NAME,
        tagline: "Feeding the valley, together.",
        nav: [
          { type: "page", page: P.members, label: "Members" },
          { type: "collection", collection: "gatherings", label: "Gatherings" },
          { type: "page", page: P.about, label: "About" },
          { type: "button", label: "Join", link: page(P.join), style: "primary" },
        ],
        header: headerFrom("header/classic@1"),
        footer: fromPreset("footer/columns@1", {
          theme: "dark-accent",
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p(NAME, "lead"),
                rt.p(
                  "A cooperative of farms, kitchens and food banks across nine Hudson Valley counties.",
                ),
              ),
            },
            "social-links": { profiles: [] },
            "text:2": {
              content: rt.doc(
                ...linkColumn("Commons", [
                  ["Members", href("members")],
                  ["Gatherings", collectionPath("gatherings")],
                  ["Join", href("join")],
                ]),
              ),
            },
            "text:3": { content: rt.doc(...linkColumn("About", [["Our story", href("about")]])) },
            "text:4": {
              content: rt.doc(
                rt.p("The hub", "eyebrow"),
                rt.p("61 Prince Street, Kingston, NY 12401. Deliveries Monday to Thursday."),
                rt.p("© 2026 Hudson Valley Food Commons Cooperative", "small"),
              ),
            },
          },
        }),
        social: [
          { network: "instagram", url: "https://instagram.com/hvfoodcommons.example" },
          { network: "mastodon", url: "https://social.coop/@hvfoodcommons" },
          { network: "email", url: `mailto:${EMAIL}` },
        ],
        seo: {
          titleTemplate: "%s · Hudson Valley Food Commons",
          description: "A cooperative of farms, kitchens and food banks in the Hudson Valley.",
          image: photoUrl("autumnFarm", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), members(), join(), about()],
      collectionConfigs: {
        gatherings: {
          kind: "events",
          label: "Gatherings",
          itemLabel: "Gathering",
          list: { layout: "list", pageSize: 20, sort: "date-asc" },
          itemPage: { layout: "split" },
        },
      },
      collections: {
        gatherings: [
          event(
            "winter-general-assembly",
            {
              title: "Winter general assembly",
              start: "2027-01-23T13:00:00-05:00",
              end: "2027-01-23T17:00:00-05:00",
              timezone: "America/New_York",
              location: {
                name: "Esopus Creek Farm barn",
                address: "880 Kings Highway, Saugerties, NY",
              },
              registrationUrl: "https://hvfoodcommons.example/rsvp/winter-assembly",
              price: "Members and guests",
              image: photoUrl("sharedTable", 1600),
              imageAlt: "Members talking over a long shared table",
              excerpt: "Steering committee elections, the 2027 budget and a potluck supper.",
            },
            "Each member organization has one vote. Childcare provided; bring a dish to share.\n",
          ),
          event(
            "grant-writing-workshop",
            {
              title: "Grant-writing workshop",
              start: "2027-02-10T18:00:00-05:00",
              end: "2027-02-10T20:00:00-05:00",
              timezone: "America/New_York",
              location: {
                name: "Kingston Community Kitchen",
                address: "61 Prince Street, Kingston, NY",
              },
              registrationUrl: "https://hvfoodcommons.example/rsvp/grants",
              price: "Free for members",
              image: photoUrl("writing", 1600),
              imageAlt: "Notes being written in a notebook",
              excerpt: "How members won $340,000 in state grants last year, and how you can too.",
            },
            "Bring a project idea; we'll work through a real application together.\n",
          ),
          event(
            "seed-swap",
            {
              title: "Spring seed swap",
              start: "2027-03-13T10:00:00-05:00",
              end: "2027-03-13T14:00:00-05:00",
              timezone: "America/New_York",
              location: { name: "Hudson Co-op Grocery", address: "Warren Street, Hudson, NY" },
              price: "Free and open to all",
              image: photoUrl("seedlings", 1600),
              imageAlt: "Seedlings sprouting in a tray",
              excerpt: "Swap seed, starts and advice with growers from across the valley.",
            },
            "Bring labelled seed if you have it, and take home what you need either way.\n",
          ),
        ],
      },
    };
  },
};
