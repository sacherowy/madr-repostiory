import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MonoChip } from "./MonoChip.js";

type Variant = "id" | "sha" | "status";

const VARIANTS: Variant[] = ["id", "sha", "status"];
const ALL_MODIFIERS = VARIANTS.map((v) => `mono-chip--${v}`);

function getChip() {
  return screen.getByTestId("mono-chip");
}

describe("MonoChip", () => {
  // Req 6.1/6.2/6.3: each machine identifier renders as a monospace chip
  // carrying the base class plus its own variant modifier (which drives the
  // per-variant color treatment in base.css), and shows the value text.
  it.each(VARIANTS)(
    "maps the %s variant to the base mono-chip class plus its own variant modifier and renders the value",
    (variant) => {
      render(<MonoChip variant={variant} value="ADR-0007" data-testid="mono-chip" />);
      const chip = getChip();

      expect(chip).toHaveClass("mono-chip");
      expect(chip).toHaveClass(`mono-chip--${variant}`);
      expect(chip).toHaveTextContent("ADR-0007");

      // No cross-variant modifier bleed.
      for (const other of ALL_MODIFIERS.filter((m) => m !== `mono-chip--${variant}`)) {
        expect(chip).not.toHaveClass(other);
      }
    }
  );

  // Req 6.1: the id variant gets the teal id treatment (the `mono-chip--id`
  // modifier whose teal tokens are defined in base.css).
  it("renders the id variant with the teal id modifier and no neutral modifiers", () => {
    render(<MonoChip variant="id" value="ADR-0001" data-testid="mono-chip" />);
    const chip = getChip();

    expect(chip).toHaveClass("mono-chip", "mono-chip--id");
    expect(chip).not.toHaveClass("mono-chip--sha");
    expect(chip).not.toHaveClass("mono-chip--status");
  });

  // Req 6.2: the sha variant gets the neutral sha modifier.
  it("renders the sha variant with the neutral sha modifier and no id modifier", () => {
    render(<MonoChip variant="sha" value="a1b2c3d" data-testid="mono-chip" />);
    const chip = getChip();

    expect(chip).toHaveClass("mono-chip", "mono-chip--sha");
    expect(chip).not.toHaveClass("mono-chip--id");
    expect(chip).toHaveTextContent("a1b2c3d");
  });

  // Req 6.3: a raw status key gets the neutral status modifier.
  it("renders the status variant with the neutral status modifier and no id modifier", () => {
    render(<MonoChip variant="status" value="superseded" data-testid="mono-chip" />);
    const chip = getChip();

    expect(chip).toHaveClass("mono-chip", "mono-chip--status");
    expect(chip).not.toHaveClass("mono-chip--id");
    expect(chip).toHaveTextContent("superseded");
  });

  // BasePrimitiveProps passthrough: className appended after the design-system
  // class, and data-testid forwarded to the chip root.
  it("appends an extra className after its own design-system classes", () => {
    render(
      <MonoChip variant="id" value="ADR-0009" className="custom-extra" data-testid="mono-chip" />
    );
    const chip = getChip();

    expect(chip).toHaveClass("mono-chip");
    expect(chip).toHaveClass("mono-chip--id");
    expect(chip).toHaveClass("custom-extra");
  });

  it("forwards data-testid to the chip root", () => {
    render(<MonoChip variant="sha" value="deadbee" data-testid="my-mono" />);
    expect(screen.getByTestId("my-mono")).toHaveClass("mono-chip");
  });
});
