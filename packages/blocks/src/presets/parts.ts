import { type BlockStyle, type ColorTheme, type Form, newId } from "@omniharmonic/openspace-schema";
import { accordionBlock } from "../blocks/accordion";
import { contactInfoBlock, hoursBlock } from "../blocks/business";
import { cardBlock, columnsBlock, iconListBlock } from "../blocks/card";
import { eventsBlock, summaryBlock } from "../blocks/collections";
import { statsBlock, timelineBlock } from "../blocks/data";
import { formBlock } from "../blocks/form";
import { logoStripBlock } from "../blocks/logo-strip";
import { quoteBlock, testimonialBlock } from "../blocks/quote";
import { tableBlock } from "../blocks/table";
import { teamBlock } from "../blocks/team";
import type { IconName } from "../icons";
import { type CropAspect, type PhotoKey, photo } from "./images";
import { make, rt, url } from "./kit";

/**
 * Shared builders for the second wave of presets: one place for the repetitive block shapes
 * (testimonials, questions, columns, stats, tables, forms, hours) so each preset reads as its
 * design and copy.
 */

export interface At {
  col?: number;
  variant?: string;
  style?: BlockStyle;
}
const at = (o: At, fallback: string) => ({
  variant: o.variant ?? fallback,
  ...(o.col !== undefined ? { col: o.col } : {}),
  ...(o.style ? { style: o.style } : {}),
});

/** A card-like surface in a given theme (cards inside grid presets). */
export const panel = (theme: ColorTheme, pad: "md" | "lg" | "xl" = "lg"): BlockStyle => ({
  colorTheme: theme,
  padding: { d: pad, m: "md" },
  radius: "md",
});

/**
 * The theme for a card that should stand out gently from its section: light sections get a
 * tinted card, tinted sections a plain one, dark sections the other dark.
 */
export const raised = (section: ColorTheme): ColorTheme =>
  (
    ({
      light: "light-accent",
      "light-accent": "light",
      dark: "dark-accent",
      "dark-accent": "dark",
      brand: "dark",
    }) as const
  )[section];

export const avatar = (k: PhotoKey) => photo(k, 80, "1:1");

export function testimonial(
  quote: string,
  name: string,
  role: string,
  face?: PhotoKey,
  o: At & { rating?: number } = {},
) {
  return make(
    testimonialBlock,
    {
      quote: rt.doc(rt.p(quote)),
      name,
      role,
      photo: face ? avatar(face) : undefined,
      rating: o.rating,
    },
    at(o, "card"),
  );
}

export function pullQuote(quote: string, attribution?: string, source?: string, o: At = {}) {
  return make(quoteBlock, { quote: rt.doc(rt.p(quote)), attribution, source }, at(o, "large"));
}

export const qa = (question: string, answer: string) => ({
  question,
  answer: rt.doc(rt.p(answer)),
});

export function questions(items: ReturnType<typeof qa>[], o: At & { openFirst?: boolean } = {}) {
  return make(
    accordionBlock,
    { items, exclusive: false, openFirst: o.openFirst ?? false, faqSchema: true },
    at(o, "lines"),
  );
}

export interface Col {
  heading: string;
  body: string;
  image?: [PhotoKey, number, CropAspect?];
  link?: string;
  linkLabel?: string;
}

export function columns(items: Col[], cols: "2" | "3" | "4", o: At & { aspect?: CropAspect } = {}) {
  return make(
    columnsBlock,
    {
      items: items.map((i) => ({
        heading: i.heading,
        body: rt.doc(rt.p(i.body)),
        image: i.image ? photo(i.image[0], i.image[1], i.image[2] ?? o.aspect ?? "3:2") : undefined,
        link: i.link ? url(i.link) : undefined,
        linkLabel: i.linkLabel,
      })),
      columns: cols,
      aspect: o.aspect ?? "3:2",
    },
    at(o, "plain"),
  );
}

export function icons(
  items: [IconName, string, string?][],
  cols: "1" | "2" | "3" | "4",
  o: At = {},
) {
  return make(
    iconListBlock,
    {
      items: items.map(([icon, title, t]) => ({ icon, title, ...(t ? { text: t } : {}) })),
      columns: cols,
    },
    at(o, "list"),
  );
}

export function card(
  headingText: string,
  bodyText: string,
  o: At & {
    icon?: IconName;
    image?: [PhotoKey, number, CropAspect?];
    eyebrow?: string;
    link?: string;
    linkLabel?: string;
  } = {},
) {
  const aspect = o.image?.[2] ?? "4:5";
  return make(
    cardBlock,
    {
      image: o.image ? photo(o.image[0], o.image[1], aspect) : undefined,
      aspect,
      icon: o.icon,
      eyebrow: o.eyebrow,
      heading: headingText,
      body: rt.doc(rt.p(bodyText)),
      link: o.link ? url(o.link) : undefined,
      linkLabel: o.linkLabel,
    },
    at(o, "stacked"),
  );
}

export function stats(items: [value: string, label: string, detail?: string][], o: At = {}) {
  return make(
    statsBlock,
    {
      items: items.map(([value, label, detail]) => ({
        value,
        label,
        ...(detail ? { detail } : {}),
      })),
    },
    at(o, "row"),
  );
}

