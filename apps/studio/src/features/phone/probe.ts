import { PHONE_HEIGHT, type PhoneProbeResult } from "@omniharmonic/openspace-lint";

/**
 * Run the Phone check's probe inside Studio's canvas while it is laid out as a phone. The probe
 * is served as `/os-phone-probe.js` (Studio's CSP allows no eval), loaded into the canvas once,
 * and run with the phone screen's height (the canvas itself is as tall as the page). The
 * canvas scroll position is restored afterwards.
 */

type ProbeWindow = Window & {
  __osPhoneProbe?: () => Promise<PhoneProbeResult>;
  __osPhoneScreenHeight?: number;
};

export const PROBE_URL = "/os-phone-probe.js";

function loadProbe(doc: Document): Promise<boolean> {
  const win = doc.defaultView as ProbeWindow | null;
  if (!win) return Promise.resolve(false);
  if (win.__osPhoneProbe) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = doc.head.querySelector<HTMLScriptElement>("script[data-os-phone-probe]");
    const script = existing ?? doc.createElement("script");
    const done = () => resolve(Boolean(win.__osPhoneProbe));
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => resolve(false), { once: true });
    if (!existing) {
      script.src = new URL(PROBE_URL, window.location.origin).toString();
      script.dataset.osPhoneProbe = "";
      doc.head.appendChild(script);
    }
    // Never hang the editor on a script that doesn't arrive.
    setTimeout(() => resolve(Boolean(win.__osPhoneProbe)), 5000);
  });
}

/** Measure the canvas document as a phone; null when the probe can't run here. */
export async function measureCanvas(doc: Document): Promise<PhoneProbeResult | null> {
  const win = doc.defaultView as ProbeWindow | null;
  if (!win || !(await loadProbe(doc)) || !win.__osPhoneProbe) return null;
  const x = win.scrollX;
  const y = win.scrollY;
  win.__osPhoneScreenHeight = PHONE_HEIGHT;
  try {
    return await win.__osPhoneProbe();
  } catch {
    return null;
  } finally {
    win.scrollTo(x, y);
  }
}

/** Outline what the phone check found, on the canvas (editor-only styling). */
export function markCanvas(doc: Document, ids: readonly string[]): void {
  let style = doc.head.querySelector<HTMLStyleElement>("style[data-os-phone-marks]");
  if (!ids.length) {
    style?.remove();
    return;
  }
  if (!style) {
    style = doc.createElement("style");
    style.dataset.osPhoneMarks = "";
    doc.head.appendChild(style);
  }
  const sel = ids.map((id) => `[data-os-id="${CSS.escape(id)}"]`).join(",");
  style.textContent = `${sel}{outline:2px dashed #d9480f!important;outline-offset:3px}`;
}
