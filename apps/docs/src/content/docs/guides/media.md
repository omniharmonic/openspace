---
title: Media
description: Upload, organize and edit images and files in your OpenSpace media library — with automatic resizing and privacy-safe metadata stripping.
---

The **Media** panel is your site's library. Images you add anywhere end up here, and you can reuse them on any page.

## Adding images

Upload with the button, **drag and drop**, **paste**, or — on a phone — straight from the **camera**. Before anything leaves your device, Studio:

1. **Resizes** the image so its longest edge is at most 2400 pixels (never enlarging it).
2. **Removes hidden metadata**, including the GPS location many phones embed in photos, while keeping the picture the right way up.
3. Works out its **dimensions**, a tiny blurred **placeholder** and a suggested **focal point**, so pages never jump while loading.
4. Names it by date and content (`media/2026/10/studio-k3f9a2c1.jpg`) and skips duplicates.

Uploads queue on your device and retry automatically if your connection drops.

When the site is published, each image is turned into modern formats (AVIF and WebP) at several sizes, so visitors on phones download small files.

## Alt text and focal point

Select an image in the library to:

- Write **alt text** — describe what the image is *for* ("Maya guiding a student into a seated twist"), not just what's in it. Purely decorative images can be left without alt text.
- Drag the **focal point** onto the subject, so crops keep faces and products in frame at every size (arrow keys work too).
- See where it's **used**, copy its address, or delete it (with a warning if it's in use).

Badges in the library flag images with **no alt text** and images that are **unused**.

## Crop and adjust

**Crop & adjust** offers aspect presets (full, 1:1, 4:5, 3:2, 16:9 or free), zoom and framing, and brightness, contrast, saturation, warmth and black-and-white. Edits are saved as a **new** image; the original stays in your library.

## Files, audio and video

- **Documents and audio** (PDFs, MP3s and similar) up to 25 MB are kept as they are.
- **SVG** graphics are cleaned of anything that could run code.
- **Video**: on GitHub Pages hosting, embed video from YouTube, Vimeo or PeerTube instead — embeds load lightly, with no third-party code until a visitor presses play. Small self-hosted clips are possible on Cloudflare hosting.

## Storage

Your media lives with your site's files. A meter shows how much you're using: you'll see a warning at 600 MB and uploads stop at 900 MB, safely under GitHub Pages' 1 GB limit.