export function timeline(items: [date: string, title: string, text?: string][], o: At = {}) {
  return make(
    timelineBlock,
    { items: items.map(([date, title, t]) => ({ date, title, ...(t ? { text: t } : {}) })) },
    at(o, "vertical"),
  );
}

export function logos(names: string[], label?: string, o: At = {}) {
  return make(
    logoStripBlock,
    { label, logos: names.map((name) => ({ name })), monochrome: true },
    at(o, "row"),
  );
}

export function team(
  people: [name: string, role: string, face: PhotoKey, bio?: string][],
  cols: "2" | "3" | "4",
  o: At = {},
) {
  return make(
    teamBlock,
    {
      people: people.map(([name, role, face, bio]) => ({
        name,
        role,
        photo: photo(face, 360, "4:5"),
        ...(bio ? { bio } : {}),
      })),
      columns: cols,
    },
    at(o, "grid"),
  );
}

export function table(
  cols: [label: string, detail?: string, highlight?: boolean][],
  rows: (string | [label: string, ...cells: string[]])[],
  o: At & { caption?: string; corner?: string; note?: string } = {},
) {
  return make(
    tableBlock,
    {
      caption: o.caption,
      corner: o.corner,
      columns: cols.map(([label, detail, highlight]) => ({
        label,
        ...(detail ? { detail } : {}),
        highlight: !!highlight,
      })),
      rows: rows.map((row) =>
        typeof row === "string"
          ? { label: row, group: true, cells: [] }
          : { label: row[0], group: false, cells: row.slice(1).map((value) => ({ value })) },
      ),
      note: o.note,
    },
    at(o, "lines"),
  );
}

export const form = (
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

export function formBlockOf(f: Form, o: At = {}) {
  return make(formBlock, { form: f }, at(o, "default"));
}

export const field = {
  name: (width: "half" | "full" = "half") =>
    ({ type: "text", name: "name", label: "Your name", required: true, width }) as const,
  email: (width: "half" | "full" = "half") =>
    ({ type: "email", name: "email", label: "Email", required: true, width }) as const,
  phone: (width: "half" | "full" = "half") =>
    ({ type: "phone", name: "phone", label: "Phone", required: false, width }) as const,
  message: (label = "How can we help?") =>
    ({ type: "textarea", name: "message", label, required: true, maxLength: 3000 }) as const,
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
/** Weekday hours, optional Saturday (and Sunday) hours; other days closed. */
export function weekHours(
  open: string,
  close: string,
  sat?: [string, string],
  sun?: [string, string],
) {
  return DAYS.map((day) => {
    const v = day === "sat" ? sat : day === "sun" ? sun : [open, close];
    return v ? { day, opens: v[0], closes: v[1], closed: false } : { day, closed: true };
  });
}

export function hours(
  rows: ReturnType<typeof weekHours>,
  o: At & { heading?: string; note?: string } = {},
) {
  return make(
    hoursBlock,
    { heading: o.heading, headingLevel: "h3", rows, note: o.note },
    at(o, "compact"),
  );
}

export function contactInfo(
  info: { name?: string; address?: string; phone?: string; email?: string; note?: string },
  o: At & { heading?: string; directions?: boolean } = {},
) {
  return make(
    contactInfoBlock,
    {
      heading: o.heading,
      headingLevel: "h3",
      name: info.name,
      address: info.address,
      phone: info.phone,
      email: info.email,
      directions: o.directions ?? !!info.address,
      note: info.note,
    },
    at(o, "list"),
  );
}

export function summary(
  collection: string,
  o: At & {
    heading?: string;
    limit?: number;
    columns?: "2" | "3" | "4";
    image?: boolean;
    excerpt?: boolean;
    date?: boolean;
    meta?: boolean;
    linkLabel?: string;
    link?: string;
    empty?: string;
  } = {},
) {
  return make(
    summaryBlock,
    {
      heading: o.heading,
      headingLevel: "h2",
      source: { collection, sort: "date-desc", limit: o.limit ?? 3 },
      columns: o.columns ?? "3",
      showImage: o.image ?? true,
      showDate: o.date ?? true,
      showExcerpt: o.excerpt ?? true,
      showMeta: o.meta ?? false,
      linkLabel: o.linkLabel,
      link: o.link ? url(o.link) : undefined,
      emptyMessage: o.empty ?? "New posts are on the way — check back soon.",
    },
    at(o, "grid"),
  );
}

export function eventList(
  collection: string,
  o: At & { heading?: string; limit?: number; image?: boolean; register?: string } = {},
) {
  return make(
    eventsBlock,
    {
      heading: o.heading,
      headingLevel: "h2",
      source: { collection, filter: { upcoming: true }, limit: o.limit ?? 6 },
      showImage: o.image ?? false,
      showLocation: true,
      showExcerpt: true,
      registerLabel: o.register ?? "Get tickets",
      emptyMessage: "New dates are announced here first.",
      structuredData: true,
    },
    at(o, "list"),
  );
}
