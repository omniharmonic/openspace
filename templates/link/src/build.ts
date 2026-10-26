import type { TemplateSpec } from "../../lib/define";
import { pageId } from "../../lib/ids";
import { block, fromPreset, headerFrom, heading, makePage, page, photo, photoUrl, rt, section, url } from "../../lib/kit";

/**
 * Link — link-in-bio, a single page (doc 04 §7). Mobile-first and punchy: Outfit throughout on a
 * bold palette; stacked link buttons, a pinned social feed, a newsletter signup and socials.
 *
 * Demo owner: Kai Moreno, a home cook and recipe writer in Austin.
 */

const T = "link";
const P = { home: pageId(T, "home") };

const NAME = "Kai Moreno";

const post = (key: Parameters<typeof photo>[0], alt: string, caption: string, path: string) => ({
  image: photo(key, 320, "1:1", alt),
  url: url(`https://instagram.com/p/${path}`),
  caption,
});

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Kai Moreno writes fast, cheerful weeknight recipes. Get the cookbook, the Sunday newsletter, cooking classes in Austin and new videos.",
    [
      section(
        [
          heading("Kai Moreno", { level: 1, size: "h2", eyebrow: "Home cook · Austin, Texas", align: "center" }),
          block(
            "link-list",
            {
              photo: photo("portraitSam", 240, "1:1", "Kai Moreno smiling in a white t-shirt"),
              bio: "Weeknight recipes with big flavour and few dishes. Cookbook out now; new videos every Thursday from my tiny Austin kitchen.",
              links: [
                {
                  label: "New video: 20-minute pantry pasta",
                  link: url("https://youtube.com/@kaimoreno.example", true),
                  icon: "camera",
                  highlight: true,
                },
                {
                  label: "Get the cookbook: Small Kitchen, Big Flavour",
                  link: url("https://kaimoreno.example/book", true),
                  icon: "book-open",
                  highlight: false,
                },
                {
                  label: "Cooking classes in Austin",
                  link: url("https://kaimoreno.example/classes", true),
                  icon: "utensils",
                  highlight: false,
                },
                {
                  label: "The Sunday supper newsletter",
                  link: page(P.home, "newsletter"),
                  icon: "mail",
                  highlight: false,
                },
                {
                  label: "Shop the knives and pans I actually use",
                  link: url("https://kaimoreno.example/kit", true),
                  icon: "shopping-bag",
                  highlight: false,
                },
                {
                  label: "Brand partnerships & press",
                  link: { type: "email", email: "hello@kaimoreno.example", subject: "Partnership" },
                  icon: "message-circle",
                  highlight: false,
                },
              ],
              showSocial: true,
            },
            { variant: "stacked" },
          ),
        ],
        { width: "narrow" },
        { theme: "brand", padding: { d: "xl", m: "lg" }, label: "Links" },
      ),
      section(
        [
          block(
            "social-feed",
            {
              heading: "Cooking this week",
              headingLevel: "h2",
              network: "instagram",
              handle: "kaimoreno.example",
              count: "6",
              followLabel: "Follow on Instagram",
              posts: [
                post("pizza", "A wood-fired pizza cut into slices", "Friday pizza: the dough recipe is in the book.", "kai-pizza"),
                post("saladBowl", "A bowl of greens, chickpeas and roasted vegetables", "The lunch bowl I make every Monday.", "kai-bowl"),
                post("pancakes", "A tall stack of pancakes with blueberries", "Sunday pancakes, no buttermilk needed.", "kai-pancakes"),
                post("breadSliced", "A seeded loaf cut into thick slices", "First loaf from the new oven.", "kai-bread"),
                post("plates", "Steak, herbs and sauces shared across the table", "Feeding eight with one cast-iron pan.", "kai-steak"),
                post("cookies", "Chocolate chip cookies on a linen cloth", "Brown-butter cookies. You know the ones.", "kai-cookies"),
              ],
            },
            { variant: "grid" },
          ),
        ],
        { width: "narrow" },
        { theme: "light", label: "Instagram" },
      ),
      fromPreset("newsletter/card@1", {
        anchor: "newsletter",
        theme: "light-accent",
        width: "narrow",
        edit: {
          0: {
            heading: "Sunday supper, in your inbox",
            description: "One recipe, one shopping list and one thing I'm obsessed with, every Sunday morning. 48,000 cooks read along.",
            askName: false,
            buttonLabel: "Subscribe",
            successMessage: "You're in! Look out for Sunday's recipe.",
            note: "Free. Unsubscribe whenever you like.",
          },
        },
      }),
    ],
    { header: { hidden: true } },
  );
}

export const link: TemplateSpec = {
  id: T,
  name: "Link",
  description:
    "A punchy, mobile-first link-in-bio page with stacked link buttons, a pinned social feed, a newsletter signup and all your profiles.",
  persona: "Link-in-bio, single page",
  mood: "Mobile-first, punchy",
  tags: ["link in bio", "creator", "single page", "social", "newsletter"],
  sample: { name: NAME, tagline: "Weeknight recipes with big flavour and few dishes." },
  thumbnail: P.home,
  looks: [
    {
      id: "saffron",
      name: "Saffron",
      description: "Golden saffron with Outfit throughout and round, friendly buttons.",
      choices: {
        palette: { brand: "oklch(0.78 0.15 80)", neutral: "warm", contrast: "standard", source: "curated" },
        pairing: "outfit",
        density: "comfortable",
        shape: "round",
        buttons: "pill-solid",
        motion: "expressive",
        imageTreatment: "circle",
      },
    },
    {
      id: "coral",
      name: "Coral",
      description: "Playful coral with Plus Jakarta Sans and soft corners.",
      choices: {
        palette: { brand: "oklch(0.7 0.15 25)", neutral: "warm", contrast: "standard", source: "curated" },
        pairing: "plus-jakarta",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "expressive",
        imageTreatment: "rounded",
      },
    },
    {
      id: "lagoon",
      name: "Lagoon",
      description: "Clear teal with Sora and Inter, crisp outlined buttons and square corners.",
      choices: {
        palette: { brand: "oklch(0.58 0.1 195)", neutral: "cool", contrast: "standard", source: "curated" },
        pairing: "sora-inter",
        density: "compact",
        shape: "sharp",
        buttons: "outline",
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
        tagline: "Weeknight recipes with big flavour and few dishes.",
        nav: [],
        header: headerFrom("header/minimal@1", { sticky: false }),
        footer: fromPreset("footer/minimal-row@1", {
          edit: {
            0: { content: rt.doc(rt.p("© 2026 Kai Moreno · Austin, Texas", "small")) },
            1: {
              content: rt.doc(
                rt.p([rt.link("YouTube", "https://youtube.com/@kaimoreno.example"), " · ", rt.link("Instagram", "https://instagram.com/kaimoreno.example"), " · ", rt.link("Email", "mailto:hello@kaimoreno.example")], "small"),
              ),
            },
          },
        }),
        social: [
          { network: "instagram", url: "https://instagram.com/kaimoreno.example" },
          { network: "youtube", url: "https://youtube.com/@kaimoreno.example" },
          { network: "tiktok", url: "https://tiktok.com/@kaimoreno.example" },
          { network: "email", url: "mailto:hello@kaimoreno.example" },
        ],
        seo: {
          titleTemplate: "%s · Kai Moreno",
          description: "Weeknight recipes with big flavour and few dishes, by Kai Moreno.",
          image: photoUrl("pizza", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home()],
    };
  },
};
