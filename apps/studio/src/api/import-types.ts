import type { Site } from "./types";

/**
 * Hosted imports — "Move my site" (Hub `/api/imports`). The Hub creates the new site and runs the
 * importer in its GitHub repository; Studio shows the progress, then what needs attention.
 */

export type ImportState =
  | "waiting"
  | "queued"
  | "running"
  | "review"
  | "publishing"
  | "ready"
  | "failed";

export interface ImportStep {
  id: "read" | "pages" | "check" | "approve" | "publish";
  label: string;
  /** "12 pages, 48 images" once they came across. */
  detail?: string;
  state: "todo" | "active" | "done" | "failed";
}

export interface AttentionGroup {
  title: string;
  items: string[];
}

/** How closely the moved site matches the old one (measured in a browser, then auto-tuned). */
export interface ImportFidelity {
  /**
   * 0–100 after auto-tuning, and before it. Calibrated: 0 is "nothing like it" (an unrelated or
   * broken page), 90+ near-identical.
   */
  score: number;
  before?: number;
  /**
   * The same comparison by the strict v3 scorer (after and before tuning), shown beside the
   * corrected score for transparency. Absent from older moves.
   */
  strict?: number;
  strictBefore?: number;
  scorer?: string;
  /**
   * Set for a move measured before the score was calibrated: the numbers are re-scaled to
   * today's honest scale, and this is the score it was saved with.
   */
  rescaledFrom?: number;
  pages: Array<{
    path: string;
    device: "desktop" | "phone";
    score: number;
    before?: number;
    strict?: number;
    strictBefore?: number;
    /** Where the corrected score read the page differently from the strict one. */
    corrections?: string[];
    /** Side-by-side thumbnail (old site left, new site right), served by the Hub. */
    image: string | null;
    /** The biggest differences still there. */
    differs?: string[];
  }>;
  /** What auto-tuning adjusted. */
  changes?: string[];
  /** Score before sections were recreated as custom designs, and with them (when kept). */
  withoutComponents?: number;
  withComponents?: number;
}

export interface ImportView {
  id: string;
  siteId: string;
  kind: "url" | "convert";
  source: string;
  state: ImportState;
  phase: string | null;
  /** Plain-language status line. */
  headline: string;
  steps: ImportStep[];
  counts: { pages: number; items: number; media: number; redirects: number } | null;
  /** "What needs your attention" (from the import report). */
  attention: AttentionGroup[];
  /** "Finish setting up" items for after launch. */
  checklist: Array<{ id: string; kind: string; title: string; detail: string }>;
  /** The before/after comparison with the old site (null when it couldn't be measured). */
  fidelity?: ImportFidelity | null;
  report: string | null;
  error: string | null;
  /** In-place conversions: the pull request the owner approves. */
  pullRequest: { number: number; url: string } | null;
  siteUrl: string | null;
  studioUrl: string;
  /** GitHub needs the person's permission first (the install step). */
  connectUrl: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export const IMPORT_PLATFORMS = [
  "auto",
  "squarespace",
  "wordpress",
  "wix",
  "webflow",
  "framer",
  "carrd",
  "github",
  "url",
] as const;

/** `POST /api/imports` */
export interface ImportInput {
  url: string;
  name?: string;
  platform?: (typeof IMPORT_PLATFORMS)[number];
  render?: boolean;
  confirmOwnership: true;
}

/** `POST /api/imports/convert` */
export interface ConvertInput {
  repo: string;
  confirmOwnership: true;
}

export interface ImportStarted {
  site: Site;
  import: ImportView;
}

/** "Start with Claude": a brief and brand material (or a page Claude made) → a live site. */
export interface StartInput {
  name: string;
  about?: string;
  audience?: string;
  feeling?: string[];
  notes?: string;
  /** A design-token file's JSON text. */
  tokens?: string;
  tokensName?: string;
  colors?: string[];
  fonts?: { heading?: string; body?: string };
  /** `data:image/…;base64,` */
  logo?: string;
  photos?: Array<{ name: string; data: string }>;
  brandDoc?: { name: string; text?: string; data?: string };
  /** A page (HTML file or zip) as a data URL. */
  html?: { name: string; data: string };
}

export interface StartStarted {
  site: Site;
  startedFrom: { kind: "template" | "html"; template?: string; look?: string; why?: string };
}

export interface UploadPageInput {
  name?: string;
  html: { name: string; data: string };
  confirmOwnership: true;
}

export interface ImportApi {
  /** Start with Claude (POST /api/start). */
  startSite(input: StartInput): Promise<StartStarted>;
  /** "Move my site" → upload a page (POST /api/imports/html). */
  uploadPage(input: UploadPageInput): Promise<StartStarted>;
  createImport(input: ImportInput): Promise<ImportStarted>;
  convertRepo(input: ConvertInput): Promise<ImportStarted>;
  getImport(id: string): Promise<ImportView>;
  retryImport(id: string): Promise<ImportView>;
  /** The site's newest import, or null when it wasn't moved in. */
  siteImport(siteId: string): Promise<ImportView | null>;
}

/** An import that is still on its way (the progress screen keeps polling). */
export const importInProgress = (state: ImportState | string | undefined) =>
  state !== undefined && state !== "ready" && state !== "failed";

/** A GitHub repository or GitHub Pages address (which can be converted in place). */
export function githubAddress(input: string): { owner: string; repo: string } | null {
  const s = input.trim();
  const short = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/.exec(s);
  if (short) return { owner: short[1] as string, repo: short[2] as string };
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  if (/^(?:www\.)?github\.com$/i.test(u.hostname) && parts[0] && parts[1])
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  const pages = /^([a-z0-9-]+)\.github\.io$/i.exec(u.hostname);
  if (pages) {
    const owner = pages[1] as string;
    const first = parts[0];
    return {
      owner,
      repo: first && !/\.[a-z0-9]{2,5}$/i.test(first) ? first : `${owner}.github.io`,
    };
  }
  return null;
}
