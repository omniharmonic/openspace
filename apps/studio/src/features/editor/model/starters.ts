import {
  accordionBlock,
  buttonBlock,
  DEMO,
  formBlock,
  imageBlock,
  newsletterBlock,
  quoteBlock,
  rt,
  textBlock,
} from "@openspace/blocks";
import type { Block, ColorTheme, Section } from "@openspace/schema";
import { cloneSection } from "./actions";

/**
 * Starter sections offered by the canvas "+" between sections. (The full preset gallery,
 * rendered in the site's style, is the Add section panel.) Every call returns fresh ids.
 */
export interface Starter {
  id: string;
  label: string;
  description: string;
  build: () => Section;
}

const section = (
  label: string,
  blocks: Block[],
  options: { columns?: number[]; theme?: ColorTheme; align?: "start" | "center" } = {},
): Section =>
  cloneSection({
    id: "sec_0000000000",
    label,
    layout: {
      mode: "stack",
      columns: { d: options.columns ?? [12], m: [12] },
      ...(options.align ? { align: options.align } : {}),
    },
    style: { colorTheme: options.theme ?? "light" },
    blocks,
  } as Section);

export const STARTERS: Starter[] = [
  {
    id: "text",
    label: "Text",
    description: "A heading and a paragraph",
    build: () =>
      section("Text", [
        textBlock.create({
          fields: {
            content: rt.doc(
              rt.h(2, "A new section"),
              rt.p("Say what this part of the page is about in a sentence or two."),
            ),
          },
        }),
      ]),
  },
  {
    id: "text-image",
    label: "Text and image",
    description: "Words on the left, a photo on the right",
    build: () =>
      section(
        "Text and image",
        [
          textBlock.create({
            column: 0,
            fields: {
              content: rt.doc(
                rt.h(2, "Tell your story"),
                rt.p(
                  "A few sentences about who you are and why it matters to the people you serve.",
                ),
              ),
            },
          }),
          buttonBlock.create({ column: 0 }),
          imageBlock.create({ column: 1, fields: { image: DEMO.forest } }),
        ],
        { columns: [6, 6], align: "center" },
      ),
  },
  {
    id: "image",
    label: "Image",
    description: "One wide photo",
    build: () =>
      section("Image", [imageBlock.create({ fields: { image: DEMO.cliffs, aspect: "16:9" } })]),
  },
  {
    id: "quote",
    label: "Quote",
    description: "A pull quote on a dark band",
    build: () => section("Quote", [quoteBlock.create({ variant: "large" })], { theme: "dark" }),
  },
  {
    id: "faq",
    label: "Questions",
    description: "Answers people ask for",
    build: () =>
      section("Questions", [
        textBlock.create({ fields: { content: rt.doc(rt.h(2, "Questions")) } }),
        accordionBlock.create(),
      ]),
  },
  {
    id: "contact",
    label: "Contact form",
    description: "A short form that lands in your inbox",
    build: () =>
      section(
        "Contact",
        [
          textBlock.create({
            column: 0,
            fields: { content: rt.doc(rt.h(2, "Get in touch"), rt.p("We reply within a day.")) },
          }),
          formBlock.create({ column: 1 }),
        ],
        { columns: [5, 7] },
      ),
  },
  {
    id: "newsletter",
    label: "Newsletter",
    description: "Collect email sign-ups",
    build: () =>
      section("Newsletter", [newsletterBlock.create({ variant: "card" })], {
        theme: "light-accent",
      }),
  },
];
