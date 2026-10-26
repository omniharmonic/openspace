import type { LookStyles, Site, TemplateSummary } from "./types";

/**
 * The six MVP launch templates (doc 04 §7) with three looks each, as the mock
 * Hub serves them. Palettes and pairings follow the template table; the
 * real catalogue comes from the Hub once templates (Task 9) are published.
 */

const serif = (family: string) => `"${family}", "Iowan Old Style", Georgia, serif`;
const sans = (family: string) => `"${family}", ui-sans-serif, system-ui, sans-serif`;

function look(
  id: string,
  name: string,
  colors: LookStyles["colors"],
  fonts: LookStyles["fonts"],
  radius: number,
  imageShape: LookStyles["imageShape"] = "rect",
) {
  return { id, name, styles: { colors, fonts, radius, imageShape } };
}

export const TEMPLATE_FIXTURES: TemplateSummary[] = [
  {
    id: "meadow",
    name: "Meadow",
    description: "Calm pages for a practice: class schedule, booking and a welcoming about page.",
    persona: "Yoga, therapy, bodywork, wellness",
    mood: "Calm, airy, organic",
    looks: [
      look(
        "oat",
        "Oat",
        { background: "#f3eee4", surface: "#e7dfd0", text: "#2e3a2f", muted: "#6c7466", accent: "#6f8461", onAccent: "#ffffff" },
        { heading: serif("Fraunces"), body: sans("Hanken Grotesk") },
        999,
        "arch",
      ),
      look(
        "clay",
        "Clay",
        { background: "#f2e6dc", surface: "#e6d2c3", text: "#3a2a22", muted: "#7a665b", accent: "#b0603f", onAccent: "#ffffff" },
        { heading: serif("Fraunces"), body: sans("Hanken Grotesk") },
        999,
        "arch",
      ),
      look(
        "dusk",
        "Dusk",
        { background: "#26302a", surface: "#323e36", text: "#ede6da", muted: "#a9b0a2", accent: "#d4b08a", onAccent: "#26302a" },
        { heading: serif("Fraunces"), body: sans("Hanken Grotesk") },
        999,
        "arch",
      ),
    ],
  },
  {
    id: "harbor",
    name: "Harbor",
    description: "Programs, events and an impact band for organisations people rely on.",
    persona: "Nonprofits, community orgs",
    mood: "Trustworthy, warm, civic",
    looks: [
      look(
        "paper",
        "Paper",
        { background: "#f6f1e7", surface: "#ebe3d3", text: "#1d3557", muted: "#5b6b80", accent: "#e2672a", onAccent: "#ffffff" },
        { heading: serif("Newsreader"), body: sans("Public Sans") },
        6,
      ),
      look(
        "tide",
        "Tide",
        { background: "#1d3557", surface: "#274571", text: "#f6f1e7", muted: "#b8c4d6", accent: "#f08a4b", onAccent: "#1d3557" },
        { heading: serif("Newsreader"), body: sans("Public Sans") },
        6,
      ),
      look(
        "civic",
        "Civic",
        { background: "#ffffff", surface: "#eef2f7", text: "#14233a", muted: "#5f6c7e", accent: "#1f5fbf", onAccent: "#ffffff" },
        { heading: sans("Public Sans"), body: sans("Public Sans") },
        2,
      ),
    ],
  },
  {
    id: "atelier",
    name: "Atelier",
    description: "A gallery-first portfolio with full-bleed slideshows and a quiet project index.",
    persona: "Photographers, visual artists",
    mood: "Gallery-first, minimal chrome",
    looks: [
      look(
        "gallery",
        "Gallery",
        { background: "#fafaf8", surface: "#ededea", text: "#141414", muted: "#6f6f6b", accent: "#141414", onAccent: "#fafaf8" },
        { heading: serif("Instrument Serif"), body: sans("Instrument Sans") },
        0,
      ),
      look(
        "darkroom",
        "Darkroom",
        { background: "#121212", surface: "#1e1e1e", text: "#ededed", muted: "#8f8f8f", accent: "#e8c547", onAccent: "#121212" },
        { heading: serif("Instrument Serif"), body: sans("Instrument Sans") },
        0,
      ),
      look(
        "gesso",
        "Gesso",
        { background: "#ece8e1", surface: "#dcd6cc", text: "#26231f", muted: "#6f6a61", accent: "#9b3d2e", onAccent: "#ffffff" },
        { heading: serif("Instrument Serif"), body: sans("Instrument Sans") },
        2,
      ),
    ],
  },
  {
    id: "ledger",
    name: "Ledger",
    description: "Case studies, services with outcomes and a clear booking call for independent experts.",
    persona: "Consultants, coaches, freelancers",
    mood: "Crisp, editorial, confident",
    looks: [
      look(
        "ivory",
        "Ivory",
        { background: "#f7f4ec", surface: "#ece6d8", text: "#1c2230", muted: "#5f6573", accent: "#1f5e46", onAccent: "#ffffff" },
        { heading: serif("Source Serif 4"), body: sans("IBM Plex Sans") },
        4,
      ),
      look(
        "ink",
        "Ink",
        { background: "#1c2230", surface: "#262e3f", text: "#f2efe6", muted: "#a5abb8", accent: "#7fc8a0", onAccent: "#1c2230" },
        { heading: serif("Source Serif 4"), body: sans("IBM Plex Sans") },
        4,
      ),
      look(
        "ledger-green",
        "Evergreen",
        { background: "#eef2ec", surface: "#dfe7dc", text: "#16261e", muted: "#56665c", accent: "#1f5e46", onAccent: "#ffffff" },
        { heading: sans("IBM Plex Sans"), body: sans("IBM Plex Sans") },
        8,
      ),
    ],
  },
  {
    id: "hearth",
    name: "Hearth",
    description: "Menu, hours, map and reservations for places people come back to.",
    persona: "Restaurants, cafés, bakeries",
    mood: "Warm, appetizing",
    looks: [
      look(
        "cream",
        "Cream",
        { background: "#fbf3e4", surface: "#f1e2c8", text: "#3b2a1e", muted: "#7c6652", accent: "#d4462b", onAccent: "#ffffff" },
        { heading: serif("Young Serif"), body: sans("Work Sans") },
        10,
      ),
      look(
        "olive",
        "Olive",
        { background: "#5f6b2f", surface: "#6d7a38", text: "#fbf3e4", muted: "#dcd6b8", accent: "#f2b33d", onAccent: "#3b2a1e" },
        { heading: serif("Young Serif"), body: sans("Work Sans") },
        10,
      ),
      look(
        "tomato",
        "Tomato",
        { background: "#d4462b", surface: "#c03c22", text: "#fff6ea", muted: "#ffd9c7", accent: "#fff6ea", onAccent: "#b43a20" },
        { heading: serif("Young Serif"), body: sans("Work Sans") },
        999,
      ),
    ],
  },
  {
    id: "signal",
    name: "Signal",
    description: "Feature grids, pricing, FAQ and a changelog for launching something new.",
    persona: "Products, startups, launches",
    mood: "Bold, modern, technical",
    looks: [
      look(
        "night",
        "Night",
        { background: "#0e0f12", surface: "#1a1c21", text: "#f4f5f7", muted: "#8d93a0", accent: "#8b7bff", onAccent: "#0e0f12" },
        { heading: sans("Bricolage Grotesque"), body: sans("Geist") },
        10,
      ),
      look(
        "daylight",
        "Daylight",
        { background: "#ffffff", surface: "#f1f2f5", text: "#0e0f12", muted: "#5e6370", accent: "#4b3cf0", onAccent: "#ffffff" },
        { heading: sans("Bricolage Grotesque"), body: sans("Geist") },
        10,
      ),
      look(
        "volt",
        "Volt",
        { background: "#0e0f12", surface: "#191b1f", text: "#f4f5f7", muted: "#8d93a0", accent: "#c6f432", onAccent: "#0e0f12" },
        { heading: sans("Bricolage Grotesque"), body: sans("Geist") },
        2,
      ),
    ],
  },
];

