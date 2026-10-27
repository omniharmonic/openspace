import type { TemplateSpec } from "../../lib/define";
import {
  block,
  definePages,
  formId,
  fromPreset,
  headerFrom,
  heading,
  makePage,
  PHOTO_SCRIM,
  page,
  photo,
  photoBackground,
  photoUrl,
  rt,
  section,
} from "../../lib/kit";

/**
 * Hearth — restaurants, cafés and bakeries (doc 04 §7). Warm and appetizing: Young Serif /
 * Work Sans in tomato, cream and olive; a real menu block, hours and a map, reservations, and a
 * strip of photographs from the kitchen.
 *
 * Demo owner: Ember & Olive, a wood-fired trattoria on Federal Hill in Providence.
 */

const T = "hearth";
const PAGES = definePages(T, {
  home: "",
  menu: "menu",
  visit: "visit",
  privateDining: "private-dining",
  about: "about",
});
const P = PAGES.id;
const _href = PAGES.href;

const NAME = "Ember & Olive";
const ADDRESS = "214 Atwells Avenue\nProvidence, RI 02903";
const PHONE = "+1 (401) 555-0158";
const EMAIL = "ciao@emberandolive.example";

const HOURS = [
  { day: "mon", closed: true },
  { day: "tue", opens: "17:00", closes: "22:00", closed: false },
  { day: "wed", opens: "17:00", closes: "22:00", closed: false },
  { day: "thu", opens: "17:00", closes: "22:00", closed: false },
  { day: "fri", opens: "17:00", closes: "23:00", closed: false },
  { day: "sat", opens: "12:00", closes: "23:00", closed: false },
  { day: "sun", opens: "12:00", closes: "21:00", closed: false },
];

type Dish = [
  name: string,
  description: string,
  price: string,
  tags?: ("v" | "vg" | "gf" | "spicy" | "n")[],
];
const dishes = (...items: Dish[]) =>
  items.map(([name, description, price, tags]) => ({
    name,
    description,
    price,
    dietary: (tags ?? []).map((tag) => ({ tag })),
  }));

