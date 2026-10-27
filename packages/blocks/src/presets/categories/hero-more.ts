import { countdownBlock } from "../../blocks/countdown";
import { newsletterBlock } from "../../blocks/newsletter";
import { videoBlock } from "../../blocks/video";
import { photo } from "../images";
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
import { field, form, formBlockOf, icons, logos, panel, stats, testimonial } from "../parts";

/** Second wave of heroes: bento, video, product, personal, local service, event, cause… */

const headline = copy.headline(3, 9, 1);
const intro = copy.sub(10, 40);
const lead = copy.body(8, 45);
const AI_AVOID =
  "More than one hero per page; a second Heading 1; headlines longer than nine words; stock photos that don't show the business.";

export const heroMorePresets = [
  definePreset({
    category: "hero",
    name: "bento",
    label: "Bento grid",
    description:
      "A headline tile, two photographs and a proof tile arranged as a bento grid of cards.",
    copy: [headline, lead, copy.items("stat", "Stat label", "stats", "items", "label", 1, 6)],
    images: [{ slot: "photos", aspect: "fill", count: 2 }],
    defaultTheme: "light",
    tags: ["image", "grid", "bento", "cards", "modern"],
    links: { primary: "/projects", secondary: "/contact" },
    ai: {
      purpose: "A modern, information-rich opening: promise, work and proof in one screen.",
      whenToUse: "Studios, agencies and product teams with two strong photos and one real number.",
      avoid: `${AI_AVOID} Filling every tile — leave the photos to breathe.`,
    },
    make: (c) => {
      const words = text(
        [
          rt.p("Design & build · Since 2009", "eyebrow"),
          rt.h(1, "Kitchens built around how you cook", "display"),
          rt.p(
            "We design, make and fit solid-wood kitchens in our own workshop, then come back every year to oil the worktops.",
            "lead",
          ),
        ],
        { style: panel("light-accent", "xl") },
      );
      const cta = button("See our kitchens", c.primary, {
        second: { label: "Book a design visit", link: c.secondary },
      });
      const a = image(photo("kitchen", 560));
      const b = image(photo("stool", 360));
      const proof = stats([["212", "Kitchens fitted"]], {
        variant: "large",
        style: panel("dark-accent"),
      });
      return {
        padding: { d: "lg", m: "md" },
        ...grid(
          [
            [words, r(1, 1, 14, 17), r(1, 1, 8, 17)],
            [cta, r(2, 19, 12, 3), r(1, 19, 8, 3)],
            [a, r(15, 1, 10, 13), r(1, 23, 8, 12)],
            [b, r(15, 14, 4, 10), r(1, 36, 4, 9)],
            [proof, r(19, 14, 6, 10), r(5, 36, 4, 9)],
          ],
          { width: "wide" },
        ),
      };
    },
  }),

  definePreset({
    category: "hero",
    name: "video-feature",
    label: "Headline with video",
    description: "A headline and actions above a large, click-to-play video.",
    copy: [headline, intro],
    images: [{ slot: "poster", aspect: "16:9" }],
    defaultTheme: "dark",
    tags: ["video", "centered", "product", "launch"],
    links: { primary: "/signup", secondary: "/demo" },
    ai: {
      purpose: "Lets a short film or walkthrough do the selling, without slowing the page.",
      whenToUse:
        "Products, venues and services with a real video. The player loads only on click. The sample video is an open movie — replace it.",
      avoid: `${AI_AVOID} Videos longer than three minutes in a hero; autoplaying sound.`,
    },
    make: (c) => ({
      layout: stack({ width: "wide", gap: "xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Plan a week of meals in ten minutes", {
          level: 1,
          size: "display",
          align: "center",
          eyebrow: "Pantry · meal planning for busy households",
          sub: "Pantry turns what's already in your cupboards into a week of dinners and a shopping list sorted by aisle.",
        }),
        button("Try it free", c.primary, {
          align: "center",
          second: { label: "Book a demo", link: c.secondary },
          note: "No card needed. Cancel any time.",
        }),
        make(
          videoBlock,
          {
            source: "embed",
            url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
            title: "Sample video: Big Buck Bunny, an open movie from the Blender Foundation",
            caption: "Sample video — replace it with your own walkthrough.",
            poster: photo("chefPrep", 1200, "16:9"),
            aspect: "16:9",
            background: false,
          },
          { variant: "framed" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "product-screenshot",
    label: "Product with screenshot",
    description:
      "A left-aligned headline and signup button beside a large product screenshot that bleeds off the edge.",
    copy: [headline, intro],
    images: [{ slot: "screenshot", aspect: "fill" }],
    defaultTheme: "dark-accent",
    tags: ["image", "grid", "product", "saas", "bleed"],
    links: { primary: "/signup", secondary: "/pricing" },
    ai: {
      purpose: "Shows the product itself next to the promise.",
      whenToUse: "Software and apps with a clean, real screenshot.",
      avoid: `${AI_AVOID} Mock-ups of features that don't exist yet.`,
    },
    make: (c) => {
      const words = heading("Bookkeeping that closes itself", {
        level: 1,
        size: "display",
        eyebrow: "Ledgerly for small studios",
        sub: "Bank feeds, receipts and invoices reconciled every night, so month-end takes a coffee, not a weekend.",
      });
      const cta = button("Start a free month", c.primary, {
        second: { label: "See pricing", link: c.secondary },
        note: "Free for 30 days, then from $18 a month.",
      });
      const shot = image(photo("dashboardLight", 900), { radius: "lg", shadow: "lg" });
      return {
        padding: { d: "xl", m: "lg" },
        ...grid([
          [words, r(1, 4, 10, 11), r(1, 1, 8, 14)],
          [cta, r(1, 15, 10, 5), r(1, 15, 8, 5)],
          [shot, r(12, 1, 13, 24, { bleed: "right" }), r(1, 21, 8, 12, { bleed: "right" })],
        ]),
      };
    },
  }),

  definePreset({
    category: "hero",
    name: "personal-intro",
    label: "Personal introduction",
    description: "A friendly first-person introduction beside a round portrait, with one action.",
    copy: [headline, intro],
    images: [{ slot: "portrait", aspect: "1:1" }],
    defaultTheme: "light",
    tags: ["image", "two-column", "personal", "portrait", "resume"],
    links: { primary: "/work", secondary: "/contact" },
    ai: {
      purpose: "Introduces a person, not a company: who they are and what they do.",
      whenToUse: "Personal sites, résumés, freelancers, coaches and writers.",
      avoid: `${AI_AVOID} Third-person bios on a personal site; job-title soup.`,
    },
    make: (c) => ({
      layout: stack({ cols: [4, 8], align: "center", gap: "2xl", order: [0, 1] }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        image(photo("portraitLena", 420, "1:1"), {
          col: 0,
          aspect: "1:1",
          treatment: "circle",
        }),
        heading("Hi, I'm Lena. I design calm software.", {
          col: 1,
          level: 1,
          size: "h1",
          eyebrow: "Product designer · Lisbon",
          sub: "Ten years making tools for nurses, teachers and farmers easier to use. Currently open to one new project for spring.",
        }),
        button("See my work", c.primary, {
          col: 1,
          second: { label: "Say hello", link: c.secondary },
        }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "local-service",
    label: "Local service with phone",
    description:
      "A headline, a call-now button and trust points beside a photo of the team at work.",
    copy: [
      headline,
      intro,
      copy.items("trust", "Trust point", "icon-list", "items", "title", 2, 6),
    ],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "light",
    tags: ["image", "two-column", "local", "trades", "phone"],
    links: { primary: "/quote" },
    ai: {
      purpose: "Gets a local customer to call or ask for a quote within seconds.",
      whenToUse: "Plumbers, electricians, cleaners, movers, salons and other local services.",
      avoid: `${AI_AVOID} Licences, guarantees or response times the owner can't back up.`,
    },
    make: (c) => ({
      layout: stack({ cols: [7, 5], align: "center", gap: "2xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Leaks fixed today, not next week", {
          col: 0,
          level: 1,
          size: "h1",
          eyebrow: "Plumbing & heating · North Denver",
          sub: "Licensed plumbers on the road seven days a week, with upfront prices before we pick up a wrench.",
        }),
        button(
          "Call\u00a0(303)\u00a0555\u20110148",
          { type: "phone", phone: "+13035550148" },
          {
            col: 0,
            size: "large",
            second: { label: "Get a written quote", link: c.primary },
          },
        ),
        icons(
          [
            ["shield-check", "Licensed and insured"],
            ["clock", "Same-day appointments"],
            ["star", "Upfront, fixed prices"],
          ],
          "1",
          { col: 0, variant: "list" },
        ),
        image(photo("electrician", 520, "4:5"), { col: 1, aspect: "4:5" }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "event-countdown",
    label: "Event with countdown",
    description:
      "Event name, date and venue over a photograph, with a live countdown and ticket button.",
    copy: [headline, intro],
    images: [{ slot: "background", aspect: "fill" }],
    tags: ["image", "background", "event", "countdown", "festival"],
    links: { primary: "/tickets", secondary: "/programme" },
    ai: {
      purpose: "Opens an event site with what, when, where and how to get in.",
      whenToUse: "Festivals, conferences, launches and fundraisers with a fixed date.",
      avoid: `${AI_AVOID} Countdowns to dates that aren't confirmed; fake scarcity.`,
    },
    make: (c) => ({
      layout: stack({ width: "content", gap: "lg" }),
      padding: { d: "3xl", m: "2xl" },
      minHeight: { d: "90vh", m: "85svh" },
      background: {
        type: "image",
        src: photo("festivalSunset", 1920).src,
        focal: [0.5, 0.45],
        overlay: scrim(0.78),
      },
      blocks: [
        heading("Riverbend Folk Weekend", {
          level: 1,
          size: "display",
          align: "center",
          eyebrow: "12–14 June · Millers Meadow, Riverbend",
          sub: "Three days of fiddles, songwriters and ceilidh dancing by the river, with camping, kids' tents and local food.",
        }),
        make(
          countdownBlock,
          {
            heading: undefined,
            headingLevel: "h2",
            target: "2027-06-12T12:00:00-06:00",
            showSeconds: false,
            doneMessage: "The gates are open — see you in the meadow.",
            buttonLabel: undefined,
            link: undefined,
          },
          { variant: "boxes", style: { align: { d: "center" } } },
        ),
        button("Buy weekend tickets", c.primary, {
          align: "center",
          size: "large",
          second: { label: "See the line-up", link: c.secondary },
        }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "cause",
    label: "Cause with donate button",
    description:
      "A photograph of the work beside a short appeal, a donate button and one proof point.",
    copy: [headline, intro, copy.items("stat", "Stat label", "stats", "items", "label", 1, 8)],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "light-accent",
    tags: ["image", "two-column", "nonprofit", "donate"],
    links: { primary: "/donate", secondary: "/our-work" },
    ai: {
      purpose: "Opens a nonprofit site with the mission, the people it serves and a way to help.",
      whenToUse: "Charities, campaigns, mutual aid groups and community funds.",
      avoid: `${AI_AVOID} Pity imagery; impact numbers the organisation can't evidence.`,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl", order: [1, 0] }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        image(photo("volunteers", 520, "4:5"), { col: 0, aspect: "4:5" }),
        heading("Plant a street tree, cool a neighbourhood", {
          col: 1,
          level: 1,
          size: "h1",
          eyebrow: "Shade Street Trust",
          sub: "We plant and water trees on the hottest blocks in town, with the people who live there. Every $60 plants one.",
        }),
        button("Donate a tree", c.primary, {
          col: 1,
          size: "large",
          second: { label: "See where we plant", link: c.secondary },
        }),
        stats([["4,820", "Trees planted and cared for since 2015"]], { col: 1, variant: "row" }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "editorial-type",
    label: "Editorial type",
    description:
      "A magazine-style opening: a huge serif headline, a short standfirst and a rule — no image.",
    copy: [headline, lead],
    defaultTheme: "light",
    tags: ["text-only", "typographic", "editorial", "writer"],
    links: { primary: "/essays", secondary: "/subscribe" },
    ai: {
      purpose: "Lets a strong sentence carry the page, like the cover line of a magazine.",
      whenToUse: "Writers, publications, studios and people whose work is words.",
      avoid: `${AI_AVOID} Long headlines — this layout shouts every word.`,
    },
    make: (c) => ({
      layout: stack({ cols: [9, 3], align: "end", gap: "xl" }),
      padding: { d: "2xl", m: "xl" },
      blocks: [
        heading("Notes on slow work and long walks", {
          col: 0,
          level: 1,
          size: "display",
          eyebrow: "The Margin · Issue 48",
          variant: "rule",
        }),
        text(
          [
            rt.p(
              "A fortnightly letter about attention, craft and the places we go to think. Written by hand, read in ten minutes.",
            ),
          ],
          { col: 1 },
        ),
        button("Read the latest", c.primary, {
          col: 1,
          role: "tertiary",
          second: { label: "Subscribe", link: c.secondary },
        }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "split-form",
    label: "Split with enquiry form",
    description: "Headline and reassurance on the left, a short enquiry form on the right.",
    copy: [headline, intro, copy.items("point", "Point", "icon-list", "items", "title", 2, 7)],
    defaultTheme: "light-accent",
    tags: ["form", "two-column", "lead-generation", "services"],
    ai: {
      purpose: "Captures an enquiry on the first screen for services sold by conversation.",
      whenToUse: "Consultants, agencies, contractors, tutors and event services.",
      avoid: `${AI_AVOID} Forms longer than four fields in a hero.`,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Get your evenings back from admin", {
          col: 0,
          level: 1,
          size: "h1",
          eyebrow: "Operations help for small agencies",
          sub: "We set up the tools, templates and routines that keep projects, invoices and inboxes moving without you.",
        }),
        icons(
          [
            ["check", "A plan within one week"],
            ["check", "Fixed price, agreed upfront"],
            ["check", "Handover your team can run"],
          ],
          "1",
          { col: 0, variant: "checklist" },
        ),
        formBlockOf(
          form(
            "First conversation",
            [field.name("full"), field.email("full"), field.message("What's eating your week?")],
            "Request a call",
            "Thanks — we'll reply within one working day with a few times to talk.",
          ),
          { col: 1, variant: "card" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "gallery-strip",
    label: "Headline over photo strip",
    description: "A centred headline above a row of four photographs of the work.",
    copy: [headline, intro],
    images: [{ slot: "photos", aspect: "4:5", count: 4 }],
    defaultTheme: "light",
    tags: ["image", "centered", "gallery", "portfolio"],
    links: { primary: "/work", secondary: "/booking" },
    ai: {
      purpose: "Shows the range of the work from the very first screen.",
      whenToUse: "Photographers, florists, makers and stylists with consistent photography.",
      avoid: `${AI_AVOID} Photos with clashing colour or mixed orientations.`,
    },
    make: (c) => {
      const h = heading("Portraits that feel like you", {
        level: 1,
        size: "display",
        align: "center",
        eyebrow: "Mara Quill Photography",
        sub: "Unhurried portrait sessions in natural light, for people who usually hate having their picture taken.",
      });
      const cta = button("See portfolios", c.primary, {
        align: "center",
        second: { label: "Book a session", link: c.secondary },
      });
      const shot = (k: Parameters<typeof photo>[0]) =>
        image(photo(k, 340, "4:5"), { aspect: "4:5" });
      const a = shot("portraitEditorial");
      const b = shot("portraitJonah");
      const d = shot("portraitMono");
      const e = shot("portraitRaf");
      return {
        padding: { d: "xl", m: "lg" },
        ...grid(
          [
            [h, r(4, 1, 18, 10), r(1, 1, 8, 12)],
            [cta, r(4, 12, 18, 3), r(1, 14, 8, 3)],
            [a, r(1, 16, 6, 12), r(1, 18, 4, 10)],
            [b, r(7, 18, 6, 12), r(5, 18, 4, 10)],
            [d, r(13, 16, 6, 12), r(1, 29, 4, 10)],
            [e, r(19, 18, 6, 12), r(5, 29, 4, 10)],
          ],
          { width: "wide" },
        ),
      };
    },
  }),

  definePreset({
    category: "hero",
    name: "app-waitlist",
    label: "Waitlist with logos",
    description:
      "A bold centred headline, an inline email signup and a strip of early partners beneath.",
    copy: [headline, intro],
    defaultTheme: "dark",
    tags: ["text-only", "centered", "newsletter", "launch", "logos"],
    ai: {
      purpose: "Collects early-access signups for something that isn't open yet.",
      whenToUse: "Pre-launch products, beta programmes and new venues.",
      avoid: `${AI_AVOID} Partner names the owner hasn't cleared.`,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "xl" }),
      padding: { d: "2xl", m: "xl" },
      blocks: [
        heading("Shared calendars for families who share everything", {
          level: 1,
          size: "display",
          align: "center",
          eyebrow: "Kinfold · early access",
          sub: "School runs, swim lessons and who's cooking — one calendar the whole household actually reads. Launching in March.",
        }),
        make(
          newsletterBlock,
          {
            heading: undefined,
            description: undefined,
            askName: false,
            placeholder: "you@example.com",
            buttonLabel: "Join the waitlist",
            successMessage: "You're on the list. We'll write when your invite is ready.",
            note: "One email when we open. No spam.",
          },
          { variant: "inline", style: { align: { d: "center" } } },
        ),
        logos(
          ["Brightwater PTA", "Northside Swim", "Cedar Co-op", "Tandem Childcare"],
          "Piloting with",
        ),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "frame-photo",
    label: "Framed photograph",
    description:
      "A full-width photograph inset with a margin, the headline overlapping its bottom-left corner on a solid card.",
    copy: [headline, lead],
    images: [{ slot: "photo", aspect: "fill" }],
    defaultTheme: "light",
    tags: ["image", "grid", "overlap", "editorial", "card"],
    links: { primary: "/stay", secondary: "/journal" },
    ai: {
      purpose: "A gallery-like opening that keeps the headline on a solid surface.",
      whenToUse: "Hotels, architects, galleries and photographers with one wide hero photo.",
      avoid: `${AI_AVOID} Photos whose subject sits bottom left.`,
    },
    make: (c) => {
      const pic = image(photo("canyon", 1440));
      const card = text(
        [
          rt.p("Casa Arroyo · Desert lodge", "eyebrow"),
          rt.h(1, "Eight rooms at the edge of the canyon", "h1"),
          rt.p(
            "Adobe rooms, a spring-fed pool and nothing between you and the stars. Open October to May.",
          ),
        ],
        { style: panel(c.theme, "xl") },
      );
      const cta = button("Check dates", c.primary, {
        second: { label: "Read our journal", link: c.secondary },
      });
      return {
        padding: { d: "lg", m: "md" },
        ...grid(
          [
            [pic, r(1, 1, 24, 22), r(1, 1, 8, 14)],
            [card, r(2, 15, 10, 12, { z: 2 }), r(1, 12, 8, 13, { z: 2 })],
            [cta, r(2, 27, 10, 3), r(1, 26, 8, 3)],
          ],
          { width: "wide" },
        ),
      };
    },
  }),

  definePreset({
    category: "hero",
    name: "review-led",
    label: "Headline with review",
    description: "A headline and action beside a photo, with a five-star review card layered on.",
    copy: [headline, intro, copy.field("quote", "Testimonial", "testimonial", "quote", 6, 30)],
    images: [
      { slot: "photo", aspect: "fill" },
      { slot: "portrait", aspect: "1:1" },
    ],
    defaultTheme: "light-accent",
    tags: ["image", "grid", "overlap", "testimonial", "trust"],
    links: { primary: "/book", secondary: "/services" },
    ai: {
      purpose: "Pairs the promise with a real customer's words at first glance.",
      whenToUse: "Salons, clinics, tutors and trades with a standout review.",
      avoid: `${AI_AVOID} Invented reviews — use a real quote with permission.`,
    },
    make: (c) => {
      const words = heading("Colour that grows out beautifully", {
        level: 1,
        size: "display",
        eyebrow: "Juno Hair Studio",
        sub: "Lived-in colour, precision cuts and honest advice about what your hair can do — in a bright, unhurried studio.",
      });
      const cta = button("Book online", c.primary, {
        second: { label: "Services & prices", link: c.secondary },
      });
      const pic = image(photo("hairCut", 640));
      const review = testimonial(
        "Three months on and my balayage still looks freshly done. I'll never go anywhere else.",
        "Alicia R.",
        "Client since 2023",
        "portraitAna",
        { rating: 5, variant: "card", style: { shadow: "lg" } },
      );
      return {
        padding: { d: "xl", m: "lg" },
        ...grid([
          [words, r(1, 3, 11, 15), r(1, 1, 8, 15)],
          [cta, r(1, 19, 11, 4), r(1, 16, 8, 4)],
          [pic, r(15, 1, 10, 24), r(1, 21, 8, 13)],
          [review, r(13, 17, 8, 9, { z: 2 }), r(1, 31, 8, 10, { z: 2 })],
        ]),
      };
    },
  }),

  definePreset({
    category: "hero",
    name: "menu-led",
    label: "Restaurant opening hours",
    description:
      "A warm photograph beside the restaurant's name, a short line and tonight's opening hours.",
    copy: [copy.headline(1, 9, 1), intro, copy.body(1, 20)],
    images: [{ slot: "photo", aspect: "3:2" }],
    defaultTheme: "dark-accent",
    tags: ["image", "two-column", "restaurant", "hours"],
    links: { primary: "/reserve", secondary: "/menu" },
    ai: {
      purpose: "Answers the three questions restaurant visitors arrive with: what, when, book.",
      whenToUse: "Restaurants, cafés, bars and bakeries.",
      avoid: `${AI_AVOID} Hours that differ from the owner's listings.`,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Osteria Lupa", {
          col: 0,
          level: 1,
          size: "display",
          eyebrow: "Handmade pasta · Wine bar",
          sub: "Pasta rolled every afternoon, a short list of Italian wines and a counter where you can watch it all happen.",
        }),
        text([rt.p("Tue–Sat 5:30–11pm · Sun 12–4pm · Closed Mondays", "small")], { col: 0 }),
        button("Book a table", c.primary, {
          col: 0,
          second: { label: "See the menu", link: c.secondary },
        }),
        image(photo("dinner", 720, "3:2"), { col: 1, aspect: "3:2" }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "minimal-line",
    label: "One line",
    description: "A single large sentence on a quiet background, with a small text link beneath.",
    copy: [headline],
    defaultTheme: "light",
    tags: ["text-only", "minimal", "typographic", "portfolio"],
    links: { primary: "/work" },
    ai: {
      purpose: "Maximum restraint: one sentence, one link.",
      whenToUse: "Portfolios, architects and studios that want the work to speak next.",
      avoid: `${AI_AVOID} Adding more buttons or an image — that's a different hero.`,
    },
    make: (c) => ({
      layout: stack({ width: "content", gap: "lg" }),
      padding: { d: "3xl", m: "2xl" },
      blocks: [
        heading("Ines Varga designs quiet houses for loud families.", {
          level: 1,
          size: "display",
        }),
        button("Selected projects", c.primary, { role: "tertiary" }),
      ],
    }),
  }),
];
