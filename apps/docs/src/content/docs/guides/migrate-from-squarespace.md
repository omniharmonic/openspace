---
title: Move from Squarespace
description: Moving a Squarespace site to OpenSpace is now part of the guide for every platform — see Move your site to OpenSpace.
---

Moving from Squarespace is covered, with every option, in **[Move your site to OpenSpace](/guides/migrate-to-openspace/#squarespace)** — the same guide now covers WordPress, Wix, Webflow and any other site.

In short:

```sh
npx -y @omniharmonic/openspace-cli import squarespace https://www.fernwoodyoga.com fernwood \
  --owner --export ~/Downloads/Squarespace-Wordpress-Export.xml
```

or, with the Claude Code plugin, `/openspace:import-squarespace https://www.fernwoodyoga.com fernwood` (or `/openspace:migrate`). Keep your Squarespace plan until the new site serves your domain over HTTPS and the redirects work.
