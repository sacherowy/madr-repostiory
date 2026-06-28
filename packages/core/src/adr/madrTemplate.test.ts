import { describe, expect, it } from "vitest";
import { MADR_BODY_SCAFFOLD } from "./madrTemplate.js";

interface HeadingLine {
  level: number;
  text: string;
  /** Body text between this heading and the next heading (or end of string). */
  sectionBody: string;
}

function parseHeadings(markdown: string): HeadingLine[] {
  const lines = markdown.split("\n");
  const headingIndices: { index: number; level: number; text: string }[] = [];

  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      headingIndices.push({ index, level: match[1].length, text: match[2].trim() });
    }
  });

  return headingIndices.map((heading, i) => {
    const nextIndex = i + 1 < headingIndices.length ? headingIndices[i + 1].index : lines.length;
    const sectionBody = lines.slice(heading.index + 1, nextIndex).join("\n");
    return { level: heading.level, text: heading.text, sectionBody };
  });
}

describe("MADR_BODY_SCAFFOLD", () => {
  it("is a non-empty exported string", () => {
    expect(typeof MADR_BODY_SCAFFOLD).toBe("string");
    expect(MADR_BODY_SCAFFOLD.length).toBeGreaterThan(0);
  });

  it("contains exactly 8 headings in the exact MADR v4.0.0 order", () => {
    const headings = parseHeadings(MADR_BODY_SCAFFOLD);

    expect(headings.map((h) => h.text)).toEqual([
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

  it("uses H2 (##) for the six top-level sections", () => {
    const headings = parseHeadings(MADR_BODY_SCAFFOLD);
    const byText = new Map(headings.map((h) => [h.text, h]));

    const expectedH2 = [
      "Context and Problem Statement",
      "Decision Drivers",
      "Considered Options",
      "Decision Outcome",
      "Pros and Cons of the Options",
      "More Information",
    ];

    for (const text of expectedH2) {
      expect(byText.get(text)?.level).toBe(2);
    }
  });

  it("nests Consequences and Confirmation as H3 (###) subsections", () => {
    const headings = parseHeadings(MADR_BODY_SCAFFOLD);
    const byText = new Map(headings.map((h) => [h.text, h]));

    expect(byText.get("Consequences")?.level).toBe(3);
    expect(byText.get("Confirmation")?.level).toBe(3);
  });

  it("positions Consequences and Confirmation between Decision Outcome and Pros and Cons of the Options", () => {
    const headings = parseHeadings(MADR_BODY_SCAFFOLD);
    const texts = headings.map((h) => h.text);

    const decisionOutcomeIndex = texts.indexOf("Decision Outcome");
    const consequencesIndex = texts.indexOf("Consequences");
    const confirmationIndex = texts.indexOf("Confirmation");
    const prosConsIndex = texts.indexOf("Pros and Cons of the Options");

    expect(decisionOutcomeIndex).toBeGreaterThanOrEqual(0);
    expect(consequencesIndex).toBe(decisionOutcomeIndex + 1);
    expect(confirmationIndex).toBe(consequencesIndex + 1);
    expect(prosConsIndex).toBe(confirmationIndex + 1);
  });

  it("marks the two required sections with no optional-marker comment", () => {
    const headings = parseHeadings(MADR_BODY_SCAFFOLD);
    const byText = new Map(headings.map((h) => [h.text, h]));

    const requiredSections = ["Context and Problem Statement", "Decision Outcome"];

    for (const text of requiredSections) {
      const section = byText.get(text);
      expect(section).toBeDefined();
      expect(section!.sectionBody).not.toMatch(/<!--\s*Optional/);
    }
  });

  it("marks every optional section with an optional-marker comment", () => {
    const headings = parseHeadings(MADR_BODY_SCAFFOLD);
    const byText = new Map(headings.map((h) => [h.text, h]));

    const optionalSections = [
      "Decision Drivers",
      "Considered Options",
      "Consequences",
      "Confirmation",
      "Pros and Cons of the Options",
      "More Information",
    ];

    for (const text of optionalSections) {
      const section = byText.get(text);
      expect(section).toBeDefined();
      expect(section!.sectionBody).toMatch(/<!--\s*Optional/);
    }
  });

  it("leaves every section otherwise empty beyond its heading and optional marker", () => {
    const headings = parseHeadings(MADR_BODY_SCAFFOLD);

    for (const heading of headings) {
      const contentLines = heading.sectionBody
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !/^<!--.*-->$/.test(line));

      expect(contentLines).toEqual([]);
    }
  });
});
