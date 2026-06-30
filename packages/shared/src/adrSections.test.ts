import { describe, it, expect } from "vitest";
import type { AdrSections, MadrSectionMeta } from "./adrSections.js";
import { MADR_SECTIONS } from "./adrSections.js";

describe("AdrSections shape", () => {
  it("constructs an AdrSections literal with all eight string fields", () => {
    const sections: AdrSections = {
      contextAndProblemStatement: "Context text",
      decisionDrivers: "Drivers text",
      consideredOptions: "Options text",
      decisionOutcome: "Outcome text",
      consequences: "Consequences text",
      confirmation: "Confirmation text",
      prosAndConsOfTheOptions: "Pros and cons text",
      moreInformation: "More info text",
    };
    expect(Object.keys(sections)).toHaveLength(8);
    expect(sections.contextAndProblemStatement).toBe("Context text");
    expect(sections.moreInformation).toBe("More info text");
  });
});

describe("MADR_SECTIONS metadata", () => {
  it("has exactly eight entries", () => {
    expect(MADR_SECTIONS).toHaveLength(8);
  });

  it("declares entries in the canonical MADR order with matching keys", () => {
    const keys = MADR_SECTIONS.map((s) => s.key);
    expect(keys).toEqual([
      "contextAndProblemStatement",
      "decisionDrivers",
      "consideredOptions",
      "decisionOutcome",
      "consequences",
      "confirmation",
      "prosAndConsOfTheOptions",
      "moreInformation",
    ]);
  });

  it("declares the exact heading text for each section, in order", () => {
    const headings = MADR_SECTIONS.map((s) => s.heading);
    expect(headings).toEqual([
      "Context and Problem Statement",
      "Decision Drivers",
      "Considered Options",
      "Decision Outcome",
      "Consequences",
      "Confirmation",
      "Pros and Cons of the Options",
      "More Information",
    ]);
  });

  it("marks exactly contextAndProblemStatement and decisionOutcome as required", () => {
    const required = MADR_SECTIONS.filter((s) => s.required).map((s) => s.key);
    expect(required).toEqual(["contextAndProblemStatement", "decisionOutcome"]);

    const optional = MADR_SECTIONS.filter((s) => !s.required).map((s) => s.key);
    expect(optional).toEqual([
      "decisionDrivers",
      "consideredOptions",
      "consequences",
      "confirmation",
      "prosAndConsOfTheOptions",
      "moreInformation",
    ]);
  });

  it("marks exactly consequences and confirmation as heading level 3, nested under decisionOutcome", () => {
    const level3 = MADR_SECTIONS.filter((s) => s.level === 3).map((s) => s.key);
    expect(level3).toEqual(["consequences", "confirmation"]);

    const level2 = MADR_SECTIONS.filter((s) => s.level === 2).map((s) => s.key);
    expect(level2).toEqual([
      "contextAndProblemStatement",
      "decisionDrivers",
      "consideredOptions",
      "decisionOutcome",
      "prosAndConsOfTheOptions",
      "moreInformation",
    ]);
  });

  it("type-checks each entry against MadrSectionMeta's shape", () => {
    for (const entry of MADR_SECTIONS) {
      const meta: MadrSectionMeta = entry;
      expect(typeof meta.key).toBe("string");
      expect(typeof meta.heading).toBe("string");
      expect([2, 3]).toContain(meta.level);
      expect(typeof meta.required).toBe("boolean");
    }
  });

  it("is readonly at the type level (array reference is declared as readonly MadrSectionMeta[])", () => {
    // Runtime sanity check that it's a real array we can iterate/filter (TS readonly is compile-time only).
    expect(Array.isArray(MADR_SECTIONS)).toBe(true);
  });
});
