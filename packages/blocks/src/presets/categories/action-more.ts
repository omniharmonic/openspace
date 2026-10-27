import type { BlockStyle } from "@omniharmonic/openspace-schema";
import { mapBlock } from "../../blocks/map";
import { newsletterBlock } from "../../blocks/newsletter";
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
import {
  contactInfo,
  field,
  form,
  formBlockOf,
  hours,
  icons,
  panel,
  raised,
  testimonial,
  weekHours,
} from "../parts";

/** Second wave of calls to action, contact and newsletter presets. */

const headline = copy.headline(2, 10, 2);
const intro = copy.sub(6, 35);
const CTA_AVOID =
  "More than one primary button; vague labels ('Click here'); urgency or offers the owner hasn't approved.";
const CONTACT_AVOID =
  "Made-up addresses, phone numbers or hours — always use the owner's real details; forms that ask for more than is needed.";
const NEWS_AVOID =
  "Promising a schedule the owner can't keep; pre-ticked consent; asking for more than an email address.";

const newsletter = (
  o: {
    heading?: string;
    description?: string;
    button: string;
    success: string;
    note?: string;
    name?: boolean;
  },
  place: { variant: string; col?: number; style?: BlockStyle },
) =>
  make(
    newsletterBlock,
    {
      heading: o.heading,
      description: o.description,
      askName: o.name ?? false,
      placeholder: "you@example.com",
      buttonLabel: o.button,
      successMessage: o.success,
      note: o.note,
    },
    place,
  );

