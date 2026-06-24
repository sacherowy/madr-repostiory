import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SimilarityMeter } from "./SimilarityMeter.js";

function getMeter() {
  return screen.getByTestId("meter");
}

function getFill(meter: HTMLElement) {
  return meter.querySelector<HTMLElement>(".meter__fill");
}

function getValue(meter: HTMLElement) {
  return meter.querySelector<HTMLElement>(".meter__value");
}

describe("SimilarityMeter", () => {
  // Req 8.2: the fill width is proportional to the score. An in-range score of
  // 0.42 produces a fill 42% wide, and the monospace value reads "0.42".
  it("renders an in-range score with a proportional fill width and the formatted value", () => {
    render(<SimilarityMeter score={0.42} data-testid="meter" />);
    const meter = getMeter();

    expect(meter).toHaveClass("meter");
    const fill = getFill(meter);
    expect(fill).not.toBeNull();
    expect(fill).toHaveClass("meter__fill");
    expect(fill!.style.width).toBe("42%");

    const value = getValue(meter);
    expect(value).not.toBeNull();
    expect(value).toHaveClass("meter__value");
    expect(value).toHaveTextContent("0.42");
  });

  // Req 8.2 (clamping high): a score above 1 is clamped to a full 100% fill and
  // the value shows the clamped 1.00.
  it("clamps a score above 1 to a 100% fill", () => {
    render(<SimilarityMeter score={1.5} data-testid="meter" />);
    const meter = getMeter();

    expect(getFill(meter)!.style.width).toBe("100%");
    expect(getValue(meter)).toHaveTextContent("1.00");
  });

  // Req 8.2 (clamping low): a negative score is clamped to a 0% fill and the
  // value shows the clamped 0.00.
  it("clamps a negative score to a 0% fill", () => {
    render(<SimilarityMeter score={-0.3} data-testid="meter" />);
    const meter = getMeter();

    expect(getFill(meter)!.style.width).toBe("0%");
    expect(getValue(meter)).toHaveTextContent("0.00");
  });

  // Boundary values render exactly.
  it("renders the boundary values 0 and 1 exactly", () => {
    const { rerender } = render(<SimilarityMeter score={0} data-testid="meter" />);
    expect(getFill(getMeter())!.style.width).toBe("0%");
    expect(getValue(getMeter())).toHaveTextContent("0.00");

    rerender(<SimilarityMeter score={1} data-testid="meter" />);
    expect(getFill(getMeter())!.style.width).toBe("100%");
    expect(getValue(getMeter())).toHaveTextContent("1.00");
  });

  // Non-finite guard: NaN/Infinity are not finite, so they fall back to 0.
  it("treats a non-finite score as 0", () => {
    render(<SimilarityMeter score={Number.NaN} data-testid="meter" />);
    const meter = getMeter();

    expect(getFill(meter)!.style.width).toBe("0%");
    expect(getValue(meter)).toHaveTextContent("0.00");
  });

  it("clamps positive Infinity to a full 100% fill", () => {
    render(<SimilarityMeter score={Number.POSITIVE_INFINITY} data-testid="meter" />);
    expect(getFill(getMeter())!.style.width).toBe("100%");
    expect(getValue(getMeter())).toHaveTextContent("1.00");
  });

  // BasePrimitiveProps passthrough: className appended after the design-system
  // class, and data-testid forwarded to the meter root.
  it("appends an extra className after its own design-system class", () => {
    render(<SimilarityMeter score={0.5} className="custom-extra" data-testid="meter" />);
    const meter = getMeter();

    expect(meter).toHaveClass("meter");
    expect(meter).toHaveClass("custom-extra");
  });

  it("forwards data-testid to the meter root", () => {
    render(<SimilarityMeter score={0.5} data-testid="my-meter" />);
    expect(screen.getByTestId("my-meter")).toHaveClass("meter");
  });
});
