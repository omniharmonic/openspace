import type { Section, SectionBackground } from "@openspace/schema";
import { themeClass } from "@openspace/theme";
import { createContext, type ReactNode, useContext } from "react";
import { BlockView, MissingBlock } from "./block";
import { SectionContext, useEditor, useRenderContext } from "./context";
import { type CssVars, cx } from "./cx";
import { Img } from "./image";
import {
  blocksByColumn,
  colorValue,
  fallbackMobileRects,
  gridItemVars,
  gridVars,
  mobileRows,
  sectionStyleVars,
  stackColumnVars,
  stackVars,
} from "./layout-vars";
import { mediaUrl, sectionFragment } from "./link";

/** True for the first section of a page (its background image loads eagerly). */
export const FirstSectionContext = createContext(false);

function overlayVars(overlay: { color: string; opacity: number } | undefined): CssVars | undefined {
  if (!overlay) return undefined;
  return { "--overlay": colorValue(overlay.color), "--overlay-opacity": overlay.opacity };
}

/** Color/gradient backgrounds become a `--bg` var; image/video become a layer element. */
export function backgroundVars(bg: SectionBackground | undefined): CssVars {
  if (!bg) return {};
  if (bg.type === "color") return { "--bg": colorValue(bg.color) };
  if (bg.type === "gradient") {
    const stops = [bg.from, bg.via, bg.to].filter(Boolean).map((c) => colorValue(c as string));
    return { "--bg": `linear-gradient(${bg.angle ?? 180}deg, ${stops.join(", ")})` };
  }
  return {};
}

export function SectionBackgroundLayer({
  background,
}: {
  background: SectionBackground | undefined;
}) {
  const { basePath } = useRenderContext();
  const first = useContext(FirstSectionContext);
  if (!background) return null;
  if (background.type === "image") {
    return (
      <div
        className={cx("os-section__bg", background.parallax && "is-parallax")}
        aria-hidden="true"
      >
        <Img
          src={background.src}
          alt=""
          sizes="100vw"
          treatment="none"
          fill
          {...(background.focal ? { focal: background.focal } : {})}
          priority={first}
          className="os-section__media"
        />
        {background.overlay && (
          <div className="os-section__overlay" style={overlayVars(background.overlay)} />
        )}
      </div>
    );
  }
  if (background.type === "video") {
    const focal = background.focal;
    return (
      <div className="os-section__bg" aria-hidden="true">
        <video
          className="os-section__media os-section__video"
          data-os-behavior="video-lite"
          data-os-autoplay=""
          muted
          loop
          playsInline
          preload="none"
          poster={background.poster ? mediaUrl(background.poster, basePath) : undefined}
          style={focal ? { objectPosition: `${focal[0] * 100}% ${focal[1] * 100}%` } : undefined}
        >
          <source src={mediaUrl(background.src, basePath)} />
        </video>
        {background.overlay && (
          <div className="os-section__overlay" style={overlayVars(background.overlay)} />
        )}
      </div>
    );
  }
  return null;
}

function StackBody({ section }: { section: Section & { layout: { mode: "stack" } } }) {
  const { layout } = section;
  const { mode } = useRenderContext();
  const cols = blocksByColumn(
    layout,
    section.blocks.filter((b) => !b.hidden || mode === "editor"),
  );
  return (
    <div
      className={cx(
        "os-section__inner os-stack",
        `os-w-${layout.width ?? "content"}`,
        layout.align && `is-align-${layout.align}`,
        cols.length > 1 && "is-multi",
      )}
      style={stackVars(layout)}
    >
      {cols.map((blocks, i) => {
        const vars = stackColumnVars(layout, i);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
            key={i}
            className="os-col"
            data-os-col={i}
            style={Object.keys(vars).length ? vars : undefined}
          >
            {blocks.map((b) => (
              <BlockView key={b.id} block={b} section={section} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function GridBody({ section }: { section: Section & { layout: { mode: "grid" } } }) {
  const { layout } = section;
  const { mode } = useRenderContext();
  const fallback = fallbackMobileRects(layout);
  const vars = { ...gridVars(layout), "--mrows": mobileRows(layout, fallback) };
  // DOM order follows desktop reading order (top-to-bottom, left-to-right) for assistive tech.
  const ordered = section.blocks
    .filter((b) => !b.hidden || mode === "editor")
    .sort((a, b) => {
      const ra = layout.items[a.id]?.d;
      const rb = layout.items[b.id as keyof typeof layout.items]?.d;
      if (!ra || !rb) return 0;
      return ra.y - rb.y || ra.x - rb.x;
    });
  return (
    <div
      className={cx("os-section__inner os-grid", `os-w-${layout.width ?? "content"}`)}
      style={vars}
    >
      {ordered.map((b) =>
        layout.items[b.id as keyof typeof layout.items] ? (
          <div
            key={b.id}
            className="os-grid__item"
            data-os-item={b.id}
            style={gridItemVars(layout, b.id, fallback)}
          >
            <BlockView block={b} section={section} />
          </div>
        ) : mode !== "production" ? (
          <div key={b.id} className="os-grid__item os-grid__item--unplaced" data-os-unplaced={b.id}>
            <MissingBlock block={b} reason="This block has no position in the grid" />
          </div>
        ) : null,
      )}
    </div>
  );
}

export interface SectionViewProps {
  section: Section;
  /** Element to render (`div` for the footer's inner section). */
  as?: "section" | "div";
  /** Extra classes on the section element. */
  className?: string;
  children?: ReactNode;
}

/**
 * A page section: color-theme wrapper, background layer, then the stack or grid body. Every
 * per-instance value is an inline custom property; classes come from the shared stylesheet.
 */
export function SectionView({ section, as: Tag = "section", className }: SectionViewProps) {
  const { mode } = useRenderContext();
  const editor = useEditor();
  const first = useContext(FirstSectionContext);
  if (section.hidden && mode !== "editor") return null;
  const { style, layout } = section;
  const vars = { ...sectionStyleVars(style), ...backgroundVars(style.background) };
  const bgType = style.background?.type ?? "none";
  const entrance = style.animation?.entrance;
  const reveal =
    entrance && entrance !== "none" && mode !== "editor"
      ? {
          "data-os-behavior": "reveal",
          "data-os-reveal": entrance,
          ...(style.animation?.stagger ? { "data-os-stagger": "" } : {}),
        }
      : {};
  const el = (
    <Tag
      id={sectionFragment(section)}
      className={cx(
        "os-section",
        themeClass(style.colorTheme ?? "light"),
        `os-section--${layout.mode}`,
        bgType !== "none" && `has-bg-${bgType}`,
        style.minHeight && "has-minh",
        style.padding && "has-pad",
        first && "os-section--first",
        className,
      )}
      data-os-id={section.id}
      data-os-section=""
      data-os-hidden={section.hidden ? "" : undefined}
      style={Object.keys(vars).length ? vars : undefined}
      {...reveal}
    >
      <SectionContext.Provider value={section}>
        <SectionBackgroundLayer background={style.background} />
        {layout.mode === "stack" ? (
          <StackBody section={section as Section & { layout: { mode: "stack" } }} />
        ) : (
          <GridBody section={section as Section & { layout: { mode: "grid" } }} />
        )}
      </SectionContext.Provider>
    </Tag>
  );
  return editor?.wrapSection ? editor.wrapSection({ section, children: el }) : el;
}
