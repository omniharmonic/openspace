import type { Block } from "./block";
import type { AnyBlockDefinition, BlockIssue, BlockMeta } from "./define-block";
import type { SiteDocument } from "./document";
import { migrateBlock } from "./migrations";

export interface DocumentBlockIssue extends BlockIssue {
  blockId: string;
}

/** A set of block definitions keyed by type. */
export interface BlockRegistry {
  get(type: string): AnyBlockDefinition | undefined;
  has(type: string): boolean;
  types(): string[];
  list(): AnyBlockDefinition[];
  /** Serializable metadata for every block (Studio's insert menu, MCP `list_blocks`). */
  meta(): BlockMeta[];
  /** Validate one block instance against its definition. */
  validate(block: Block): { success: true } | { success: false; issues: BlockIssue[] };
  /** Migrate a block to its definition's current version (unknown types are returned as-is). */
  migrate(block: Block): Block;
  /** Validate every block in a site document (pages + footer); issue paths are document paths. */
  validateDocument(doc: SiteDocument): DocumentBlockIssue[];
}

export function createBlockRegistry(definitions: readonly AnyBlockDefinition[]): BlockRegistry {
  const byType = new Map<string, AnyBlockDefinition>();
  for (const def of definitions) {
    if (byType.has(def.type)) throw new Error(`Block type ${def.type} is defined twice`);
    byType.set(def.type, def);
  }
  const validate: BlockRegistry["validate"] = (block) => {
    const def = byType.get(block.type);
    if (!def)
      return {
        success: false,
        issues: [{ path: ["type"], message: `Unknown block type "${block.type}"` }],
      };
    const result = def.validate(block);
    return result.success ? { success: true } : { success: false, issues: result.issues };
  };
  return {
    get: (type) => byType.get(type),
    has: (type) => byType.has(type),
    types: () => [...byType.keys()],
    list: () => [...byType.values()],
    meta: () => [...byType.values()].map((d) => d.meta),
    validate,
    migrate: (block) => {
      const def = byType.get(block.type);
      return def ? migrateBlock(def, block) : block;
    },
    validateDocument: (doc) => {
      const out: DocumentBlockIssue[] = [];
      const check = (blocks: readonly Block[], base: (string | number)[]) => {
        blocks.forEach((b, j) => {
          const r = validate(b);
          if (!r.success) {
            for (const issue of r.issues)
              out.push({
                blockId: b.id,
                path: [...base, j, ...issue.path],
                message: issue.message,
              });
          }
        });
      };
      check(doc.site.footer.blocks, ["site", "footer", "blocks"]);
      for (const [key, page] of Object.entries(doc.pages)) {
        page.sections.forEach((s, i) => {
          check(s.blocks, ["pages", key, "sections", i, "blocks"]);
        });
      }
      return out;
    },
  };
}
