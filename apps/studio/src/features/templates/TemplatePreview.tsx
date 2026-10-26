import type { TemplateLook, TemplateSummary } from "../../api/types";
import { SiteSketch } from "./SiteSketch";
import "./TemplatePreview.css";

export function previewSrc(template: TemplateSummary, look: TemplateLook): string | null {
  if (!template.previewUrl) return null;
  const url = new URL(template.previewUrl, typeof window !== "undefined" ? window.location.href : "http://localhost");
  url.searchParams.set("look", look.id);
  return url.toString();
}

export interface TemplatePreviewProps {
  template: TemplateSummary;
  look: TemplateLook;
  /** Width the live page is laid out at before scaling down (device preview). */
  frameWidth?: number;
  interactive?: boolean;
}

/**
 * Live preview when the Hub provides one (renderer output in an iframe),
 * a thumbnail when there's only that, otherwise a sketch of the look.
 */
export function TemplatePreview({ template, look, frameWidth = 1440, interactive = false }: TemplatePreviewProps) {
  const src = previewSrc(template, look);
  const sample = template.sample ?? { name: template.name, tagline: template.description };
  if (src) {
    return (
      <div className="st-tpreview" style={{ ["--_fw" as string]: frameWidth }}>
        <iframe
          className="st-tpreview__frame"
          src={src}
          title={`${template.name} template, ${look.name} look`}
          loading="lazy"
          sandbox="allow-scripts"
          tabIndex={interactive ? 0 : -1}
          style={{ pointerEvents: interactive ? "auto" : "none" }}
        />
      </div>
    );
  }
  if (template.thumbnailUrl) {
    return (
      <img
        className="st-tpreview__img"
        src={template.thumbnailUrl}
        alt={`${template.name} template, ${look.name} look`}
        loading="lazy"
      />
    );
  }
  return <SiteSketch styles={look.styles} name={sample.name} tagline={sample.tagline} />;
}
