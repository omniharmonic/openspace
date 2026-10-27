import { sectionFragment } from "@omniharmonic/openspace-renderer";
import {
  type Link,
  LinkSchema,
  type Section,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";

/** Link targets (arch §4.1) in picker order, with their names. */
export const LINK_TYPE_LABEL: Record<Link["type"], string> = {
  page: "Page",
  item: "Collection item",
  url: "Web address",
  email: "Email",
  phone: "Phone",
  file: "File",
  anchor: "Section on this page",
};

export const LINK_TYPES = Object.keys(LINK_TYPE_LABEL) as Link["type"][];

export type LinkResult = { ok: true; link: Link } | { ok: false; message: string };

/** Validate a link built by the picker, with a plain-language message. */
export function checkLink(candidate: unknown, allow?: readonly Link["type"][]): LinkResult {
  const parsed = LinkSchema.safeParse(candidate);
  if (!parsed.success) {
    const type = (candidate as { type?: string } | null)?.type;
    const message =
      type === "url"
        ? "Use a full web address (https://…) or a path on this site (/about)."
        : type === "email"
          ? "That doesn’t look like an email address."
          : type === "phone"
            ? "Use digits, spaces, dashes or brackets, optionally starting with +."
            : type === "file"
              ? "Choose a file from your site, or an https:// address."
              : "Choose where this link goes.";
    return { ok: false, message };
  }
  if (allow && !allow.includes(parsed.data.type))
    return {
      ok: false,
      message: `${LINK_TYPE_LABEL[parsed.data.type]} links aren’t allowed here.`,
    };
  return { ok: true, link: parsed.data };
}

/**
 * Turn what someone typed into a web-address link target: bare domains get `https://`,
 * site paths stay as they are. Returns the cleaned string (not yet validated).
 */
export function normaliseUrl(input: string): string {
  const v = input.trim();
  if (!v) return v;
  if (v.startsWith("/") || /^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return `https://${v}`;
  return v;
}

/** Guess the best link type for pasted text (an email, a phone number, a URL). */
export function guessLink(input: string): Link | null {
  const v = input.trim();
  if (/^mailto:/i.test(v)) return { type: "email", email: v.slice(7) };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { type: "email", email: v };
  if (/^tel:/i.test(v)) return { type: "phone", phone: v.slice(4) };
  if (/^\+?[0-9 ()\-.]{6,30}$/.test(v)) return { type: "phone", phone: v };
  const url = normaliseUrl(v);
  const r = checkLink({ type: "url", url });
  return r.ok ? r.link : null;
}

/** Sections of a page that a link can jump to, with readable names. */
export function sectionTargets(
  doc: SiteDocument,
  pageId: string,
): Array<{ section: Section; fragment: string; label: string }> {
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  if (!page) return [];
  return page.sections.map((s, i) => ({
    section: s,
    fragment: sectionFragment(s),
    label: s.label ?? (s.anchor ? `#${s.anchor}` : `Section ${i + 1}`),
  }));
}

/** One-line description of where a link goes ("About", "hello@…", "#contact"). */
export function describeLink(doc: SiteDocument, link: Link | undefined | null): string {
  if (!link) return "No link";
  switch (link.type) {
    case "page": {
      const page = doc.pages[link.page as keyof SiteDocument["pages"]];
      const name = page?.title ?? "Missing page";
      if (!link.anchor) return name;
      const target = page
        ? sectionTargets(doc, page.id).find((t) => t.fragment === link.anchor)
        : undefined;
      return `${name} › ${target?.label ?? `#${link.anchor}`}`;
    }
    case "item": {
      const item = doc.collections[link.collection]?.[link.slug];
      return item ? item.frontmatter.title : `${link.collection}/${link.slug}`;
    }
    case "url":
      return link.url.replace(/^https?:\/\//, "");
    case "email":
      return link.email;
    case "phone":
      return link.phone;
    case "file":
      return link.src.split("/").at(-1) ?? link.src;
    case "anchor": {
      for (const page of Object.values(doc.pages)) {
        const t = sectionTargets(doc, page.id).find((x) => x.section.id === link.section);
        if (t) return `${t.label} (${page.title})`;
      }
      return "Missing section";
    }
  }
}
