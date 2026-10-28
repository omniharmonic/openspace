/** MCP prompts: starting points for the common jobs an owner asks their AI to do. */
import { ToolError } from "./errors";
import { ITERATION_GUIDANCE } from "./guidance";

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface PromptDefinition {
  name: string;
  title: string;
  description: string;
  arguments: PromptArgument[];
  render(args: Record<string, string>): string;
}

const site = (a: Record<string, string>) => (a.site ? ` (site ${a.site})` : "");

export const PROMPTS: PromptDefinition[] = [
  {
    name: "design-a-page",
    title: "Design a page",
    description:
      "Compose a new page (or redesign one) from section presets, with real copy, checked and reviewed.",
    arguments: [
      {
        name: "brief",
        description: "What the page is for, who it's for, what it must say.",
        required: true,
      },
      {
        name: "page",
        description: "Existing page to redesign (id, slug or title); omit for a new page.",
      },
      { name: "site", description: "Site id (when the connection has several)." },
    ],
    render: (
      a,
    ) => `Design ${a.page ? `the page "${a.page}"` : "a new page"}${site(a)} from this brief:

${a.brief}

Work like a designer:
1. Read openspace://guidance/design, then get_site (pages, nav, current look) and, for an existing page, get_page with detail "outline".
2. Plan 4–7 sections that tell the story in order (hero with one clear headline and primary action → value → proof → details → closing call to action). Pick presets with list_section_presets; choose color themes that create rhythm (e.g. light → light-accent → light → dark finale).
3. Build it: create_page with the preset ids (or insert_section into the existing page).
4. Replace every piece of demo copy with copy from the brief (update_block; rich text is Markdown). Keep within each preset's word ranges. Don't invent facts, prices, testimonials or credentials — leave a clear placeholder question for the owner instead, and list those questions at the end.
5. Run design_check on the page, fix errors (apply_fix where offered), then screenshot desktop and mobile (or render_page) and refine.
6. Finish with zero design_check errors and a short summary from get_draft_diff. Don't publish unless asked.`,
  },
  {
    name: "restyle-site",
    title: "Restyle the site",
    description:
      "Change the whole site's look through Site Styles (palette, type, shape, buttons) — never inline CSS.",
    arguments: [
      {
        name: "mood",
        description: 'The feeling to aim for, e.g. "warmer and more editorial".',
        required: true,
      },
      { name: "site", description: "Site id (when the connection has several)." },
    ],
    render: (a) => `Restyle the site${site(a)} to feel: ${a.mood}

1. get_styles (with options) and get_site to see the current look and content; screenshot the home page as a "before".
2. create_snapshot named "before-restyle".
3. Try list_templates for a matching look (apply_template_look), or set_styles with a curated palette, a type pairing and shape/button/density choices that fit the mood. Keep two typefaces at most.
4. Screenshot the home page (desktop and mobile) and one inner page; compare with the "before". Adjust section color themes with update_section if the rhythm suffers.
5. design_check the whole site: contrast must have zero errors (set_styles explains any automatic contrast adjustments).
6. Summarise what changed and why; don't publish unless asked.`,
  },
  {
    name: "write-blog-post",
    title: "Write a blog post",
    description: "Draft a post in the owner's voice and save it as a draft.",
    arguments: [
      { name: "topic", description: "What the post is about.", required: true },
      { name: "audience", description: "Who it's for (optional)." },
      { name: "site", description: "Site id (when the connection has several)." },
    ],
    render: (
      a,
    ) => `Write a blog post${site(a)} about: ${a.topic}${a.audience ? `\nAudience: ${a.audience}` : ""}

1. list_posts with withBody for two or three recent posts to learn the owner's voice, length and structure; get_site for the site's purpose.
2. Draft the post in Markdown: a specific title, a one-sentence excerpt (≤ 160 characters), short paragraphs, ## subheadings, and a closing call to action ({% button href="/contact" %}…{% /button %} where it helps).
3. Never invent facts, quotes, prices or events — ask the owner, and mark open questions in your reply.
4. Save it with create_post as a draft (status "draft"), with tags that already exist on the site where possible.
5. Reply with the title, excerpt and the open questions. Publishing the post is the owner's call.`,
  },
  {
    name: "iterate-design",
    title: "Iterate on a design",
    description: "Tight look → check → edit loop on one page until it meets the design bar.",
    arguments: [
      { name: "page", description: "Page id, slug or title.", required: true },
      {
        name: "goal",
        description: 'What to improve (optional), e.g. "stronger hero, calmer mobile".',
      },
      { name: "site", description: "Site id (when the connection has several)." },
    ],
    render: (
      a,
    ) => `Iterate on the design of "${a.page}"${site(a)}.${a.goal ? ` Goal: ${a.goal}.` : ""}

${ITERATION_GUIDANCE}
Do at most five passes, and after each pass say in one line what you changed and what you saw in the screenshot. Stop when design_check shows no errors and the page reads clearly on desktop and mobile.`,
  },
];

export function getPrompt(
  name: string,
  args: Record<string, string> = {},
  prompts: readonly PromptDefinition[] = PROMPTS,
) {
  const p = prompts.find((x) => x.name === name);
  if (!p)
    throw new ToolError(
      `Unknown prompt "${name}". Prompts: ${prompts.map((x) => x.name).join(", ")}.`,
      "not_found",
    );
  const missing = p.arguments.filter((x) => x.required && !args[x.name]?.trim()).map((x) => x.name);
  if (missing.length)
    throw new ToolError(`Prompt ${name} needs: ${missing.join(", ")}.`, "invalid_arguments");
  return {
    description: p.description,
    messages: [{ role: "user" as const, content: { type: "text" as const, text: p.render(args) } }],
  };
}
