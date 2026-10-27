import {
  type Align,
  type Block,
  type BlockStyle,
  migrateBlock,
  type Responsive,
  resolve,
  type Section,
} from "@omniharmonic/openspace-schema";
import { imageTreatmentClass, TOKEN_VARS, themeClass } from "@omniharmonic/openspace-theme";
import { Component, type ReactNode, useContext } from "react";
import { componentDefinitionFor } from "./component";
import {
  BlockFieldsContext,
  BlockRegistryContext,
  type RenderMode,
  useEditor,
  useRenderContext,
} from "./context";
import { type CssVars, cx } from "./cx";
import { responsiveVars } from "./layout-vars";
import { globalRegistry, type RendererBlockDefinition } from "./registry";

/** `acme/map` → `acme-map`. */
export const blockTypeClass = (type: string) => `os-block--${type.replace(/\//g, "-")}`;

const spaceVar = (t: string) =>
  `var(${TOKEN_VARS.space[t as keyof typeof TOKEN_VARS.space] ?? TOKEN_VARS.space.md})`;

/** `os-align-center os-talign-center os-malign-start` (inheritance applied). */
export function alignClasses(align: Responsive<Align>): string {
  return `os-align-${resolve(align, "d")} os-talign-${resolve(align, "t")} os-malign-${resolve(align, "m")}`;
}

/** Wrapper classes + vars for a block's token style overrides. */
export function blockStyleProps(
  style: BlockStyle | undefined,
  mode: RenderMode,
): { className: string; vars: CssVars; attrs: Record<string, string> } {
  const vars: CssVars = {};
  const attrs: Record<string, string> = {};
  if (!style) return { className: "", vars, attrs };
  Object.assign(vars, responsiveVars("bpad", style.padding, spaceVar));
  if (style.radius) vars["--radius"] = `var(${TOKEN_VARS.radius[style.radius]})`;
  if (style.shadow) vars["--shadow"] = `var(${TOKEN_VARS.shadow[style.shadow]})`;
  const entrance = style.animation?.entrance;
  if (entrance && entrance !== "none" && mode !== "editor") {
    attrs["data-os-behavior"] = "reveal";
    attrs["data-os-reveal"] = entrance;
  }
  const className = cx(
    style.colorTheme && `${themeClass(style.colorTheme)} os-themed`,
    style.imageTreatment && imageTreatmentClass(style.imageTreatment),
    style.padding && "has-pad",
    style.align && alignClasses(style.align),
    style.radius && "has-radius",
    style.shadow && style.shadow !== "none" && "has-shadow",
    style.border && style.border !== "none" && `os-border-${style.border}`,
  );
  return { className, vars, attrs };
}

export function MissingBlock({ block, reason }: { block: Block; reason: string }) {
  const editor = useEditor();
  const { mode } = useRenderContext();
  if (mode === "production") return null;
  if (editor?.renderMissingBlock) return <>{editor.renderMissingBlock({ block, reason })}</>;
  return (
    <div className="os-block-missing" role="note">
      {reason}
    </div>
  );
}

type Prepared =
  | { ok: true; def: RendererBlockDefinition; block: Block; fields: Record<string, unknown> }
  | { ok: false; reason: string };

