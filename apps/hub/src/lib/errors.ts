import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Errors the Hub reports to clients. Every error response has the shape
 * `{ error: { code, message, details? } }`; `code` is stable and machine-readable,
 * `message` is plain language (no Git vocabulary for errors Studio may show).
 */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "bad_request", message, details);
export const unauthenticated = (message = "Please sign in.") =>
  new HttpError(401, "unauthenticated", message);
export const forbidden = (message = "You don't have access to this.") =>
  new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (code: string, message: string, details?: unknown) =>
  new HttpError(409, code, message, details);

export function errorBody(code: string, message: string, details?: unknown) {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}
