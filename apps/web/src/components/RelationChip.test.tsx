import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { RelationType } from "@adr/shared";
import { RelationChip } from "./RelationChip.js";

const RELATION_TYPES: RelationType[] = [
  "supersedes",
  "superseded-by",
  "relates-to",
  "depends-on",
  "conflicts-with",
];
const ALL_MODIFIERS = RELATION_TYPES.map((t) => `chip--${t}`);

function getChip() {
  return screen.getByTestId("relation-chip");
}

describe("RelationChip", () => {
  // Req 5.1: each relation type renders as a monospace chip with the correct
  // colored marker (the marker class drives the per-type color in base.css).
  it.each(RELATION_TYPES)(
    "maps the %s relation to the base chip class plus its own marker modifier and a marker element",
    (type) => {
      render(<RelationChip type={type} data-testid="relation-chip" />);
      const chip = getChip();

      // Monospace base + the per-type modifier (base.css makes `.chip` monospace).
      expect(chip).toHaveClass("chip");
      expect(chip).toHaveClass(`chip--${type}`);

      // The leading colored marker element must be present.
      expect(chip.querySelector(".chip__marker")).not.toBeNull();

      // It must carry ONLY its own relation modifier, never another type's.
      for (const other of ALL_MODIFIERS.filter((m) => m !== `chip--${type}`)) {
        expect(chip).not.toHaveClass(other);
      }
    }
  );

  // Req 12.2: when direction, type, and target are provided, the three existing
  // RelationsPanel test hooks must be preserved with their exact text values.
  it("renders the three relation test hooks with their exact text when direction, type, and target are given", () => {
    render(
      <RelationChip
        type="supersedes"
        target="ADR-0007"
        direction="outbound"
        data-testid="relation-chip"
      />
    );

    expect(screen.getByTestId("relation-direction")).toHaveTextContent("outbound");
    expect(screen.getByTestId("relation-type")).toHaveTextContent("supersedes");
    expect(screen.getByTestId("relation-target")).toHaveTextContent("ADR-0007");
  });

  // The hooks must be three distinct testid'd spans, not collapsed into one opaque element.
  it("exposes the three hooks as separate spans rather than collapsing them", () => {
    render(
      <RelationChip
        type="depends-on"
        target="ADR-0002"
        direction="inbound"
        data-testid="relation-chip"
      />
    );

    const direction = screen.getByTestId("relation-direction");
    const type = screen.getByTestId("relation-type");
    const target = screen.getByTestId("relation-target");

    expect(direction.tagName).toBe("SPAN");
    expect(type.tagName).toBe("SPAN");
    expect(target.tagName).toBe("SPAN");
    expect(direction).not.toBe(type);
    expect(type).not.toBe(target);
  });

  // When no direction is given, the type/target hooks still render; no empty
  // direction span is emitted (design: omit the direction span when absent).
  it("omits the direction hook when no direction is given but keeps type and target", () => {
    render(<RelationChip type="relates-to" target="ADR-0003" data-testid="relation-chip" />);

    expect(screen.queryByTestId("relation-direction")).toBeNull();
    expect(screen.getByTestId("relation-type")).toHaveTextContent("relates-to");
    expect(screen.getByTestId("relation-target")).toHaveTextContent("ADR-0003");
  });

  // When no target is given, the target hook is omitted but the type hook stays.
  it("omits the target hook when no target is given but keeps the type", () => {
    render(<RelationChip type="conflicts-with" data-testid="relation-chip" />);

    expect(screen.queryByTestId("relation-target")).toBeNull();
    expect(screen.getByTestId("relation-type")).toHaveTextContent("conflicts-with");
  });

  // BasePrimitiveProps passthrough: className appended after the design-system
  // class, and data-testid forwarded to the chip root.
  it("appends an extra className after its own design-system classes", () => {
    render(
      <RelationChip type="supersedes" className="custom-extra" data-testid="relation-chip" />
    );
    const chip = getChip();

    expect(chip).toHaveClass("chip");
    expect(chip).toHaveClass("chip--supersedes");
    expect(chip).toHaveClass("custom-extra");
  });

  it("forwards data-testid to the chip root", () => {
    render(<RelationChip type="depends-on" data-testid="my-relation" />);
    expect(screen.getByTestId("my-relation")).toHaveClass("chip");
  });
});
