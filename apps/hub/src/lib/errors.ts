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

/**
 * Durable Object RPC drops custom error classes and fields, so errors meant for the client cross
 * the boundary encoded in the message (`[os:<status>:<code>] <message>`) and are decoded again in
 * `handleError`.
 */
const RPC_ERROR = /^\[os:(\d{3}):([a-z_]+)\] ([\s\S]*)$/;

export function encodeRpcError(err: HttpError): Error {
  return new Error(`[os:${err.status}:${err.code}] ${err.message}`);
}

export function decodeRpcError(err: unknown): HttpError | null {
  const m = err instanceof Error ? RPC_ERROR.exec(err.message) : null;
  if (!m) return null;
  return new HttpError(Number(m[1]) as ContentfulStatusCode, m[2] as string, m[3] as string);
}
