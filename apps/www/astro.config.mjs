// OpenSpace site shell. Site, base path, routes, images, feeds and publishing all come from
// openspace.json and content/ via the site-kit integration — there is nothing to configure here.
import openspace from "@omniharmonic/openspace-site-kit";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [openspace()],
});
