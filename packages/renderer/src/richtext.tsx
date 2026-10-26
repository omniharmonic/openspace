import type { BlockNode, InlineNode, Mark, RichTextDoc, TypePreset } from "@openspace/schema";
import { colorVar } from "@openspace/theme";
import { Fragment, type ReactNode } from "react";
import { useRenderContext } from "./context";
import { cx } from "./cx";
import { withBase } from "./link";

/** Class for a typography preset: `os-type-h2`. */
export const typeClass = (preset: TypePreset | "button" | "nav") => `os-type-${preset}`;

/** Marks are applied innermost-first in this order; links always wrap everything. */
const MARK_ORDER: Mark["type"][] = ["code", "strike", "underline", "italic", "bold", "highlight", "link"];

function wrapMark(mark: Mark, child: ReactNode, key: number, basePath: string): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong key={key}>{child}</strong>;
    case "italic":
      return <em key={key}>{child}</em>;
    case "underline":
      return <u key={key}>{child}</u>;
    case "strike":
      return <s key={key}>{child}</s>;
    case "code":
      return <code key={key}>{child}</code>;
    case "highlight": {
      const color = mark.attrs?.color;
      return (
        <mark
          key={key}
          className="os-highlight"
          style={color ? { "--hl": `var(${colorVar(color)})` } : undefined}
        >
          {child}
        </mark>
      );
    }
    case "link": {
      const { href, title, newTab } = mark.attrs;
      return (
        <a
          key={key}
          href={withBase(href, basePath)}
          title={title}
          target={newTab ? "_blank" : undefined}
          rel={newTab ? "noopener" : undefined}
        >
          {child}
        </a>
      );
    }
  }
}

function renderInline(nodes: InlineNode[] | undefined, basePath: string): ReactNode[] {
  if (!nodes) return [];
  return nodes.map((node, i) => {
    if (node.type === "hardBreak") return <br key={i} />;
    const marks = [...(node.marks ?? [])].sort(
      (a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type),
    );
    let out: ReactNode = node.text;
    for (const m of marks) out = wrapMark(m, out, i, basePath);
    return marks.length ? out : <Fragment key={i}>{node.text}</Fragment>;
  });
}

function renderBlock(node: BlockNode, key: number, basePath: string): ReactNode {
  switch (node.type) {
    case "paragraph": {
      const preset = node.attrs?.preset;
      const children = renderInline(node.content, basePath);
      return (
        <p key={key} className={preset && preset !== "body" ? typeClass(preset) : undefined}>
          {children.length ? children : <br />}
        </p>
      );
    }
    case "heading": {
      const { level, preset } = node.attrs;
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      return (
        <Tag key={key} className={typeClass(preset ?? (`h${level}` as TypePreset))}>
          {renderInline(node.content, basePath)}
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul key={key}>
          {node.content.map((li, i) => (
            <li key={i}>{li.content.map((c, j) => renderBlock(c, j, basePath))}</li>
          ))}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} start={node.attrs?.start}>
          {node.content.map((li, i) => (
            <li key={i}>{li.content.map((c, j) => renderBlock(c, j, basePath))}</li>
          ))}
        </ol>
      );
    case "blockquote":
      return (
        <blockquote key={key}>
          {node.content.map((c, j) => renderBlock(c, j, basePath))}
        </blockquote>
      );
  }
}

export interface RichTextProps {
  doc: RichTextDoc | null | undefined;
  className?: string;
  /** Element wrapping the flow (default `div`). */
  as?: "div" | "section" | "article";
}

/**
 * Render a rich-text document (arch §3.5) to semantic HTML. Headings and paragraphs carry
 * typography preset classes; links are base-path aware; no inline styles except token
 * highlight colors.
 */
export function RichText({ doc, className, as: Tag = "div" }: RichTextProps) {
  const { basePath } = useRenderContext();
  if (!doc || doc.content.length === 0) return null;
  return (
    <Tag className={cx("os-rich", className)}>
      {doc.content.map((node, i) => renderBlock(node, i, basePath))}
    </Tag>
  );
}
