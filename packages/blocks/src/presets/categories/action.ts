import { type Form, newId } from "@openspace/schema";
import { contactInfoBlock, hoursBlock } from "../../blocks/business";
import { iconListBlock } from "../../blocks/card";
import { donationBlock } from "../../blocks/commerce";
import { countdownBlock } from "../../blocks/countdown";
import { formBlock } from "../../blocks/form";
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

/** Call to action, contact/location/hours and newsletter presets. */

const headline = copy.headline(2, 10, 2);
const intro = copy.sub(6, 35);
const CTA_AVOID =
  "More than one primary button; vague labels ('Click here'); urgency or offers the owner hasn't approved.";

export const ctaPresets = [
  definePreset({
    category: "cta",
    name: "banner",
    label: "Centred banner",
    description: "A short centred headline, one line of support and one clear action.",
    copy: [headline, intro],
    defaultTheme: "brand",
    tags: ["centered", "banner"],
    links: { primary: "/book", secondary: "/gift-cards" },
    ai: {
      purpose: "Closes a page with one clear next step.",
      whenToUse: "The last section before the footer on most pages.",
      avoid: CTA_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Your first class is on us", {
          align: "center",
          sub: "Come and see if the studio feels right. No pressure, no sales pitch — just a good stretch.",
        }),
        button("Book your free class", c.primary, {
          align: "center",
          size: "large",
          second: { label: "Buy a gift card", link: c.secondary },
        }),
      ],
    }),
  }),

  definePreset({
    category: "cta",
    name: "split",
    label: "Headline with action on the right",
    description: "A headline on the left and the action aligned to the right.",
    copy: [headline],
    defaultTheme: "dark-accent",
    tags: ["two-column", "compact"],
    links: { primary: "/contact" },
    ai: {
      purpose: "A compact, confident prompt between sections.",
      whenToUse: "Mid-page on services pages, or above the footer.",
      avoid: CTA_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [8, 4], align: "center", gap: "xl" }),
      padding: { d: "lg", m: "lg" },
      blocks: [
        heading("Ready to stop doing your own books?", { col: 0, eyebrow: "Let's talk" }),
        button("Book a 20-minute call", c.primary, {
          col: 1,
          align: "end",
          mobileAlign: "start",
          note: "Free, no obligation.",
        }),
      ],
    }),
  }),

  definePreset({
    category: "cta",
    name: "photo-background",
    label: "Photo background",
    description: "A call to action over a full-width photograph with a soft scrim.",
    copy: [headline, intro],
    images: [{ slot: "background", aspect: "fill" }],
    defaultTheme: "dark",
    tags: ["image", "background", "centered"],
    links: { primary: "/reserve" },
    ai: {
      purpose: "An atmospheric closing invitation.",
      whenToUse: "Restaurants, venues and travel — where the place sells itself.",
      avoid: `${CTA_AVOID} Busy photos that fight the text.`,
    },
    make: (c) => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      padding: { d: "3xl", m: "2xl" },
      background: {
        type: "image",
        src: photo("terrace", 1920).src,
        focal: [0.5, 0.5],
        overlay: scrim(0.6),
      },
      blocks: [
        heading("Long lunches on the terrace", {
          align: "center",
          sub: "Open for lunch Thursday to Sunday through September. Book a table by the water.",
        }),
        button("Reserve a table", c.primary, { align: "center" }),
      ],
    }),
  }),

  definePreset({
    category: "cta",
    name: "card-over-photo",
    label: "Card over photo",
    description: "A call-to-action card layered over the edge of a wide photograph.",
    copy: [headline, copy.body(8, 40)],
    images: [{ slot: "photo", aspect: "fill" }],
    tags: ["image", "grid", "overlap", "card"],
    links: { primary: "/volunteer" },
    ai: {
      purpose: "A warm, photo-led invitation with a solid card for legibility.",
      whenToUse: "Volunteering, membership and community calls to action.",
      avoid: CTA_AVOID,
    },
    make: (c) => {
      const pic = image(photo("volunteers", 1100));
      const card = text(
        [
          rt.h(2, "Give two hours a month", "h2"),
          rt.p(
            "Sort donations, drive deliveries or cook with us on Saturdays. Training and lunch are on us.",
          ),
        ],
        { style: { colorTheme: c.theme, padding: { d: "xl", m: "md" } } },
      );
      const cta = button("Sign up to volunteer", c.primary);
      return {
        ...grid([
          [pic, r(5, 1, 20, 20), r(1, 1, 8, 12)],
          [card, r(1, 9, 10, 11, { z: 2 }), r(1, 10, 8, 10, { z: 2 })],
          [cta, r(2, 21, 9, 3), r(1, 21, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "cta",
    name: "countdown",
    label: "Countdown to an event",
    description: "A headline, a live countdown and the action to register.",
    copy: [headline, intro],
    defaultTheme: "dark-accent",
    tags: ["countdown", "event", "centered"],
    links: { primary: "/tickets" },
    ai: {
      purpose: "Builds urgency for a real date: a launch, sale or event.",
      whenToUse: "Only when there's a genuine deadline the owner has set.",
      avoid: `${CTA_AVOID} Fake deadlines that reset.`,
    },
    make: (c) => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("The spring plant sale opens soon", {
          align: "center",
          eyebrow: "Saturday 9am",
          sub: "Over 400 varieties grown in our greenhouse, plus potting advice from the growers.",
        }),
        make(
          countdownBlock,
          {
            heading: undefined,
            headingLevel: "h3",
            target: "2027-04-17T09:00:00-05:00",
            showSeconds: false,
            doneMessage: "The sale is open — come on down to the greenhouse.",
            buttonLabel: undefined,
            link: undefined,
          },
          { variant: "boxes", style: { align: { d: "center" } } },
        ),
        button("Get early-entry tickets", c.primary, { align: "center" }),
      ],
    }),
  }),

  definePreset({
    category: "cta",
    name: "donate",
    label: "Donation appeal",
    description: "A short appeal beside a donation form with suggested amounts.",
    copy: [headline, copy.body(15, 70)],
    defaultTheme: "light-accent",
    tags: ["donation", "nonprofit", "two-column"],
    ai: {
      purpose: "Turns a reader into a donor with suggested amounts and monthly giving.",
      whenToUse: "Nonprofits, community groups and creators accepting support.",
      avoid: `${CTA_AVOID} Claims about what a gift buys that the owner hasn't confirmed.`,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], gap: "2xl", align: "center" }),
      blocks: [
        heading("Help us keep the pantry open", { col: 0, eyebrow: "Donate" }),
        text(
          [
            rt.p(
              "Every week we hand out fresh groceries to more than 300 families. $35 stocks a family's shelves for a week; a monthly gift lets us plan ahead.",
            ),
          ],
          { col: 0 },
        ),
        make(
          donationBlock,
          {
            heading: undefined,
            headingLevel: "h3",
            description: undefined,
            mode: "checkout",
            currency: "USD",
            amounts: [{ amount: 25 }, { amount: 35 }, { amount: 75 }, { amount: 150 }],
            allowCustom: true,
            frequency: "both",
            buttonLabel: "Give now",
            note: "Gifts are tax-deductible. You'll get a receipt by email.",
          },
          { col: 1, variant: "card" },
        ),
      ],
    }),
  }),
];

