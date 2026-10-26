import { describe, expect, it } from "vitest";
import { siteFixture } from "./__fixtures__/site";
import { scanForSecrets, scanValueForSecrets, shannonEntropy } from "./secrets";

// Assemble fake keys at runtime so this file itself never trips secret scanners.
const fake = (...parts: string[]) => parts.join("");

describe("scanForSecrets", () => {
  it.each([
    ["stripe-secret-key", fake("sk_", "live_", "51HqLyjWDarjtT1zdp7dcXyZaBcDeFgH")],
    ["stripe-secret-key", fake("rk_", "test_", "51HqLyjWDarjtT1zdp7dcXy")],
    ["stripe-webhook-secret", fake("whsec_", "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw")],
    ["github-token", fake("ghp_", "16C7e42F292c6912E7710c838347Ae178B4a")],
    ["github-token", fake("gho_", "16C7e42F292c6912E7710c838347Ae178B4a")],
    [
      "github-fine-grained-token",
      fake(
        "github_pat_",
        "11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP",
      ),
    ],
    ["aws-access-key-id", fake("AKIA", "IOSFODNN7EXAMPLE")],
    ["anthropic-api-key", fake("sk-ant-", "api03-abcdefghijklmnopqrstuvwxyz012345")],
    ["openai-api-key", fake("sk-proj-", "abcdefghijklmnopqrstuvwxyz0123456789ABCD")],
    ["google-api-key", fake("AIza", "SyD-abcdefghijklmnopqrstuvwxyz01234")],
    ["slack-token", fake("xoxb-", "123456789012-abcdefghijkl")],
    ["private-key", fake("-----BEGIN ", "RSA PRIVATE KEY-----")],
    ["generic-secret-assignment", fake('"apiKey": "', 'a8F3kQ9zL2mX7pR4tW1v"')],
    ["generic-secret-assignment", fake("CLIENT_SECRET=", "Zx81kd93JsnQ02LmzP4a")],
    [
      "generic-secret-assignment",
      fake("https://api.example.com/v1?api_key=", "Q2w9E8r7T6y5U4i3O2p1"),
    ],
    ["generic-secret-assignment", fake("password: ", "Tr0ub4dor!3xyzABC12")],
    ["generic-secret-assignment", fake("key=", "n3Kq8ZpL0xW5vT2rY7aB")],
    ["generic-secret-assignment", fake('"key": "', 'n3Kq8ZpL0xW5vT2rY7aB"')],
    ["generic-secret-assignment", fake("STRIPE_KEY=", "Hk29dLq0Zm4Xw8Pn3Rt6")],
    ["generic-secret-assignment", fake('"stripeKey": "', 'Hk29dLq0Zm4Xw8Pn3Rt6"')],
    ["generic-secret-assignment", fake("https://maps.example.com/js?key=", "Q7mZ2xK9pL4wT8vR1nB5")],
  ])("detects %s", (rule, text) => {
    const findings = scanForSecrets(`some content\n  ${text}\nmore`);
    expect(findings.map((f) => f.rule)).toEqual([rule]);
    expect(findings[0]?.line).toBe(2);
    expect(findings[0]?.preview).not.toContain(text.slice(8));
  });

  it.each([
    ["Stripe publishable key", fake("pk_", "live_", "51HqLyjWDarjtT1zdp7dcXyZaBcDeFgH")],
    [
      "prose about tokens",
      "Design tokens and API keys are explained in our guide; the secret is consistency.",
    ],
    ["token names", '"token": "primary-button-color"'],
    ["low-entropy value", "api_key=aaaaaaaaaaaaaaaaaaaaaaaa"],
    ["short value", "secret: abc123"],
    ["media path", '"key": "media/2026/10/hero-k3f9-2400w.jpg"'],
    ["key with word value", '"key": "primary-button-color"'],
    ["monkey business", "monkey: bananas-and-more-bananas"],
    [
      "unsplash url",
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2400&q=80",
    ],
    ["ids", '{"id": "blk_7hq2k3f9mz", "siteId": "st_01jb3q8w2n"}'],
    ["sk prefix in words", "ask_live_events_now and task_test_runner"],
    ["password field label", '"label": "Password reset instructions"'],
  ])("ignores %s", (_name, text) => {
    expect(scanForSecrets(text)).toEqual([]);
  });

  it("finds nothing in a realistic site document and reports multiple findings in order", () => {
    expect(scanValueForSecrets(siteFixture())).toEqual([]);
    const doc = siteFixture();
    doc.site.headInjection = `<script>const k="${fake("sk_", "live_", "51HqLyjWDarjtT1zdp7dcXyZaBc")}";</script>`;
    doc.site.footerInjection = `<!-- ${fake("ghp_", "16C7e42F292c6912E7710c838347Ae178B4a")} -->`;
    const findings = scanValueForSecrets(doc);
    expect(findings.map((f) => f.rule)).toEqual(["stripe-secret-key", "github-token"]);
    expect(findings[0]?.index).toBeLessThan(findings[1]?.index ?? 0);
  });

  it("computes entropy", () => {
    expect(shannonEntropy("aaaa")).toBe(0);
    expect(shannonEntropy("abcd")).toBe(2);
  });
});
