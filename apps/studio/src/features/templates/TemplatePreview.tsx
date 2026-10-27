import type { TemplateLook, TemplateSummary } from "../../api/types";
import type { Personalization } from "./personalize";
import { TemplateRender } from "./TemplateRender";
import "./TemplatePreview.css";

export function previewSrc(template: TemplateSummary, look: TemplateLook): string | null {
  if (!template.previewUrl) return null;
  const url = new URL(
    template.previewUrl,
    typeof window !== "undefined" ? window.location.href : "http://localhost",
  );
  url.searchParams.set("look", look.id);
  return url.toString();
}

export interface TemplatePreviewProps {
  template: TemplateSummary;
  look: TemplateLook;
  /** Width the live page is laid out at before scaling down (device preview). */
  frameWidth?: number;
  /** A scrollable, clickable preview (the gallery's preview dialog). */
  interactive?: boolean;
  personalize?: Personalization;
  /** Fetch the template right away (the one large preview on a screen). */
  eager?: boolean;
  /** Accessible name (default: "<Template> template, <Look> look"). */
  title?: string;
}

/** Screen height ÷ width for the device previews (desktop 1440×900, tablet 834×1112, phone 390×844). */
export function deviceAspect(frameWidth: number): number {
  if (frameWidth <= 430) return 844 / 390;
  if (frameWidth <= 1024) return 1112 / 834;
  return 900 / 1440;
}

/**
 * A template in a look, rendered live by `@omniharmonic/openspace-renderer` from the template's real
 * document. The interactive preview uses the Hub's full preview page when it has one (every
 * page, links and behaviors working), else the live render, scrollable.
 */
export function TemplatePreview({
  template,
  look,
  frameWidth = 1440,
  interactive = false,
  personalize,
  eager,
  title,
}: TemplatePreviewProps) {
  const src = interactive ? previewSrc(template, look) : null;
  const ar = deviceAspect(frameWidth);
  if (src) {
    return (
      <div
        className="st-tpreview st-tpreview--device"
        style={{ ["--_fw" as string]: frameWidth, ["--_ar" as string]: ar }}
      >
        <iframe
          className="st-tpreview__frame"
          src={src}
          title={title ?? `${template.name} template, ${look.name} look`}
          loading="lazy"
          sandbox="allow-scripts"
        />
      </div>
    );
  }
  return (
    <TemplateRender
      template={template}
      look={look}
      frameWidth={frameWidth}
      aspect={interactive ? ar : 0.75}
      interactive={interactive}
      personalize={personalize}
      eager={eager}
      title={title}
    />
  );
}
