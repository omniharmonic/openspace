/**
 * How Claude leads "Start with Claude" over the Hub's remote MCP: the server instructions sent in
 * `initialize`, and the `start-a-site` prompt (for clients that show MCP prompts). The
 * instructions alone are enough — clients that ignore prompts still get the whole flow, and the
 * same steps are repeated in `start_site`'s description for clients that only read tools.
 */
import { type PromptDefinition, SERVER_INSTRUCTIONS } from "@omniharmonic/openspace-mcp-tools";
import { FINISH_MOVE_FLOW } from "./move-guide";

export const START_FLOW = `Making a new website with someone (they have no site yet, or ask for a new one):
1. Lead the conversation warmly, in plain words, one or two questions at a time — never a form. Learn: what the site is for; who visits and what they should do there (book, buy, sign up, get in touch, read); how it should feel (three words); what they already have (logo, photos, colours, wording, an old site, sites they love); which pages they need. Ask to see their logo or photos if they mention them.
2. Propose a direction in a few sentences — palette, type, layout, the page list — and get their yes. You may show a quick preview first.
3. Design it yourself, bespoke, not a template: write the complete page(s) as HTML with their own CSS (a small design system as CSS variables), real copy from their words (no lorem ipsum; never invent facts, prices or testimonials — ask), phone-ready (responsive, no sideways scrolling, body text at least 16px, tap targets at least 44px). Give each section an id and point the menu and buttons at it (<a href="#how-it-works"> → <section id="how-it-works">): OpenSpace keeps those links working, in the header and the phone menu. Then call start_site with name, about, audience, feeling and the page as html (or several pages as files). Use a template only if the person would rather.
4. start_site answers at once with the edit link (it works straight away) and the live address. Tell them the first version is being published — usually about a minute, and the address shows "not found" until then. Meanwhile run phone_check (fix_for_phones if needed) and keep refining with them; every edit goes to the draft.
5. Call site_status until it says live. Finish with both links — the live site and "edit it in OpenSpace" — and offer to keep refining it together here.
Permissions: a site you made is always yours to edit. If a site exists that you can't edit, the tool's answer has an "Allow" link for the person — give it to them; you can never grant yourself access. If you're not allowed to create sites, say how to turn it on (the answer says where).
Speak plainly: no jargon (repository, MCP, deploy, DNS) unless explained in one friendly sentence. Celebrate when it's live.`;

/** Hub server instructions: the editing basics plus the start and finish-a-move flows. */
export const HUB_INSTRUCTIONS = `${SERVER_INSTRUCTIONS}

Start with list_sites. ${START_FLOW}

${FINISH_MOVE_FLOW}`;

export const START_PROMPT: PromptDefinition = {
  name: "start-a-site",
  title: "Make a new website with me",
  description:
    "Claude asks you a few questions about your site, proposes a direction, designs it and puts it online with OpenSpace — then gives you the link to edit it.",
  arguments: [
    {
      name: "idea",
      description: "A few words about the site, if you like (e.g. “my pottery studio”).",
    },
  ],
  render: (
    a,
  ) => `I'd like to make a new website with OpenSpace${a.idea?.trim() ? ` — ${a.idea.trim()}` : ""}.

Please lead me through it: ask me a few questions first (one or two at a time), propose a direction, then design the site yourself and put it online with start_site. Tell me while it's being published, check site_status until it's live, and give me the live link and the link to edit it in OpenSpace.

How to do it well:
${START_FLOW}`,
};
