/**
 * Template looks for `list_templates` / `apply_template_look`. Sources, in order:
 * 1. the store's injected `templates` catalog (Hub, CLI with a templates folder);
 * 2. an installed `@omniharmonic/openspace-templates` package (the template registry, loaded optionally);
 * 3. built-in looks for the twelve launch templates (doc 04 §7), assembled from the theme
 *    package's template pairings and curated palettes — usable before template content ships.
 */
import { type StyleChoices, StyleChoicesSchema } from "@omniharmonic/openspace-schema";
import { curatedPalettes, TYPE_PAIRINGS } from "@omniharmonic/openspace-theme";
import type { SiteStore, TemplateInfo, TemplateLook } from "./store";

type Mood = Pick<StyleChoices, "density" | "shape" | "buttons" | "motion" | "imageTreatment">;

const LAUNCH: Array<{
  id: string;
  name: string;
  persona: string;
  mood: string;
  look: Mood;
  alt: Mood;
  /** Extra palette for the third look when the template has only one of its own. */
  extraPalette: string;
}> = [
  {
    id: "meadow",
    name: "Meadow",
    persona: "Yoga, therapy, bodywork, wellness",
    mood: "Calm, airy, organic",
    look: {
      density: "airy",
      shape: "round",
      buttons: "pill-solid",
      motion: "subtle",
      imageTreatment: "arch",
    },
    alt: {
      density: "comfortable",
      shape: "soft",
      buttons: "pill-outline",
      motion: "subtle",
      imageTreatment: "rounded",
    },
    extraPalette: "lavender",
  },
  {
    id: "harbor",
    name: "Harbor",
    persona: "Nonprofits, community orgs",
    mood: "Trustworthy, warm, civic",
    look: {
      density: "comfortable",
      shape: "soft",
      buttons: "solid",
      motion: "subtle",
      imageTreatment: "rounded",
    },
    alt: {
      density: "compact",
      shape: "sharp",
      buttons: "outline",
      motion: "none",
      imageTreatment: "none",
    },
    extraPalette: "forest",
  },
  {
    id: "atelier",
    name: "Atelier",
    persona: "Photographers, visual artists",
    mood: "Gallery-first, minimal chrome",
    look: {
      density: "airy",
      shape: "sharp",
      buttons: "text-arrow",
      motion: "subtle",
      imageTreatment: "none",
    },
    alt: {
      density: "comfortable",
      shape: "sharp",
      buttons: "underline",
      motion: "none",
      imageTreatment: "frame",
    },
    extraPalette: "ink-blue",
  },
  {
    id: "ledger",
    name: "Ledger",
    persona: "Consultants, coaches, freelancers",
    mood: "Crisp, editorial, confident",
    look: {
      density: "comfortable",
      shape: "sharp",
      buttons: "solid",
      motion: "subtle",
      imageTreatment: "none",
    },
    alt: {
      density: "compact",
      shape: "soft",
      buttons: "text-arrow",
      motion: "none",
      imageTreatment: "rounded",
    },
    extraPalette: "harbor",
  },
  {
    id: "hearth",
    name: "Hearth",
    persona: "Restaurants, cafés, bakeries",
    mood: "Warm, appetizing",
    look: {
      density: "comfortable",
      shape: "soft",
      buttons: "pill-solid",
      motion: "subtle",
      imageTreatment: "rounded",
    },
    alt: {
      density: "comfortable",
      shape: "round",
      buttons: "outline",
      motion: "expressive",
      imageTreatment: "grain",
    },
    extraPalette: "saffron",
  },
  {
    id: "signal",
    name: "Signal",
    persona: "Products, startups, launches",
    mood: "Bold, modern, technical",
    look: {
      density: "compact",
      shape: "soft",
      buttons: "solid",
      motion: "expressive",
      imageTreatment: "rounded",
    },
    alt: {
      density: "comfortable",
      shape: "round",
      buttons: "pill-solid",
      motion: "subtle",
      imageTreatment: "none",
    },
    extraPalette: "lagoon",
  },
  {
    id: "field-notes",
    name: "Field Notes",
    persona: "Writers, newsletters, blogs",
    mood: "Reading-first, literary",
    look: {
      density: "comfortable",
      shape: "sharp",
      buttons: "underline",
      motion: "none",
      imageTreatment: "none",
    },
    alt: {
      density: "airy",
      shape: "soft",
      buttons: "text-arrow",
      motion: "subtle",
      imageTreatment: "grain",
    },
    extraPalette: "sage",
  },
  {
    id: "encore",
    name: "Encore",
    persona: "Musicians, performers, podcasters",
    mood: "Expressive, nocturnal",
    look: {
      density: "comfortable",
      shape: "sharp",
      buttons: "solid",
      motion: "expressive",
      imageTreatment: "duotone",
    },
    alt: {
      density: "compact",
      shape: "round",
      buttons: "pill-outline",
      motion: "subtle",
      imageTreatment: "none",
    },
    extraPalette: "coral",
  },
  {
    id: "kiln",
    name: "Kiln",
    persona: "Makers and small shops",
    mood: "Tactile, crafted",
    look: {
      density: "comfortable",
      shape: "soft",
      buttons: "outline",
      motion: "subtle",
      imageTreatment: "grain",
    },
    alt: {
      density: "airy",
      shape: "round",
      buttons: "pill-solid",
      motion: "subtle",
      imageTreatment: "blob",
    },
    extraPalette: "olive",
  },
  {
    id: "commons",
    name: "Commons",
    persona: "Coalitions, cooperatives, movements",
    mood: "Grounded, collective",
    look: {
      density: "comfortable",
      shape: "soft",
      buttons: "solid",
      motion: "subtle",
      imageTreatment: "rounded",
    },
    alt: {
      density: "compact",
      shape: "sharp",
      buttons: "outline",
      motion: "none",
      imageTreatment: "none",
    },
    extraPalette: "harbor",
  },
  {
    id: "vow",
    name: "Vow",
    persona: "Weddings and celebrations",
    mood: "Romantic, refined",
    look: {
      density: "airy",
      shape: "round",
      buttons: "pill-outline",
      motion: "subtle",
      imageTreatment: "arch",
    },
    alt: {
      density: "airy",
      shape: "sharp",
      buttons: "underline",
      motion: "subtle",
      imageTreatment: "frame",
    },
    extraPalette: "lavender",
  },
  {
    id: "link",
    name: "Link",
    persona: "Link-in-bio, single page",
    mood: "Mobile-first, punchy",
    look: {
      density: "compact",
      shape: "round",
      buttons: "pill-solid",
      motion: "expressive",
      imageTreatment: "circle",
    },
    alt: {
      density: "compact",
      shape: "soft",
      buttons: "solid",
      motion: "subtle",
      imageTreatment: "rounded",
    },
    extraPalette: "electric",
  },
];

