import { defineBlock, f, type SiteDocument } from "@openspace/schema";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { IDS, siteFixture } from "./__fixtures__/site";
import { popupTrigger } from "./chrome";
import { PageView } from "./page";
import { registerBlocks, unregisterBlocks } from "./registry";

function withPopup(popup: SiteDocument["site"]["popup"]): SiteDocument {
  const doc = siteFixture();
  doc.site.popup = popup;
  return doc;
}

const popup = {
  enabled: true,
  trigger: "scroll" as const,
  scrollPercent: 40,
  frequencyDays: 14,
  heading: "Ten percent off your first class",
  body: "Bring a friend to the Saturday flow.",
  cta: { label: "See the schedule", link: { type: "url" as const, url: "/schedule" } },
};

afterEach(() => unregisterBlocks());

describe("site pop-up", () => {
  it("renders the pop-up dialog with its trigger, cap and content on published pages", () => {
    const html = renderToStaticMarkup(<PageView doc={withPopup(popup)} page={IDS.home} />);
    expect(html).toContain('data-os-behavior="popup"');
    expect(html).toContain('data-os-trigger="scroll"');
    expect(html).toContain('data-os-scroll="40"');
    expect(html).toContain('data-os-frequency="14"');
    expect(html).toContain("Ten percent off your first class");
    expect(html).toContain("Bring a friend to the Saturday flow.");
    expect(html).toContain('href="/schedule"');
  });

  it("is left out when disabled, absent, or in the editor canvas", () => {
    expect(
      renderToStaticMarkup(
        <PageView doc={withPopup({ ...popup, enabled: false })} page={IDS.home} />,
      ),
    ).not.toContain("os-popup");
    expect(renderToStaticMarkup(<PageView doc={withPopup(null)} page={IDS.home} />)).not.toContain(
      "os-popup",
    );
    expect(
      renderToStaticMarkup(<PageView doc={withPopup(popup)} page={IDS.home} mode="editor" />),
    ).not.toContain("os-popup");
  });

  it("maps each trigger", () => {
    expect(popupTrigger({ ...popup, trigger: "time", delaySeconds: 5 })).toEqual({
      type: "time",
      seconds: 5,
    });
    expect(popupTrigger({ ...popup })).toEqual({ type: "scroll", percent: 40 });
    expect(popupTrigger({ ...popup, trigger: "exit-intent" })).toEqual({ type: "exit" });
  });

  it("renders the registered newsletter block for a signup pop-up", () => {
    registerBlocks([
      defineBlock({
        type: "newsletter",
        version: 1,
        category: "forms",
        label: "Newsletter",
        icon: "mail",
        description: "Signup",
        fields: {
          askName: f.boolean({ default: false }),
          placeholder: f.text({ default: "you@example.com" }),
          buttonLabel: f.text({ default: "Subscribe" }),
          successMessage: f.text({ default: "Check your inbox." }),
        },
        variants: ["stacked"],
        ai: { purpose: "Signup", whenToUse: "Anywhere", avoid: "Nothing" },
        render: ({ fields }) => <form data-os-behavior="newsletter">{fields.buttonLabel}</form>,
      }),
    ]);
    const html = renderToStaticMarkup(
      <PageView doc={withPopup({ ...popup, newsletter: true })} page={IDS.home} />,
    );
    expect(html).toContain('data-os-behavior="newsletter"');
  });
});
