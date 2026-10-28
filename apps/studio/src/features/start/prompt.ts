/**
 * The ready-made first message for Claude after "Start with Claude": plain words, the site's id
 * so Claude finds it, the brief, and the skill to use. The person pastes it (or opens Claude with
 * it filled in) — they never have to know what a design system or a skill is.
 */
export interface Brief {
  about?: string;
  audience?: string;
  feeling?: string[];
}

export const DESIGN_SKILL = "openspace-design-from-scratch";

export function designPrompt(
  site: { id: string; name: string },
  brief: Brief = {},
  /** "html": the site is a page they brought (their own design), not a template. */
  from?: "template" | "html",
): string {
  const lines = [
    from === "html"
      ? `Please help me with my new website "${site.name}" on OpenSpace (site ${site.id}). It's already live, made from my own page — I'd like to polish it and add to it.`
      : `Please design my new website "${site.name}" with me on OpenSpace (site ${site.id}). It's already live with a simple starting design — I'd like it to feel truly mine.`,
  ];
  if (brief.about?.trim()) lines.push(`What it's for: ${brief.about.trim()}`);
  if (brief.audience?.trim()) lines.push(`Who it's for: ${brief.audience.trim()}`);
  if (brief.feeling?.length) lines.push(`How it should feel: ${brief.feeling.join(", ")}`);
  lines.push(
    `Use the ${DESIGN_SKILL} skill: read my site's design system first, then take me through it one step at a time in plain words, show me screenshots as you go, and publish when I'm happy.`,
  );
  return lines.join("\n");
}

/** claude.ai with the message filled in (the person still presses send). */
export const claudeNewChatUrl = (prompt: string) =>
  `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;

/**
 * The first message for "Start with Claude" in Claude itself (no site yet): Claude leads from
 * here — questions, a direction, the design, publishing — using the OpenSpace connector.
 */
export function startInClaudePrompt(idea?: string): string {
  const about = idea?.trim() ? ` It's for ${idea.trim()}.` : "";
  return `I'd like to make a new website with OpenSpace.${about} Please use the OpenSpace connector and guide me: ask me a few questions about it first, then design it, put it online and give me the link to edit it in OpenSpace.`;
}

/** The old site's address as a person would write it ("owner/repo" stays as it is). */
export function oldAddress(source: string): string {
  const s = source.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^[\w.-]+\/[\w.-]+$/.test(s)) return s;
  return `https://${s}`;
}

/**
 * The first message for "Improve it with Claude" after an automatic move: names the old address
 * and the new site (its id, so Claude finds it), and says what to do — compare page by page,
 * rebuild what didn't come across, keep it editable, ask before publishing.
 */
export function finishMovePrompt(
  site: { id: string; name: string },
  source: string | null | undefined,
  score?: number | null,
): string {
  const close =
    typeof score === "number"
      ? ` The automatic move got it to ${score}/100 for how close it looks.`
      : "";
  return [
    `Please finish moving my site${source?.trim() ? ` ${oldAddress(source)}` : ""} to OpenSpace (site "${site.name}", id ${site.id}).${close}`,
    "Compare it with the original page by page, on a computer and on a phone, starting with what OpenSpace's move report says still differs. Rebuild what didn't come across — custom sections, animations, missing pieces — so it looks like my old site, and keep every word and picture editable for me in OpenSpace.",
    "Show me before and after as you go, run the design and phone checks, and ask me before you publish anything. Use the openspace-migrate skill if you have it.",
  ].join("\n");
}