const reservationForm = () => ({
  form: {
    id: formId(),
    name: "Reservation request",
    fields: [
      { type: "text", name: "name", label: "Name", required: true, width: "half" },
      { type: "email", name: "email", label: "Email", required: true, width: "half" },
      { type: "date", name: "date", label: "Date", required: true, width: "half" },
      {
        type: "select",
        name: "time",
        label: "Time",
        required: true,
        width: "half",
        options: ["5:00", "5:30", "6:00", "6:30", "7:00", "7:30", "8:00", "8:30", "9:00"],
      },
      {
        type: "select",
        name: "guests",
        label: "Guests",
        required: true,
        width: "half",
        options: ["1", "2", "3", "4", "5", "6", "7 or more"],
      },
      { type: "phone", name: "phone", label: "Phone", width: "half" },
      { type: "textarea", name: "notes", label: "Allergies or occasions", maxLength: 1000 },
    ],
    submitLabel: "Request a table",
    success: {
      type: "message",
      message: "Grazie! We'll confirm your table by email within a few hours.",
    },
    notifyOwner: true,
  },
});

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Ember & Olive is a wood-fired trattoria on Federal Hill in Providence: handmade pasta, pizza from the oven and natural wine.",
    [
      fromPreset("hero/staggered-photos@1", {
        edit: {
          "image:1": {
            image: photo(
              "plates",
              420,
              "original",
              "Grilled steak, herbs and sauces shared across the table",
            ),
          },
          "image:2": {
            image: photo(
              "chefPrep",
              320,
              "original",
              "Our cook chopping fresh herbs before service",
            ),
          },
          "image:3": {
            image: photo("pizza", 420, "original", "A wood-fired pizza cut into slices"),
          },
          text: {
            content: rt.doc(
              rt.p("Federal Hill · Providence", "eyebrow"),
              rt.h(1, "Wood-fired cooking, made to share", "h1"),
              rt.p(
                "Handmade pasta, blistered pizza and whatever the market brought in that morning, cooked over oak and served to the middle of the table.",
              ),
            ),
          },
          button: {
            label: "Reserve a table",
            link: page(P.visit, "reserve"),
            secondaryLabel: "See the menu",
            secondaryLink: page(P.menu),
          },
        },
      }),
      fromPreset("services/price-list@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "From the oven",
            text: "A few things we're known for",
            subheading:
              "The menu changes with the season; these never leave it. Everything is made in our kitchen each afternoon.",
          },
          button: { label: "The full menu", link: page(P.menu), role: "secondary" },
          "restaurant-menu": {
            sections: [
              {
                title: "Favourites",
                items: dishes(
                  [
                    "Cacio e pepe",
                    "Hand-rolled tonnarelli, pecorino romano, cracked black pepper.",
                    "24",
                    ["v"],
                  ],
                  [
                    "Margherita DOP",
                    "San Marzano tomato, fior di latte, basil, olive oil.",
                    "19",
                    ["v"],
                  ],
                  [
                    "Spiedini di gamberi",
                    "Oak-grilled shrimp, salsa verde, charred lemon.",
                    "27",
                    ["gf"],
                  ],
                  ["Tiramisù", "Espresso-soaked savoiardi, mascarpone, cocoa.", "12", ["v"]],
                ),
              },
            ],
            currency: "$",
            legend: true,
            footnote:
              "Most dishes can be made gluten-free; please tell your server about any allergies.",
          },
        },
      }),
      fromPreset("about/quote-and-image@1", {
        edit: {
          image: {
            image: photo(
              "dining",
              640,
              "3:2",
              "The dining room at Ember & Olive, lit low before service",
            ),
          },
          quote: {
            quote: rt.doc(
              rt.p(
                "My grandmother cooked for twelve every Sunday on a wood stove in Calabria. I just wanted a room where it feels like that every night.",
              ),
            ),
            attribution: "Lucia Ferrante",
            source: "Chef and owner",
          },
        },
      }),
      fromPreset("gallery/carousel@1", {
        edit: {
          heading: { eyebrow: "From the kitchen", text: "This week at the pass" },
          gallery: {
            images: [
              {
                image: photo("pastaRagu", 420, "4:5", "Pappardelle with slow-cooked ragù"),
                caption: "Pappardelle, Sunday ragù",
              },
              {
                image: photo("pastaCutting", 420, "4:5", "Cutting fresh tagliatelle by hand"),
                caption: "Tagliatelle, cut at 3pm",
              },
              {
                image: photo("dinner", 420, "4:5", "A plated dish on a candlelit table"),
                caption: "Branzino, capers, lemon",
              },
              {
                image: photo("breadLoaves", 420, "4:5", "Two rustic loaves dusted with flour"),
                caption: "Our daily bread",
              },
              {
                image: photo("sharedTable", 420, "4:5", "Friends sharing dinner on the terrace"),
                caption: "Sunday on the terrace",
              },
            ],
            lightbox: true,
          },
        },
      }),
      fromPreset("contact/hours-overlap@1", {
        edit: {
          image: {
            image: photo(
              "cafeInterior",
              860,
              "original",
              "Wooden tables and pendant lights in the dining room",
            ),
          },
          hours: {
            heading: "Opening hours",
            rows: HOURS,
            note: "Kitchen closes 30 minutes before the doors. Walk-ins welcome at the bar.",
          },
          "contact-info": {
            name: NAME,
            address: "214 Atwells Avenue, Providence, RI 02903",
            phone: PHONE,
          },
        },
      }),
      fromPreset("testimonials/three-cards@1", {
        edit: {
          heading: { eyebrow: "Guests", text: "Why people keep coming back" },
          "testimonial:1": {
            quote: rt.doc(
              rt.p(
                "The cacio e pepe is the best I've had outside Rome, and they remembered our anniversary.",
              ),
            ),
            name: "Jules Moreno",
            role: "Regular since opening",
            photo: photo("portraitSam", 120, "1:1", "Portrait of Jules Moreno"),
          },
          "testimonial:2": {
            quote: rt.doc(
              rt.p(
                "We booked the long table for my mother's 70th. Family-style platters, perfect pacing, no rush at all.",
              ),
            ),
            name: "Nadia Sorensen",
            role: "Private dining, March",
            photo: photo("portraitClara", 120, "1:1", "Portrait of Nadia Sorensen"),
          },
          "testimonial:3": {
            quote: rt.doc(
              rt.p(
                "Sit at the counter and watch the oven. Order whatever the chef says is good tonight.",
              ),
            ),
            name: "Theo Grant",
            role: "Food writer, Providence Weekly",
            photo: photo("portraitTheo", 120, "1:1", "Portrait of Theo Grant"),
          },
        },
      }),
      fromPreset("cta/photo-background@1", {
        style: { background: photoBackground(photo("terrace", 1440, "original"), PHOTO_SCRIM) },
        edit: {
          heading: {
            text: "A long table for your celebration",
            subheading:
              "Private dining for 10 to 24 guests in the back room, with a family-style menu cooked over the fire.",
          },
          button: { label: "Plan a private dinner", link: page(P.privateDining) },
        },
      }),
    ],
  );
}

