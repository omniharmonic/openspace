// OpenSpace documentation — Astro Starlight. Content is CC BY 4.0.
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export const SITE = "https://docs.openspace.dev";
export const REPO = "https://github.com/omniharmonic/openspace";

export default defineConfig({
  site: SITE,
  integrations: [
    starlight({
      title: "OpenSpace",
      description:
        "Documentation for OpenSpace, the open-source website builder: beautiful sites you own, free forever.",
      social: [{ icon: "github", label: "GitHub", href: REPO }],
      editLink: { baseUrl: `${REPO}/edit/main/apps/docs/` },
      lastUpdated: false,
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Live in three minutes", slug: "getting-started" },
            { label: "Templates", slug: "templates" },
            { label: "FAQ", slug: "faq" },
          ],
        },
        {
          label: "Build your site",
          items: [
            { label: "Editing", slug: "guides/editing" },
            { label: "Site Styles", slug: "guides/site-styles" },
            { label: "Pages & navigation", slug: "guides/pages-and-navigation" },
            { label: "Media", slug: "guides/media" },
            { label: "Publishing, history & rollback", slug: "guides/publishing" },
            { label: "Domains", slug: "guides/domains" },
            { label: "Move from Squarespace", slug: "guides/migrate-from-squarespace" },
          ],
        },
        {
          label: "Connect your AI",
          items: [
            { label: "Overview", slug: "connect-your-ai" },
            { label: "Claude & Claude Desktop", slug: "connect-your-ai/claude" },
            { label: "Claude Code plugin", slug: "connect-your-ai/claude-code" },
            { label: "Tools reference", slug: "connect-your-ai/tools" },
          ],
        },
        {
          label: "Grow",
          items: [
            { label: "Forms & newsletter", slug: "grow/forms-and-newsletter" },
            { label: "Email campaigns", slug: "grow/campaigns" },
            { label: "Members", slug: "grow/members" },
            { label: "Store & donations", slug: "grow/store" },
            { label: "Analytics", slug: "grow/analytics" },
            { label: "Collaborators & roles", slug: "grow/collaborators" },
          ],
        },
        {
          label: "Developers",
          items: [
            { label: "Architecture overview", slug: "architecture" },
            { label: "Self-hosting the Hub", slug: "self-hosting" },
            { label: "Budget alerts & abuse", slug: "operators/budget-and-abuse" },
            { label: "The openspace CLI", slug: "developers/cli" },
            { label: "Block development", slug: "developers/block-development" },
            { label: "Contributing templates", slug: "contributing/templates" },
          ],
        },
        {
          label: "Trust",
          items: [{ label: "Privacy & data", slug: "privacy" }],
        },
      ],
    }),
  ],
});
