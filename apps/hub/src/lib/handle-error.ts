import type { Context } from "hono";
import { ZodError } from "zod";
import { GitHubConflictError, GitHubNotFoundError } from "../github/types";
import { SiteFilesError } from "../services/site-files";
import type { AppEnv } from "../types";
import { errorBody, HttpError } from "./errors";

/** Map any thrown error to the `{ error: { code, message } }` envelope; log unexpected ones. */
export function handleError(err: Error, c: Context<AppEnv>): Response {
  if (err instanceof HttpError) {
    if (err.status >= 500) c.var.log?.error(err.message, { code: err.code, err });
    return c.json(errorBody(err.code, err.message, err.details), err.status);
  }
  if (err instanceof ZodError)
    return c.json(errorBody("invalid_request", err.issues[0]?.message ?? "Invalid request."), 400);
  if (err instanceof GitHubConflictError)
    return c.json(
      errorBody("conflict", "Someone else changed this site at the same moment. Try again."),
      409,
    );
  if (err instanceof GitHubNotFoundError) {
    c.var.log?.warn("github not found", { err });
    return c.json(errorBody("not_found", "We couldn't find that."), 404);
  }
  if (err instanceof SiteFilesError) {
    c.var.log?.warn("site content invalid", { err, issues: err.issues });
    return c.json(
      errorBody("content_invalid", "This site's content couldn't be read.", err.issues),
      422,
    );
  }
  c.var.log?.error("unhandled error", { err, path: c.req.path, method: c.req.method });
  return c.json(errorBody("internal", "Something went wrong on our side."), 500);
}
