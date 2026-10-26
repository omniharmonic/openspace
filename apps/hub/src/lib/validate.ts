import type { Context } from "hono";
import type { z } from "zod";
import { HttpError } from "./errors";

/** Parse and validate a JSON request body; 400 with field issues on failure. */
export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    const text = await c.req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "invalid_json", "The request body must be JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new HttpError(
      400,
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid request.",
      parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })),
    );
  return parsed.data;
}
