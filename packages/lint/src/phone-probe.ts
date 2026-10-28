/**
 * The rendered half of the Phone check: a script that runs inside a real browser (Playwright
 * locally, Cloudflare Browser Rendering on the Hub, Studio's own phone-preview iframe) on a page
 * laid out at phone width, and measures what only a browser knows — sideways scrolling, text cut
 * off at the screen edge, words that don't fit, text too small to read, buttons too small to tap,
 * text over text, text over photos, images taller than the screen.
 *
 * It is a plain-JS string (not a function's `toString()`, which bundlers may rewrite) so every
 * runtime can hand it to `page.evaluate()` / `eval` unchanged. It returns a {@link PhoneProbeResult}
 * (JSON); `phoneIssuesFromProbe()` turns that into plain-language issues with fixes.
 */

export type PhoneFindingKind =
  /** The page scrolls sideways: something is wider than the screen. */
  | "page-overflow"
  /** Content is cut off at the screen edge (clipped, not scrollable). */
  | "cut-off"
  /** A word in a heading doesn't fit on one line and breaks mid-word. */
  | "broken-word"
  /** A heading so large it fills most of the screen. */
  | "big-heading"
  /** Reading text smaller than 16px. */
  | "small-text"
  /** Any text smaller than 12px. */
  | "tiny-text"
  /** Text squeezed into a very narrow column. */
  | "narrow-text"
  /** A link or button less than 44px tall, or narrow and crowded by another one. */
  | "tap-target"
  /** Two pieces of text drawn on top of each other. */
  | "overlap"
  /** Text over a photo that can become unreadable on bright or dark parts of it. */
  | "photo-contrast"
  /** Text on a solid background without enough contrast. */
  | "low-contrast"
  /** Text touching the edge of the screen. */
  | "edge-text"
  /** An image taller than the phone screen. */
  | "tall-image"
  /** Most of a photo is cropped away on phones. */
  | "heavy-crop"
  /** A lot of empty space above and below a section. */
  | "loose-padding"
  /** The header is crowded: its parts overlap or it is very tall. */
  | "header-crowded"
  /** The footer is several screens tall. */
  | "long-footer"
  /** The first section's main button is below the first phone screen. */
  | "cta-below-fold";

export interface PhoneFinding {
  kind: PhoneFindingKind;
  /** Section id (`data-os-id` of the enclosing section), when inside one. */
  section?: string;
  /** Block id (`data-os-id` of the enclosing block). */
  block?: string;
  /** Where on the page: header, footer, menu, popup or main content. */
  area: "header" | "footer" | "main" | "menu" | "other";
  /** Element tag (lowercase) of what was measured. */
  tag: string;
  /** A short sample of its text (≤ 60 characters). */
  text?: string;
  /** The measured value (px, ratio…) and the limit it broke. */
  value?: number;
  limit?: number;
  /** OpenSpace classes of the element and its parents (for developers, never shown to owners). */
  path?: string;
  /** Is the element inside a custom component (designer markup)? */
  component?: string;
}

export interface PhoneProbeResult {
  /** Viewport width the page was measured at. */
  width: number;
  height: number;
  /** Document scroll width (> width when the page scrolls sideways). */
  scrollWidth: number;
  findings: PhoneFinding[];
}

/** Minimum sizes and ratios the probe and the static rules share. */
export const PHONE_LIMITS = {
  /** Apple HIG / Material: 44 CSS px square. */
  tapTarget: 44,
  /** Nothing smaller than this, however isolated. */
  tapTargetMin: 16,
  /** Reading text (paragraphs, lists, quotes). */
  bodyText: 16,
  /** Any text (labels, eyebrows, captions). */
  anyText: 12,
  /** Text never closer than this to the screen edge. */
  edge: 12,
  /** Heading font size as a share of the viewport width. */
  headingShare: 0.16,
  /** Heading block height as a share of the viewport height. */
  headingScreen: 0.6,
  /** Images taller than this share of the viewport height. */
  imageScreen: 1.05,
  /** Section padding (each side) above which a phone shows "a lot of empty space". */
  loosePadding: 128,
  /** Text columns narrower than this (px) with more than a few words. */
  narrowColumn: 130,
  /** Visible share of a photo below which it counts as heavily cropped. */
  crop: 0.34,
} as const;

/** Phone widths the rendered check measures. */
export const PHONE_WIDTHS = [360, 390] as const;
export const PHONE_HEIGHT = 780;