function menu() {
  return makePage(
    P.menu,
    "Menu",
    "menu",
    "The Ember & Olive dinner menu: antipasti, handmade pasta, wood-fired pizza, dishes from the oven, desserts and natural wine.",
    [
      section(
        [
          heading("Menu", {
            level: 1,
            size: "display",
            eyebrow: "Dinner · Tuesday to Sunday",
            sub: "Made to share. Order a few plates for the middle of the table and add more as you go.",
            align: "center",
          }),
        ],
        { width: "narrow" },
        { theme: "light-accent", padding: { d: "xl", m: "lg" } },
      ),
      section(
        [
          heading("Dinner", {
            align: "center",
            sub: "Served Tuesday to Sunday from 5pm, and from noon at weekends.",
          }),
          block(
            "restaurant-menu",
            {
              sections: [
                {
                  title: "Antipasti",
                  items: dishes(
                    ["Focaccia", "Rosemary, flaky salt, whipped ricotta and honey.", "9", ["v"]],
                    ["Burrata", "Roasted grapes, saba, toasted hazelnuts.", "16", ["v", "n"]],
                    [
                      "Arancini",
                      "Saffron risotto, smoked mozzarella, Calabrian chili aioli.",
                      "13",
                      ["v", "spicy"],
                    ],
                    ["Crudo", "Local fluke, blood orange, fennel, olive oil.", "18", ["gf"]],
                  ),
                },
                {
                  title: "Pasta",
                  note: "Made by hand every afternoon",
                  items: dishes(
                    ["Cacio e pepe", "Tonnarelli, pecorino romano, black pepper.", "24", ["v"]],
                    ["Pappardelle", "Slow-braised short rib ragù, parmigiano.", "29"],
                    [
                      "Agnolotti",
                      "Butternut squash, brown butter, sage, amaretti.",
                      "26",
                      ["v", "n"],
                    ],
                    [
                      "Linguine alle vongole",
                      "Rhode Island littlenecks, garlic, white wine, chili.",
                      "31",
                      ["spicy"],
                    ],
                  ),
                },
                {
                  title: "Pizza",
                  note: "From the oak-fired oven",
                  items: dishes(
                    ["Margherita DOP", "San Marzano tomato, fior di latte, basil.", "19", ["v"]],
                    [
                      "Diavola",
                      "Spicy soppressata, tomato, mozzarella, hot honey.",
                      "22",
                      ["spicy"],
                    ],
                    ["Funghi", "Roasted mushrooms, taleggio, thyme, garlic.", "21", ["v"]],
                  ),
                },
                {
                  title: "Dal forno",
                  items: dishes(
                    [
                      "Half chicken",
                      "Brined and roasted in the oven, salsa verde, potatoes.",
                      "32",
                      ["gf"],
                    ],
                    ["Whole branzino", "Charred lemon, capers, herbs.", "38", ["gf"]],
                    [
                      "Bistecca for two",
                      "Dry-aged ribeye, rosemary, sea salt, arugula.",
                      "84",
                      ["gf"],
                    ],
                  ),
                },
                {
                  title: "Dolci",
                  items: dishes(
                    ["Tiramisù", "Espresso, mascarpone, cocoa.", "12", ["v"]],
                    ["Olive oil cake", "Citrus, whipped mascarpone.", "11", ["v"]],
                    ["Affogato", "Fior di latte gelato, a shot of espresso.", "9", ["v", "gf"]],
                  ),
                },
              ],
              currency: "$",
              legend: true,
              footnote:
                "A 20% service charge is added for tables of eight or more. Please tell us about any allergies.",
            },
            { variant: "classic" },
          ),
        ],
        { width: "narrow" },
        { theme: "light", label: "Dinner menu", preset: "services/price-list@1" },
      ),
      section(
        [
          heading("Wine & drinks", { eyebrow: "By the glass and bottle", align: "center" }),
          block(
            "restaurant-menu",
            {
              sections: [
                {
                  title: "Wine by the glass",
                  items: dishes(
                    ["Frizzante, Lambrusco di Sorbara", "Bright, dry and a little fizzy.", "12"],
                    ["Bianco, Etna", "Volcanic, mineral, saline.", "14"],
                    ["Rosso, Nero d'Avola", "Ripe, juicy, easy with pizza.", "13"],
                  ),
                },
                {
                  title: "Aperitivi",
                  items: dishes(
                    ["Negroni", "Gin, Campari, sweet vermouth.", "14"],
                    ["Spritz", "Aperol or Select, prosecco, soda.", "13"],
                    ["Chinotto spritz", "Italian bitter orange soda, no alcohol.", "8"],
                  ),
                },
              ],
              currency: "$",
              legend: false,
            },
            { variant: "columns" },
          ),
        ],
        {},
        { theme: "light-accent", label: "Drinks" },
      ),
    ],
  );
}

