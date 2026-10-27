import { type Op, summarize } from "@omniharmonic/openspace-ops";
import type { SiteDocument } from "@omniharmonic/openspace-schema";

export interface TrailerActor {
  name: string;
  email: string | null;
  kind: "human" | "agent";
  label: string | null;
  /** For agents: the person the agent works for. */
  onBehalfOf?: string | null;
  session?: string | null;
}

/** A commit-trailer email for a person: their email, else a GitHub noreply address. */
export function trailerEmail(user: {
  email: string | null;
  login: string;
  githubId: number | null;
}): string {
  if (user.email) return user.email;
  return user.githubId
    ? `${user.githubId}+${user.login}@users.noreply.github.com`
    : `${user.login}@users.noreply.github.com`;
}

/**
 * Commit trailers (arch §5.3): `Co-authored-by:` for every person whose ops are in the commit,
 * `Agent:` for every MCP session.
 */
export function trailers(actors: readonly TrailerActor[]): string[] {
  const out = new Set<string>();
  for (const a of actors) {
    if (a.kind === "human") {
      if (a.email) out.add(`Co-authored-by: ${a.name} <${a.email}>`);
    } else {
      const who = a.onBehalfOf ? ` for ${a.onBehalfOf}` : "";
      const session = a.session ? ` (session ${a.session})` : "";
      out.add(`Agent: ${a.label ?? a.name}${session}${who}`);
    }
  }
  return [...out];
}

/** "Edited Home; changed accent color" + blank line + trailers. */
export function commitMessage(
  ops: readonly Op[],
  docBefore: SiteDocument,
  actors: readonly TrailerActor[],
  fallback = "Saved changes",
): { message: string; summary: string } {
  let summary: string;
  try {
    summary = ops.length ? summarize(ops, docBefore) : fallback;
  } catch {
    summary = fallback;
  }
  if (summary === "No changes") summary = fallback;
  const t = trailers(actors);
  return { summary, message: t.length ? `${summary}\n\n${t.join("\n")}` : summary };
}