function prepare(def: RendererBlockDefinition | undefined, raw: Block, mode: RenderMode): Prepared {
  if (!def) return { ok: false, reason: `Unknown block type “${raw.type}”` };
  let block = raw;
  try {
    if (raw.v < def.version) block = migrateBlock(def, raw);
  } catch (err) {
    return { ok: false, reason: `Could not upgrade this ${def.label} block: ${String(err)}` };
  }
  const parsed = def.fieldsSchema.safeParse(block.fields);
  if (parsed.success)
    return { ok: true, def, block, fields: parsed.data as Record<string, unknown> };
  if (mode !== "production")
    return {
      ok: false,
      reason: `This ${def.label} block has invalid content: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
    };
  // Production: replace only the failing fields with their defaults (or drop them), then
  // re-validate. Raw invalid values never reach a render function (e.g. unsafe link URLs).
  const repaired = repairFields(def, block.fields, parsed.error.issues);
  const again = def.fieldsSchema.safeParse(repaired);
  if (again.success) return { ok: true, def, block, fields: again.data as Record<string, unknown> };
  return { ok: false, reason: `This ${def.label} block has invalid content` };
}

/** Swap each top-level field with a validation issue for its default, or remove it. */
export function repairFields(
  def: Pick<RendererBlockDefinition, "meta">,
  fields: Record<string, unknown>,
  issues: readonly { path: readonly PropertyKey[] }[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fields };
  const defaults = def.meta.defaults.fields as Record<string, unknown>;
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key !== "string") continue;
    if (defaults[key] !== undefined) out[key] = structuredClone(defaults[key]);
    else delete out[key];
  }
  return out;
}

/**
 * Calls the definition's render function as its own component so hooks inside it keep a
 * stable order. The try/catch only covers the render function's own synchronous execution:
 * an error thrown by a nested component (rendered later by React) is not caught here. On the
 * client (Studio canvas) {@link BlockErrorBoundary} catches those; during static rendering
 * (`renderToStaticMarkup` has no error boundaries) such an error fails the page render, which
 * site-kit reports as a build error rather than shipping a silently broken page.
 */
function RenderBlock(props: {
  def: RendererBlockDefinition;
  block: Block;
  fields: Record<string, unknown>;
}) {
  const { def, block, fields } = props;
  try {
    return (
      <BlockFieldsContext.Provider value={{ block, fields }}>
        {
          def.render({
            id: block.id as never,
            fields,
            variant: block.variant ?? def.defaults.variant,
            style: block.style,
            block,
          }) as ReactNode
        }
      </BlockFieldsContext.Provider>
    );
  } catch (err) {
    return <MissingBlock block={block} reason={`This block failed to render: ${String(err)}`} />;
  }
}

/** Client-side error boundary around each block (no effect during static rendering). */
export class BlockErrorBoundary extends Component<
  { block: Block; children: ReactNode },
  { error: string | null }
> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: String(err) };
  }
  override render() {
    if (this.state.error)
      return (
        <MissingBlock
          block={this.props.block}
          reason={`This block failed to render: ${this.state.error}`}
        />
      );
    return this.props.children;
  }
}

export interface BlockViewProps {
  block: Block;
  /** The containing section (absent for standalone renders such as email/OG). */
  section?: Section;
}

/**
 * Render one block through the registry: migrate if stale, validate fields, wrap in a
 * `.os-block` container (container-query context, token style overrides, `data-os-id`).
 */
export function BlockView({ block, section }: BlockViewProps) {
  const registry = useContext(BlockRegistryContext) ?? globalRegistry;
  const ctx = useRenderContext();
  const editor = useEditor();
  // Custom components resolve from the document being rendered (`component/<name>`).
  const component = registry.get(block.type)
    ? undefined
    : componentDefinitionFor(ctx.doc, block.type);
  const def =
    component && "def" in component
      ? component.def
      : (registry.get(block.type) as RendererBlockDefinition | undefined);
  // Hidden blocks are skipped everywhere but Studio, which shows them ghosted.
  if (block.hidden && ctx.mode !== "editor") return null;
  const prepared: Prepared =
    component && "reason" in component
      ? { ok: false, reason: component.reason }
      : prepare(def, block, ctx.mode);

  const content: ReactNode = prepared.ok ? (
    <BlockErrorBoundary block={block}>
      <RenderBlock def={prepared.def} block={prepared.block} fields={prepared.fields} />
    </BlockErrorBoundary>
  ) : (
    <MissingBlock block={block} reason={prepared.reason} />
  );
  if (!prepared.ok && ctx.mode === "production" && !editor) return null;

  const variant = prepared.ok
    ? (prepared.block.variant ?? prepared.def.defaults.variant)
    : undefined;
  const s = blockStyleProps(block.style, ctx.mode);
  const el = (
    <div
      className={cx(
        "os-block",
        blockTypeClass(block.type),
        variant && `is-${variant}`,
        s.className,
      )}
      data-os-id={block.id}
      data-os-block={block.type}
      data-os-hidden={block.hidden ? "" : undefined}
      style={Object.keys(s.vars).length ? s.vars : undefined}
      {...s.attrs}
    >
      {content}
    </div>
  );
  return editor?.wrapBlock ? editor.wrapBlock({ block, section, children: el }) : el;
}
