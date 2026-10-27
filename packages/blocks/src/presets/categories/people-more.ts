import { tabsBlock } from "../../blocks/tabs";
import { teamBlock } from "../../blocks/team";
import { type PhotoKey, photo } from "../images";
import {
  button,
  copy,
  definePreset,
  grid,
  heading,
  image,
  make,
  r,
  rt,
  scrim,
  stack,
  text,
} from "../kit";
import { card, logos, panel, qa, questions, stats, team } from "../parts";

/** Second wave of FAQ, team, stats and logos presets. */

const headline = copy.headline(1, 10, 2);
const q = copy.items("question", "Question", "accordion", "items", "question", 3, 16);
const FAQ_AVOID =
  "Inventing policies, guarantees or prices; answers longer than a short paragraph; more than ten questions in one list.";
const TEAM_AVOID =
  "Stock photos presented as staff; job titles nobody understands; bios longer than three sentences.";
const STATS_AVOID =
  "Invented, rounded-up or unverifiable figures; more than six numbers; vanity metrics.";
const LOGO_AVOID =
  "Logos or names of organisations that aren't real clients, partners or press; using brand logos against their guidelines.";

const SERVICE_FAQ = [
  qa(
    "Do you charge a call-out fee?",
    "Yes — $95, which includes the first hour of work. We confirm any further cost before starting.",
  ),
  qa(
    "Are you licensed and insured?",
    "Every plumber is state-licensed, and we carry $2 million in liability insurance.",
  ),
  qa(
    "Do you work weekends?",
    "Yes, for emergencies. Weekend and evening work is charged at time and a half.",
  ),
  qa(
    "Is your work guaranteed?",
    "Labour is guaranteed for two years; parts carry the manufacturer's warranty.",
  ),
];

