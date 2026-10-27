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
  image?: { side: "left" | "right" | "center"; widthShare: number; top: number };
  /** Distance from the section top to its first text (px). */
  padTop?: number;
  align?: "left" | "center";
  /** First words of the section, for matching. */
  text: string;
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
    element?: string;
  };
  eyebrowRule?: boolean;
  /** Content width (from the text's left edge, centred), that left edge, and section padding. */
  layout: { contentWidth?: number; left?: number; sectionPadding?: number };
  sections: ProbeSection[];
  /** Total page height (px). */
  height: number;
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
  const chrome = (el) => !!el.closest("header, [role=banner], nav, .os-header, .os-announcement, .os-menu, dialog");
  let sections = [...document.querySelectorAll(".os-section")].filter((e) => visible(e) && !e.closest(".os-footer") && !e.parentElement.closest(".os-section"));
  if (!sections.length) {
    const tops = [...document.querySelectorAll("section")].filter((e) => visible(e) && !chrome(e) && !e.parentElement.closest("section") && e.getBoundingClientRect().width >= vw * 0.85 && e.getBoundingClientRect().height >= 60);
    if (tops.length >= 2) sections = tops;
  }
  if (!sections.length) {
    // Descend from <main> (or body) while one child holds most of the page.
    let box = document.querySelector("main") || document.body;
    for (let i = 0; i < 8; i++) {
      const kids = [...box.children].filter((e) => visible(e) && !chrome(e) && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(e.tagName));
      const big = kids.filter((e) => e.getBoundingClientRect().height >= 60);
      if (big.length === 1 && big[0].getBoundingClientRect().height > box.getBoundingClientRect().height * 0.6) box = big[0];
      else { sections = big; break; }
    }
  }
  sections = sections.filter((e) => !e.closest("footer, .os-footer, [role=contentinfo], #footer-sections"));
  const headSel = "h1, h2, h3, h4, .os-heading__text";
  const textSel = "p, li, blockquote, h3, h4, dd, figcaption";
  const all = [];
  const out = sections.slice(0, 40).map((sec, index) => {
    const r = rect(sec);
    const bgEl = [sec, ...sec.querySelectorAll(":scope > *, :scope > * > *")].find((e) => {
      const s = cs(e);
      const er = e.getBoundingClientRect();
      return s.backgroundImage && s.backgroundImage !== "none" && !/gradient/.test(s.backgroundImage) && er.width >= r.width * 0.8 && er.height >= r.height * 0.6;
    });
    const coverImg = [...sec.querySelectorAll("img, video")].find((e) => {
      const er = e.getBoundingClientRect();
      return visible(e) && er.width >= r.width * 0.9 && er.height >= r.height * 0.7;
    });
    const res = { index, top: Math.round(r.top), height: Math.round(r.height), background: bgOf(sec), columns: 1, italicLines: 0, text: ownText(sec).slice(0, 120) };
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
    if (best) res.body = best.t;
    // Columns: text items whose vertical spans overlap, at distinct left edges.
    const items = [...sec.querySelectorAll(textSel + ", h2, img")].filter((e) => visible(e) && (e.tagName === "IMG" ? e.getBoundingClientRect().width > 60 : ownText(e).length >= 12)).map(rect);
    for (const a of items) {
      const mid = a.top + Math.min(a.height, 40) / 2;
      const lefts = [];
      for (const b of items) if (b.top <= mid && b.bottom >= mid && !lefts.some((l) => Math.abs(l - b.left) < 40)) lefts.push(b.left);
      res.columns = Math.max(res.columns, Math.min(6, lefts.length));
    }
    // The largest image (not the background).
    const imgs = [...sec.querySelectorAll("img, picture, svg, video")].filter((e) => visible(e) && e !== coverImg).map((e) => ({ e, r: rect(e) })).filter((x) => x.r.width * x.r.height > r.width * r.height * 0.04);
    imgs.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    if (imgs[0]) {
      const ir = imgs[0].r;
      const cx = (ir.left + ir.width / 2) / vw;
      res.image = { side: cx < 0.42 ? "left" : cx > 0.58 ? "right" : "center", widthShare: Math.round((ir.width / Math.max(1, r.width)) * 100) / 100, top: Math.round(ir.top - r.top) };
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
    const links = [...header.querySelectorAll("nav a, a")].filter((a) => visible(a) && ownText(a).length > 1 && ownText(a).length < 30 && toHex(cs(a).backgroundColor) === undefined && !a.matches(".os-header__brand, .os-button"));
    const mid = links[Math.floor(links.length / 2)];
    if (mid) presets.nav = textOf(mid);
    // The site title set as text (a wordmark), not a logo image.
    const brand = [...header.querySelectorAll(".os-header__title, [class*=wordmark], [class*=logo], [class*=brand], [class*=site-title], a[href='/'], a[href='./'], a[rel=home]")].find((e) => visible(e) && ownText(e).length > 1 && ownText(e).length <= 40 && !e.querySelector("img, svg"));
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
    buttons = { radius: parseFloat(s.borderTopLeftRadius) || 0, background: toHex(s.backgroundColor), border: parseFloat(s.borderTopWidth) || 0, paddingX: parseFloat(s.paddingLeft) || 0, text: ownText(btn).slice(0, 40), element: btn.tagName.toLowerCase() + (btn.className && typeof btn.className === "string" ? "." + btn.className.trim().split(/\s+/).slice(0, 2).join(".") : "") };
  }

  // --- layout ---------------------------------------------------------------------------------
  const lefts = out.filter((s) => s.heading && s.align !== "center").map((s) => s.heading.left).filter((l) => l > 0 && l < vw / 2);
  lefts.sort((a, b) => a - b);
  const left = lefts.length ? lefts[Math.floor(lefts.length / 2)] : undefined;
  const pads = out.map((s) => s.padTop).filter((p) => p !== undefined && p > 0 && p < 400).sort((a, b) => a - b);
  const layout = {};
  if (left !== undefined) {
    layout.contentWidth = Math.round(vw - 2 * left);
    layout.left = Math.round(left);
  }
  if (pads.length) layout.sectionPadding = pads[Math.floor(pads.length / 2)];
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