// --- contact ------------------------------------------------------------------------------------

const contactForm = (
  name: string,
  fields: Form["fields"],
  submitLabel: string,
  message: string,
): Form => ({
  id: newId("frm"),
  name,
  fields,
  submitLabel,
  success: { type: "message", message },
  notifyOwner: true,
});

const CONTACT_AVOID =
  "Made-up addresses, phone numbers or hours — always use the owner's real details; forms that ask for more than is needed.";

const hours = (open: string, close: string, weekendOpen?: string, weekendClose?: string) =>
  (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => {
    const weekend = day === "sat" || day === "sun";
    if (weekend && !weekendOpen) return { day, closed: true };
    return {
      day,
      opens: weekend ? weekendOpen : open,
      closes: weekend ? weekendClose : close,
      closed: false,
    };
  });

export const contactPresets = [
  definePreset({
    category: "contact",
    name: "form-split",
    label: "Contact form with details",
    description: "A heading and contact details on the left; an enquiry form on the right.",
    copy: [headline, intro],
    defaultTheme: "light",
    tags: ["form", "two-column"],
    ai: {
      purpose: "The main way to get in touch: a short form plus direct details.",
      whenToUse: "Contact pages and the end of services pages.",
      avoid: CONTACT_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("Tell us about your project", {
          col: 0,
          eyebrow: "Contact",
          sub: "We reply to every enquiry within two working days, usually sooner.",
        }),
        make(
          contactInfoBlock,
          {
            heading: undefined,
            headingLevel: "h3",
            name: "Fernhill Studio",
            address: "212 Larch Street, Studio 4\nPortland, OR 97214",
            phone: "+1 (503) 555-0187",
            email: "hello@fernhill.studio",
            directions: true,
            note: undefined,
          },
          { col: 0, variant: "list" },
        ),
        make(
          formBlock,
          {
            form: contactForm(
              "Project enquiry",
              [
                { type: "text", name: "name", label: "Your name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "select",
                  name: "budget",
                  label: "Rough budget",
                  width: "full",
                  options: ["Under $5,000", "$5,000 – $15,000", "$15,000+", "Not sure yet"],
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "What are you working on?",
                  required: true,
                  maxLength: 3000,
                },
              ],
              "Send enquiry",
              "Thanks — we've got your message and will be in touch within two working days.",
            ),
          },
          { col: 1, variant: "card" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "contact",
    name: "location",
    label: "Map, hours and address",
    description: "A map beside opening hours and contact details.",
    copy: [headline],
    images: [{ slot: "map", aspect: "4:3" }],
    defaultTheme: "light-accent",
    tags: ["map", "hours", "visit"],
    ai: {
      purpose: "Everything someone needs to visit: where, when and how to reach you.",
      whenToUse: "Any business with a physical location.",
      avoid: CONTACT_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [7, 5], gap: "2xl" }),
      blocks: [
        make(
          mapBlock,
          {
            name: "Little Ember Bakery",
            address: "418 Linden Street, Fort Collins, CO 80524",
            latitude: 40.5893,
            longitude: -105.0721,
            zoom: 15,
            details: undefined,
            linkLabel: "Open in Maps",
            aspect: "4:3",
          },
          { col: 0, variant: "plain" },
        ),
        heading("Come and see us", { col: 1, eyebrow: "Visit" }),
        make(
          hoursBlock,
          {
            heading: "Opening hours",
            headingLevel: "h3",
            rows: hours("07:00", "15:00", "08:00", "14:00"),
            note: "The ovens fire at 4am — loaves are usually gone by noon on Saturdays.",
          },
          { col: 1, variant: "compact" },
        ),
        make(
          contactInfoBlock,
          {
            heading: undefined,
            headingLevel: "h3",
            name: undefined,
            address: "418 Linden Street\nFort Collins, CO 80524",
            phone: "+1 (970) 555-0163",
            email: "hello@littleember.com",
            directions: true,
            note: undefined,
          },
          { col: 1, variant: "list" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "contact",
    name: "hours-overlap",
    label: "Hours card over photo",
    description: "A photograph of the shopfront with an opening-hours card layered on top.",
    copy: [],
    images: [{ slot: "photo", aspect: "fill" }],
    tags: ["image", "grid", "overlap", "hours"],
    ai: {
      purpose: "Opening times presented with the warmth of the place itself.",
      whenToUse: "Cafés, shops and restaurants.",
      avoid: CONTACT_AVOID,
    },
    make: (c) => {
      const pic = image(photo("cafeInterior", 960));
      const card = make(
        hoursBlock,
        {
          heading: "Opening hours",
          headingLevel: "h2",
          rows: hours("07:30", "17:00", "08:30", "16:00"),
          note: "Kitchen closes 30 minutes before the doors.",
        },
        { variant: "card", style: { colorTheme: c.theme, padding: { d: "lg", m: "md" } } },
      );
      const info = make(
        contactInfoBlock,
        {
          heading: undefined,
          headingLevel: "h3",
          name: "Morning Room Café",
          address: "77 Grove Avenue, Richmond, VA 23220",
          phone: "+1 (804) 555-0128",
          email: undefined,
          directions: true,
          note: undefined,
        },
        { variant: "list" },
      );
      return {
        ...grid([
          [pic, r(1, 1, 17, 24, { bleed: "left" }), r(1, 1, 8, 12, { bleed: "both" })],
          [card, r(14, 4, 10, 15, { z: 2 }), r(1, 10, 8, 15, { z: 2 })],
          [info, r(14, 20, 10, 5), r(1, 26, 8, 6)],
        ]),
      };
    },
  }),

  definePreset({
    category: "contact",
    name: "simple",
    label: "Simple contact",
    description: "A centred heading with email, phone and address — no form.",
    copy: [headline, intro],
    defaultTheme: "light",
    tags: ["centered", "minimal"],
    ai: {
      purpose: "Direct contact details for people who'd rather email or call.",
      whenToUse: "Small practices, freelancers and one-page sites.",
      avoid: CONTACT_AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Say hello", {
          align: "center",
          sub: "For commissions, prints and workshops, email is best. I check it every weekday morning.",
        }),
        make(
          contactInfoBlock,
          {
            heading: undefined,
            headingLevel: "h3",
            name: undefined,
            address: "Studio 9, The Printworks\nAsheville, NC 28801",
            phone: "+1 (828) 555-0119",
            email: "studio@junebarlow.com",
            directions: false,
            note: undefined,
          },
          { variant: "columns", style: { align: { d: "center" } } },
        ),
      ],
    }),
  }),

  definePreset({
    category: "contact",
    name: "booking-request",
    label: "Booking request form",
    description: "A centred heading and a booking request form on a card.",
    copy: [headline, intro],
    defaultTheme: "light-accent",
    tags: ["form", "booking", "centered"],
    ai: {
      purpose: "Collects booking or reservation requests the owner confirms by hand.",
      whenToUse: "Private dining, event venues, tours and anything confirmed personally.",
      avoid: `${CONTACT_AVOID} Promising availability the form can't check.`,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Private dining enquiries", {
          align: "center",
          eyebrow: "Groups of 8 – 24",
          sub: "Tell us the date and the occasion and we'll come back with menus and availability within a day.",
        }),
        make(
          formBlock,
          {
            form: contactForm(
              "Private dining",
              [
                { type: "text", name: "name", label: "Name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "date",
                  name: "date",
                  label: "Preferred date",
                  required: true,
                  width: "half",
                },
                {
                  type: "select",
                  name: "guests",
                  label: "Number of guests",
                  width: "half",
                  options: ["8 – 12", "13 – 18", "19 – 24"],
                },
                {
                  type: "textarea",
                  name: "occasion",
                  label: "Tell us about the occasion",
                  maxLength: 2000,
                },
              ],
              "Send request",
              "Thank you — we'll be in touch within one day with menus and availability.",
            ),
          },
          { variant: "card" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "contact",
    name: "two-locations",
    label: "Two locations",
    description: "Two shops side by side, each with address, phone and hours.",
    copy: [headline],
    defaultTheme: "light",
    tags: ["locations", "hours", "two-column"],
    ai: {
      purpose: "Lists more than one location clearly.",
      whenToUse: "Businesses with two or three branches.",
      avoid: CONTACT_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], gap: "xl" }),
      blocks: [
        heading("Two shops, same bread", { col: 0, eyebrow: "Locations" }),
        make(
          contactInfoBlock,
          {
            heading: "Old Town",
            headingLevel: "h3",
            name: undefined,
            address: "418 Linden Street\nFort Collins, CO 80524",
            phone: "+1 (970) 555-0163",
            email: undefined,
            directions: true,
            note: "Seating for twenty, plus the patio.",
          },
          { col: 0, variant: "card" },
        ),
        make(
          contactInfoBlock,
          {
            heading: "Midtown",
            headingLevel: "h3",
            name: undefined,
            address: "2601 College Avenue\nFort Collins, CO 80525",
            phone: "+1 (970) 555-0171",
            email: undefined,
            directions: true,
            note: "Takeaway only, with parking out front.",
          },
          { col: 1, variant: "card" },
        ),
      ],
    }),
  }),
];

