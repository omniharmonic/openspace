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