function builtInTemplates(): TemplateInfo[] {
  return LAUNCH.map((t) => {
    const pairing = TYPE_PAIRINGS.find((p) => p.template === t.id)?.id ?? "fraunces-hanken";
    const own = curatedPalettes.filter((p) => p.templates?.includes(t.id));
    const extra = curatedPalettes.find((p) => p.id === t.extraPalette);
    const palettes = [...own, ...(extra ? [extra] : [])];
    const pick = (i: number) => palettes[Math.min(i, palettes.length - 1)] ?? curatedPalettes[0];
    const choices = (
      paletteIndex: number,
      mood: Mood,
      contrast: "standard" | "high" = "standard",
    ): StyleChoices => {
      const pal = pick(paletteIndex);
      return {
        palette: {
          brand: pal?.brand ?? "oklch(0.55 0.12 250)",
          neutral: pal?.neutral ?? "warm",
          contrast,
          source: "curated",
        },
        pairing,
        ...mood,
      };
    };
    const looks: TemplateLook[] = [
      {
        id: "signature",
        name: `${t.name} — ${pick(0)?.name}`,
        description: `The template's own look: ${t.mood.toLowerCase()}.`,
        choices: choices(0, t.look),
      },
      {
        id: "alternate",
        name: `${t.name} — ${pick(1)?.name}`,
        description: "Same type pairing, a second palette and a different shape and button style.",
        choices: choices(1, t.alt),
      },
      {
        id: "high-contrast",
        name: `${t.name} — ${pick(2)?.name}, high contrast`,
        description: "AAA contrast (7:1 body text) with a third palette.",
        choices: choices(2, t.look, "high"),
      },
    ];
    return {
      id: t.id,
      name: t.name,
      persona: t.persona,
      mood: t.mood,
      description: `For ${t.persona.toLowerCase()}. ${t.mood}.`,
      tags: ["built-in"],
      looks,
    };
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Normalise whatever a template registry exports into `TemplateInfo`. */
export function normaliseTemplate(raw: unknown): TemplateInfo | null {
  if (!isRecord(raw)) return null;
  const meta = isRecord(raw.template) ? { ...raw, ...raw.template } : raw;
  const id = typeof meta.id === "string" ? meta.id : null;
  if (!id) return null;
  const rawLooks = Array.isArray(meta.looks) ? meta.looks : [];
  const looks: TemplateLook[] = [];
  rawLooks.forEach((l, i) => {
    if (!isRecord(l)) return;
    const candidate = isRecord(l.choices)
      ? l.choices
      : isRecord(l.styles) && isRecord(l.styles.choices)
        ? l.styles.choices
        : l;
    const parsed = StyleChoicesSchema.safeParse(candidate);
    if (!parsed.success) return;
    const name = typeof l.name === "string" ? l.name : `Look ${i + 1}`;
    looks.push({
      id:
        typeof l.id === "string"
          ? l.id
          : name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "") || `look-${i + 1}`,
      name,
      ...(typeof l.description === "string" ? { description: l.description } : {}),
      choices: parsed.data,
    });
  });
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : undefined);
  return {
    id,
    name: str("name") ?? id,
    description: str("description"),
    persona: str("persona"),
    mood: str("mood"),
    tags: Array.isArray(meta.tags)
      ? meta.tags.filter((t): t is string => typeof t === "string")
      : undefined,
    looks,
  };
}

/** Read a `@omniharmonic/openspace-templates`-style module (several export shapes are accepted). */
export async function templatesFromModule(
  mod: Record<string, unknown>,
): Promise<TemplateInfo[] | null> {
  let raws: unknown[] | null = null;
  const cat = mod.templateCatalog;
  if (Array.isArray(cat)) raws = cat;
  else if (isRecord(cat) && typeof cat.list === "function")
    raws = await (cat.list as () => unknown[])();
  else if (typeof mod.listTemplates === "function")
    raws = await (mod.listTemplates as () => unknown[])();
  else if (Array.isArray(mod.templates)) raws = mod.templates;
  else if (isRecord(mod.templates)) raws = Object.values(mod.templates);
  else if (typeof mod.loadTemplate === "function") {
    const ids = (mod.TEMPLATE_IDS ?? mod.templateIds) as unknown;
    if (Array.isArray(ids))
      raws = await Promise.all(ids.map((id) => (mod.loadTemplate as (id: unknown) => unknown)(id)));
  }
  if (!raws) return null;
  const out = raws
    .map(normaliseTemplate)
    .filter((t): t is TemplateInfo => !!t && t.looks.length > 0);
  return out.length ? out : null;
}

/** Optional dependency, resolved at runtime only (the specifier is not a literal for bundlers). */
const OPTIONAL_TEMPLATES_PACKAGE = ["@omniharmonic", "openspace-templates"].join("/");

export async function loadTemplates(
  store: SiteStore,
  importer: (spec: string) => Promise<unknown> = (spec) => import(/* @vite-ignore */ spec),
): Promise<{ source: "store" | "package" | "built-in"; templates: TemplateInfo[] }> {
  if (store.templates) return { source: "store", templates: await store.templates.list() };
  try {
    const mod = (await importer(OPTIONAL_TEMPLATES_PACKAGE)) as Record<string, unknown>;
    const list = await templatesFromModule(mod);
    if (list) return { source: "package", templates: list };
  } catch {
    // Not installed: fall back to the built-in looks.
  }
  return { source: "built-in", templates: builtInTemplates() };
}
