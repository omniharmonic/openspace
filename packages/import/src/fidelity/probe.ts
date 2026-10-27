/**
 * The look probe: a script run in a real browser page (Playwright) that measures what a visitor
 * sees — fonts per role (headings, running text, labels), the computed type scale (sizes, line
 * height, tracking, case), the page rhythm (content width, section padding, gutter), button and
 * navigation styling, and, per section, its background, heading, text, column count, eyebrow and
 * accent rule, and image placement. The same probe reads the original site (to carry its look into
 * Site Styles) and both sides of a fidelity comparison, so they are measured identically.
 *
 * The script is a string (the import package has no DOM types); `parseProbe` checks its result.
 */

/** Computed text style of one element (sizes in px, tracking in em). */
export interface ProbeText {
  family: string;
  /** Every family in the stack (first = the one asked for). */
  stack?: string;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  case: "none" | "uppercase" | "lowercase" | "capitalize";
  weight: number;
  italic: boolean;
  color?: string;
  /** Set in small capitals (`font-variant: small-caps`). */
  smallCaps?: boolean;
}

/**
 * A font as drawn on the page, measured on a canvas at 100px with the element's own font stack
 * (so the face the visitor sees): x-height and cap height (em), the average lowercase advance
 * (em), and the weights the page uses.
 */
export interface FontMetrics {
  xHeight: number;
  capHeight: number;
  width: number;
  /** Lowercase glyphs as tall as capitals: a small-caps face. */
  smallCaps?: boolean;
  /** What the glyphs look like: feet on the "l" (serif), equal advances (monospace). */
  category?: "serif" | "sans-serif" | "monospace";
  weights: number[];
  italic?: boolean;
}

export interface ProbeSection {
  index: number;
  top: number;
  height: number;
  /** Background color (`#rrggbb`), the first opaque one up the tree. */
  background?: string;
  /** A photo behind the section. */
  backgroundImage?: boolean;
  heading?: ProbeText & { text: string; tag: string; left: number };
  eyebrow?: ProbeText & { text: string };
  /** A short accent rule sits with the eyebrow/heading. */
  rule?: boolean;
  body?: ProbeText;
  /** Most text items side by side. */
  columns: number;
  /** Italic lines (closing lines, pull quotes). */
  italicLines: number;
  /** The largest image: where it sits and how wide it is (share of the section). */
  image?: {
    side: "left" | "right" | "center";
    widthShare: number;
    top: number;
    /** Shown width ÷ height (the crop a visitor sees). */
    aspect?: number;
    /** Share of the viewport width. */
    viewShare?: number;
  };
  /** Running text color (`#rrggbb`). */
  textColor?: string;
  /** The fill of the section's first filled button (`#rrggbb`). */
  button?: string;
  /**
   * What the section is made of, where (a computer-width probe): its words, pictures, buttons and
   * links with their boxes and text styles — enough to recreate an unmappable section as a
   * custom component on theme tokens (never its CSS). Absent for sections with forms, video,
   * embeds or more than 30 parts.
   */
  blueprint?: BlueprintItem[];
  /** The section's box (page px), for inset panels. */
  left?: number;
  width?: number;
  /** The section's own box draws a shadow or border (a raised content card). */
  raised?: boolean;
  /** Width and left edge of its widest paragraph (the measure). */
  textWidth?: number;
  textLeft?: number;
  /** Distance from the section top to its first text (px). */
  padTop?: number;
  /** Where the section's own content (text, images, forms) starts and ends (page px). */
  contentTop?: number;
  contentBottom?: number;
  align?: "left" | "center";
  /** First words of the section, for matching. */
  text: string;
  /** More of its words (up to 20 000 characters), for matching parts of long sections. */
  words?: string;
}

export interface BlueprintItem {
  kind: "heading" | "text" | "image" | "button" | "link" | "rule" | "panel";
  /** Rules and panels: their fill. */
  color?: string;
  /** Panels: their border, and corner radius (px). */
  border?: { width: number; color?: string };
  radius?: number;
  /** Heading level (1–6). */
  level?: number;
  text?: string;
  href?: string;
  /** The picture's best address (`currentSrc`) and alt text. */
  src?: string;
  alt?: string;
  /** Page-pixel box. */
  box: { x: number; y: number; w: number; h: number };
  style?: ProbeText & { align?: string };
  /** A paragraph's words with their inline links (absolute href), bold and italics. */
  runs?: { t: string; href?: string; b?: 1; i?: 1 }[];
}