/** Demo sites for a Site Gardener managing a few client sites (dev mock only). */
export function demoSites(login: string, now = Date.now()): Site[] {
  const day = 86_400_000;
  return [
    {
      id: "st_8m2kq0w4zd",
      name: "Willow Street Yoga",
      tagline: "Slow classes for busy people",
      repo: `${login}/willow-street-yoga`,
      status: "live",
      url: `https://${login}.github.io/willow-street-yoga`,
      template: "meadow",
      look: "oat",
      createdAt: new Date(now - 41 * day).toISOString(),
      inboxCount: 3,
      updateAvailable: true,
      owner: login,
      role: "owner",
    },
    {
      id: "st_4vn7c1ht9r",
      name: "Eastside Tenants Union",
      tagline: "Organising for fair housing since 2009",
      repo: "eastside-tenants/site",
      status: "live",
      url: "https://eastsidetenants.org",
      template: "harbor",
      look: "paper",
      createdAt: new Date(now - 112 * day).toISOString(),
      inboxCount: 12,
      updateAvailable: false,
      owner: "eastside-tenants",
      role: "designer",
    },
    {
      id: "st_2b6x5e0pfa",
      name: "Pan & Crumb",
      tagline: "Sourdough, every morning at seven",
      repo: `${login}/pan-and-crumb`,
      status: "failed",
      url: `https://${login}.github.io/pan-and-crumb`,
      template: "hearth",
      look: "cream",
      createdAt: new Date(now - 3 * day).toISOString(),
      inboxCount: 0,
      updateAvailable: false,
      owner: login,
      role: "owner",
    },
  ];
}
