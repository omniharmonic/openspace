import { productBlock } from "@omniharmonic/openspace-blocks";
import type { BooleanFieldMeta } from "@omniharmonic/openspace-schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BooleanControl } from "./basic";

const productField = (name: string) => {
  const meta = productBlock.meta.fields[name] as BooleanFieldMeta | undefined;
  if (!meta) throw new Error(`no product field ${name}`);
  return meta;
};

describe("on/off fields", () => {
  it("show what the page shows when a field was never set (the field's default)", () => {
    // A product imported before these toggles existed shows its price and its button, so the
    // switches must read on, not off.
    for (const name of ["showPrice", "showBuy", "showTitle"]) {
      const meta = productField(name);
      expect(meta.default).toBe(true);
      render(
        <BooleanControl
          id={name}
          meta={meta}
          label={name}
          value={undefined}
          onChange={() => null}
        />,
      );
      expect(screen.getByRole("switch", { name })).toBeChecked();
    }
  });

  it("still shows an explicit off as off, and a field without a default as off", () => {
    const meta = productField("showBuy");
    render(<BooleanControl id="a" meta={meta} label="off" value={false} onChange={() => null} />);
    expect(screen.getByRole("switch", { name: "off" })).not.toBeChecked();
    const plain = { kind: "boolean", optional: true } as BooleanFieldMeta;
    render(
      <BooleanControl id="b" meta={plain} label="plain" value={undefined} onChange={() => null} />,
    );
    expect(screen.getByRole("switch", { name: "plain" })).not.toBeChecked();
  });
});