/**
 * The probe. Evaluate it in a page that is already laid out at phone width (fonts loaded, lazy
 * images forced); it resolves to a {@link PhoneProbeResult}.
 */
export const PHONE_PROBE_SCRIPT = `(async () => {
  const L = ${JSON.stringify(PHONE_LIMITS)};
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const findings = [];
  const seen = new Set();
  const style = document.createElement("style");
  // elementsFromPoint skips pointer-events:none layers (photo backgrounds, overlays).
  style.textContent = "*,*::before,*::after{pointer-events:auto!important;scroll-behavior:auto!important}";
  document.head.appendChild(style);
  const cs = (el) => getComputedStyle(el);
  const txt = (el) => (el.textContent || "").replace(/\\s+/g, " ").trim();
  const short = (s) => (s.length > 60 ? s.slice(0, 59) + "…" : s);
  const where = (el) => {
    const out = {};
    const blk = el.closest("[data-os-block]");
    const sec = el.closest("[data-os-section]");
    if (blk && blk.getAttribute("data-os-id")) out.block = blk.getAttribute("data-os-id");
    if (sec && sec.getAttribute("data-os-id")) out.section = sec.getAttribute("data-os-id");
    const comp = el.closest("[data-os-component]");
    if (comp) out.component = comp.getAttribute("data-os-component") || "component";
    out.area = el.closest(".os-menu") ? "menu" : el.closest("[data-os-header],.os-header,.os-announcement") ? "header" : el.closest(".os-footer,footer") ? "footer" : el.closest(".os-popup,dialog") ? "other" : "main";
    return out;
  };
  const add = (kind, el, extra) => {
    const w = where(el);
    const key = kind + "|" + (w.block || "") + "|" + (w.section || "") + "|" + (extra && extra.key ? extra.key : "") + "|" + (w.block || w.section ? "" : el.tagName + txt(el).slice(0, 30));
    if (seen.has(key)) return;
    seen.add(key);
    const f = { kind, ...w, tag: el.tagName.toLowerCase() };
    const cls = (e) => (e && typeof e.className === "string" ? e.className.split(/\\s+/).filter((c) => c.startsWith("os-") && !/^os-(theme|align|talign|malign)/.test(c)).slice(0, 2).join(".") : "");
    const where2 = [cls(el), cls(el.parentElement), cls(el.parentElement && el.parentElement.parentElement)].filter(Boolean).join(" < ");
    if (where2) f.path = where2.slice(0, 120);
    const t = txt(el);
    if (t) f.text = short(t);
    if (extra) { if (extra.value !== undefined) f.value = Math.round(extra.value * 100) / 100; if (extra.limit !== undefined) f.limit = extra.limit; }
    findings.push(f);
  };
  const hiddenByStyle = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = cs(e);
      if (s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse" || Number(s.opacity) === 0) return true;
      if (e.hasAttribute("hidden") || e.getAttribute("aria-hidden") === "true") return true;
      if (e.classList && (e.classList.contains("os-visually-hidden") || e.classList.contains("os-skip-link") || e.classList.contains("os-hp") || e.classList.contains("os-empty"))) return true;
      // Editor-only notes and Studio's own canvas chrome are not part of the published page.
      if (e.hasAttribute && e.hasAttribute("data-os-editor")) return true;
      if (e.tagName === "DIALOG" && !e.open) return true;
      if (e.tagName === "DETAILS" && !e.open && e !== el && !(el.closest("summary") && el.closest("summary").parentElement === e)) return true;
    }
    return false;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return !hiddenByStyle(el);
  };
  /** Inside something that scrolls sideways on purpose (carousels, tab bars, marquees, code). */
  const inScroller = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const ox = cs(e).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
      if (e.classList.contains("os-marquee") || e.classList.contains("os-carousel")) return true;
    }
    return false;
  };
  /** The nearest ancestor that clips horizontally (overflow hidden/clip), if any. */
  const clipper = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const ox = cs(e).overflowX;
      if (ox === "hidden" || ox === "clip") return e;
    }
    return null;
  };
  /** Bounding box of an element's own text (not hidden child spans). */
  const ownRect = (el) => {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const x of range.getClientRects()) {
        if (x.width < 0.5) continue;
        l = Math.min(l, x.left); t = Math.min(t, x.top); r = Math.max(r, x.right); b = Math.max(b, x.bottom);
      }
    }
    return l === Infinity ? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } : { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
  };
  const ownText = (el) => { let s = ""; for (const n of el.childNodes) if (n.nodeType === 3) s += n.textContent; return s.replace(/\\s+/g, " ").trim(); };
  const decorative = (el) => !!el.closest(".os-section__bg,.os-img,.os-section__overlay,[aria-hidden=true],.os-marquee,.os-header__cart-count");

  // Text leaves: elements with their own (non-blank) text.
  const all = Array.from(document.body.querySelectorAll("*"));
  const SKIP = new Set(["SCRIPT","STYLE","NOSCRIPT","TEMPLATE","SVG","PATH","OPTION","HEAD","TITLE","META","LINK","BR"]);
  const leaves = [];
  const leafSet = new Set();
  for (const el of all) {
    if (SKIP.has(el.tagName.toUpperCase())) continue;
    let own = "";
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
    if (!own.trim()) continue;
    if (!visible(el)) continue;
    leaves.push(el);
    leafSet.add(el);
  }

  // --- sideways scrolling and cut-off content ---------------------------------------------
  const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const content = all.filter((el) => {
    const t = el.tagName;
    return (t === "IMG" || t === "IFRAME" || t === "VIDEO" || t === "TABLE" || t === "PRE" || t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || t === "BUTTON" || t === "A" || t === "svg" || t === "SVG" || el.classList.contains("os-img") || el.classList.contains("os-block") || leafSet.has(el));
  });
  let overflowCulprit = null;
  for (const el of content) {
    if (el.tagName === "IMG" || el.tagName === "svg" || el.tagName === "SVG") continue; // cropped by their frame on purpose
    if (!visible(el) || decorative(el) && !el.classList.contains("os-img") || inScroller(el)) continue;
    if (el.classList.contains("os-img") && el.closest(".os-section__bg")) continue;
    const r = leafSet.has(el) && !el.classList.contains("os-block") ? ownRect(el) : el.getBoundingClientRect();
    if (r.width < 1) continue;
    const over = Math.max(r.right - vw, -r.left);
    if (over <= 2) continue;
    // Full-bleed media is drawn edge to edge on purpose.
    if ((el.tagName === "IMG" || el.classList.contains("os-img") || el.tagName === "VIDEO") && r.left >= -2 && r.right <= vw + 2) continue;
    const clip = clipper(el);
    const clipRect = clip ? clip.getBoundingClientRect() : null;
    if (clipRect && clipRect.left >= -2 && clipRect.right <= vw + 2) {
      // Clipped by a box inside the screen: is the element cut by it?
      if (r.right > clipRect.right + 2 || r.left < clipRect.left - 2) {
        add("cut-off", el, { value: over, key: el.tagName });
      }
    } else if (!overflowCulprit || r.right > overflowCulprit.getBoundingClientRect().right) overflowCulprit = el;
  }
  if (scrollWidth > vw + 1) add("page-overflow", overflowCulprit || document.body, { value: scrollWidth - vw });

  // --- headings: broken words and huge sizes ------------------------------------------------
  const heads = all.filter((el) => /^H[1-6]$/.test(el.tagName) || el.classList.contains("os-type-display") || el.classList.contains("os-type-h1") || el.classList.contains("os-header__title"));
  for (const h of heads) {
    if (!visible(h)) continue;
    const s = cs(h);
    const size = parseFloat(s.fontSize);
    const r = h.getBoundingClientRect();
    if (size > vw * L.headingShare || r.height > vh * L.headingScreen) add("big-heading", h, { value: size, limit: Math.round(vw * L.headingShare) });
    // A word broken across lines: one word, more than one line box.
    const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    let broken = false;
    for (let n = walker.nextNode(); n && !broken; n = walker.nextNode()) {
      const text = n.textContent || "";
      const re = /[^\\s\\-\u2010\u2013\u2014/]+/g;
      let m;
      while ((m = re.exec(text)) && !broken) {
        if (m[0].length < 4) continue;
        const range = document.createRange();
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        const rects = Array.from(range.getClientRects()).filter((x) => x.width > 0.5);
        const tops = new Set(rects.map((x) => Math.round(x.top)));
        if (tops.size > 1) broken = true;
        else if (rects.length && h.getBoundingClientRect().right + 1 < Math.max(...rects.map((x) => x.right))) broken = true;
      }
    }
    if (broken) add("broken-word", h, { value: size });
  }

  // --- text size, narrow columns, edges ------------------------------------------------------
  const READING = new Set(["P","LI","DD","BLOCKQUOTE","TD","FIGCAPTION"]);
  for (const el of leaves) {
    if (decorative(el) && !el.closest(".os-img figcaption")) continue;
    const s = cs(el);
    const size = parseFloat(s.fontSize);
    const t = ownText(el);
    const reading = READING.has(el.tagName) || (!!el.closest(".os-rich") && !el.closest("h1,h2,h3,h4,h5,h6,.os-type-eyebrow,small,label,button,.os-button"));
    // Paragraph-length text must be 16px; short notes may be a little smaller (never under 14px).
    if (reading && ((t.length >= 120 && size < L.bodyText - 0.5) || (t.length >= 40 && size < 13.5))) add("small-text", el, { value: size, limit: L.bodyText });
    else if (size < L.anyText - 0.5 && t.length > 1) add("tiny-text", el, { value: size, limit: L.anyText });
    const r = el.getBoundingClientRect();
    if (!el.closest("h1,h2,h3,h4,h5,h6") && (t.match(/[A-Za-z\\u00C0-\\uFFFF]{2,}/g) || []).length >= 6 && r.width < L.narrowColumn && !inScroller(el)) add("narrow-text", el, { value: r.width, limit: L.narrowColumn });
    if (!inScroller(el) && r.right <= vw + 2 && r.left >= -2) {
      // The text itself (not its box) against the screen edges.
      const tr = ownRect(el);
      if (tr.width > 0 && (tr.left < L.edge - 0.5 || tr.right > vw - L.edge + 0.5) && !el.closest(".os-announcement")) add("edge-text", el, { value: Math.min(tr.left, vw - tr.right), limit: L.edge });
    }
  }

  // --- tap targets ---------------------------------------------------------------------------
  // (A map's legal attribution link is exempt: it's required, tiny by convention and rarely tapped.)
  const targets = all.filter((el) => el.matches("a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab]") && visible(el) && !el.closest(".os-hp,.os-map__attribution"));
  const proseLink = (el) => el.tagName === "A" && !el.classList.contains("os-button") && !!el.parentElement && el.parentElement.closest("p,li,dd,blockquote,td,figcaption") && txt(el.parentElement.closest("p,li,dd,blockquote,td,figcaption")).length > txt(el).length + 10;
  /** A "stretched" link (an absolutely positioned ::after) is as big as the card it covers. */
  const hitRect = (el) => {
    const after = getComputedStyle(el, "::after");
    if (after && after.content && after.content !== "none" && after.position === "absolute") {
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement)
        if (cs(e).position !== "static") return e.getBoundingClientRect();
    }
    return el.getBoundingClientRect();
  };
  const rects = targets.map(hitRect);
  targets.forEach((el, i) => {
    if (proseLink(el)) return;
    if (el.type === "checkbox" || el.type === "radio") { const lab = el.closest("label"); if (lab) return; }
    const r = rects[i];
    if (r.width >= L.tapTarget - 0.5 && r.height >= L.tapTarget - 0.5) return;
    // Too short to tap reliably (44px), or so narrow and close to another target that it's easy to miss.
    const tiny = r.height < L.tapTarget - 0.5 || r.width < L.tapTargetMin - 0.5;
    // Tall enough: is it so narrow that a neighbour on the same line sits inside its 44px-wide zone?
    const cx = r.left + r.width / 2, half = L.tapTarget / 2;
    const zone = { left: cx - half, right: cx + half, top: r.top + r.height * 0.25, bottom: r.bottom - r.height * 0.25 };
    let crowded = false;
    targets.forEach((o, j) => {
      if (j === i || crowded || o.contains(el) || el.contains(o)) return;
      const q = rects[j];
      if (q.left < zone.right && q.right > zone.left && q.top < zone.bottom && q.bottom > zone.top) crowded = true;
    });
    if (tiny || crowded) add("tap-target", el, { value: Math.min(r.width, r.height), limit: L.tapTarget, key: txt(el).slice(0, 20) || el.getAttribute("aria-label") || String(i) });
  });

  // --- text over text --------------------------------------------------------------------------
  const blockOf = (el) => el.closest("[data-os-block]") || el.closest("[data-os-id]");
  /** Line boxes of an element's own text (a drop cap or a tall first letter stays within its line). */
  const lineRects = (el) => {
    const out = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const x of range.getClientRects()) if (x.width >= 0.5) out.push(x);
    }
    return out;
  };
  const boxes = leaves.filter((el) => !decorative(el) && ownText(el).length > 1).map((el) => ({ el, r: ownRect(el), lines: lineRects(el), b: blockOf(el) }));
  const linesMeet = (a, b) => a.lines.some((x) => b.lines.some((y) => Math.min(x.right, y.right) - Math.max(x.left, y.left) > 4 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > Math.max(8, 0.3 * Math.min(x.height, y.height))));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (!a.b || !b.b || a.b === b.b || a.b.contains(b.b) || b.b.contains(a.b)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const hgt = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 4 && hgt > 4 && linesMeet(a, b)) add("overlap", b.el, { key: a.b.getAttribute("data-os-id") || String(i) });
    }

  // --- contrast (text over photos and on solid colors) ---------------------------------------
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
  const colors = new Map();
  /** Any CSS color (rgb, color(), oklab, color-mix results…) as 0–255 RGB + alpha. */
  const parse = (c) => {
    if (!c || c === "transparent") return null;
    if (colors.has(c)) return colors.get(c);
    let out = null;
    const m = /^rgba?\\(([^)]+)\\)$/.exec(c);
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      out = { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    } else if (ctx2d) {
      const a = /\\/\\s*([\\d.]+)(%?)\\s*\\)$/.exec(c);
      const alpha = a ? Number(a[1]) / (a[2] ? 100 : 1) : 1;
      ctx2d.clearRect(0, 0, 1, 1);
      ctx2d.fillStyle = "#000";
      ctx2d.fillStyle = c.replace(/\\/\\s*[\\d.]+%?\\s*\\)$/, ")");
      ctx2d.fillRect(0, 0, 1, 1);
      const d = ctx2d.getImageData(0, 0, 1, 1).data;
      out = { r: d[0], g: d[1], b: d[2], a: alpha };
    }
    colors.set(c, out);
    return out;
  };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, base) => ({ r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 });
  const opacityOf = (el) => { let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= Number(cs(e).opacity); return o; };
  const PHOTO = new Set(["IMG","VIDEO","CANVAS","PICTURE","IFRAME"]);
  const pageBg = parse(cs(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const checkPoint = (el, x, y) => {
    const stack = document.elementsFromPoint(x, y);
    const at = stack.indexOf(el);
    if (at < 0) return null;
    const layers = [];
    let photo = false, base = null;
    for (const e of stack.slice(at)) {
      if (PHOTO.has(e.tagName)) { photo = true; break; }
      const s = cs(e);
      if (/url\\(/.test(s.backgroundImage)) { photo = true; break; }
      if (s.backgroundImage && s.backgroundImage !== "none") return null; // gradients: checked from the document
      const bg = parse(s.backgroundColor);
      if (bg && bg.a > 0) {
        const a = bg.a * opacityOf(e);
        if (a >= 0.98) { base = { ...bg, a: 1 }; break; }
        layers.push({ ...bg, a });
      }
    }
    return { photo, base: base || (photo ? null : pageBg), layers };
  };
  for (const el of leaves) {
    if (decorative(el) || ownText(el).length < 2) continue;
    const s = cs(el);
    const fg = parse(s.color);
    if (!fg || fg.a === 0) continue;
    const size = parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ownRect(el);
    if (r.width < 1) continue;
    const sy = window.scrollY;
    const pts = [[r.left + Math.min(8, r.width / 2), r.top + sy + r.height / 2], [r.left + r.width / 2, r.top + sy + r.height / 2]];
    let worst = Infinity, photo = false;
    for (const [px, docY] of pts) {
      if (docY < window.scrollY + 80 || docY > window.scrollY + vh - 20) window.scrollTo(0, Math.max(0, docY - vh / 2));
      const py = docY - window.scrollY;
      if (py < 0 || py > vh) continue;
      const hit = checkPoint(el, Math.max(0, Math.min(vw - 1, px)), py);
      if (!hit) continue;
      const bases = hit.photo ? [{ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 }] : [hit.base];
      for (const b0 of bases) {
        let c = b0;
        for (const l of hit.layers.slice().reverse()) c = over(l, c);
        const text = fg.a < 1 ? over(fg, c) : fg;
        worst = Math.min(worst, ratio(text, c));
      }
      photo = photo || hit.photo;
    }
    if (worst < need - 0.05) add(photo ? "photo-contrast" : "low-contrast", el, { value: worst, limit: need });
  }
  window.scrollTo(0, 0);

  // --- images --------------------------------------------------------------------------------
  for (const box of document.querySelectorAll(".os-img,iframe,video")) {
    if (!visible(box) || box.closest(".os-section__bg,.os-header,.os-lightbox,.os-carousel__track,.os-marquee")) continue;
    const r = box.getBoundingClientRect();
    if (r.height > vh * L.imageScreen) add("tall-image", box, { value: r.height, limit: Math.round(vh * L.imageScreen) });
    const img = box.querySelector && box.querySelector("img");
    if (img && img.naturalWidth > 0 && cs(img).objectFit === "cover") {
      const ir = img.getBoundingClientRect();
      const nat = img.naturalWidth / img.naturalHeight, shown = ir.width / Math.max(1, ir.height);
      const share = Math.min(nat / shown, shown / nat);
      if (share < L.crop && !box.style.getPropertyValue("--focal") && !img.style.getPropertyValue("--focal")) add("heavy-crop", box, { value: share, limit: L.crop });
    }
  }
  for (const bg of document.querySelectorAll(".os-section__bg img")) {
    const sec = bg.closest("[data-os-section]");
    if (!sec || !visible(sec) || bg.naturalWidth === 0) continue;
    const r = sec.getBoundingClientRect();
    const nat = bg.naturalWidth / bg.naturalHeight, shown = r.width / Math.max(1, r.height);
    const share = Math.min(nat / shown, shown / nat);
    const focal = (bg.getAttribute("style") || "") + (bg.closest("[style*='--focal']") ? "focal" : "");
    if (share < L.crop && !/--focal|focal/.test(focal)) add("heavy-crop", sec, { value: share, limit: L.crop, key: "bg" });
  }

  // --- section rhythm, header, footer ---------------------------------------------------------
  for (const sec of document.querySelectorAll("main [data-os-section]")) {
    if (!visible(sec)) continue;
    const s = cs(sec);
    const pad = Math.max(parseFloat(s.paddingTop), parseFloat(s.paddingBottom));
    const header = document.querySelector(".os-header");
    const overlayExtra = sec.classList.contains("os-section--first") && document.querySelector(".has-overlay-header") && header ? header.getBoundingClientRect().height : 0;
    const top = parseFloat(s.paddingTop) - overlayExtra, bottom = parseFloat(s.paddingBottom);
    const minh = parseFloat(s.minHeight) || 0;
    if (Math.max(top, bottom) > L.loosePadding && minh < vh * 0.5) add("loose-padding", sec, { value: Math.max(top, bottom), limit: L.loosePadding });
    void pad;
  }
  const bar = document.querySelector(".os-header__bar");
  if (bar && visible(bar)) {
    const parts = Array.from(bar.children).filter(visible);
    let crowded = bar.getBoundingClientRect().height > 120;
    for (let i = 0; i < parts.length && !crowded; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i].getBoundingClientRect(), b = parts[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) { crowded = true; break; }
      }
    if (bar.scrollWidth > bar.clientWidth + 2) crowded = true;
    if (crowded) add("header-crowded", bar, { value: bar.getBoundingClientRect().height });
  }
  // The first section's main action: visible without scrolling?
  const first = Array.from(document.querySelectorAll("main [data-os-section]")).find(visible);
  // Only a first section with photos or video (a hero) can push its words and button down.
  if (first && first.querySelector("img,video,.os-section__bg")) {
    // A form's own submit button sits at its end, wherever that is; look at call-to-action buttons.
    const cta = Array.from(first.querySelectorAll(".os-button--primary")).find((b) => visible(b) && !b.closest("form,.os-form,.os-newsletter"));
    if (cta) {
      const top = cta.getBoundingClientRect().top + window.scrollY;
      if (top + 20 > vh) add("cta-below-fold", cta, { value: top, limit: vh });
    }
  }
  const footer = document.querySelector(".os-footer");
  if (footer && visible(footer) && footer.getBoundingClientRect().height > vh * 2.5) add("long-footer", footer, { value: footer.getBoundingClientRect().height, limit: Math.round(vh * 2.5) });

  style.remove();
  return { width: vw, height: vh, scrollWidth, findings };
})()`;

/**
 * Run before the probe (and before a phone screenshot): make lazy images load, scroll through so
 * observers fire, wait for images and fonts, and reveal entrance animations immediately.
 */
export const PHONE_PREPARE_SCRIPT = `(async () => {
  for (const img of Array.from(document.images)) { img.loading = "eager"; img.decoding = "sync"; }
  document.documentElement.classList.remove("os-reveal-ready");
  const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
  for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 80; y += step, i++) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 25));
  }
  window.scrollTo(0, 0);
  const done = Promise.all(Array.from(document.images).map((img) => img.complete ? null :
    new Promise((r) => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); })));
  await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
})()`;
