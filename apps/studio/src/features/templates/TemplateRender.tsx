import { lazy, Suspense, useMemo, useState } from "react";
import { useTemplateDetail } from "../../api/catalog-queries";
import type { TemplateLook, TemplateSummary } from "../../api/types";
import { lookStyles, type Personalization, personalizeTemplate } from "./personalize";
import { SiteSketch } from "./SiteSketch";

// The renderer and block library load with the first live render, not with the gallery page.
const SiteRender = lazy(() => import("./LiveRender").then((m) => ({ default: m.SiteRender })));

export interface TemplateRenderProps {
  template: TemplateSummary;
  look: TemplateLook;
  personalize?: Personalization;
  frameWidth?: number;
  aspect?: number | "fill";
  /** Reveal only the header and this many sections. */
  sections?: number;
  interactive?: boolean;
  title?: string;
  className?: string;
  /** Fetch right away instead of when scrolled near (for the one preview on a screen). */
  eager?: boolean;
}

/**
 * A template's home page, rendered live by `@openspace/renderer` in the chosen look (and with
 * the owner's name, tagline, color and logo when given). The template's document is fetched
 * the first time the render comes near the viewport and cached for the session.
 */
export function TemplateRender({
  template,
  look,
  personalize,
  frameWidth = 1440,
  aspect = 0.75,
  sections,
  interactive,
  title,
  className,
  eager = false,
}: TemplateRenderProps) {
  const [wanted, setWanted] = useState(eager);
  const detail = useTemplateDetail(template.id, { enabled: wanted });
  const name = personalize?.name;
  const tagline = personalize?.tagline;
  const brandColor = personalize?.brandColor;
  const logo = personalize?.logo;
  const doc = useMemo(() => {
    if (!detail.data) return undefined;
    const styles = lookStyles(detail.data, look.id, template.looks);
    return personalizeTemplate(detail.data.document, styles, template.sample, {
      name,
      tagline,
      brandColor,
      logo,
    });
  }, [detail.data, look.id, template.looks, template.sample, name, tagline, brandColor, logo]);
  const label = title ?? `${template.name} template, ${look.name} look`;
  return (
    <Suspense
      fallback={
        <div
          className="st-render"
          style={aspect === "fill" ? undefined : { aspectRatio: `${1 / aspect}` }}
          role="img"
          aria-label={label}
        />
      }
    >
      <SiteRender
        doc={doc}
        frameWidth={frameWidth}
        aspect={aspect}
        sections={sections}
        interactive={interactive}
        title={label}
        className={className}
        onVisibleChange={(v) => v && setWanted(true)}
        fallback={
          detail.isError ? (
            // The Hub couldn't send the template: a sketch of the look stands in.
            <SiteSketch
              styles={look.styles}
              name={name || template.sample?.name || template.name}
              tagline={tagline || template.sample?.tagline}
              accent={brandColor}
              logo={logo}
            />
          ) : undefined
        }
      />
    </Suspense>
  );
}
