import type { Op, SiteDocument } from "@openspace/ops";
import type { Page } from "@openspace/schema";
import { blocksInOrder, blockText, headingsOf, imagesIn } from "./content";
import { type CheckOptions, type Issue, issue, opMeta, sortIssues } from "./issue";

/**
 * SEO check for one page: title and description (presence, length, uniqueness), a single
 * Heading 1, a social sharing image, thin content, image alt text, vague link labels and
 * no-index pages. Autofixes fill in a missing description from the page's first paragraph and a
 * missing share image from the page's first photo.
 */
export function seoCheck(page: Page, doc: SiteDocument, options: CheckOptions = {}): Issue[] {
  const meta = opMeta(options);
  const out: Issue[] = [];
  const add = (i: Parameters<typeof issue>[0]) => out.push(issue({ ...i, page: page.id }));
  const sections = page.sections.filter((s) => !s.hidden);
  const blocks = sections.flatMap((s) => blocksInOrder(s));
  const patch = (set: Record<string, unknown>): Op => ({
    op: "page.update",
    ...meta(),
    page: page.id,
    set,
  });

  // Title
  const title = effectiveTitle(page, doc);
  if (title.length > 60) {
    add({
      rule: "seo-title-long",
      severity: "warning",
      message: `The page title in search results is ${title.length} characters (“${title}”); search engines cut it off after about 60.`,
      fix: "Set a shorter SEO title for this page.",
    });
  } else if ((page.seo?.title ?? page.title).trim().length < 4) {
    add({
      rule: "seo-title-short",
      severity: "info",
      message: `The page title “${page.title}” says very little about the page.`,
      fix: "Use a descriptive title, e.g. 'Classes & timetable' instead of 'Info'.",
    });
  }
  const sameTitle = Object.values(doc.pages).filter(
    (p) => p.id !== page.id && effectiveTitle(p, doc) === title,
  );
  if (sameTitle.length) {
    add({
      rule: "seo-title-duplicate",
      severity: "warning",
      message: `“${title}” is also the title of ${sameTitle.map((p) => p.title).join(", ")}. Each page needs its own title in search results.`,
      fix: "Give each page a distinct SEO title.",
    });
  }

  // Description
  const description = page.seo?.description ?? undefined;
  const firstParagraph = blocks
    .filter((b) => b.type === "text" || b.type === "heading")
    .map((b) => (b.type === "heading" ? String(b.fields.subheading ?? "") : blockText(b)))
    .find((t) => t.split(/\s+/).length >= 8);
  if (!description) {
    const suggestion = firstParagraph ? clip(firstParagraph, 155) : undefined;
    add({
      rule: "seo-description-missing",
      severity: doc.site.seo?.description ? "info" : "warning",
      message: doc.site.seo?.description
        ? "This page has no description of its own, so search results show the site-wide one."
        : "This page has no description for search results.",
      fix: "Write one or two sentences (50–160 characters) about what's on this page.",
      ...(suggestion
        ? {
            autofix: {
              label: "Use the page's first paragraph",
              ops: [patch({ "seo.description": suggestion })],
            },
          }
        : {}),
    });
  } else if (description.length < 50 || description.length > 160) {
    add({
      rule: "seo-description-length",
      severity: "info",
      message: `The description is ${description.length} characters; aim for 50–160 so it isn't cut off or too thin.`,
      fix:
        description.length > 160
          ? "Shorten the description."
          : "Add a little more detail to the description.",
    });
  }
  if (description) {
    const same = Object.values(doc.pages).filter(
      (p) => p.id !== page.id && p.seo?.description === description,
    );
    if (same.length) {
      add({
        rule: "seo-description-duplicate",
        severity: "info",
        message: `${same.map((p) => p.title).join(", ")} use the same description.`,
        fix: "Describe each page in its own words.",
      });
    }
  }

  // Heading 1
  const h1s = blocks.flatMap(headingsOf).filter((h) => h.level === 1);
  if (h1s.length === 0) {
    add({
      rule: "seo-h1-missing",
      severity: "warning",
      message: "The page has no Heading 1, which tells search engines what the page is about.",
      fix: "Make the main headline a Heading 1.",
    });
  } else if (h1s.length > 1) {
    add({
      rule: "seo-h1-multiple",
      severity: "info",
      message: `The page has ${h1s.length} Heading 1s.`,
      fix: "Keep one Heading 1 and make the others Heading 2.",
    });
  }

  // Share image
  if (!page.seo?.image && !doc.site.seo?.image) {
    const first = blocks
      .flatMap(imagesIn)
      .find(({ image }) => image.width === undefined || image.width >= 600)?.image;
    add({
      rule: "seo-share-image",
      severity: "info",
      message: "No image is set for when this page is shared on social media or in messages.",
      fix: "Choose a share image in the page's SEO settings.",
      ...(first
        ? {
            autofix: {
              label: "Use the page's first photo",
              ops: [patch({ "seo.image": first.src })],
            },
          }
        : {}),
    });
  }

  // Thin content
  const words = blocks.map(blockText).join(" ").split(/\s+/).filter(Boolean).length;
  if (!page.seo?.noindex && words < 80) {
    add({
      rule: "seo-thin-content",
      severity: "info",
      message: `The page has about ${words} words of text; search engines have little to go on.`,
      fix: "Add a short paragraph that explains what's on the page in your own words.",
    });
  }

  // Alt text
  const missingAlt = blocks
    .flatMap((b) => imagesIn(b).map((i) => ({ b, i })))
    .filter(({ i }) => !i.image.alt.trim());
  if (missingAlt.length) {
    add({
      rule: "seo-image-alt",
      severity: "warning",
      message: `${missingAlt.length} image${missingAlt.length === 1 ? " has" : "s have"} no alt text, which search engines and screen readers rely on.`,
      fix: "Describe what each image shows and why it's there.",
    });
  }

  // Vague link labels
  for (const b of blocks.filter((x) => x.type === "button")) {
    for (const label of [b.fields.label, b.fields.secondaryLabel]) {
      if (
        typeof label === "string" &&
        /^(?:click here|here|read more|learn more|more|link|go)$/i.test(label.trim())
      ) {
        add({
          rule: "seo-link-text",
          severity: "info",
          block: b.id,
          key: label,
          message: `The button “${label}” doesn't say where it goes.`,
          fix: "Use a label that names the destination, e.g. 'See the class timetable'.",
        });
      }
    }
  }

  if (page.seo?.noindex) {
    add({
      rule: "seo-noindex",
      severity: "info",
      message: "This page is hidden from search engines.",
      fix: "Turn off 'Hide from search engines' if people should find it on Google.",
      autofix: {
        label: "Show in search engines",
        ops: [{ op: "page.update", ...meta(), page: page.id, unset: ["seo.noindex"] }],
      },
    });
  }
  return sortIssues(out);
}

/** Title as shown in search results (`seo.title` or the page title, through the site template). */
export function effectiveTitle(page: Page, doc: SiteDocument): string {
  const base = page.seo?.title || page.title;
  const template = doc.site.seo?.titleTemplate;
  return template?.includes("%s") ? template.replace("%s", base) : base;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
