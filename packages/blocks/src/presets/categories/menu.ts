import { restaurantMenuBlock } from "../../blocks/restaurant-menu";
import { photo } from "../images";
import { button, copy, definePreset, grid, heading, image, make, r, stack } from "../kit";
import { card } from "../parts";

/** Menu presets for restaurants, cafés, bars and bakeries (restaurant-menu block). */

const headline = copy.headline(1, 10, 2);
const AVOID =
  "Prices or dishes the owner hasn't confirmed; allergy claims without the kitchen's sign-off; menus longer than the kitchen really cooks.";

type Tag = "v" | "vg" | "gf" | "df" | "n" | "spicy";
type Dish = [name: string, price: string, description?: string, tags?: Tag[]];
const section = (title: string, items: Dish[], note?: string) => ({
  title,
  ...(note ? { note } : {}),
  items: items.map(([name, price, description, tags]) => ({
    name,
    ...(price ? { price } : {}),
    ...(description ? { description } : {}),
    dietary: (tags ?? []).map((tag) => ({ tag })),
  })),
});

const menu = (
  sections: ReturnType<typeof section>[],
  o: { variant: string; col?: number; legend?: boolean; footnote?: string; currency?: string },
) =>
  make(
    restaurantMenuBlock,
    {
      currency: o.currency ?? "$",
      legend: o.legend ?? true,
      sections,
      footnote: o.footnote,
    },
    { variant: o.variant, ...(o.col !== undefined ? { col: o.col } : {}) },
  );

