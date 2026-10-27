/**
 * @omniharmonic/openspace-templates — the twelve launch templates (doc 04 §7), each a complete site
 * (`openspace.json`, `content/**`, `media/LICENSES.json`) with three looks, plus a typed
 * registry for the Hub (`TemplateSource`), the Studio gallery and the CLI.
 *
 * Templates are data: each folder under `templates/<id>/` holds the generated site files and
 * `template.json`, written from `templates/<id>/src/build.ts` by `pnpm generate`. The registry
 * builds the same documents in memory (no filesystem), so it also runs inside a Worker.
 */
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { atelier } from "./atelier/src/build";
import { beacon } from "./beacon/src/build";
import { commons } from "./commons/src/build";
import { darkroom } from "./darkroom/src/build";
import { encore } from "./encore/src/build";
import { fieldNotes } from "./field-notes/src/build";
import { fixwell } from "./fixwell/src/build";
import { folio } from "./folio/src/build";
import { gather } from "./gather/src/build";
import { harbor } from "./harbor/src/build";
import { hearth } from "./hearth/src/build";
import { inkwell } from "./inkwell/src/build";
import { keystone } from "./keystone/src/build";
import { kiln } from "./kiln/src/build";
import { ledger } from "./ledger/src/build";
import {
  type BuiltTemplate,
  buildTemplate,
  type Licenses,
  type TemplateMeta,
  type TemplateSpec,
} from "./lib/define";
import { documentFiles, formatJson } from "./lib/files";
import { link } from "./link/src/build";
import { meadow } from "./meadow/src/build";
import { orbit } from "./orbit/src/build";
import { signal } from "./signal/src/build";
import { vow } from "./vow/src/build";

export type {
  LicenseEntry,
  Licenses,
  LookSpec,
  TemplateLook,
  TemplateMeta,
  TemplateSpec,
} from "./lib/define";
export { documentFiles, templateFolderFiles, templateJson } from "./lib/files";

export const name = "@omniharmonic/openspace-templates";

/** Template specs in gallery order (the six MVP templates first, doc 04 §7). */
export const templateSpecs: readonly TemplateSpec[] = [
  meadow,
  harbor,
  atelier,
  ledger,
  hearth,
  signal,
  fieldNotes,
  encore,
  kiln,
  commons,
  vow,
  link,
  darkroom,
  orbit,
  beacon,
  fixwell,
  keystone,
  gather,
  inkwell,
  folio,
];

export const TEMPLATE_IDS: readonly string[] = templateSpecs.map((s) => s.id);

const cache = new Map<string, BuiltTemplate>();

function built(id: string): BuiltTemplate | undefined {
  const hit = cache.get(id);
  if (hit) return hit;
  const spec = templateSpecs.find((s) => s.id === id);
  if (!spec) return undefined;
  const t = buildTemplate(spec);
  cache.set(id, t);
  return t;
}

/** A loaded template: gallery metadata, the site document and its repository files. */
export interface LoadedTemplate {
  meta: TemplateMeta;
  doc: SiteDocument;
  /** Site repository files keyed by path: `openspace.json`, `content/**`, `media/LICENSES.json`. */
  files: Record<string, string>;
  licenses: Licenses;
}

/** Gallery metadata for every template. */
export function listTemplates(): TemplateMeta[] {
  return TEMPLATE_IDS.map((id) => structuredClone((built(id) as BuiltTemplate).meta));
}

/** A template by id, or `undefined`. Each call returns fresh copies (safe to personalize). */
export function loadTemplate(id: string): LoadedTemplate | undefined {
  const t = built(id);
  if (!t) return undefined;
  const doc = structuredClone(t.doc);
  return {
    meta: structuredClone(t.meta),
    doc,
    files: { ...documentFiles(doc), "media/LICENSES.json": formatJson(t.licenses) },
    licenses: structuredClone(t.licenses),
  };
}

/** The registry as the Hub's `TemplateSource` (`list()` / `load()`). */
export const templateSource = {
  async list(): Promise<TemplateMeta[]> {
    return listTemplates();
  },
  async load(id: string): Promise<{ meta: TemplateMeta; files: Record<string, string> } | null> {
    const t = loadTemplate(id);
    return t ? { meta: t.meta, files: t.files } : null;
  },
};