export interface LookProbe {
  url: string;
  viewport: number;
  title: string;
  presets: Partial<
    Record<
      | "display"
      | "h1"
      | "h2"
      | "h3"
      | "h4"
      | "lead"
      | "body"
      | "small"
      | "eyebrow"
      | "button"
      | "nav"
      | "wordmark",
      ProbeText
    >
  >;
  buttons?: {
    radius: number;
    background?: string;
    border: number;
    paddingX: number;
    /** Which element was measured (for a closer look). */
    text?: string;
    /** Measured outside the page's content (a search or cookie button in the chrome). */
    chrome?: boolean;
    element?: string;
  };
  eyebrowRule?: boolean;
  /** Content width (from the text's left edge, centred), that left edge, and section padding. */
  layout: { contentWidth?: number; left?: number; sectionPadding?: number };
  sections: ProbeSection[];
  /** Total page height (px). */
  height: number;
  /** Measured fonts by family (first family of each role's stack). */
  fonts?: Record<string, FontMetrics>;
  /** Font files and font stylesheets the page loaded (to tell licensed services apart). */
  fontRequests?: string[];
  /** The header logo's shown height (px). */
  logoHeight?: number;
  /** The footer's background color. */
  footerBackground?: string;
  /** How many groups of words sit side by side on the footer's first line, and their style. */
  footerColumns?: number;
  footerText?: ProbeText;
  /** The page's own background behind every section (`body`). */
  pageBackground?: string;
  /** A full-height column of identity and navigation beside the page (sidebar themes). */
  sidebar?: { side: "left" | "right"; width: number; background?: string };
}

