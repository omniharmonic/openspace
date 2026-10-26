import type { OpIssue } from "@openspace/ops";
import type { z } from "zod";

/**
 * A failure the agent can correct: returned as an MCP tool result with `isError: true` and a
 * message that names the offending input paths, so the model can fix the call and retry.
 */
export class ToolError extends Error {
  constructor(
    message: string,
    readonly code: string = "invalid",
    readonly issues: OpIssue[] = [],
    readonly hint?: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export const pathText = (path: readonly (string | number | symbol)[]): string =>
  path.length
    ? path
        .map((p, i) =>
          typeof p === "number" ? `[${p}]` : `${i === 0 ? "" : "."}${String(p as string)}`,
        )
        .join("")
    : "(root)";

export function issueLines(issues: readonly OpIssue[], prefix: (string | number)[] = []): string[] {
  return issues.map((i) => `- ${pathText([...prefix, ...i.path])}: ${i.message}`);
}

/** Zod issues → `OpIssue`s (symbols stringified). */
export function zodToIssues(error: z.ZodError): OpIssue[] {
  return error.issues.map((i) => ({
    path: i.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
    message: i.message,
  }));
}

export function invalidInput(tool: string, error: z.ZodError): ToolError {
  const issues = zodToIssues(error);
  return new ToolError(
    `Invalid arguments for ${tool}:\n${issueLines(issues).join("\n")}`,
    "invalid_arguments",
    issues,
    "Fix the listed argument paths and call the tool again.",
  );
}

/** Render a ToolError for the agent. */
export function errorText(e: ToolError): string {
  return e.hint ? `${e.message}\n\nHint: ${e.hint}` : e.message;
}
