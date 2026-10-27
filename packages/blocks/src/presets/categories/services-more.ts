import { mapBlock } from "../../blocks/map";
import type { IconName } from "../../icons";
import { type CropAspect, type PhotoKey, photo } from "../images";
import { button, copy, definePreset, grid, heading, image, make, r, rt, stack, text } from "../kit";
import { card, icons, panel, qa, questions, raised, table } from "../parts";

/** Second wave of services & offerings: dark cards, index lists, detail, overlays, areas. */

const headline = copy.headline(1, 10, 2);
const AVOID =
  "Services the business doesn't offer; vague names ('Solutions'); prices or areas the owner hasn't confirmed.";

export const servicesMorePresets = [
  definePreset({
    category: "services",
    name: "dark-icon-cards",
    label: "Service cards on dark",
    description: "Four services as icon cards on a dark band, each linking to its page.",
    copy: [headline, copy.sub(6, 35)],
    defaultTheme: "dark",
    tags: ["cards", "icons", "four-up", "dark"],
    ai: {
      purpose: "A bold overview of the main services with a way into each.",
      whenToUse: "Trades, agencies, clinics and consultancies with four core services.",
      avoid: AVOID,
    },
    make: (c) => {
      const h = heading("What we can help with", {
        eyebrow: "Services",
        sub: "Licensed electricians for homes and small businesses across the county.",
      });
      const s = (title: string, body: string, icon: IconName, link: string) =>
        card(title, body, { icon, link, linkLabel: "Learn more", style: panel(raised(c.theme)) });
      const a = s(
        "Rewiring",
        "Safe, tidy rewires for older homes, room by room or all at once.",
        "zap",
        "/services/rewiring",
      );
      const b = s(
        "EV chargers",
        "Home charger installs with load checks and permits handled.",
        "car",
        "/services/ev-chargers",
      );
      const d = s(
        "Lighting",
        "Indoor and garden lighting designed around how you use each space.",
        "lightbulb",
        "/services/lighting",
      );
      const e = s(
        "Repairs",
        "Tripping breakers, dead sockets and flickering lights, fixed fast.",
        "wrench",
        "/services/repairs",
      );
      return {
        ...grid([
          [h, r(1, 1, 14, 7), r(1, 1, 8, 8)],
          [a, r(1, 9, 6, 13), r(1, 10, 8, 10)],
          [b, r(7, 9, 6, 13), r(1, 21, 8, 10)],
          [d, r(13, 9, 6, 13), r(1, 32, 8, 10)],
          [e, r(19, 9, 6, 13), r(1, 43, 8, 10)],
        ]),
      };
    },
  }),

  definePreset({
    category: "services",
    name: "index-list",
    label: "Numbered service list",
    description:
      "Services as a numbered editorial list with a short description each, beside a heading.",
    copy: [headline, copy.body(20, 120)],
    defaultTheme: "light",
    tags: ["list", "editorial", "text-only", "two-column"],
    ai: {
      purpose: "A typographic, magazine-like list of services for text-led brands.",
      whenToUse: "Consultants, architects, lawyers and studios.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ cols: [4, 8], gap: "2xl" }),
      blocks: [
        heading("Practice areas", { col: 0, eyebrow: "What we do" }),
        text(
          [
            rt.h(3, "01 — Wills and estates", "h3"),
            rt.p("Clear wills, powers of attorney and calm help with probate when the time comes."),
            rt.h(3, "02 — Buying and selling homes", "h3"),
            rt.p("Fixed-fee conveyancing with one named lawyer from offer to keys."),
            rt.h(3, "03 — Small business", "h3"),
            rt.p("Leases, partnership agreements and contracts written in plain English."),
            rt.h(3, "04 — Family matters", "h3"),
            rt.p("Separation, custody and prenuptial agreements handled with care and discretion."),
          ],
          { col: 1 },
        ),
      ],
    }),
  }),

  definePreset({
    category: "services",
    name: "detail-split",
    label: "Service in detail",
    description: "One service explained in depth: photo, description, what's included and a price.",
    copy: [
      headline,
      copy.body(10, 60),
      copy.items("inclusion", "Inclusion", "icon-list", "items", "title", 2, 8),
    ],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "light",
    tags: ["image", "two-column", "detail", "checklist"],
    links: { primary: "/book" },
    ai: {
      purpose: "Sells one service properly on its own page or section.",
      whenToUse: "Service detail pages for salons, clinics, trades and coaches.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl" }),
      blocks: [
        image(photo("bathroom", 480, "4:5"), { col: 0, aspect: "4:5" }),
        heading("Bathroom renovations", { col: 1, eyebrow: "From $14,500" }),
        text(
          [
            rt.p(
              "One team from strip-out to the last bead of silicone — plumbing, tiling, electrics and joinery — finished in about three weeks.",
            ),
          ],
          { col: 1 },
        ),
        icons(
          [
            ["check", "Design visit and 3D layout"],
            ["check", "All trades, one project lead"],
            ["check", "Waste removal and deep clean"],
            ["check", "Five-year workmanship guarantee"],
          ],
          "2",
          { col: 1, variant: "checklist" },
        ),
        button("Book a design visit", c.primary, { col: 1 }),
      ],
    }),
  }),

  definePreset({
    category: "services",
    name: "overlay-cards",
    label: "Services as photo tiles",
    description: "Three tall photo tiles with the service name set over each photograph.",
    copy: [headline],
    images: [{ slot: "service photos", aspect: "4:5", count: 3 }],
    defaultTheme: "light",
    tags: ["cards", "overlay", "image", "three-up"],
    ai: {
      purpose: "A visual menu of services where the photos do the talking.",
      whenToUse: "Salons, studios, venues and experiences.",
      avoid: `${AVOID} Busy photos that make the overlay text hard to read.`,
    },
    make: () => {
      const h = heading("Book a chair", { eyebrow: "Services", align: "center" });
      const t = (title: string, body: string, img: [PhotoKey, number, CropAspect?], link: string) =>
        card(title, body, { image: img, link, linkLabel: "Book", variant: "overlay" });
      const a = t(
        "Cuts",
        "Precision cuts and restyles, with a wash and finish.",
        ["hairCut", 380, "4:5"],
        "/book/cuts",
      );
      const b = t(
        "Colour",
        "Balayage, glosses and grey blending.",
        ["salonChairs", 380, "4:5"],
        "/book/colour",
      );
      const d = t(
        "Barbering",
        "Fades, beard trims and hot-towel shaves.",
        ["barber", 380, "4:5"],
        "/book/barbering",
      );
      return {
        ...grid([
          [h, r(5, 1, 16, 4), r(1, 1, 8, 4)],
          [a, r(1, 6, 8, 18), r(1, 6, 8, 14)],
          [b, r(9, 6, 8, 18), r(1, 21, 8, 14)],
          [d, r(17, 6, 8, 18), r(1, 36, 8, 14)],
        ]),
      };
    },
  }),

  definePreset({
    category: "services",
    name: "areas-served",
    label: "Areas we serve",
    description: "A map of the service area beside the towns covered and response times.",
    copy: [headline, copy.body(8, 50)],
    defaultTheme: "light-accent",
    tags: ["map", "local", "two-column", "trades"],
    links: { primary: "/quote" },
    ai: {
      purpose: "Tells local customers at a glance whether you cover them.",
      whenToUse: "Trades, cleaners, delivery and mobile services.",
      avoid: `${AVOID} Promising response times the team can't meet.`,
    },
    make: (c) => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        make(
          mapBlock,
          {
            name: "Fixwell Plumbing",
            address: "2150 W 32nd Ave, Denver, CO 80211",
            latitude: 39.7617,
            longitude: -105.0136,
            zoom: 11,
            details: undefined,
            linkLabel: "Open in Maps",
            aspect: "4:3",
          },
          { col: 0, variant: "plain" },
        ),
        heading("Where we work", { col: 1, eyebrow: "Service area" }),
        text(
          [
            rt.p(
              "Same-day visits anywhere within twenty minutes of our Highland yard: Highland, Berkeley, Sunnyside, Wheat Ridge, Arvada and Edgewater. Further out? Call and ask — we often say yes.",
            ),
          ],
          { col: 1 },
        ),
        button("Check your address", c.primary, { col: 1, role: "secondary" }),
      ],
    }),
  }),

  definePreset({
    category: "services",
    name: "accordion-image",
    label: "Services with photo and detail",
    description: "A photograph beside an expandable list of services with prices in each answer.",
    copy: [headline, copy.items("service", "Service", "accordion", "items", "question", 1, 8)],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "light",
    tags: ["accordion", "image", "two-column"],
    ai: {
      purpose: "Lists services compactly with detail on demand.",
      whenToUse: "Clinics, salons and studios with five to eight services.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        image(photo("massage", 480, "4:5"), { col: 0, aspect: "4:5" }),
        heading("Treatments", { col: 1, eyebrow: "Menu" }),
        questions(
          [
            qa(
              "Deep tissue massage",
              "Slow, firm pressure for chronic tension. 60 minutes, $95; 90 minutes, $135.",
            ),
            qa(
              "Pregnancy massage",
              "Side-lying with extra pillows, from 14 weeks. 60 minutes, $95.",
            ),
            qa(
              "Lymphatic drainage",
              "Light, rhythmic work that eases swelling after surgery or travel. 60 minutes, $105.",
            ),
            qa("Hot stone", "Warm basalt stones to melt the shoulders and back. 75 minutes, $120."),
          ],
          { col: 1, openFirst: true },
        ),
      ],
    }),
  }),

  definePreset({
    category: "services",
    name: "service-table",
    label: "Service comparison",
    description: "Service levels compared side by side in a table, with what each includes.",
    copy: [headline, copy.sub(6, 35)],
    defaultTheme: "light",
    tags: ["table", "comparison", "packages"],
    ai: {
      purpose: "Helps customers pick between service levels.",
      whenToUse: "Cleaning, maintenance, care plans and support packages.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "lg" }),
      blocks: [
        heading("Garden care plans", {
          align: "center",
          eyebrow: "Maintenance",
          sub: "Choose how often we visit. Every plan includes green waste removal.",
        }),
        table(
          [
            ["Seasonal", "4 visits"],
            ["Monthly", "12 visits", true],
            ["Fortnightly", "26 visits"],
          ],
          [
            ["Lawn mowing and edging", "yes", "yes", "yes"],
            ["Hedge trimming", "Twice a year", "Four times", "As needed"],
            ["Weeding and mulching", "yes", "yes", "yes"],
            ["Pruning and planting", "no", "yes", "yes"],
            ["Price per visit", "$140", "$120", "$95"],
          ],
          { caption: "Garden care plans compared", variant: "boxed" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "services",
    name: "horizontal-cards",
    label: "Service rows",
    description: "Services as wide horizontal cards: photo on the left, details on the right.",
    copy: [headline],
    images: [{ slot: "service photos", aspect: "3:2", count: 3 }],
    defaultTheme: "light-accent",
    tags: ["cards", "horizontal", "image", "list"],
    ai: {
      purpose: "Gives each service a photo and a paragraph without a long page.",
      whenToUse: "Venues, tours, photographers and event services.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "lg" }),
      blocks: [
        heading("Ways to work with me", { eyebrow: "Services" }),
        card("Portraits", "Unhurried sessions at home or outdoors, with thirty edited images.", {
          variant: "horizontal",
          image: ["portraitEditorial", 360, "3:2"],
          link: "/services/portraits",
          linkLabel: "Details and prices",
        }),
        card("Weddings", "Small weddings and elopements, from getting ready to the first dance.", {
          variant: "horizontal",
          image: ["weddingField", 360, "3:2"],
          link: "/services/weddings",
          linkLabel: "Details and prices",
        }),
        card(
          "Brand and editorial",
          "Photographs of people at work for websites, press and reports.",
          {
            variant: "horizontal",
            image: ["photographerStreet", 360, "3:2"],
            link: "/services/editorial",
            linkLabel: "Details and prices",
          },
        ),
      ],
    }),
  }),
];
