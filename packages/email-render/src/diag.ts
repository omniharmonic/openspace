/** A non-fatal problem found while rendering (skipped block, unresolved link, theme fallback). */
export interface EmailWarning {
  code:
    | "unknown-block"
    | "unresolved-link"
    | "unsupported-link"
    | "invalid-field"
    | "theme-error"
    | "theme"
    | "color-substituted";
  message: string;
  /** Where it happened, e.g. `blocks[2].items[0].link`. */
  path?: string;
}

export type Warn = (code: EmailWarning["code"], message: string, path?: string) => void;

/** Thrown for caller errors that would otherwise silently send a broken email. */
export class EmailRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailRenderError";
  }
}
