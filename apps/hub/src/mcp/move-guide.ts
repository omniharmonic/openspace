/**
 * How Claude takes over a site that was moved in automatically ("Move your site" in Studio, or
 * `import_site`) and brings it closer to the original: part of the Hub's server instructions,
 * the `finish-a-move` prompt (for clients that show MCP prompts), and the hint `import_status`
 * adds when a move didn't come out a near-perfect match. Studio's "Improve it with Claude" sends
 * a message that names the old address and the site id; this is what Claude does with it.
 */
import type { PromptDefinition } from "@omniharmonic/openspace-mcp-tools";

/** Below this match (0–100), or with listed differences, a move is worth finishing by hand. */
export const CLOSE_ENOUGH = 90;

export const FINISH_MOVE_FLOW = `Finishing a move (the person's site was moved in automatically — "Move your site" in Studio, or import_site — and they ask you to bring it closer to the original):
1. Find the site (the message names its id; list_sites). If you can't reach it, the answer has an "Allow" link for the person — give it to them and wait; you can never grant yourself access. Then import_status with the site id: it gives the old address, how close the move came (0–100, page by page), what still differs on each page and what needs attention. Start with the lowest-scoring pages and the listed differences.
2. Look at both, page by page: screenshot_url of the original page and screenshot of the new one, same device — desktop, then mobile. Name the three biggest differences a visitor would notice (missing sections or elements, section order, the top of the page, columns, photo crops, colours, type, spacing, buttons, motion). Tell the person in two or three plain sentences what you'll fix.
3. Rebuild what didn't come across. Use the site's own designs first: set_styles (fonts, colours, spacing), update_section, a closer preset (list_section_presets, insert_section), place_in_grid. For a section, animation or element the standard designs can't express (a custom layout, a slideshow, an animated banner, a distinctive card grid), make a custom component: create_component with the original's look recreated in its own template and CSS (a little js only for motion, honouring reduced motion), and a field for every word, picture and link so the person can still edit them in OpenSpace — then insert_component and preview_component, and remove the section it replaces. Never paste the old site's code or scripts wholesale, and never invent content: ask when something is missing.
4. Check: design_check (zero errors; apply_fix where offered), then phone_check and fix_for_phones, and compare with the original again on a phone. Show the person before and after.
5. Publish only with their OK: get_draft_diff, a one-line summary, "Ready to put these changes live? Your site stays as it is until you say yes." Then publish with confirm: true — or, if this connection can't publish, ask them to press Publish in Studio. Finish with the live link and the Studio link; their old site stays untouched until they move their web address.`;

export const FINISH_MOVE_PROMPT: PromptDefinition = {
  name: "finish-a-move",
  title: "Finish moving my site",
  description:
    "Claude compares your moved site with the original page by page and rebuilds what didn't come across — custom sections, animations, missing pieces — keeping everything editable, and asks you before publishing.",
  arguments: [
    { name: "site", description: "The OpenSpace site (id or name) that was moved in." },
    { name: "from", description: "Your old site's address, e.g. https://www.example.com." },
  ],
  render: (a) => {
    const from = a.from?.trim() ? ` ${a.from.trim()}` : "";
    const site = a.site?.trim() ? ` (site ${a.site.trim()})` : "";
    return `Please finish moving my site${from} to OpenSpace${site}. The automatic move brought most of it across; I'd like it to look like my old site.

Compare it with the original page by page, starting with what OpenSpace's move report says still differs. Rebuild what didn't come across — custom sections, animations, missing pieces — keep every word and picture editable for me, run the design and phone checks, show me before and after, and ask me before you publish.

How to do it well:
${FINISH_MOVE_FLOW}`;
  },
};