/** In-page script (an expression evaluating to a Promise<LookProbe>). */
export const PROBE_SCRIPT = String.raw`(async () => {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  // Lazy content: scroll through once so observers fire, then back to the top.
  for (let y = 0, i = 0; y < doc.scrollHeight && i < 60; y += Math.max(400, innerHeight * 0.8), i++) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 25));
  }
  window.scrollTo(0, 0);
  if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
  const cs = (el) => getComputedStyle(el);
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height, right: r.right + scrollX, bottom: r.bottom + scrollY };
  };
  const visible = (el) => {
    const s = cs(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const toHex = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || "");
    if (!m) return undefined;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (p.length > 3 && p[3] < 0.5) return undefined;
    return "#" + p.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
  };
  const firstFamily = (f) => (f || "").split(",")[0].trim().replace(/^["']|["']$/g, "");
  const ownText = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const capsText = (el) => {
    const t = ownText(el);
    return t.length > 3 && /[A-Z].*[A-Z]/.test(t) && t === t.toUpperCase();
  };
  const textOf = (el) => {
    const s = cs(el);
    const size = parseFloat(s.fontSize) || 16;
    const lh = s.lineHeight === "normal" ? 1.2 : parseFloat(s.lineHeight) / size;
    const ls = s.letterSpacing === "normal" ? 0 : parseFloat(s.letterSpacing) / size;
    return {
      family: firstFamily(s.fontFamily),
      stack: s.fontFamily,
      size: Math.round(size * 10) / 10,
      lineHeight: Math.round(lh * 100) / 100,
      letterSpacing: Math.round(ls * 1000) / 1000,
      // Text typed in capitals reads as uppercase too.
      case: ["uppercase", "lowercase", "capitalize"].includes(s.textTransform) ? s.textTransform : capsText(el) ? "uppercase" : "none",
      weight: Number(s.fontWeight) || 400,
      italic: s.fontStyle === "italic" || s.fontStyle.startsWith("oblique"),
      color: toHex(s.color),
      ...(/small-caps/.test(s.fontVariantCaps || s.fontVariant || "") ? { smallCaps: true } : {}),
    };
  };
  const bgOf = (el) => {
    for (let e = el; e && e !== doc; e = e.parentElement) {
      const c = toHex(cs(e).backgroundColor);
      if (c) return c;
    }
    return toHex(cs(document.body).backgroundColor) || toHex(cs(doc).backgroundColor) || "#ffffff";
  };
  const isUpperish = (t, el) => t.case === "uppercase" || (ownText(el).length > 2 && ownText(el) === ownText(el).toUpperCase() && /[A-Z]/.test(ownText(el)));

  // --- sections -------------------------------------------------------------------------------
  const chrome = (el) => !!(el.closest("header") && !el.closest("header").closest("article, main, section, .os-section")) || !!el.closest("[role=banner], nav, .os-header, .os-announcement, .os-menu, dialog, aside, [role=complementary], #sidebar, #secondary, .widget-area, .os-popup, [id*=cookie], [class*=cookie]");
  let sections = [...document.querySelectorAll(".os-section")].filter((e) => visible(e) && !e.closest(".os-footer") && !e.parentElement.closest(".os-section"));
  if (!sections.length) {
    const tops = [...document.querySelectorAll("section")].filter((e) => visible(e) && !chrome(e) && !e.parentElement.closest("section") && e.getBoundingClientRect().width >= vw * 0.85 && e.getBoundingClientRect().height >= 60);
    if (tops.length >= 2) sections = tops;
  }
  if (!sections.length) {
    // Visual bands, from the body down: a wrapper with one big child is looked through; children
    // stacked one above the other are separate bands; children side by side or layered (a
    // banner's photo and words) make one band; many short children are one article.
    const kidsOf = (el, min = 40) => [...el.children].filter((e) => visible(e) && !chrome(e) && !e.matches("footer, [role=contentinfo], .os-footer, #footer, #preFooter, .pre-footer") && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK)$/.test(e.tagName) && e.getBoundingClientRect().height >= min);
    const empty = (e) => !ownText(e) && !e.querySelector("img, picture, svg, video, iframe, input, canvas") && !/^(IMG|PICTURE|SVG|VIDEO|IFRAME|CANVAS)$/.test(e.tagName);
    const bands = (el, depth) => {
      const kids = kidsOf(el);
      if (!kids.length || depth > 14) return [el];
      const er = el.getBoundingClientRect();
      if (kids.length === 1) {
        const kr = kids[0].getBoundingClientRect();
        return kr.height >= er.height * 0.5 || depth < 3 ? bands(kids[0], depth + 1) : [el];
      }
      const rs = kids.map((k) => k.getBoundingClientRect()).sort((a, b) => a.top - b.top);
      const stacked = rs.every((r, i) => i === 0 || r.top >= rs[i - 1].bottom - 12);
      if (!stacked) {
        // One dominant child among small ones (a page wrapper with a skip link): look through it.
        const big = kids.filter((k) => k.getBoundingClientRect().height >= er.height * 0.6);
        if (big.length === 1 && depth < 6) return bands(big[0], depth + 1);
        // The page's own content beside a sidebar: look into the part holding <main>.
        const mainKid = kids.find((k) => k.matches("main, [role=main], #main, #content, .site-content") || k.querySelector("main, [role=main], #main"));
        return mainKid && depth < 10 ? bands(mainKid, depth + 1) : [el];
      }
      const hs = rs.map((r) => r.height).sort((a, b) => a - b);
      // A row of columns (an image beside words) is a band of its own, even inside an article.
      // (Looking through single-child wrappers: an image card's figure inside its block.)
      const isRow = (k) => {
        let box = k;
        for (let n = 0; n < 6; n++) {
          const ks = kidsOf(box).filter((e) => !empty(e));
          if (ks.length === 1) {
            box = ks[0];
            continue;
          }
          const rs = ks.map((e) => e.getBoundingClientRect());
          return rs.some((a, i) => rs.some((b, j) => j > i && Math.abs(a.left - b.left) > 40 && a.top < b.bottom - 12 && b.top < a.bottom - 12));
        }
        return false;
      };
      if (kids.length > 3 && hs[Math.floor(hs.length / 2)] < 220 && depth > 2 && !kids.some(isRow)) return [el];
      // Runs of short blocks between rows stay together (one band of words).
      const out = [];
      let run = [];
      const flush = () => {
        if (run.length === 1) out.push(run[0]);
        else if (run.length) out.push(run);
        run = [];
      };
      for (const k of kidsOf(el, 8)) {
        if (empty(k)) continue;
        if (isRow(k) || k.getBoundingClientRect().height >= 220) {
          // A short run just above (a page title, a section heading) belongs to what follows.
          const runH = run.reduce((n, e) => n + e.getBoundingClientRect().height, 0);
          if (run.length && runH < 160) {
            out.push([...run, k]);
            run = [];
            continue;
          }
          flush();
          out.push(...(isRow(k) ? [k] : bands(k, depth + 1)));
        } else run.push(k);
      }
      flush();
      return out;
    };
    // A run of blocks measured as one section.
    const group = (els) => ({
      els,
      getBoundingClientRect() {
        const rs = els.map((e) => e.getBoundingClientRect());
        const left = Math.min(...rs.map((r) => r.left));
        const top = Math.min(...rs.map((r) => r.top));
        const right = Math.max(...rs.map((r) => r.right));
        const bottom = Math.max(...rs.map((r) => r.bottom));
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      },
      querySelectorAll(sel) {
        if (/:scope/.test(sel)) return [...els, ...els.flatMap((e) => [...e.children])];
        return els.flatMap((e) => [...(e.matches(sel) ? [e] : []), ...e.querySelectorAll(sel)]);
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      get innerText() {
        return els.map((e) => e.innerText || e.textContent || "").join(" ");
      },
      get textContent() {
        return els.map((e) => e.textContent || "").join(" ");
      },
      get parentElement() {
        return els[0].parentElement;
      },
      closest(sel) {
        return els[0].closest(sel);
      },
      contains(x) {
        return els.some((e) => e.contains(x));
      },
    });
    sections = bands(document.body, 0)
      .filter((e) => e !== document.body)
      .map((e) => (Array.isArray(e) ? group(e) : e))
      .filter((e) => e.getBoundingClientRect().height >= 60);
  }
  // The footer region (with Squarespace 7.0's pre-footer, which an import moves into the footer)
  // is chrome on both sides.
  const FOOTERISH = "footer, .os-footer, [role=contentinfo], #footer-sections, #preFooter, .pre-footer";
  sections = sections.filter((e) => !e.closest(FOOTERISH));
  const headSel = "h1, h2, h3, h4, .os-heading__text";
  const textSel = "p, li, blockquote, h3, h4, dd, figcaption";
  const all = [];
  const out = sections.slice(0, 40).map((sec, index) => {
    const r = rect(sec);
    const bgEl = [...(sec.els ? [] : [sec]), ...sec.querySelectorAll(":scope > *, :scope > * > *")].find((e) => {
      const s = cs(e);
      const er = e.getBoundingClientRect();
      return s.backgroundImage && s.backgroundImage !== "none" && !/gradient/.test(s.backgroundImage) && er.width >= r.width * 0.8 && er.height >= r.height * 0.6;
    });
    const coverImg = [...sec.querySelectorAll("img, video")].find((e) => {
      const er = e.getBoundingClientRect();
      return visible(e) && er.width >= r.width * 0.9 && er.height >= r.height * 0.7;
    });
    const res = { index, top: Math.round(r.top), height: Math.round(r.height), left: Math.round(r.left), width: Math.round(r.width), background: bgOf(sec.els ? sec.els[0] : sec), columns: 1, italicLines: 0, text: ownText(sec).slice(0, 120), words: ownText(sec).slice(0, 20000) };
    // A raised panel: the section's own box draws a shadow or a border (a theme's content card).
    // (Its own box, or a panel around it narrower than the page: an article card around a band.)
    for (let e = sec.els ? sec.els[0] : sec, k = 0; e && e !== document.body && k < 5; e = e.parentElement, k++) {
      const st = cs(e);
      const er = e.getBoundingClientRect();
      if (k > 0 && er.width >= vw * 0.95) break;
      if ((st.boxShadow && st.boxShadow !== "none") || (k === 0 && !sec.els && parseFloat(st.borderTopWidth) >= 1)) { res.raised = true; break; }
    }
    if (bgEl || coverImg) res.backgroundImage = true;
    const h = [...sec.querySelectorAll(headSel)].find((e) => visible(e) && ownText(e).length > 1);
    if (h) {
      res.heading = { ...textOf(h), text: ownText(h).slice(0, 100), tag: h.tagName.toLowerCase(), left: Math.round(rect(h).left) };
      // The eyebrow: a short, small, tracked or capitalised line just above the heading.
      const hr = rect(h);
      const cands = [...sec.querySelectorAll("p, span, div, small, h5, h6, .os-heading__eyebrow")].filter((e) => {
        if (!visible(e) || e.contains(h) || h.contains(e)) return false;
        const t = ownText(e);
        if (!t || t.length > 60 || e.children.length > 2) return false;
        const er = rect(e);
        return er.bottom <= hr.top + 4 && hr.top - er.bottom < 140;
      });
      const eb = cands.reverse().find((e) => {
        const t = textOf(e);
        return t.size < Math.min(17, res.heading.size * 0.6) && (isUpperish(t, e) || t.letterSpacing >= 0.05);
      });
      if (eb) {
        res.eyebrow = { ...textOf(eb), text: ownText(eb).slice(0, 60) };
        const er = rect(eb);
        // An accent rule: a short thin box (or the eyebrow's ::after/::before) between them.
        const pseudo = ["::after", "::before"].some((p) => {
          const s = getComputedStyle(eb, p);
          const hgt = parseFloat(s.height);
          return s.content !== "none" && s.display !== "none" && hgt > 0 && hgt <= 4 && parseFloat(s.width) <= 160;
        });
        const box = [...sec.querySelectorAll("*")].some((e) => {
          const b = e.getBoundingClientRect();
          if (b.height < 1 || b.width < 1 || cs(e).display === "none" || cs(e).visibility === "hidden") return false;
          const top = b.top + scrollY;
          return b.height <= 4 && b.width >= 16 && b.width <= 160 && top >= er.top - 2 && top <= hr.top + 2 && (toHex(cs(e).backgroundColor) || parseFloat(cs(e).borderTopWidth) > 0 || e.tagName === "HR");
        });
        res.rule = pseudo || box;
      }
      res.align = cs(h).textAlign === "center" ? "center" : "left";
      res.padTop = Math.round(Math.min(hr.top, eb ? rect(eb).top : hr.top) - r.top);
    }
    // The section's first filled button: its fill.
    const btnEl = [...sec.querySelectorAll("a, button, input[type=submit]")].find((e) => visible(e) && !e.closest("nav, header") && ownText(e).length > 1 && ownText(e).length <= 40 && toHex(cs(e).backgroundColor) && parseFloat(cs(e).paddingLeft) >= 8);
    if (btnEl) res.button = toHex(cs(btnEl).backgroundColor);
    // Running text: the most-used style among paragraphs.
    const paras = [...sec.querySelectorAll(textSel)].filter((e) => visible(e) && ownText(e).length >= 30 && !e.querySelector("p, li"));
    const tally = new Map();
    for (const p of paras) {
      const t = textOf(p);
      // Italic: the line itself, or (nearly) all of its words in <em>/<i>.
      const em = [...p.querySelectorAll("em, i")].reduce((n, e) => n + ownText(e).length, 0);
      if (t.italic || em >= ownText(p).length * 0.8) res.italicLines++;
      all.push({ el: p, t });
      const k = t.family + "|" + t.size;
      tally.set(k, (tally.get(k) || { t, n: 0 }));
      tally.get(k).n += ownText(p).length;
    }
    const best = [...tally.values()].sort((a, b) => b.n - a.n)[0];
    if (best) {
      res.body = best.t;
      if (best.t.color) res.textColor = best.t.color;
    }
    // How wide the running text is set (the measure), and where it starts.
    const measures = paras.map((p) => rect(p)).filter((x) => x.width > 120);
    if (measures.length) {
      res.textWidth = Math.round(Math.max(...measures.map((x) => x.width)));
      res.textLeft = Math.round(Math.min(...measures.map((x) => x.left)));
    }
    // Columns: text items whose vertical spans overlap, at distinct left edges.
    const items = [...sec.querySelectorAll(textSel + ", h2, img")].filter((e) => visible(e) && (e.tagName === "IMG" ? e.getBoundingClientRect().width > 60 : ownText(e).length >= 12)).map(rect);
    for (const a of items) {
      const mid = a.top + Math.min(a.height, 40) / 2;
      const lefts = [];
      for (const b of items) if (b.top <= mid && b.bottom >= mid && !lefts.some((l) => Math.abs(l - b.left) < 40)) lefts.push(b.left);
      res.columns = Math.max(res.columns, Math.min(6, lefts.length));
    }
    // The section's parts and where they sit (to recreate it as a component when needed).
    if (!sec.querySelector("form, input, textarea, select, iframe, video, canvas, embed, object")) {
      const parts = [];
      const inPart = (e) => parts.some((p) => p.el.contains(e));
      // Inline links and emphasis inside a paragraph (kept as rich text when it's recreated).
      const runsOf = (el) => {
        const out = [];
        const walk = (n, m) => {
          for (const c of n.childNodes) {
            if (c.nodeType === 3) { const t = (c.textContent || "").replace(/\s+/g, " "); if (t) out.push({ t, ...m }); }
            else if (c.nodeType === 1 && cs(c).display !== "none") {
              const mm = { ...m };
              if (c.tagName === "A" && c.getAttribute("href")) mm.href = c.href;
              if (/^(STRONG|B)$/.test(c.tagName)) mm.b = 1;
              if (/^(EM|I)$/.test(c.tagName)) mm.i = 1;
              if (c.tagName === "BR") out.push({ t: "\n" }); else walk(c, mm);
            }
          }
        };
        walk(el, {});
        return out.length <= 80 && out.some((r) => r.href || r.b || r.i) ? out : undefined;
      };
      const btnLike = (e) => { const st = cs(e); return (toHex(st.backgroundColor) || parseFloat(st.borderTopWidth) >= 1) && parseFloat(st.paddingLeft) >= 8; };
      const els = [...sec.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, blockquote, img, a, button")].filter((e) => visible(e));
      for (const e of els) {
        if (inPart(e) || parts.length > 30) continue;
        const t = ownText(e);
        const box = rect(e);
        const at = { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) };
        if (e.tagName === "IMG") {
          if (box.width < 40 || box.height < 30 || e === coverImg) continue;
          parts.push({ el: e, item: { kind: "image", src: e.currentSrc || e.src, alt: (e.alt || "").slice(0, 300), box: at } });
        } else if (/^H[1-6]$/.test(e.tagName)) {
          if (!t) continue;
          parts.push({ el: e, item: { kind: "heading", level: Number(e.tagName[1]), text: t.slice(0, 300), box: at, style: { ...textOf(e), align: cs(e).textAlign } } });
        } else if (e.tagName === "A" || e.tagName === "BUTTON") {
          if (!t || t.length > 60 || e.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote")) continue;
          parts.push({ el: e, item: { kind: btnLike(e) ? "button" : "link", text: t, href: e.getAttribute("href") || "", box: at, style: { ...textOf(e), align: cs(e).textAlign } } });
        } else {
          if (!t || e.querySelector("p, li, h1, h2, h3, h4, h5, h6, img")) continue;
          const runs = runsOf(e);
          parts.push({ el: e, item: { kind: "text", text: t.slice(0, 1500), box: at, style: { ...textOf(e), align: cs(e).textAlign }, ...(runs ? { runs } : {}) } });
        }
      }
      // Accent rules (thin bars, <hr>) and panels (boxes with their own fill or border) behind
      // the words: recreated on theme colors.
      const secBg = res.background;
      let decor = 0;
      for (const e of sec.querySelectorAll("hr, div, span, section, article, aside, figure, li")) {
        if (decor >= 6 || !visible(e) || parts.some((p) => p.el === e)) continue;
        const b = rect(e);
        const st = cs(e);
        const fill = toHex(st.backgroundColor);
        const bw = parseFloat(st.borderTopWidth) || 0;
        const line = e.tagName === "HR" || (b.height <= 4 && b.width >= 16 && (fill || bw >= 1));
        if (line) {
          parts.push({ el: e, item: { kind: "rule", box: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.max(1, Math.round(e.tagName === "HR" ? bw || 1 : b.height)) }, color: fill || toHex(st.borderTopColor) } });
          decor++;
          continue;
        }
        const own = fill && fill !== secBg;
        const framed = bw >= 1 && st.borderTopStyle !== "none" && parseFloat(st.borderLeftWidth) >= 1;
        if ((own || framed) && b.width >= 120 && b.height >= 60 && b.width < r.width * 0.95 && !e.querySelector("img, video, iframe") && ownText(e)) {
          parts.push({ el: e, item: { kind: "panel", box: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }, ...(own ? { color: fill } : {}), ...(framed ? { border: { width: Math.round(bw), color: toHex(st.borderTopColor) } } : {}), radius: parseFloat(st.borderTopLeftRadius) || 0 } });
          decor++;
        }
      }
      if (parts.length && parts.length <= 36) res.blueprint = parts.map((p) => p.item);
    }
    // Where the section's own content starts and ends (for the spacing between sections).
    const content = [...sec.querySelectorAll(textSel + ", h1, h2, img, picture, video, iframe, form, button, a")].filter((e) => visible(e) && (/^(IMG|PICTURE|VIDEO|IFRAME|FORM)$/.test(e.tagName) || ownText(e).length > 1)).map(rect);
    if (content.length) {
      res.contentTop = Math.round(Math.min(...content.map((c) => c.top)));
      res.contentBottom = Math.round(Math.max(...content.map((c) => c.bottom)));
    }
    // The largest image (not the background).
    const imgs = [...sec.querySelectorAll("img, picture, svg, video")].filter((e) => visible(e) && e !== coverImg).map((e) => ({ e, r: rect(e) })).filter((x) => x.r.width * x.r.height > r.width * r.height * 0.04);
    imgs.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    if (imgs[0]) {
      const ir = imgs[0].r;
      const cx = (ir.left + ir.width / 2) / vw;
      res.image = { side: cx < 0.42 ? "left" : cx > 0.58 ? "right" : "center", widthShare: Math.round((ir.width / Math.max(1, r.width)) * 100) / 100, top: Math.round(ir.top - r.top), aspect: Math.round((ir.width / Math.max(1, ir.height)) * 100) / 100, viewShare: Math.round((ir.width / vw) * 100) / 100 };
    }
    return res;
  });

  // --- presets --------------------------------------------------------------------------------
  const median = (list) => {
    if (!list.length) return undefined;
    const s = [...list].sort((a, b) => a.size - b.size);
    return s[Math.floor(s.length / 2)];
  };
  const inMain = (el) => !chrome(el) && !el.closest("footer, .os-footer");
  const styleOfAll = (sel) => [...document.querySelectorAll(sel)].filter((e) => visible(e) && inMain(e) && ownText(e).length > 1).map(textOf);
  const presets = {};
  const h1s = styleOfAll("h1");
  if (h1s.length) presets.h1 = h1s.sort((a, b) => b.size - a.size)[0];
  const h2 = median(styleOfAll("h2"));
  if (h2) presets.h2 = h2;
  const h3 = median(styleOfAll("h3"));
  if (h3) presets.h3 = h3;
  // A display line: the page's largest short text, well above its headings (a banner's title
  // set in a paragraph). Read when importing; the comparison doesn't check it.
  {
    const ref = Math.max(presets.h1 ? presets.h1.size : 0, presets.h2 ? presets.h2.size : 0, 16);
    let best;
    for (const e of document.querySelectorAll("p, strong, b, span, h1, h2, h3, div")) {
      if (!visible(e) || !inMain(e)) continue;
      const t = ownText(e);
      if (t.length < 3 || t.length > 60 || [...e.children].some((k) => ownText(k) === t && k.tagName !== "BR" && !/^(STRONG|B|EM|I|SPAN)$/.test(k.tagName))) continue;
      const st = textOf(e);
      if (st.size >= ref * 1.3 && (!best || st.size > best.size)) best = st;
    }
    if (best) presets.display = best;
  }
  const tally = new Map();
  for (const { el, t } of all) {
    const k = t.family + "|" + t.size;
    if (!tally.has(k)) tally.set(k, { t, n: 0 });
    tally.get(k).n += ownText(el).length;
  }
  const body = [...tally.values()].sort((a, b) => b.n - a.n)[0];
  if (body) presets.body = body.t;
  if (body) {
    const leads = all.filter(({ t }) => t.size >= body.t.size * 1.18 && (!presets.h3 || t.size < presets.h3.size * 1.4)).map(({ t }) => t);
    const lead = median(leads);
    if (lead) presets.lead = lead;
    const smalls = all.filter(({ t }) => t.size <= body.t.size * 0.9 && t.size >= 11).map(({ t }) => t);
    const small = median(smalls);
    if (small) presets.small = small;
  }
  const eyebrows = out.filter((s) => s.eyebrow).map((s) => s.eyebrow);
  const eb = median(eyebrows);
  if (eb) presets.eyebrow = eb;
  const header = document.querySelector(".os-header, header, [role=banner]") || document.querySelector("nav");
  if (header) {
    // The menu's links: the header's <nav>, else the page's main navigation, else the header.
    const navEl = header.querySelector("nav") || [...document.querySelectorAll("nav, [role=navigation]")].find((n) => visible(n) && !n.closest("footer") && n.querySelectorAll("a").length >= 2);
    // A link to the home page is the site's name, not a menu entry.
    const homeLink = (a) => { try { const u = new URL(a.href, location.href); return u.origin === location.origin && !u.hash && /^\/?(?:index\.html)?$/.test(u.pathname); } catch (e) { return false; } };
    const linkOk = (a) => visible(a) && ownText(a).length > 1 && ownText(a).length < 30 && toHex(cs(a).backgroundColor) === undefined && !a.matches(".os-header__brand, .os-button, [rel=home]") && !a.closest(".os-header__brand, [class*=site-title], [class*=brand]") && !homeLink(a);
    let links = navEl ? [...navEl.querySelectorAll("a")].filter(linkOk) : [];
    if (!links.length) links = [...header.querySelectorAll("a")].filter(linkOk);
    const mid = links[Math.floor(links.length / 2)];
    if (mid) presets.nav = textOf(mid);
    // The site title set as text (a wordmark), not a logo image.
    // The innermost element holding the title text (an OpenSpace title span, not its link).
    const brandOk = (e) => visible(e) && ownText(e).length > 1 && ownText(e).length <= 40 && !e.querySelector("img, svg");
    const brand = [...header.querySelectorAll(".os-header__title")].find(brandOk) || [...header.querySelectorAll("[class*=wordmark], [class*=logo], [class*=brand], [class*=site-title], a[href='/'], a[href='./'], a[rel=home]")].filter(brandOk).find((e, _, list) => !list.some((o) => o !== e && e.contains(o)));
    if (brand) presets.wordmark = textOf(brand);
  }
  const isButton = (e) => {
    const s = cs(e);
    const t = ownText(e);
    const r = e.getBoundingClientRect();
    if (r.top + scrollY < 0 || r.left + scrollX < 0 || r.right > vw + 2 || /skip/i.test(String(e.className)) || s.position === "absolute" && /^#/.test(e.getAttribute("href") || "x") && r.top + scrollY < 5) return false;
    return visible(e) && t.length > 1 && t.length <= 40 && (toHex(s.backgroundColor) || parseFloat(s.borderTopWidth) >= 1) && parseFloat(s.paddingLeft) >= 8;
  };
  // A call-to-action button in the page body (forms' submit buttons count; toggles don't).
  const btnCands = [...document.querySelectorAll("a, button, input[type=submit]")].filter((e) => !e.matches("summary *, [aria-expanded], [aria-controls], .os-header__toggle, .os-menu__close") && isButton(e));
  const btn = btnCands.find(inMain) || btnCands[0];
  let buttons;
  if (btn) {
    presets.button = textOf(btn);
    const s = cs(btn);
    buttons = { radius: parseFloat(s.borderTopLeftRadius) || 0, background: toHex(s.backgroundColor), border: parseFloat(s.borderTopWidth) || 0, paddingX: parseFloat(s.paddingLeft) || 0, text: ownText(btn).slice(0, 40), element: btn.tagName.toLowerCase() + (btn.className && typeof btn.className === "string" ? "." + btn.className.trim().split(/\s+/).slice(0, 2).join(".") : ""), ...(inMain(btn) ? {} : { chrome: true }) };
  }

  // --- layout ---------------------------------------------------------------------------------
  const lefts = out.filter((s) => s.heading && s.align !== "center").map((s) => s.heading.left).filter((l) => l > 0 && l < vw / 2);
  lefts.sort((a, b) => a - b);
  const left = lefts.length ? lefts[Math.floor(lefts.length / 2)] : undefined;
  // Section spacing: the gap between one section's content and the next one's, halved (the
  // padding each side contributes) — measured the same way whether the sections have their own
  // padding (OpenSpace) or sit in a flow with gaps between them.
  const gaps = [];
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i];
    if (a.contentBottom === undefined || b.contentTop === undefined) continue;
    const g = b.contentTop - a.contentBottom;
    if (g > 0 && g < 800) gaps.push(g / 2);
  }
  const pads = (gaps.length ? gaps : out.map((s) => s.padTop)).filter((p) => p !== undefined && p > 0 && p < 400).sort((a, b) => a - b);
  const layout = {};
  if (left !== undefined) {
    layout.contentWidth = Math.round(vw - 2 * left);
    layout.left = Math.round(left);
  }
  if (pads.length) layout.sectionPadding = pads[Math.floor(pads.length / 2)];
  // --- fonts as drawn ---------------------------------------------------------------------------
  const fonts = {};
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const used = new Map();
    for (const t of [presets.h1, presets.h2, presets.h3, presets.body, presets.lead, presets.eyebrow, presets.button, presets.nav, presets.wordmark, ...all.map((a) => a.t)]) {
      if (!t || !t.family) continue;
      const u = used.get(t.family) || { stack: t.stack || t.family, weights: new Set(), italic: false };
      u.weights.add(Math.round(t.weight / 100) * 100);
      if (t.italic) u.italic = true;
      used.set(t.family, u);
    }
    for (const [family, u] of [...used].slice(0, 6)) {
      // Measured at the regular weight, like the open families it's matched against.
      ctx.font = "400 100px " + u.stack;
      const m = (s) => ctx.measureText(s);
      const xh = m("x").actualBoundingBoxAscent / 100;
      const ch = m("H").actualBoundingBoxAscent / 100;
      const width = m("abcdefghijklmnopqrstuvwxyz").width / 2600;
      if (!(xh > 0 && ch > 0)) continue;
      const l = m("l");
      const stem = ((l.actualBoundingBoxLeft || 0) + (l.actualBoundingBoxRight || 0)) / 100;
      const mono = Math.abs(m("i").width - m("m").width) < 1;
      const category = mono ? "monospace" : stem > 0.17 ? "serif" : "sans-serif";
      fonts[family] = { category, xHeight: Math.round(xh * 1000) / 1000, capHeight: Math.round(ch * 1000) / 1000, width: Math.round(width * 1000) / 1000, weights: [...u.weights].sort((a, b) => a - b), ...((m("gpqy").actualBoundingBoxDescent / 100 < 0.04 && xh / ch > 0.6) || (xh / ch > 0.78 && width > 0.58) ? { smallCaps: true } : {}), ...(u.italic ? { italic: true } : {}) };
    }
  } catch (e) {}
  // A sidebar: a full-height column at the page's edge holding the navigation, the page beside it.
  let sidebar;
  if (vw >= 1000) {
    const cands = [...document.querySelectorAll("body *")].filter((e) => {
      if (!visible(e) || e.closest("footer")) return false;
      const r = e.getBoundingClientRect();
      const edge = r.left <= vw * 0.03 ? "left" : r.right >= vw * 0.97 ? "right" : undefined;
      return edge && r.width >= vw * 0.12 && r.width <= vw * 0.36 && r.height >= innerHeight * 0.7 && e.querySelectorAll("a").length >= 3 && e.querySelector("nav, ul, [class*=menu]");
    });
    const el = cands.find((e) => !cands.some((o) => o !== e && o.contains(e)));
    if (el) {
      const r = el.getBoundingClientRect();
      const side = r.left <= vw * 0.03 ? "left" : "right";
      // The page's words sit beside it, not under it.
      const words = [...document.querySelectorAll("main p, article p, #content p, .content p, p")].filter((p) => visible(p) && !el.contains(p) && !chrome(p) && cs(p).position !== "fixed" && !p.closest("[style*=fixed]") && ownText(p).length > 40).slice(0, 8);
      const beside = words.length && words.every((p) => { const pr = p.getBoundingClientRect(); return side === "left" ? pr.left >= r.right - 4 : pr.right <= r.left + 4; });
      // Its color: its own, else a full-height band the page paints behind it (body::before).
      let background = toHex(cs(el).backgroundColor);
      if (!background)
        for (const host of [document.body, doc])
          for (const pseudo of ["::before", "::after"]) {
            const ps = getComputedStyle(host, pseudo);
            const w = parseFloat(ps.width);
            if (!background && ps.content !== "none" && toHex(ps.backgroundColor) && w > 0 && Math.abs(w - r.right) < vw * 0.08) background = toHex(ps.backgroundColor);
          }
      if (beside) sidebar = { side, width: Math.round(r.width), background: background || bgOf(el) };
    }
  }
  const fontRequests = [...new Set(performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)|typekit|fonts\.(?:googleapis|gstatic|net|com)|typography\.com|myfonts|webtype|typenetwork|fontdeck|edgefonts|\/fonts?\//i.test(n)))].slice(0, 40);
  return {
    url: location.href,
    viewport: vw,
    title: document.title,
    presets,
    ...(buttons ? { buttons } : {}),
    ...(eyebrows.length ? { eyebrowRule: out.filter((s) => s.rule).length >= Math.max(1, eyebrows.length / 2) } : {}),
    layout,
    sections: out,
    height: doc.scrollHeight,
    fonts,
    fontRequests,
    pageBackground: toHex(cs(document.body).backgroundColor) || toHex(cs(doc).backgroundColor) || "#ffffff",
    ...(() => {
      // The header's logo picture (its shown height) and the footer's own color.
      const out = {};
      const head = document.querySelector(".os-header, header, [role=banner], #header");
      const logo = head && [...head.querySelectorAll("img, svg")].find((e) => visible(e) && e.getBoundingClientRect().height >= 16 && e.getBoundingClientRect().width >= 24);
      if (logo) out.logoHeight = Math.round(logo.getBoundingClientRect().height);
      const foot = [...document.querySelectorAll(".os-footer, footer, [role=contentinfo], #footer")].filter(visible).pop();
      if (foot) {
        const c = toHex(cs(foot).backgroundColor) || [...foot.querySelectorAll("*")].map((e) => toHex(cs(e).backgroundColor)).find(Boolean);
        if (c) out.footerBackground = c;
        // Its first line of words: how many groups sit side by side, and their style.
        const leaves = [...foot.querySelectorAll("p, li, a, span, small, div, h2, h3, h4")].filter((e) => visible(e) && ownText(e) && ![...e.children].some((k) => ownText(k) && /^(P|DIV|UL|LI|H2|H3|H4)$/.test(k.tagName)));
        const lines = leaves.map((e) => ({ e, r: rect(e) }));
        if (lines.length) {
          const top = Math.min(...lines.map((l) => l.r.top));
          const row = lines.filter((l) => l.r.top <= top + 24);
          const groups = [];
          for (const l of row.sort((a, b) => a.r.left - b.r.left)) {
            const g = groups[groups.length - 1];
            if (g && l.r.left - g.right < 48) g.right = Math.max(g.right, l.r.right);
            else groups.push({ left: l.r.left, right: l.r.right });
          }
          out.footerColumns = groups.length;
          out.footerText = textOf(row[0].e);
        }
      }
      return out;
    })(),
    ...(sidebar ? { sidebar } : {}),
  };
})()`;

/** A probe result from the browser, checked loosely (it crossed a process boundary). */
export function parseProbe(raw: unknown): LookProbe | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Partial<LookProbe>;
  if (typeof p.viewport !== "number" || !Array.isArray(p.sections) || typeof p.presets !== "object")
    return undefined;
  return { layout: {}, height: 0, url: "", title: "", ...p } as LookProbe;
}
