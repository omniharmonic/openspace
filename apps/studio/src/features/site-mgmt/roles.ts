import type { SiteRole } from "../../api";

/** Plain-language names and powers of each site role (Settings → People, invitation page). */
export const ROLE_INFO: Record<SiteRole, { name: string; does: string }> = {
  owner: { name: "Owner", does: "Everything, including hosting, transfer and deleting the site." },
  designer: {
    name: "Designer",
    does: "Everything on the site: pages, layout, styles and settings.",
  },
  editor: { name: "Editor", does: "Words, images and pages — but not layout or styles." },
  contributor: {
    name: "Contributor",
    does: "Writes blog posts and events as drafts for approval.",
  },
};