function visit() {
  return makePage(
    P.visit,
    "Visit & reservations",
    "visit",
    "Book a table at Ember & Olive, 214 Atwells Avenue, Providence. Opening hours, directions, parking and reservation requests.",
    [
      fromPreset("contact/location@1", {
        edit: {
          map: {
            name: NAME,
            address: "214 Atwells Avenue, Providence, RI 02903",
            latitude: 41.8205,
            longitude: -71.4245,
          },
          heading: { eyebrow: "Visit", text: "Find us on Federal Hill", level: "h1" },
          hours: {
            rows: HOURS,
            headingLevel: "h2",
            note: "Valet parking on Friday and Saturday evenings; metered parking on Atwells Avenue.",
          },
          "contact-info": { address: ADDRESS, phone: PHONE, email: EMAIL, headingLevel: "h2" },
        },
      }),
      fromPreset("contact/booking-request@1", {
        anchor: "reserve",
        edit: {
          heading: {
            eyebrow: "Reservations",
            text: "Reserve a table",
            subheading:
              "Book up to 30 days ahead. We keep the bar and counter seats for walk-ins every night.",
          },
          form: reservationForm(),
        },
      }),
    ],
  );
}

function privateDining() {
  return makePage(
    P.privateDining,
    "Private dining",
    "private-dining",
    "Host a birthday, rehearsal dinner or work celebration in the Ember & Olive back room, for 10 to 24 guests, family style.",
    [
      fromPreset("hero/split-landscape@1", {
        edit: {
          image: {
            image: photo("sharedTable", 760, "3:2", "Friends talking over a long shared table"),
          },
          heading: {
            eyebrow: "Private dining",
            text: "The long table is yours",
            subheading:
              "Our back room seats up to 24 at one long table beside the oven. We'll plan a family-style menu with you and pour wines to match.",
          },
          button: {
            label: "Send an enquiry",
            link: page(P.privateDining, "enquire"),
            secondaryLabel: "See the menu",
            secondaryLink: page(P.menu),
          },
        },
      }),
      fromPreset("pricing/compact-list@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Menus", text: "Family-style menus" },
          pricing: {
            plans: [
              {
                name: "La Tavola",
                price: "$68",
                period: "per guest",
                description: "Antipasti to share, two pastas, wood-fired chicken and dessert.",
                features: [],
                buttonLabel: "Enquire",
                link: page(P.privateDining, "enquire"),
                featured: false,
              },
              {
                name: "Il Fuoco",
                price: "$92",
                period: "per guest",
                description: "Crudo and burrata, three pastas, bistecca for the table and dolci.",
                features: [],
                buttonLabel: "Enquire",
                link: page(P.privateDining, "enquire"),
                featured: false,
              },
              {
                name: "Wine pairing",
                price: "$45",
                period: "per guest",
                description: "Four Italian wines chosen by our sommelier to match your menu.",
                features: [],
                buttonLabel: "Add pairing",
                link: page(P.privateDining, "enquire"),
                featured: false,
              },
            ],
            note: "Minimum spend of $1,200 on Friday and Saturday evenings.",
          },
        },
      }),
      fromPreset("contact/booking-request@1", {
        anchor: "enquire",
        edit: {
          heading: {
            eyebrow: "Groups of 10 – 24",
            text: "Tell us about your dinner",
            subheading:
              "Share the date, the occasion and any dietary needs. We'll reply with menus and availability within a day.",
          },
          form: {
            form: {
              id: formId(),
              name: "Private dining",
              fields: [
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
                  label: "Guests",
                  width: "half",
                  options: ["10 – 14", "15 – 19", "20 – 24"],
                },
                { type: "textarea", name: "occasion", label: "The occasion", maxLength: 2000 },
              ],
              submitLabel: "Send enquiry",
              success: {
                type: "message",
                message: "Thank you! Our events manager will reply within a day.",
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
    "Chef Lucia Ferrante opened Ember & Olive in 2019. Meet the team behind the oven and the farms we cook with.",
    [
      fromPreset("about/story-split@1", {
        edit: {
          image: {
            image: photo("portraitMaya", 520, "4:5", "Portrait of chef Lucia Ferrante, smiling"),
          },
          heading: {
            eyebrow: "Our story",
            text: "Cooking the way my nonna did",
            level: "h1",
            size: "h1",
          },
          text: {
            content: rt.doc(
              rt.p(
                "I grew up between Providence and my grandmother's village in Calabria, where dinner was cooked on a wood stove and nobody left the table early. After fifteen years cooking in Boston and Rome, I came home to Federal Hill to open the kind of place I always wanted to eat in.",
              ),
              rt.p(
                "Ember & Olive opened in 2019 with one oak-fired oven and twelve tables. We buy whole animals and whole crates of vegetables from farms within an hour of the restaurant, make every pasta by hand, and change the menu whenever the market does.",
              ),
            ),
          },
          button: { label: "Meet the team", link: page(P.about, "team"), role: "secondary" },
        },
      }),
      fromPreset("team/grid@1", {
        theme: "light-accent",
        anchor: "team",
        edit: {
          heading: {
            eyebrow: "The team",
            text: "Around the fire",
            subheading: "A small crew who cook, pour and look after you every night.",
          },
          team: {
            people: [
              {
                name: "Lucia Ferrante",
                role: "Chef & owner",
                photo: photo("portraitMaya", 300, "4:5", "Portrait of Lucia Ferrante"),
              },
              {
                name: "Owen Bassett",
                role: "Head of pasta",
                photo: photo("portraitDaniel", 300, "4:5", "Portrait of Owen Bassett"),
              },
              {
                name: "Ana Delgado",
                role: "Front of house",
                photo: photo("portraitAna", 300, "4:5", "Portrait of Ana Delgado"),
              },
              {
                name: "Marcus Hale",
                role: "Sommelier",
                photo: photo("portraitMarcus", 300, "4:5", "Portrait of Marcus Hale"),
              },
            ],
          },
        },
      }),
      fromPreset("logos/row@1", {
        edit: {
          "logo-strip": {
            label: "We cook with",
            logos: [
              { name: "Hurricane Hill Farm" },
              { name: "Little Compton Oysters" },
              { name: "Wildflour Mill" },
              { name: "Sweet Berry Farm" },
              { name: "Narragansett Creamery" },
            ],
          },
        },
      }),
    ],
  );
}

export const hearth: TemplateSpec = {
  id: T,
  name: "Hearth",
  description:
    "A warm, appetizing site for restaurants, cafés and bakeries, with a real menu, opening hours and map, reservations and a strip of food photography.",
  persona: "Restaurants, cafés, bakeries",
  mood: "Warm, appetizing",
  tags: ["restaurant", "café", "bakery", "menu", "reservations", "hospitality"],
  sample: { name: NAME, tagline: "Wood-fired cooking, made to share." },
  thumbnail: P.home,
  looks: [
    {
      id: "tomato",
      name: "Tomato",
      description:
        "Ripe tomato red on cream with olive-green buttons and links, and Young Serif headings.",
      choices: {
        palette: {
          brand: "oklch(0.6 0.2 30)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "young-serif-work-sans",
        density: "comfortable",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
      overrides: { color: { accent: { $value: "oklch(0.5 0.1 115)", $type: "color" } } },
    },
    {
      id: "olive-grove",
      name: "Olive Grove",
      description: "Olive and cream with Playfair Display, for a quieter, wine-bar mood.",
      choices: {
        palette: {
          brand: "oklch(0.55 0.09 115)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "playfair-source-sans",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "bistro-noir",
      name: "Bistro Noir",
      description:
        "Deep wine red with Abril Fatface headings and sharp corners, for a late-night bistro.",
      choices: {
        palette: {
          brand: "oklch(0.38 0.11 18)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "abril-lato",
        density: "compact",
        shape: "sharp",
        buttons: "outline",
        motion: "subtle",
        imageTreatment: "grain",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: NAME,
        tagline: "Wood-fired cooking, made to share.",
        nav: [
          { type: "page", page: P.menu, label: "Menu" },
          { type: "page", page: P.privateDining, label: "Private dining" },
          { type: "page", page: P.about, label: "Our story" },
          { type: "page", page: P.visit, label: "Visit" },
          { type: "button", label: "Reserve", link: page(P.visit, "reserve"), style: "primary" },
        ],
        header: headerFrom("header/centered-nav@1", { sticky: true }),
        footer: fromPreset("footer/visit@1", {
          edit: {
            text: {
              content: rt.doc(
                rt.p(NAME, "lead"),
                rt.p(
                  "Wood-fired Italian cooking on Federal Hill. Dinner Tuesday to Sunday, lunch at weekends.",
                  "small",
                ),
              ),
            },
            "social-links": { profiles: [] },
            "contact-info": { heading: "Find us", address: ADDRESS, phone: PHONE, email: EMAIL },
            hours: { heading: "Hours", rows: HOURS },
          },
        }),
        social: [
          { network: "instagram", url: "https://instagram.com/emberandolive.example" },
          { network: "tripadvisor", url: "https://tripadvisor.com/emberandolive-example" },
          { network: "email", url: `mailto:${EMAIL}` },
        ],
        seo: {
          titleTemplate: "%s · Ember & Olive, Providence",
          description: "Wood-fired Italian cooking on Federal Hill, Providence.",
          image: photoUrl("pizza", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), menu(), visit(), privateDining(), about()],
    };
  },
};
