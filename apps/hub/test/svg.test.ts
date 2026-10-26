import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "../src/lib/svg";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const refused = (svg: string) => {
  const r = sanitizeSvg(svg);
  return r.ok ? null : r.problem;
};
const clean = (svg: string) => {
  const r = sanitizeSvg(svg);
  if (!r.ok) throw new Error(`refused: ${r.problem}`);
  return r.svg;
};

describe("SVG allowlist re-serializer (adversarial corpus)", () => {
  const hostile: Array<[string, string]> = [
    ["script element", `<svg ${NS}><script>alert(1)</script></svg>`],
    ["uppercase script", `<svg ${NS}><SCRIPT>alert(1)</SCRIPT></svg>`],
    [
      "namespaced script",
      `<svg ${NS} xmlns:s="${"http://www.w3.org/2000/svg"}"><s:script>alert(1)</s:script></svg>`,
    ],
    ["event handler", `<svg ${NS} onload="alert(1)"/>`],
    ["uppercase on*", `<svg ${NS}><rect ONCLICK="alert(1)"/></svg>`],
    ["mixed-case on*", `<svg ${NS}><rect oNmOuSeOvEr="alert(1)"/></svg>`],
    ["quoted > before handler", `<svg ${NS} x=">" onload="alert(1)"/>`],
    [
      "xlink:href javascript",
      `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><rect/></a></svg>`,
    ],
    [
      "entity-encoded javascript",
      `<svg ${NS}><a href="&#106;avascript&#x3A;alert(1)"><rect/></a></svg>`,
    ],
    [
      "named-entity colon + tab",
      `<svg ${NS}><a href="jav&#x09;ascript&colon;alert(1)"><rect/></a></svg>`,
    ],
    ["use external href", `<svg ${NS}><use href="https://evil.example/s.svg#x"/></svg>`],
    [
      "use data: href",
      `<svg ${NS}><use href="data:image/svg+xml,&lt;svg onload=alert(1)&gt;"/></svg>`,
    ],
    ["style url(javascript:)", `<svg ${NS}><rect style="fill:url(javascript:alert(1))"/></svg>`],
    [
      "style url(external)",
      `<svg ${NS}><rect style="background:url( 'https://e.example/t' )"/></svg>`,
    ],
    ["style escape", `<svg ${NS}><rect style="fill:u\\72l(https://e.example)"/></svg>`],
    ["presentation url(external)", `<svg ${NS}><rect fill="url(https://e.example/p#g)"/></svg>`],
    [
      "animate attributeName href",
      `<svg ${NS}><a><animate attributeName="href" values="javascript:alert(1)"/><rect/></a></svg>`,
    ],
    [
      "set attributeName href",
      `<svg ${NS}><a><set attributeName="href" to="javascript:alert(1)"/><rect/></a></svg>`,
    ],
    [
      "foreignObject",
      `<svg ${NS}><foreignObject><iframe src="https://e.example"/></foreignObject></svg>`,
    ],
    ["style element", `<svg ${NS}><style>@import url(https://e.example/x.css);</style></svg>`],
    ["image element", `<svg ${NS}><image href="https://e.example/x.png"/></svg>`],
    ["entity declarations", `<!DOCTYPE svg [<!ENTITY x "&#60;script&#62;">]><svg ${NS}>&x;</svg>`],
    ["nested svg with handler", `<svg ${NS}><svg onload="alert(1)"><rect/></svg></svg>`],
    ["BOM + handler", `﻿<svg ${NS} onload="alert(1)"/>`],
    ["malformed attribute", `<svg ${NS}><rect title="unterminated></svg>`],
    ["not an svg", "<html><body>hi</body></html>"],
  ];
  for (const [label, svg] of hostile)
    it(`refuses: ${label}`, () => {
      expect(refused(svg)).not.toBeNull();
    });

  it("CDATA and comments never smuggle markup: text is re-escaped, comments dropped", () => {
    const out = clean(
      `<svg ${NS}><!-- <script>alert(1)</script> --><text><![CDATA[<script>alert(1)</script>]]></text></svg>`,
    );
    expect(out).toBe(`<svg ${NS}><text>&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>`);
  });

  it("drops processing instructions, doctypes, editor namespaces and unknown attributes", () => {
    const out = clean(
      `<?xml version="1.0"?><?xml-stylesheet href="https://e.example/x.css"?><!DOCTYPE svg><svg ${NS} xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" data-x="1" inkscape:version="1"><sodipodi:namedview/><metadata><rdf:RDF/></metadata><rect width="4" height="4" fill="#123456" data-y="2"/></svg>`,
    );
    expect(out).toBe(`<svg ${NS}><metadata/><rect width="4" height="4" fill="#123456"/></svg>`);
  });

  it("keeps clean drawings: local references, gradients, canonical attribute case, escaped values", () => {
    const out = clean(
      `<svg viewbox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)" title="a &gt; b"/><use href="#g"/><svg x="1"><circle r="1" style="fill: #000"/></svg></svg>`,
    );
    expect(out).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/><use href="#g"/><svg x="1"><circle r="1" style="fill: #000"/></svg></svg>`,
    );
  });

  it("re-escapes attribute values and keeps xlink fragment references", () => {
    const out = clean(
      `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><text font-family="&quot;A&quot; &amp; B">x &amp; y</text><use xlink:href="&#35;a"/></svg>`,
    );
    expect(out).toBe(
      `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><text font-family="&quot;A&quot; &amp; B">x &amp; y</text><use xlink:href="#a"/></svg>`,
    );
  });
});
