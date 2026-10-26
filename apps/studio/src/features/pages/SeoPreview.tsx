import { pageDescription, pageTitle, siteUrlFor } from "@openspace/renderer";
import type { Page, SiteDocument } from "@openspace/schema";
import { Globe } from "lucide-react";
import { useState } from "react";
import { Segmented } from "../../ui";
import { useMediaPreviewUrl } from "../media/sources";

/** Where a page lives on the web: `https://maya.example/classes/`. */
export function pageUrl(doc: SiteDocument, slug: string): string {
  const base = siteUrlFor(doc);
  return slug ? `${base}${slug}/` : base;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Plain-language SEO length hints (Google shows about 60 / 160 characters). */
export function seoHints(title: string, description: string | undefined): string[] {
  const hints: string[] = [];
  if (title.length > 60)
    hints.push("The title is long; search results cut it off after about 60 characters.");
  if (!description) hints.push("Add a description so search results show your words, not a guess.");
  else if (description.length < 50)
    hints.push("The description is short; aim for one or two sentences.");
  else if (description.length > 160)
    hints.push("The description is long; search results show about 160 characters.");
  return hints;
}

/**
 * Live previews of how a page appears in a Google result and as a social card, using the same
 * title/description fallbacks the published page uses (`@openspace/renderer`).
 */
export function SeoPreview({ doc, page }: { doc: SiteDocument; page: Page }) {
  const [view, setView] = useState<"google" | "social">("google");
  const title = pageTitle(doc, page);
  const description = pageDescription(doc, page) ?? "";
  const url = pageUrl(doc, page.slug);
  const host = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();
  const crumbs = host ? [host.host, ...host.pathname.split("/").filter(Boolean)].join(" › ") : url;
  const image = page.seo?.image ?? doc.site.seo?.image ?? null;
  const imageUrl = useMediaPreviewUrl(image);
  const favicon = useMediaPreviewUrl(doc.site.favicon ?? null);

  return (
    <div className="st-seo">
      <div className="st-seo__head">
        <span className="st-seo__label">Preview</span>
        <Segmented
          aria-label="Preview"
          size="sm"
          value={view}
          onValueChange={setView}
          options={[
            { value: "google", label: "Search" },
            { value: "social", label: "Social" },
          ]}
        />
      </div>
      {view === "google" ? (
        <div className="st-seo__google" data-testid="seo-google">
          <div className="st-seo__site">
            <span className="st-seo__fav">
              {favicon ? <img src={favicon} alt="" /> : <Globe aria-hidden="true" />}
            </span>
            <span>
              <span className="st-seo__name">{doc.site.title}</span>
              <span className="st-seo__crumbs">{crumbs}</span>
            </span>
          </div>
          <p className="st-seo__title">{truncate(title, 60)}</p>
          <p className="st-seo__desc">
            {description ? truncate(description, 160) : <em>No description yet.</em>}
          </p>
          {page.seo?.noindex && <p className="st-seo__note">Hidden from search engines.</p>}
        </div>
      ) : (
        <div className="st-seo__card" data-testid="seo-social">
          <div className="st-seo__img">
            {imageUrl ? <img src={imageUrl} alt="" /> : <span>{doc.site.title}</span>}
          </div>
          <div className="st-seo__card-body">
            <span className="st-seo__domain">{host?.host ?? ""}</span>
            <p className="st-seo__card-title">{truncate(title, 70)}</p>
            <p className="st-seo__card-desc">{truncate(description, 110)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
