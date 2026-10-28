import { describe, expect, it } from "vitest";
import { claudeNewChatUrl, designPrompt } from "./prompt";

describe("the message for Claude", () => {
  it("names the site, the brief and the skill in plain words", () => {
    const p = designPrompt(
      { id: "st_abc123defg", name: "Crumb & Kettle" },
      { about: "A bakery in Leith", audience: "Neighbours", feeling: ["warm", "unhurried"] },
    );
    expect(p).toContain('"Crumb & Kettle"');
    expect(p).toContain("st_abc123defg");
    expect(p).toContain("How it should feel: warm, unhurried");
    expect(p).toContain("openspace-design-from-scratch");
    expect(p).not.toMatch(/\b(?:MCP|repo|workflow|DNS)\b/);
    expect(claudeNewChatUrl(p)).toMatch(/^https:\/\/claude\.ai\/new\?q=Please%20design/);
  });

  it("doesn't call a page they brought 'a simple starting design'", () => {
    const p = designPrompt({ id: "st_abc123defg", name: "Fern Hollow" }, {}, "html");
    expect(p).not.toMatch(/simple starting design/);
    expect(p).toContain("my own page");
  });
});