export const menuPresets = [
  definePreset({
    category: "menu",
    name: "classic",
    label: "Classic menu",
    description: "A centred heading over a single-column menu with dish descriptions and prices.",
    copy: [headline, copy.sub(4, 30)],
    defaultTheme: "light",
    tags: ["menu", "restaurant", "centered", "classic"],
    ai: {
      purpose: "The full menu, easy to read on a phone.",
      whenToUse: "Restaurant and café menu pages.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Dinner", {
          align: "center",
          eyebrow: "Tuesday to Saturday from 5:30",
          sub: "Pasta is rolled every afternoon. Ask about tonight's specials.",
        }),
        menu(
          [
            section("To start", [
              [
                "Burrata, blood orange, fennel",
                "14",
                "With toasted hazelnuts and good olive oil.",
                ["v", "gf"],
              ],
              ["Fried artichokes", "12", "Lemon aioli.", ["v"]],
              ["Beef carpaccio", "16", "Capers, rocket, aged parmesan.", ["gf"]],
            ]),
            section("Pasta", [
              ["Tagliatelle al ragù", "24", "Slow-cooked beef and pork, six hours."],
              ["Cacio e pepe", "19", "Pecorino, black pepper, nothing else.", ["v"]],
              ["Squid ink linguine", "26", "Clams, chilli, parsley.", ["df", "spicy"]],
            ]),
          ],
          {
            variant: "classic",
            footnote: "Gluten-free pasta on request. Please tell us about any allergies.",
          },
        ),
      ],
    }),
  }),

  definePreset({
    category: "menu",
    name: "two-columns",
    label: "Two-column menu",
    description: "A wide menu flowing into two columns, with a dietary legend.",
    copy: [headline],
    defaultTheme: "light-accent",
    tags: ["menu", "columns", "cafe", "wide"],
    ai: {
      purpose: "Fits a longer menu on one screen on desktop while staying single-column on phones.",
      whenToUse: "Cafés and brunch spots with several short sections.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("All-day menu", { eyebrow: "Served 8am – 3pm" }),
        menu(
          [
            section("Eggs", [
              ["Shakshuka", "15", "Baked eggs, peppers, feta, flatbread.", ["v", "spicy"]],
              ["Eggs on sourdough", "11", "Poached, fried or scrambled.", ["v"]],
            ]),
            section("Bowls", [
              ["Green grain bowl", "14", "Farro, greens, herbs, tahini.", ["vg"]],
              ["Miso salmon bowl", "18", "Brown rice, pickles, sesame.", ["df"]],
            ]),
            section("Sweet", [
              ["Ricotta hotcakes", "13", "Berries, honeycomb butter.", ["v"]],
              ["Granola and yoghurt", "9", "House granola, seasonal fruit.", ["v", "n"]],
            ]),
            section("Sides", [
              ["Bacon", "5"],
              ["Avocado", "4", undefined, ["vg"]],
              ["Hash brown", "4", undefined, ["vg", "gf"]],
            ]),
          ],
          { variant: "columns" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "menu",
    name: "with-photo",
    label: "Menu beside photograph",
    description: "A short menu in one column with a tall photograph of the food beside it.",
    copy: [headline, copy.sub(4, 30)],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "dark-accent",
    tags: ["menu", "image", "two-column", "restaurant"],
    links: { primary: "/reserve" },
    ai: {
      purpose: "A seasonal or signature menu with a photo that shows the cooking.",
      whenToUse: "Home pages and menu teasers for restaurants and pop-ups.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        heading("From the wood oven", {
          col: 0,
          eyebrow: "This week",
          sub: "Everything here is cooked over oak in the oven by the door.",
        }),
        menu(
          [
            section("Small plates", [
              ["Flatbread, whipped feta, za'atar", "9", undefined, ["v"]],
              ["Charred leeks, romesco", "11", undefined, ["vg", "n"]],
              ["Lamb skewers, yoghurt, chilli", "15", undefined, ["gf", "spicy"]],
              ["Whole roast trout, brown butter", "28", undefined, ["gf"]],
            ]),
          ],
          { variant: "minimal", col: 0, legend: false },
        ),
        button("Book a table", c.primary, { col: 0 }),
        image(photo("plates", 520, "4:5"), { col: 1, aspect: "4:5" }),
      ],
    }),
  }),

  definePreset({
    category: "menu",
    name: "drinks",
    label: "Drinks list",
    description: "A compact drinks list in sections, set narrow like a chalkboard.",
    copy: [headline],
    defaultTheme: "light",
    tags: ["menu", "drinks", "coffee", "compact"],
    ai: {
      purpose: "Coffee, tea, wine or cocktail lists without descriptions getting in the way.",
      whenToUse: "Cafés, bars and bakeries.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Coffee & tea", { eyebrow: "Roasted on Fridays", align: "center" }),
        menu(
          [
            section(
              "Espresso",
              [
                ["Espresso", "3"],
                ["Flat white", "4.5"],
                ["Cortado", "4"],
                ["Oat milk", "0.5"],
              ],
              "Single-origin beans change every month.",
            ),
            section("Brewed", [
              ["Filter of the day", "3.5"],
              ["Pour-over", "5"],
              ["Cold brew", "4.5"],
            ]),
            section("Tea", [
              ["Hojicha", "4"],
              ["Fresh mint", "3.5"],
              ["Chai with honey", "4.5"],
            ]),
          ],
          { variant: "minimal", legend: false },
        ),
      ],
    }),
  }),

  definePreset({
    category: "menu",
    name: "tasting",
    label: "Tasting menu",
    description: "A set menu course by course, with one price and a booking button.",
    copy: [headline, copy.sub(4, 30)],
    defaultTheme: "dark",
    tags: ["menu", "tasting", "set-menu", "centered", "fine-dining"],
    links: { primary: "/reserve" },
    ai: {
      purpose: "Presents a fixed or seasonal tasting menu with its price.",
      whenToUse: "Chef's tables, supper clubs and special-occasion menus.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Autumn tasting menu", {
          align: "center",
          eyebrow: "Six courses · $95",
          sub: "Served Thursday to Saturday at one sitting, 7pm. Wine pairing $55.",
        }),
        menu(
          [
            section("The menu", [
              ["Squash broth", "", "Brown butter, sage, toasted seeds.", ["v", "gf"]],
              ["Beetroot tartare", "", "Smoked yoghurt, rye crumb.", ["v"]],
              ["Hand-dived scallop", "", "Celeriac, apple, hazelnut.", ["gf", "n"]],
              ["Duck, plum, chicory", "", "With a little bread for the sauce."],
              ["Cheese from the cave", "", "Three cheeses, quince, oat crackers.", ["v"]],
              ["Pear and bay leaf", "", "Poached pear, bay custard, almond.", ["v", "n"]],
            ]),
          ],
          { variant: "classic" },
        ),
        button("Reserve seats", c.primary, {
          align: "center",
          note: "Tell us about allergies when you book.",
        }),
      ],
    }),
  }),

  definePreset({
    category: "menu",
    name: "specials",
    label: "Specials cards",
    description: "Three dishes as photo cards with prices — this week's specials.",
    copy: [headline],
    images: [{ slot: "dish photos", aspect: "4:5", count: 3 }],
    defaultTheme: "light",
    tags: ["menu", "cards", "image", "three-up", "specials"],
    links: { primary: "/menu" },
    ai: {
      purpose: "Highlights a few dishes worth coming in for.",
      whenToUse: "Home pages of restaurants, bakeries and food trucks.",
      avoid: AVOID,
    },
    make: (c) => {
      const h = heading("This week's specials", { eyebrow: "Until Sunday" });
      const a = card(
        "Wood-fired margherita",
        "San Marzano tomatoes, fior di latte and basil from the garden.",
        { eyebrow: "$17", image: ["pizza", 380, "4:5"] },
      );
      const b = card("Summer grain salad", "Farro, peaches, mint and a lot of good olive oil.", {
        eyebrow: "$14",
        image: ["saladBowl", 380, "4:5"],
      });
      const d = card("Chocolate olive-oil cake", "Dark, damp and served with crème fraîche.", {
        eyebrow: "$9",
        image: ["cake", 380, "4:5"],
      });
      const cta = button("See the full menu", c.primary, {
        role: "secondary",
        align: "end",
        mobileAlign: "start",
      });
      return {
        ...grid([
          [h, r(1, 1, 16, 4), r(1, 1, 8, 4)],
          [cta, r(17, 2, 8, 3), r(1, 50, 8, 3)],
          [a, r(1, 6, 8, 18), r(1, 6, 8, 14)],
          [b, r(9, 6, 8, 18), r(1, 21, 8, 14)],
          [d, r(17, 6, 8, 18), r(1, 36, 8, 14)],
        ]),
      };
    },
  }),
];