export const ctaMorePresets = [
  definePreset({
    category: "cta",
    name: "split-photo",
    label: "Action beside photo",
    description: "A headline, line of support and button beside a photograph, on a tinted band.",
    copy: [headline, intro],
    images: [{ slot: "photo", aspect: "3:2" }],
    defaultTheme: "light-accent",
    tags: ["image", "two-column", "closing"],
    links: { primary: "/book" },
    ai: {
      purpose: "A warm, closing invitation with a picture of what's on offer.",
      whenToUse: "End of service, class and venue pages.",
      avoid: CTA_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        heading("Your table by the fire is waiting", {
          col: 0,
          sub: "Book for two or twelve. We hold walk-in seats at the bar every night.",
        }),
        button("Book a table", c.primary, { col: 0, size: "large" }),
        image(photo("dining", 640, "3:2"), { col: 1, aspect: "3:2" }),
      ],
    }),
  }),

  definePreset({
    category: "cta",
    name: "big-type",
    label: "Big type call to action",
    description: "An oversized two-line headline with one button, set left on a dark band.",
    copy: [copy.headline(2, 8, 2)],
    defaultTheme: "dark",
    tags: ["typographic", "bold", "closing"],
    links: { primary: "/contact" },
    ai: {
      purpose: "A confident, typographic close.",
      whenToUse: "Agencies, consultants, studios and launches.",
      avoid: `${CTA_AVOID} Headlines over eight words.`,
    },
    make: (c) => ({
      layout: stack({ cols: [9, 3], align: "end", gap: "xl" }),
      padding: { d: "2xl", m: "xl" },
      blocks: [
        heading("Have a project in mind? Let's talk.", { col: 0, size: "display" }),
        button("Start a conversation", c.primary, { col: 1, align: "end", mobileAlign: "start" }),
      ],
    }),
  }),

  definePreset({
    category: "cta",
    name: "card-centered",
    label: "Card on tinted band",
    description: "A raised card with headline, text and two actions, centred on a tinted section.",
    copy: [headline, copy.body(6, 35)],
    defaultTheme: "light-accent",
    tags: ["card", "centered", "panel"],
    links: { primary: "/signup", secondary: "/demo" },
    ai: {
      purpose: "Frames the final ask as a distinct, tidy panel.",
      whenToUse: "Software, courses and memberships.",
      avoid: CTA_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "content", gap: "lg" }),
      blocks: [
        text(
          [
            rt.h(2, "Try Frontdesk free for 30 days", "h2"),
            rt.p(
              "Set up your booking page in an afternoon. No card needed, and we'll move your clients across for you.",
            ),
          ],
          { align: "center", style: { ...panel("light", "xl"), border: "subtle" } },
        ),
        button("Start your free trial", c.primary, {
          align: "center",
          second: { label: "Book a demo", link: c.secondary },
        }),
      ],
    }),
  }),

  definePreset({
    category: "cta",
    name: "phone-band",
    label: "Call us band",
    description:
      "A slim band with a short line, a phone button and opening hours — for local services.",
    copy: [headline],
    defaultTheme: "brand",
    tags: ["phone", "band", "local", "compact"],
    ai: {
      purpose: "Gets a customer on the phone, fast.",
      whenToUse: "Plumbers, electricians, cleaners, locksmiths and clinics.",
      avoid: `${CTA_AVOID} Phone numbers nobody answers.`,
    },
    make: () => ({
      layout: stack({ cols: [7, 5], align: "center", gap: "xl" }),
      padding: { d: "lg", m: "lg" },
      blocks: [
        heading("Burst pipe? We're on our way.", {
          col: 0,
          eyebrow: "Emergency call-outs 7 days a week",
        }),
        button(
          "Call (303) 555‑0148",
          { type: "phone", phone: "+13035550148" },
          {
            col: 1,
            size: "large",
            align: "end",
            mobileAlign: "start",
          },
        ),
      ],
    }),
  }),

  definePreset({
    category: "cta",
    name: "with-testimonial",
    label: "Action with review",
    description: "A closing headline and button beside a short customer review.",
    copy: [headline, intro, copy.field("quote", "Testimonial", "testimonial", "quote", 6, 35)],
    images: [{ slot: "portrait", aspect: "1:1" }],
    defaultTheme: "light",
    tags: ["two-column", "testimonial", "closing"],
    links: { primary: "/apply" },
    ai: {
      purpose: "Removes the last doubt with someone else's words right next to the ask.",
      whenToUse: "Coaching, courses, clinics and high-consideration services.",
      avoid: `${CTA_AVOID} Invented reviews.`,
    },
    make: (c) => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        heading("Ready for a calmer year in business?", {
          col: 0,
          sub: "Applications for the spring cohort close on 1 March. Twelve places.",
        }),
        button("Apply for spring", c.primary, { col: 0 }),
        testimonial(
          "The best money I've spent on my business. I finally know where every week goes.",
          "Lauren Pike",
          "Owner, Pike Design Studio",
          "portraitCoach",
          { col: 1, variant: "card", rating: 5, style: panel(raised(c.theme)) },
        ),
      ],
    }),
  }),

  definePreset({
    category: "cta",
    name: "photo-split-dark",
    label: "Photo half with action",
    description:
      "A full-height photograph filling half the section, the call to action on a dark half.",
    copy: [headline, copy.body(6, 40)],
    images: [{ slot: "photo", aspect: "fill" }],
    defaultTheme: "dark-accent",
    tags: ["image", "grid", "bleed", "closing"],
    links: { primary: "/volunteer" },
    ai: {
      purpose: "A bold, magazine-like close with a strong photograph.",
      whenToUse: "Nonprofits, events, retreats and venues.",
      avoid: CTA_AVOID,
    },
    make: (c) => {
      const pic = image(photo("volunteers", 960));
      const words = text([
        rt.p("Volunteer", "eyebrow"),
        rt.h(2, "Two hours on a Saturday plants a street", "h2"),
        rt.p("No experience needed. We bring the tools, the trees and the coffee."),
      ]);
      const cta = button("Join a planting day", c.primary);
      return {
        padding: { d: "none", m: "none" },
        ...grid([
          [pic, r(1, 1, 12, 26, { bleed: "left" }), r(1, 1, 8, 14, { bleed: "both" })],
          [words, r(14, 8, 10, 10), r(1, 16, 8, 10)],
          [cta, r(14, 19, 10, 3), r(1, 27, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "cta",
    name: "gift-card",
    label: "Gift cards",
    description:
      "A short invitation to buy a gift card, with three reasons it makes a good present.",
    copy: [headline, intro, copy.items("reason", "Reason", "icon-list", "items", "title", 2, 6)],
    defaultTheme: "light-accent",
    tags: ["gift", "icons", "seasonal"],
    links: { primary: "/gift-cards" },
    ai: {
      purpose: "Sells gift cards around holidays and occasions.",
      whenToUse: "Restaurants, spas, studios and shops that sell gift cards.",
      avoid: CTA_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        heading("Give an hour of calm", {
          col: 0,
          eyebrow: "Gift cards",
          sub: "Treatment gift cards in any amount, sent by email in minutes or posted in a linen envelope.",
        }),
        button("Buy a gift card", c.primary, { col: 0 }),
        icons(
          [
            ["gift", "Any amount, any treatment"],
            ["calendar", "Valid for a full year"],
            ["mail", "Emailed in minutes"],
          ],
          "1",
          { col: 1, variant: "list", style: panel(raised(c.theme)) },
        ),
      ],
    }),
  }),

  definePreset({
    category: "cta",
    name: "minimal-link",
    label: "Minimal next step",
    description: "A single sentence with an inline arrow link — a whisper rather than a shout.",
    copy: [copy.headline(3, 14, 2)],
    defaultTheme: "light",
    tags: ["minimal", "text-only", "portfolio"],
    links: { primary: "/contact" },
    ai: {
      purpose: "A quiet close for portfolios and editorial sites.",
      whenToUse: "Portfolios, writers and architects.",
      avoid: CTA_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "content", gap: "md" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Currently booking commissions for autumn.", { size: "h2" }),
        button("Get in touch", c.primary, { role: "tertiary" }),
      ],
    }),
  }),
];

export const contactMorePresets = [
  definePreset({
    category: "contact",
    name: "map-wide",
    label: "Wide map with details",
    description: "A wide map with the address, phone and hours in a card beside it.",
    copy: [headline],
    defaultTheme: "light",
    tags: ["map", "wide", "hours", "location"],
    ai: {
      purpose: "Shows exactly where to go, with everything needed to visit.",
      whenToUse: "Shops, restaurants, clinics and venues.",
      avoid: CONTACT_AVOID,
    },
    make: (c) => {
      const h = heading("Find the studio", { eyebrow: "Visit" });
      const map = make(
        mapBlock,
        {
          name: "Juno Hair Studio",
          address: "77 Pearl Street, Boulder, CO 80302",
          latitude: 40.0176,
          longitude: -105.2797,
          zoom: 15,
          details: undefined,
          linkLabel: "Get directions",
          aspect: "16:9",
        },
        { variant: "plain" },
      );
      const info = contactInfo(
        {
          address: "77 Pearl Street\nBoulder, CO 80302",
          phone: "+1 (303) 555-0172",
          email: "hello@junohair.example",
        },
        { style: panel(raised(c.theme)) },
      );
      const hrs = hours(weekHours("10:00", "19:00", ["09:00", "16:00"]), {
        heading: "Hours",
        style: panel(raised(c.theme)),
      });
      return {
        ...grid([
          [h, r(1, 1, 16, 4), r(1, 1, 8, 4)],
          [map, r(1, 6, 16, 18), r(1, 6, 8, 10)],
          [info, r(17, 6, 8, 9), r(1, 17, 8, 9)],
          [hrs, r(17, 15, 8, 9), r(1, 27, 8, 11)],
        ]),
      };
    },
  }),

  definePreset({
    category: "contact",
    name: "quote-request",
    label: "Quote request",
    description: "A detailed quote form beside what happens next and the phone number.",
    copy: [headline, copy.items("step", "Step", "icon-list", "items", "title", 2, 8)],
    defaultTheme: "light-accent",
    tags: ["form", "two-column", "quote", "local"],
    ai: {
      purpose: "Collects enough detail to quote without a site visit.",
      whenToUse: "Trades, cleaners, movers and contractors.",
      avoid: CONTACT_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("Get a free, written quote", { col: 0, eyebrow: "Quotes" }),
        icons(
          [
            ["mail", "We reply within four hours", "Weekdays, 7am to 6pm."],
            ["home", "A free visit if we need one", "Usually within two days."],
            ["shield-check", "A fixed price in writing", "No surprises on the invoice."],
          ],
          "1",
          { col: 0, variant: "list" },
        ),
        formBlockOf(
          form(
            "Quote request",
            [
              field.name(),
              field.phone(),
              field.email("full"),
              {
                type: "select",
                name: "job",
                label: "Type of job",
                required: true,
                width: "full",
                options: [
                  "Leak or repair",
                  "Bathroom or kitchen",
                  "Water heater",
                  "Something else",
                ],
              },
              field.message("Tell us about the job"),
            ],
            "Request my quote",
            "Thanks — we'll be in touch within four working hours.",
          ),
          { col: 1, variant: "card" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "contact",
    name: "cards-row",
    label: "Contact options",
    description: "Three ways to get in touch as cards — call, email, visit — under a heading.",
    copy: [headline],
    defaultTheme: "light",
    tags: ["cards", "three-up", "options"],
    ai: {
      purpose: "Lets people choose how they'd like to reach you.",
      whenToUse: "Contact pages for clinics, schools and offices.",
      avoid: CONTACT_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [4, 4, 4], gap: "lg" }),
      blocks: [
        contactInfo(
          { phone: "+1 (503) 555-0110", note: "Mon–Fri, 8am–5pm" },
          { col: 0, heading: "Call", variant: "card" },
        ),
        contactInfo(
          { email: "office@harbourschool.example", note: "We reply within a day" },
          { col: 1, heading: "Email", variant: "card" },
        ),
        contactInfo(
          { address: "14 Quay Road\nPortland, OR 97209", note: "Visitors sign in at reception" },
          { col: 2, heading: "Visit", variant: "card" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "contact",
    name: "photo-form",
    label: "Form over photo",
    description: "A contact form card over a softened full-width photograph.",
    copy: [headline, copy.sub(4, 30)],
    images: [{ slot: "background", aspect: "fill" }],
    tags: ["form", "image", "background", "card"],
    ai: {
      purpose: "An atmospheric contact section for venues and destinations.",
      whenToUse: "Wedding venues, retreats, hotels and studios.",
      avoid: CONTACT_AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      padding: { d: "2xl", m: "xl" },
      background: {
        type: "image",
        src: photo("weddingField", 1920).src,
        focal: [0.5, 0.4],
        overlay: scrim(0.8),
      },
      blocks: [
        heading("Check your date", {
          align: "center",
          eyebrow: "Weddings at Hollins Barn",
          sub: "Tell us a little about your day and we'll send availability and a brochure.",
        }),
        formBlockOf(
          form(
            "Wedding enquiry",
            [
              field.name(),
              field.email(),
              {
                type: "date",
                name: "date",
                label: "Preferred date",
                required: false,
                width: "half",
              },
              {
                type: "text",
                name: "guests",
                label: "Number of guests",
                required: false,
                width: "half",
              },
            ],
            "Check availability",
            "Thank you! We'll reply within two days with dates and a brochure.",
          ),
          { variant: "card" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "contact",
    name: "simple-centered",
    label: "Email and phone, centred",
    description: "A centred heading with large email and phone links — no form.",
    copy: [headline, copy.body(3, 30)],
    defaultTheme: "dark",
    tags: ["centered", "minimal", "no-form"],
    ai: {
      purpose: "The simplest possible contact section.",
      whenToUse: "Freelancers, portfolios and personal sites.",
      avoid: CONTACT_AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "md" }),
      padding: { d: "2xl", m: "xl" },
      blocks: [
        heading("Let's make something", { align: "center", eyebrow: "Contact", size: "h1" }),
        text(
          [
            rt.p([rt.link("hello@lenabrandt.example", "mailto:hello@lenabrandt.example")], "lead"),
            rt.p("Based in Lisbon, working with teams everywhere."),
          ],
          { align: "center" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "contact",
    name: "appointment",
    label: "Appointment request",
    description: "A short appointment form with preferred day and time, beside hours and a note.",
    copy: [headline, copy.body(6, 40)],
    defaultTheme: "light",
    tags: ["form", "hours", "two-column", "appointments"],
    ai: {
      purpose: "Takes appointment requests for businesses without online booking.",
      whenToUse: "Clinics, salons, tutors and advisers.",
      avoid: CONTACT_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("Request an appointment", { col: 0, eyebrow: "New patients" }),
        text(
          [
            rt.p(
              "We'll call you back the same day to confirm a time. Bring any recent scans or reports.",
            ),
          ],
          {
            col: 0,
          },
        ),
        hours(weekHours("08:00", "18:00", ["09:00", "13:00"]), { col: 0, heading: "Clinic hours" }),
        formBlockOf(
          form(
            "Appointment request",
            [
              field.name(),
              field.phone(),
              field.email("full"),
              {
                type: "radio",
                name: "time",
                label: "Best time of day",
                required: false,
                options: ["Morning", "Afternoon", "Evening"],
              },
              field.message("What would you like help with?"),
            ],
            "Request appointment",
            "Thanks — we'll call you back today to confirm.",
          ),
          { col: 1, variant: "card" },
        ),
      ],
    }),
  }),
];

export const newsletterMorePresets = [
  definePreset({
    category: "newsletter",
    name: "centered-dark",
    label: "Centred on dark",
    description:
      "A centred heading, a promise of what subscribers get and an inline signup on dark.",
    copy: [headline, intro],
    defaultTheme: "dark",
    tags: ["centered", "inline", "dark"],
    ai: {
      purpose: "A focused, distraction-free invitation to subscribe.",
      whenToUse: "Writers, podcasters and makers.",
      avoid: NEWS_AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("One good essay, every other Sunday", {
          align: "center",
          eyebrow: "The Margin",
          sub: "On attention, craft and the places we go to think. Free, and read by 9,000 people.",
        }),
        newsletter(
          {
            button: "Subscribe",
            success: "Welcome aboard. The next essay arrives on Sunday.",
            note: "Unsubscribe in one click.",
          },
          { variant: "inline", style: { align: { d: "center" } } },
        ),
      ],
    }),
  }),

  definePreset({
    category: "newsletter",
    name: "with-benefits",
    label: "Signup with benefits",
    description:
      "What subscribers get as a short list, beside a signup card that asks for a first name.",
    copy: [headline, copy.items("benefit", "Benefit", "icon-list", "items", "title", 2, 8)],
    defaultTheme: "light-accent",
    tags: ["two-column", "icons", "card"],
    ai: {
      purpose: "Makes the value of subscribing concrete.",
      whenToUse: "Shops, studios and nonprofits with a regular email.",
      avoid: NEWS_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        heading("Join the plant club", { col: 0, eyebrow: "Newsletter" }),
        icons(
          [
            ["sprout", "Seasonal care tips each month"],
            ["gift", "First pick of rare plants"],
            ["calendar", "Workshop dates before anyone else"],
          ],
          "1",
          { col: 0, variant: "checklist" },
        ),
        newsletter(
          {
            heading: "Monthly, never more",
            button: "Join the club",
            success: "You're in. Watch for a welcome email with this month's care guide.",
            name: true,
          },
          { variant: "card", col: 1 },
        ),
      ],
    }),
  }),

  definePreset({
    category: "newsletter",
    name: "photo-background",
    label: "Signup over photo",
    description: "A signup card over a softened photograph.",
    copy: [copy.field("heading", "Heading", "newsletter", "heading", 2, 10)],
    images: [{ slot: "background", aspect: "fill" }],
    tags: ["image", "background", "card"],
    ai: {
      purpose: "An atmospheric signup for travel, food and outdoor brands.",
      whenToUse: "Retreats, restaurants, farms and outdoor brands.",
      avoid: NEWS_AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow" }),
      padding: { d: "2xl", m: "xl" },
      background: {
        type: "image",
        src: photo("forest", 1920).src,
        focal: [0.5, 0.5],
        overlay: scrim(0.8),
      },
      blocks: [
        newsletter(
          {
            heading: "Letters from the farm",
            description:
              "Harvest news, recipes and the first word on retreat dates. Four times a year.",
            button: "Sign up",
            success: "Thank you — the next letter goes out at the turn of the season.",
          },
          { variant: "stacked", style: { align: { d: "center" } } },
        ),
      ],
    }),
  }),

  definePreset({
    category: "newsletter",
    name: "inline-band",
    label: "Slim signup band",
    description: "A one-line band with a short prompt and an inline email field.",
    copy: [headline],
    defaultTheme: "brand",
    tags: ["band", "inline", "compact"],
    ai: {
      purpose: "A low-key signup that fits between any two sections.",
      whenToUse: "Above the footer on most pages.",
      avoid: NEWS_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "xl" }),
      padding: { d: "lg", m: "lg" },
      blocks: [
        heading("New drops, first", { col: 0, eyebrow: "Newsletter" }),
        newsletter(
          { button: "Get updates", success: "Thanks — you'll hear about the next drop first." },
          { variant: "inline", col: 1 },
        ),
      ],
    }),
  }),
];
