import { loadTemplate } from "@openspace/templates";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HubProvider } from "../../api/context";
import { TEMPLATE_FIXTURES } from "../../api/fixtures";
import { createMockHub } from "../../api/mock";
import { createQueryClient } from "../../app/Providers";
import { lookStyles, personalizeTemplate } from "./personalize";
import { TemplateRender } from "./TemplateRender";

/** jsdom has no IntersectionObserver: a stub that reports everything as in view. */
class InViewObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    queueMicrotask(() =>
      this.cb(
        [{ target: el, isIntersecting: true } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      ),
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = InViewObserver;
});
afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

describe("live template renders", () => {
  it("personalizes the home page headline, title, brand color and look", () => {
    const t = loadTemplate("meadow");
    if (!t) throw new Error("no meadow");
    const look = t.meta.looks[2];
    if (!look) throw new Error("no look");
    const styles = lookStyles(
      {
        looks: t.meta.looks.map((l) => ({ ...l, siteStyles: l.styles, styles: {} as never })),
        document: t.doc,
      },
      look.id,
    );
    expect(styles).toEqual(look.styles);
    const doc = personalizeTemplate(t.doc, styles, t.meta.sample, {
      name: "Juniper Bodywork",
      tagline: "Massage that meets you where you are",
      brandColor: "#7a3e9d",
    });
    expect(doc.site.title).toBe("Juniper Bodywork");
    expect(doc.styles.choices.palette.brand).toBe("#7a3e9d");
    const words = JSON.stringify(doc.pages);
    expect(words).not.toContain(t.meta.sample.tagline);
    expect(words).toContain("Massage that meets you where you are");
    // The template itself is untouched.
    expect(t.doc.site.title).not.toBe("Juniper Bodywork");
  });

  it("renders the real template through the renderer once it scrolls into view", async () => {
    const hub = createMockHub();
    const template = TEMPLATE_FIXTURES[0];
    const look = template?.looks[0];
    if (!template || !look) throw new Error("no fixture");
    // jsdom has no layout: give the box a width so the frame can be scaled into it.
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 320,
    });
    try {
      render(
        <QueryClientProvider client={createQueryClient()}>
          <HubProvider hub={hub}>
            <TemplateRender
              template={template}
              look={look}
              personalize={{ name: "Juniper Bodywork" }}
            />
          </HubProvider>
        </QueryClientProvider>,
      );
      const name = `${template.name} template, ${look.name} look`;
      await waitFor(() => expect(hub.calls.some((c) => c.method === "getTemplate")).toBe(true));
      const frame = await waitFor(() => {
        const f = screen.getByRole("img", { name }).querySelector("iframe");
        expect(f).toBeTruthy();
        return f as HTMLIFrameElement;
      });
      await act(async () => {
        frame.dispatchEvent(new Event("load"));
      });
      await waitFor(() =>
        expect(frame.contentDocument?.querySelector("[data-os-page]")).toBeTruthy(),
      );
      const d = frame.contentDocument as Document;
      expect(d.querySelector("header")?.textContent).toContain("Juniper Bodywork");
      // Scaled from a 1440px page into the 320px box, cropped 4:3.
      expect(frame.style.width).toBe("1440px");
      expect(frame.style.transform).toBe(`scale(${320 / 1440})`);
      expect(frame.getAttribute("sandbox")).toBe("allow-same-origin");
      expect(d.head.querySelector('[data-os="tokens"]')?.textContent).toContain("--os-");
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });
});