export const faqMorePresets = [
  definePreset({
    category: "faq",
    name: "two-column",
    label: "Questions in two columns",
    description: "A centred heading over questions split into two columns.",
    copy: [headline, q],
    defaultTheme: "light",
    tags: ["accordion", "two-column", "wide"],
    ai: {
      purpose: "Answers eight or so questions without a long scroll.",
      whenToUse: "FAQ pages and the end of service pages.",
      avoid: FAQ_AVOID,
    },
    make: () => {
      const h = heading("Questions people ask before booking", { eyebrow: "FAQ", align: "center" });
      const a = questions(SERVICE_FAQ.slice(0, 2));
      const b = questions(SERVICE_FAQ.slice(2));
      return {
        ...grid([
          [h, r(4, 1, 18, 5), r(1, 1, 8, 6)],
          [a, r(1, 7, 12, 12), r(1, 8, 8, 12)],
          [b, r(13, 7, 12, 12), r(1, 21, 8, 12)],
        ]),
      };
    },
  }),

  definePreset({
    category: "faq",
    name: "with-contact-card",
    label: "Questions with contact card",
    description:
      "Questions on the left and a contact card with a photo and phone number on the right.",
    copy: [headline, q, copy.body(5, 30)],
    images: [{ slot: "portrait", aspect: "1:1" }],
    defaultTheme: "light-accent",
    tags: ["accordion", "two-column", "contact", "card"],
    links: { primary: "/contact" },
    ai: {
      purpose: "Answers questions and offers a real person for anything else.",
      whenToUse: "Services where people want reassurance: clinics, trades, schools.",
      avoid: FAQ_AVOID,
    },
    make: (c) => {
      const h = heading("Good questions", { eyebrow: "FAQ" });
      const list = questions(SERVICE_FAQ, { openFirst: true });
      const face = image(photo("portraitCoach", 160, "1:1"), {
        aspect: "1:1",
        treatment: "circle",
      });
      const note = text([
        rt.h(3, "Still wondering?", "h4"),
        rt.p("Call Maria at the office between 7am and 6pm, or send a message any time."),
      ]);
      const cta = button("Send a message", c.primary, { role: "secondary" });
      return {
        ...grid([
          [h, r(1, 1, 14, 4), r(1, 1, 8, 4)],
          [list, r(1, 6, 14, 22), r(1, 6, 8, 26)],
          [face, r(17, 6, 3, 5), r(1, 33, 3, 5)],
          [note, r(17, 12, 8, 7), r(1, 39, 8, 7)],
          [cta, r(17, 20, 8, 3), r(1, 47, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "faq",
    name: "tabs-pills",
    label: "Questions by audience",
    description: "Questions grouped by audience in pill tabs — for example guests, parents, teams.",
    copy: [headline, copy.sub(4, 30)],
    defaultTheme: "light",
    tags: ["tabs", "topics", "centered"],
    ai: {
      purpose: "Lets different visitors jump to the questions that apply to them.",
      whenToUse: "Events, schools and venues with distinct audiences.",
      avoid: FAQ_AVOID,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "lg" }),
      blocks: [
        heading("Before the festival", {
          align: "center",
          eyebrow: "FAQ",
          sub: "Pick the questions that fit you. Can't find an answer? Email the box office.",
        }),
        make(
          tabsBlock,
          {
            label: "Who's asking",
            items: [
              {
                label: "Campers",
                content: rt.doc(
                  rt.h(3, "When can we pitch our tent?", "h4"),
                  rt.p("The campsite opens at 10am on Friday. Quiet hours run from 1am to 8am."),
                  rt.h(3, "Are there showers?", "h4"),
                  rt.p("Yes — hot showers by the main gate, open 7am to 11pm."),
                ),
              },
              {
                label: "Families",
                content: rt.doc(
                  rt.h(3, "Do children need tickets?", "h4"),
                  rt.p("Under-12s go free with a paying adult; teens get half-price tickets."),
                  rt.h(3, "Is there a kids' area?", "h4"),
                  rt.p("The Little Meadow has crafts, storytelling and a quiet tent all weekend."),
                ),
              },
              {
                label: "Access",
                content: rt.doc(
                  rt.h(3, "Is the site step-free?", "h4"),
                  rt.p(
                    "Main paths are matted and step-free, with an accessible viewing platform at each stage.",
                  ),
                  rt.h(3, "Can I bring a carer?", "h4"),
                  rt.p("Yes — carers get a free ticket. Tell us when you book."),
                ),
              },
            ],
          },
          { variant: "pills" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "faq",
    name: "dark-minimal",
    label: "Questions on dark",
    description:
      "A heading and short line on the left, minimal questions on a dark band on the right.",
    copy: [headline, q, copy.body(5, 30)],
    defaultTheme: "dark",
    tags: ["accordion", "dark", "two-column", "minimal"],
    ai: {
      purpose: "A sleek FAQ for product and premium service pages.",
      whenToUse: "Software, studios and premium services.",
      avoid: FAQ_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("Questions, answered", { col: 0, eyebrow: "FAQ" }),
        text([rt.p("Anything else? Our team replies within a working day.")], { col: 0 }),
        questions(
          [
            qa(
              "Can I import my existing clients?",
              "Yes — upload a spreadsheet or connect your old booking system and we'll move everything across.",
            ),
            qa(
              "Is there a contract?",
              "No. Plans are monthly or yearly, and you can cancel any time from settings.",
            ),
            qa(
              "Where is my data stored?",
              "In the EU and the US, encrypted at rest. You choose the region when you sign up.",
            ),
            qa(
              "Do my clients need an account?",
              "No. They book with an email address and get a link to manage their bookings.",
            ),
          ],
          { col: 1, variant: "minimal" },
        ),
      ],
    }),
  }),
];

const portrait = (k: PhotoKey) => photo(k, 360, "4:5");

export const teamMorePresets = [
  definePreset({
    category: "team",
    name: "four-up",
    label: "Team of four",
    description: "Four people in a row with portraits, names and roles, under a centred heading.",
    copy: [headline, copy.sub(4, 30)],
    images: [{ slot: "portraits", aspect: "4:5", count: 4 }],
    defaultTheme: "light",
    tags: ["grid", "four-up", "portraits"],
    ai: {
      purpose: "Introduces a small team with faces and roles.",
      whenToUse: "About pages for agencies, clinics and studios.",
      avoid: TEAM_AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("The people you'll work with", {
          align: "center",
          eyebrow: "Team",
          sub: "Four designers, one developer and a studio dog called Biscuit.",
        }),
        team(
          [
            ["Ana Ruiz", "Creative director", "portraitAna"],
            ["Daniel Okoro", "Designer", "portraitDaniel"],
            ["Iris Lund", "Designer", "portraitIris"],
            ["Theo Grant", "Developer", "portraitTheo"],
          ],
          "4",
        ),
      ],
    }),
  }),

  definePreset({
    category: "team",
    name: "list-bios",
    label: "Team list with bios",
    description: "People as rows: portrait, name, role and a two-sentence bio.",
    copy: [headline],
    images: [{ slot: "portraits", aspect: "4:5", count: 3 }],
    defaultTheme: "light",
    tags: ["list", "bios", "detail"],
    ai: {
      purpose: "Gives each person room to explain their background.",
      whenToUse: "Practices, firms and clinics where credentials matter.",
      avoid: TEAM_AVOID,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "lg" }),
      blocks: [
        heading("Our practitioners", { eyebrow: "Team" }),
        team(
          [
            [
              "Dr Maya Chen",
              "Osteopath",
              "portraitMaya",
              "Twelve years in sports clinics before opening the practice. Specialises in running injuries and long-term back pain.",
            ],
            [
              "Marcus Hale",
              "Physiotherapist",
              "portraitMarcus",
              "Former rugby physio who now helps desk workers move better. Runs our Tuesday rehab class.",
            ],
            [
              "Nina Holt",
              "Massage therapist",
              "portraitNina",
              "Trained in deep tissue and lymphatic drainage. Known for very good playlists.",
            ],
          ],
          "2",
          { variant: "list" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "team",
    name: "founders-pair",
    label: "Two founders",
    description: "Two founders side by side with large portraits and a short paragraph each.",
    copy: [headline, copy.body(10, 50)],
    images: [{ slot: "portraits", aspect: "4:5", count: 2 }],
    defaultTheme: "light-accent",
    tags: ["two-up", "founders", "image", "story"],
    ai: {
      purpose: "Puts the founders' faces and voices at the centre of the business.",
      whenToUse: "Partnerships, family businesses and two-person studios.",
      avoid: TEAM_AVOID,
    },
    make: () => {
      const h = heading("Meet Mira and Sol", { eyebrow: "The founders" });
      const a = image(portrait("portraitAna"), { aspect: "4:5" });
      const at = text([
        rt.h(3, "Mira Haddad", "h4"),
        rt.p(
          "Runs the roaster and the numbers. Will tell you more about Ethiopian coffee than you asked.",
        ),
      ]);
      const b = image(portrait("portraitIris"), { aspect: "4:5" });
      const bt = text([
        rt.h(3, "Sol Haddad", "h4"),
        rt.p(
          "Runs the kitchen and the playlist. Responsible for the cardamom buns and their fan club.",
        ),
      ]);
      return {
        ...grid([
          [h, r(1, 1, 16, 4), r(1, 1, 8, 4)],
          [a, r(1, 6, 6, 12), r(1, 6, 4, 9)],
          [at, r(7, 10, 5, 8), r(5, 6, 4, 9)],
          [b, r(13, 6, 6, 12), r(1, 16, 4, 9)],
          [bt, r(19, 10, 6, 8), r(5, 16, 4, 9)],
        ]),
      };
    },
  }),

  definePreset({
    category: "team",
    name: "circles-centered",
    label: "Round portraits",
    description: "Six people with round portraits in a centred grid — friendly and compact.",
    copy: [headline],
    images: [{ slot: "portraits", aspect: "1:1", count: 6 }],
    defaultTheme: "light",
    tags: ["circles", "grid", "volunteers", "board"],
    ai: {
      purpose: "Shows a larger group — a board, volunteers, a crew — compactly.",
      whenToUse: "Nonprofit boards, committees, volunteer crews and co-ops.",
      avoid: TEAM_AVOID,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "xl" }),
      blocks: [
        heading("Our board", { align: "center", eyebrow: "Governance" }),
        make(
          teamBlock,
          {
            people: (
              [
                ["Rosa Delgado", "Chair", "portraitClara"],
                ["Owen Price", "Treasurer", "portraitOwen"],
                ["Maya Chen", "Secretary", "portraitMaya"],
                ["Jonah Ellis", "Trustee", "portraitJonah"],
                ["Lena Brandt", "Trustee", "portraitLena"],
                ["Rafael Costa", "Trustee", "portraitRaf"],
              ] as [string, string, PhotoKey][]
            ).map(([name, role, k]) => ({ name, role, photo: photo(k, 240, "1:1") })),
            columns: "3",
          },
          { variant: "circles", style: { align: { d: "center" } } },
        ),
      ],
    }),
  }),

  definePreset({
    category: "team",
    name: "hiring",
    label: "Team with hiring card",
    description: "Three team members and a card inviting applications for an open role.",
    copy: [headline],
    images: [{ slot: "portraits", aspect: "4:5", count: 3 }],
    defaultTheme: "light",
    tags: ["grid", "hiring", "careers", "cards"],
    links: { primary: "/careers" },
    ai: {
      purpose: "Introduces the team and invites the next person to join.",
      whenToUse: "Growing businesses with an open role.",
      avoid: `${TEAM_AVOID} Advertising roles that are already filled.`,
    },
    make: (c) => {
      const h = heading("A small crew, growing slowly", { eyebrow: "Team", col: 0 });
      const people = team(
        [
          ["Jo Kowalski", "Owner and site lead", "portraitClara"],
          ["Marcus Hale", "Head carpenter", "portraitMarcus"],
          ["Sam Ortiz", "Electrician", "portraitSam"],
        ],
        "3",
        { col: 0 },
      );
      const hiring = card(
        "We're hiring a second carpenter",
        "Full time, four-day week, own tools not required. We'd love to hear from you.",
        {
          col: 1,
          icon: "hammer",
          eyebrow: "Open role",
          link: "/careers",
          linkLabel: "See the role",
          style: panel("dark-accent"),
        },
      );
      const cta = button("Join the crew", c.primary, { col: 1, role: "tertiary" });
      return {
        layout: stack({ cols: [9, 3], gap: "xl" }),
        blocks: [h, people, hiring, cta],
      };
    },
  }),
];

export const statsMorePresets = [
  definePreset({
    category: "stats",
    name: "big-numbers",
    label: "Big numbers",
    description: "Three oversized numbers stacked with labels, beside a heading.",
    copy: [headline, copy.items("stat", "Stat label", "stats", "items", "label", 1, 8)],
    defaultTheme: "light",
    tags: ["large", "two-column", "editorial"],
    ai: {
      purpose: "Makes a few numbers impossible to miss.",
      whenToUse: "About and impact pages with two to four standout figures.",
      avoid: STATS_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("A year at the community kitchen", { col: 0, eyebrow: "By the numbers" }),
        stats(
          [
            ["48,000", "Hot meals served", "Every weekday lunchtime, no questions asked."],
            ["260", "Volunteers on the rota"],
            ["9 tonnes", "Food saved from waste"],
          ],
          { col: 1, variant: "large" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "stats",
    name: "brand-band",
    label: "Numbers on a brand band",
    description: "Four numbers in a row on a saturated brand-colour band.",
    copy: [copy.items("stat", "Stat label", "stats", "items", "label", 1, 6)],
    defaultTheme: "brand",
    tags: ["row", "band", "brand", "compact"],
    ai: {
      purpose: "A bold punctuation mark of proof between sections.",
      whenToUse: "Product, agency and nonprofit home pages.",
      avoid: STATS_AVOID,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      padding: { d: "lg", m: "lg" },
      blocks: [
        stats(
          [
            ["12k", "Teams on Tidewire"],
            ["3 s", "Median alert time"],
            ["99.99%", "Uptime last year"],
            ["24/7", "Human support"],
          ],
          { variant: "row" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "stats",
    name: "over-photo",
    label: "Numbers over photo",
    description: "A row of numbers and a heading over a darkened photograph.",
    copy: [headline, copy.items("stat", "Stat label", "stats", "items", "label", 1, 6)],
    images: [{ slot: "background", aspect: "fill" }],
    tags: ["image", "background", "row"],
    ai: {
      purpose: "Numbers with atmosphere — the place behind the figures.",
      whenToUse: "Venues, events, farms and nonprofits.",
      avoid: STATS_AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      padding: { d: "2xl", m: "xl" },
      background: {
        type: "image",
        src: photo("festivalCrowd", 1920).src,
        focal: [0.5, 0.5],
        overlay: scrim(0.8),
      },
      blocks: [
        heading("Ten summers in the meadow", { eyebrow: "Since 2016", align: "center" }),
        stats(
          [
            ["9,000", "Festival-goers a year"],
            ["140", "Bands and songwriters"],
            ["3", "Stages by the river"],
          ],
          { variant: "row", style: { align: { d: "center" } } },
        ),
      ],
    }),
  }),

  definePreset({
    category: "stats",
    name: "cards-detail",
    label: "Number cards with detail",
    description: "Numbers as cards, each with a short line of context underneath.",
    copy: [
      headline,
      copy.sub(4, 30),
      copy.items("stat", "Stat label", "stats", "items", "label", 1, 6),
    ],
    defaultTheme: "light-accent",
    tags: ["cards", "detail", "three-up"],
    ai: {
      purpose: "Numbers that need a sentence of explanation to mean anything.",
      whenToUse: "Reports, case studies and B2B services.",
      avoid: STATS_AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("What a year of coaching changed", {
          eyebrow: "Client survey",
          sub: "From 120 business owners who finished the programme in 2025.",
        }),
        stats(
          [
            ["87%", "Grew revenue", "Median growth was 24% over the year."],
            ["6 hrs", "Saved each week", "Mostly from meetings and email."],
            ["1 in 3", "Hired their first employee", "With a plan for the role first."],
          ],
          { variant: "cards" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "stats",
    name: "number-photo-split",
    label: "Number beside photo",
    description: "One headline number and a short paragraph beside a tall photograph.",
    copy: [copy.items("stat", "Stat label", "stats", "items", "label", 1, 8), copy.body(8, 45)],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "dark-accent",
    tags: ["single", "image", "two-column"],
    ai: {
      purpose: "Lets one number tell the story.",
      whenToUse: "Nonprofits, trades and makers with one remarkable figure.",
      avoid: STATS_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        stats([["1 million", "Litres of clean water a day"]], { col: 0, variant: "large" }),
        text(
          [
            rt.p(
              "That's what the forty village wells we've dug with local crews now pump — maintained by the communities who use them.",
            ),
          ],
          { col: 0 },
        ),
        image(photo("tapWater", 520, "4:5"), { col: 1, aspect: "4:5" }),
      ],
    }),
  }),

  definePreset({
    category: "stats",
    name: "inline-strip",
    label: "Compact number strip",
    description: "A slim strip of four small numbers — fits under a hero or above a footer.",
    copy: [copy.items("stat", "Stat label", "stats", "items", "label", 1, 5)],
    defaultTheme: "light",
    tags: ["row", "compact", "strip"],
    ai: {
      purpose: "Quick, quiet proof that doesn't interrupt the page.",
      whenToUse: "Under heroes and between sections on service pages.",
      avoid: STATS_AVOID,
    },
    make: () => ({
      layout: stack({ width: "wide" }),
      padding: { d: "md", m: "md" },
      blocks: [
        stats(
          [
            ["4.9★", "Google rating"],
            ["15 yrs", "In business"],
            ["2-yr", "Labour guarantee"],
            ["7 days", "A week"],
          ],
          { variant: "row" },
        ),
      ],
    }),
  }),
];

export const logosMorePresets = [
  definePreset({
    category: "logos",
    name: "split-heading",
    label: "Logos beside heading",
    description: "A short heading on the left and a grid of client names on the right.",
    copy: [headline],
    defaultTheme: "light",
    tags: ["grid", "two-column", "clients"],
    ai: {
      purpose: "A tidy statement of who you've worked with.",
      whenToUse: "Agencies, consultants and B2B products.",
      avoid: LOGO_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [4, 8], align: "center", gap: "2xl" }),
      blocks: [
        heading("Trusted by teams who ship every day", { col: 0, eyebrow: "Customers" }),
        logos(
          ["Parcelly", "Kitebase", "Orchard Pay", "Ludo Labs", "Northwind Health", "Tandem"],
          undefined,
          { col: 1, variant: "grid" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "logos",
    name: "press-band",
    label: "Press band on dark",
    description: "An 'As seen in' label and a row of publication names on a dark band.",
    copy: [copy.field("label", "Label", "logo-strip", "label", 1, 5)],
    defaultTheme: "dark",
    tags: ["press", "row", "dark", "band"],
    ai: {
      purpose: "Borrowed credibility from real press coverage.",
      whenToUse: "Products, restaurants and authors with genuine coverage.",
      avoid: LOGO_AVOID,
    },
    make: () => ({
      layout: stack({ width: "wide" }),
      padding: { d: "md", m: "md" },
      blocks: [
        logos(
          ["The Daily Larder", "City Table Weekly", "Good Eating Guide", "The Evening Ledger"],
          "As seen in",
        ),
      ],
    }),
  }),

  definePreset({
    category: "logos",
    name: "partners-cards",
    label: "Partners with descriptions",
    description: "Partner organisations as cards, each with what the partnership does.",
    copy: [headline],
    defaultTheme: "light-accent",
    tags: ["cards", "partners", "nonprofit", "three-up"],
    ai: {
      purpose: "Shows partnerships with substance, not just logos.",
      whenToUse: "Nonprofits, coalitions and programmes delivered with partners.",
      avoid: LOGO_AVOID,
    },
    make: () => {
      const h = heading("Our partners", { eyebrow: "Working together" });
      const a = card(
        "Eastside Schools Trust",
        "Hosts our gardens at twelve schools and builds harvest lunches into the timetable.",
        { icon: "graduation-cap", eyebrow: "Education partner", style: panel("light") },
      );
      const b = card(
        "City Parks Department",
        "Supplies trees at cost and maps the hottest streets with us each spring.",
        { icon: "leaf", eyebrow: "Public partner", style: panel("light") },
      );
      const d = card(
        "Riverside Community Fund",
        "Funds our tree keeper training and watering kits.",
        {
          icon: "heart-handshake",
          eyebrow: "Funder",
          style: panel("light"),
        },
      );
      return {
        ...grid([
          [h, r(1, 1, 16, 4), r(1, 1, 8, 4)],
          [a, r(1, 6, 8, 10), r(1, 6, 8, 9)],
          [b, r(9, 6, 8, 10), r(1, 16, 8, 9)],
          [d, r(17, 6, 8, 10), r(1, 26, 8, 9)],
        ]),
      };
    },
  }),

  definePreset({
    category: "logos",
    name: "stats-and-logos",
    label: "Logos with a number",
    description: "A big customer number beside a scrolling marquee of customer names.",
    copy: [copy.items("stat", "Stat label", "stats", "items", "label", 1, 6)],
    defaultTheme: "light",
    tags: ["marquee", "stats", "motion"],
    ai: {
      purpose: "Combines scale (a number) with names people recognise.",
      whenToUse: "Products and platforms with many customers.",
      avoid: LOGO_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [3, 9], align: "center", gap: "xl" }),
      padding: { d: "lg", m: "lg" },
      blocks: [
        stats([["2,400+", "Studios use Frontdesk"]], { col: 0, variant: "row" }),
        logos(
          [
            "Northside Climbing",
            "Still Point Bodywork",
            "Juno Hair",
            "Twin Oaks Café",
            "Kiln & Co",
            "Harbour Yoga",
          ],
          undefined,
          { col: 1, variant: "marquee" },
        ),
      ],
    }),
  }),
];
