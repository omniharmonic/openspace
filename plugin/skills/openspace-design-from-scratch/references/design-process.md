# From feelings to design decisions

The person gives you feelings ("warm", "calm", "a bit cheeky"); you turn them into concrete, consistent choices. Use this as a translation table, then trust your eye on the screenshot.

## Moodboard in words

Write each direction as 3–5 sentences a non-designer can picture. Cover:

- **The first screen**: what fills it (a big photo, big words, a split of both), how much air there is.
- **Colour mood**: grounds (paper, cream, ink, sand, night), the one colour that means "act here", and how loud it is.
- **Type voice**: an editorial serif (thoughtful, literary), a friendly grotesk (open, modern), a condensed display (bold, energetic), a monospace accent (technical, crafted).
- **Photography**: close and warm, wide and airy, flat-lay and graphic, people-first or product-first.
- **Rhythm**: calm long scroll with big gaps, or tight and busy like a market stall.

Give each a short name ("Bakery window at 7am", "Quiet gallery", "Sunday market").

## Feelings → choices

| They say | Palette | Type | Shape & rhythm | Motion |
|---|---|---|---|---|
| warm, welcoming, cosy | cream/oat grounds, deep brown text, one terracotta or honey accent | soft serif headings (Fraunces, Newsreader), humanist sans text | soft corners, comfortable spacing | subtle |
| calm, quiet, restful | off-white and stone, muted green or blue accent | light serif or airy sans, generous line height | airy spacing, few lines and boxes | subtle or none |
| bold, energetic, loud | high contrast (black, white, one saturated colour) | heavy grotesk or condensed display, big sizes | sharp or pill buttons, compact rhythm | expressive |
| elegant, refined, premium | ink and ivory, a metallic or deep jewel accent | high-contrast serif (Playfair, Cormorant), small caps eyebrows | sharp corners, generous margins, thin rules | subtle |
| playful, friendly, fun | brighter pastels or primaries on white | rounded sans (Nunito), chunky headings | round corners, pill buttons | expressive |
| earthy, natural, handmade | clay, moss, sand, bark | warm serif + sturdy sans, maybe a hand-drawn accent | soft corners, textured photos | subtle |
| modern, clean, minimal | white/near-black, one accent | neutral grotesk (Inter, Instrument Sans) | sharp, aligned grid, lots of space | none or subtle |
| trustworthy, professional | navy/slate, white, one confident accent | sturdy serif headings or clean sans | soft corners, clear structure | subtle |

Always: body text 16–20px, 4.5:1 contrast (the checker enforces it), two font families at most, one action colour.

## Design-system tokens

`update_design_system` accepts tokens in the record's shape:

```json
{
  "colors": {
    "cream": { "value": "#fbf3e6", "role": "background" },
    "cocoa": { "value": "#3b2416", "role": "text" },
    "terracotta": { "value": "#b5532a", "role": "brand", "usage": "Buttons and small accents only" },
    "night": { "value": "#1f1712", "usage": "Dark sections" }
  },
  "fonts": {
    "heading": { "family": "Fraunces" },
    "body": { "family": "Work Sans" }
  },
  "type": {
    "display": { "size": 88, "sizeMobile": 48, "lineHeight": 1.02 },
    "h2": { "size": 44, "sizeMobile": 32, "lineHeight": 1.1 },
    "body": { "size": 18, "lineHeight": 1.6 },
    "eyebrow": { "size": 13, "letterSpacing": 0.18, "case": "uppercase" }
  },
  "space": { "contentWidth": 1160, "sectionPadding": 112, "sectionPaddingMobile": 64 },
  "radius": { "base": 14, "button": 999 }
}
```

Colour `role`s map onto the site's styles: `background`, `surface`, `text`, `text-muted`, `heading`, `brand` (the action colour), `border`, `link`. A design-token file in any common shape (W3C/DTCG, Style Dictionary, Tokens Studio, a brand-kit export) can be passed as `tokens` instead — it is read into this shape.

With `applyToStyles: true` the tokens restyle the whole site; fonts that aren't free web fonts fall back to the closest pairing (the person can upload a licensed font in the editor's Site Styles).

## Rules worth writing down

Good `rules` are short and checkable:

- "Terracotta is for buttons and links only — never large areas."
- "Headlines in sentence case; eyebrows in small caps."
- "Every section has one job; one button per screen."
- "Photos: warm, close, natural light; never stock handshakes."
- "Dark sections are for the story and the final call to action."