// --- newsletter ---------------------------------------------------------------------------------

const NEWS_AVOID =
  "Promising perks, discounts or a schedule the owner hasn't confirmed; asking for more than an email.";

const signup = (
  fields: Partial<Record<string, unknown>>,
  variant: string,
  extra: { col?: number; style?: object } = {},
) =>
  make(
    newsletterBlock,
    {
      heading: undefined,
      description: undefined,
      askName: false,
      placeholder: "you@example.com",
      buttonLabel: "Subscribe",
      successMessage: "Thanks for subscribing — check your inbox to confirm.",
      note: undefined,
      ...fields,
    },
    { variant, ...extra },
  );

export const newsletterPresets = [
  definePreset({
    category: "newsletter",
    name: "banner",
    label: "Newsletter banner",
    description: "A heading and inline signup in one compact band.",
    copy: [copy.field("heading", "Heading", "newsletter", "heading", 2, 10)],
    defaultTheme: "dark-accent",
    tags: ["compact", "band"],
    ai: {
      purpose: "A low-key invitation to subscribe.",
      whenToUse: "Above the footer on most pages.",
      avoid: NEWS_AVOID,
    },
    make: () => ({
      layout: stack(),
      padding: { d: "lg", m: "lg" },
      blocks: [
        signup(
          {
            heading: "Fresh from the oven, once a month",
            description: "New bakes, seasonal specials and the occasional recipe. No spam.",
            buttonLabel: "Sign me up",
          },
          "banner",
        ),
      ],
    }),
  }),

  definePreset({
    category: "newsletter",
    name: "card",
    label: "Newsletter card",
    description: "A centred card with heading, description and signup.",
    copy: [copy.field("heading", "Heading", "newsletter", "heading", 2, 10)],
    defaultTheme: "light-accent",
    tags: ["card", "centered"],
    ai: {
      purpose: "A focused, friendly signup.",
      whenToUse: "Blog posts, the end of articles, writer and creator sites.",
      avoid: NEWS_AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow" }),
      blocks: [
        signup(
          {
            heading: "Get the Sunday letter",
            description:
              "One essay about slow living and good work, every Sunday morning. Read by 9,000 people.",
            askName: true,
            note: "Unsubscribe any time with one click.",
          },
          "card",
          { style: { align: { d: "center" } } },
        ),
      ],
    }),
  }),

  definePreset({
    category: "newsletter",
    name: "split-image",
    label: "Signup beside photo",
    description: "A photograph beside a heading, the reasons to subscribe and the signup.",
    copy: [headline],
    images: [{ slot: "photo", aspect: "4:5" }],
    tags: ["image", "two-column", "benefits"],
    ai: {
      purpose: "Sells the newsletter with what readers get.",
      whenToUse: "Newsletter-first sites and landing pages.",
      avoid: NEWS_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], gap: "2xl", align: "center" }),
      blocks: [
        image(photo("writing", 520, "4:5"), { col: 0, aspect: "4:5" }),
        heading("Notes from the garden", { col: 1, eyebrow: "Newsletter" }),
        make(
          iconListBlock,
          {
            columns: "1",
            items: [
              { icon: "sprout", title: "What to sow this month" },
              { icon: "calendar", title: "First dibs on workshop places" },
              { icon: "gift", title: "A seed swap list every spring" },
            ],
          },
          { col: 1, variant: "list" },
        ),
        signup({ buttonLabel: "Join the list", note: "Twice a month. No spam, ever." }, "stacked", {
          col: 1,
        }),
      ],
    }),
  }),

  definePreset({
    category: "newsletter",
    name: "overlap",
    label: "Signup over landscape",
    description: "A wide landscape photograph with a signup card layered across it.",
    copy: [copy.field("heading", "Heading", "newsletter", "heading", 2, 10)],
    images: [{ slot: "photo", aspect: "fill" }],
    defaultTheme: "light",
    tags: ["image", "grid", "overlap", "card"],
    ai: {
      purpose: "A memorable signup moment for travel, outdoor and lifestyle brands.",
      whenToUse: "Home pages of brands with strong landscape photography.",
      avoid: NEWS_AVOID,
    },
    make: (c) => {
      const pic = image(photo("hills", 1440));
      const card = signup(
        {
          heading: "Trail notes, every other Friday",
          description: "Routes, gear we actually use and the best café at the end of each walk.",
        },
        "stacked",
        { style: { colorTheme: c.theme, padding: { d: "xl", m: "md" } } },
      );
      return {
        ...grid(
          [
            [pic, r(1, 1, 24, 22), r(1, 1, 8, 12, { bleed: "both" })],
            [card, r(13, 8, 10, 13, { z: 2 }), r(1, 9, 8, 14, { z: 2 })],
          ],
          { width: "wide" },
        ),
      };
    },
  }),
];
