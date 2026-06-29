import { describe, expect, it } from "vitest";
import type { AdrSections } from "@adr/shared";
import { MADR_SECTIONS } from "@adr/shared";
import { combinedSectionText, joinSections, splitSections } from "./sections.js";

/** All 8 AdrSections fields empty. */
function emptySections(): AdrSections {
  return {
    contextAndProblemStatement: "",
    decisionDrivers: "",
    consideredOptions: "",
    decisionOutcome: "",
    consequences: "",
    confirmation: "",
    prosAndConsOfTheOptions: "",
    moreInformation: "",
  };
}

describe("splitSections", () => {
  it("maps each of the 8 canonical headings (correct text + level) to its field", () => {
    const body = [
      "## Context and Problem Statement",
      "Why are we doing this?",
      "",
      "## Decision Drivers",
      "- driver one",
      "",
      "## Considered Options",
      "- option A",
      "",
      "## Decision Outcome",
      "Chosen option A.",
      "",
      "### Consequences",
      "Good, because reasons.",
      "",
      "### Confirmation",
      "Reviewed by team.",
      "",
      "## Pros and Cons of the Options",
      "- pro",
      "",
      "## More Information",
      "See link.",
    ].join("\n");

    const { sections, additionalContent } = splitSections(body);

    expect(sections.contextAndProblemStatement).toBe("Why are we doing this?\n");
    expect(sections.decisionDrivers).toBe("- driver one\n");
    expect(sections.consideredOptions).toBe("- option A\n");
    expect(sections.decisionOutcome).toBe("Chosen option A.\n");
    expect(sections.consequences).toBe("Good, because reasons.\n");
    expect(sections.confirmation).toBe("Reviewed by team.\n");
    expect(sections.prosAndConsOfTheOptions).toBe("- pro\n");
    expect(sections.moreInformation).toBe("See link.");
    expect(additionalContent).toBe("");
  });

  it("does not further split a nested sub-heading inside a section's content; it is routed to additionalContent, breaking the section's content at that point (accepted risk per design Non-Goals)", () => {
    const body = [
      "## Pros and Cons of the Options",
      "### Option A",
      "- pro",
    ].join("\n");

    const { sections, additionalContent } = splitSections(body);

    // The nested "### Option A" heading does not match any MADR_SECTIONS
    // entry, so it (and everything after it, up to the next heading or end
    // of body) is routed to additionalContent instead of remaining part of
    // prosAndConsOfTheOptions's content.
    expect(sections.prosAndConsOfTheOptions).toBe("");
    expect(additionalContent).toBe("### Option A\n- pro");
  });

  it("does NOT match a heading with right text but wrong level; it lands in additionalContent with the heading line included", () => {
    // "Decision Drivers" is canonically level 2 (##); here it's level 3 (###).
    const body = ["## Context and Problem Statement", "Some context.", "", "### Decision Drivers", "- driver one"].join(
      "\n",
    );

    const { sections, additionalContent } = splitSections(body);

    expect(sections.contextAndProblemStatement).toBe("Some context.\n");
    expect(sections.decisionDrivers).toBe("");
    expect(additionalContent).toBe("### Decision Drivers\n- driver one");
  });

  it("routes a duplicate occurrence of an already-matched heading to additionalContent", () => {
    const body = [
      "## Context and Problem Statement",
      "First content.",
      "",
      "## Context and Problem Statement",
      "Duplicate content.",
    ].join("\n");

    const { sections, additionalContent } = splitSections(body);

    expect(sections.contextAndProblemStatement).toBe("First content.\n");
    expect(additionalContent).toBe("## Context and Problem Statement\nDuplicate content.");
  });

  it("routes content preceding the first heading to additionalContent", () => {
    const body = ["Some preamble text.", "", "## Context and Problem Statement", "Real content."].join("\n");

    const { sections, additionalContent } = splitSections(body);

    expect(additionalContent).toBe("Some preamble text.\n");
    expect(sections.contextAndProblemStatement).toBe("Real content.");
  });

  it("recognizes the reserved '## Additional Content' heading, stripping the heading line from the captured content", () => {
    const body = [
      "## Context and Problem Statement",
      "Some context.",
      "",
      "## Additional Content",
      "Plain prose with no heading of its own.",
    ].join("\n");

    const { sections, additionalContent } = splitSections(body);

    expect(sections.contextAndProblemStatement).toBe("Some context.\n");
    expect(additionalContent).toBe("Plain prose with no heading of its own.");
  });

  it("routes a duplicate occurrence of the reserved '## Additional Content' heading to additionalContent with the heading line included", () => {
    const body = [
      "## Additional Content",
      "First catch-all content.",
      "",
      "## Additional Content",
      "Duplicate catch-all content.",
    ].join("\n");

    const { additionalContent } = splitSections(body);

    expect(additionalContent).toBe("First catch-all content.\n\n## Additional Content\nDuplicate catch-all content.");
  });

  it("puts the entire content into additionalContent when there are no recognized headings at all", () => {
    // Simulates the example fixture's non-English (Polish) headings.
    const body = ["## Uzycie gita", "Some content.", "", "## Inny naglowek", "More content."].join("\n");

    const { sections, additionalContent } = splitSections(body);

    expect(sections).toEqual(emptySections());
    expect(additionalContent).toBe(body);
  });

  it("never throws on an empty body and yields all-empty sections with empty additionalContent", () => {
    const { sections, additionalContent } = splitSections("");

    expect(sections).toEqual(emptySections());
    expect(additionalContent).toBe("");
  });

  it("accounts for every character of the input across fields and additionalContent (combined order)", () => {
    const body = [
      "preamble",
      "## Context and Problem Statement",
      "ctx content",
      "## Unrecognized Heading",
      "stray content",
      "## Decision Outcome",
      "outcome content",
    ].join("\n");

    const { sections, additionalContent } = splitSections(body);

    expect(sections.contextAndProblemStatement).toBe("ctx content");
    expect(sections.decisionOutcome).toBe("outcome content");
    expect(additionalContent).toBe("preamble\n## Unrecognized Heading\nstray content");
  });
});

describe("joinSections", () => {
  it("emits all 8 headings in canonical order/level from MADR_SECTIONS even when every field is empty", () => {
    const result = joinSections(emptySections(), "");

    const headingLines = result
      .split("\n")
      .filter((line) => /^#{1,6}\s+/.test(line));

    expect(headingLines).toEqual(MADR_SECTIONS.map((meta) => `${"#".repeat(meta.level)} ${meta.heading}`));
  });

  it("wraps additionalContent under the reserved '## Additional Content' heading when non-empty", () => {
    const result = joinSections(emptySections(), "stray trailing content");

    expect(result.endsWith("stray trailing content")).toBe(true);
    const lines = result.split("\n");
    const headingIndex = lines.indexOf("## Additional Content");
    const strayIndex = lines.indexOf("stray trailing content");
    expect(headingIndex).toBeGreaterThan(-1);
    expect(strayIndex).toBe(headingIndex + 1);
  });

  it("omits the reserved '## Additional Content' heading entirely when additionalContent is empty", () => {
    const withEmpty = joinSections(emptySections(), "");
    expect(withEmpty).not.toContain("Additional Content");
    expect(withEmpty.trimEnd().endsWith("More Information")).toBe(true);
  });

  it("is a pure function with no side effects (repeated calls with same input produce the same output)", () => {
    const sections: AdrSections = {
      ...emptySections(),
      contextAndProblemStatement: "ctx",
      decisionOutcome: "outcome",
    };

    const first = joinSections(sections, "extra");
    const second = joinSections(sections, "extra");

    expect(first).toBe(second);
  });
});

describe("joinSections -> splitSections round trip", () => {
  it("reproduces the original fields exactly when all fields are populated and additionalContent starts with a heading line", () => {
    const sections: AdrSections = {
      contextAndProblemStatement: "Why are we doing this?",
      decisionDrivers: "- driver one\n- driver two",
      consideredOptions: "- option A\n- option B",
      decisionOutcome: "Chosen option A.",
      consequences: "Good, because reasons.",
      confirmation: "Reviewed by team.",
      prosAndConsOfTheOptions: "Option A: - pro\n- con",
      moreInformation: "See link.",
    };
    const additionalContent = "## Legacy Notes\nSome legacy catch-all content.";

    const joined = joinSections(sections, additionalContent);
    const { sections: roundTrippedSections, additionalContent: roundTrippedAdditional } = splitSections(joined);

    expect(roundTrippedSections).toEqual(sections);
    expect(roundTrippedAdditional).toBe(additionalContent);
  });

  it("reproduces the original fields exactly when some fields are empty and additionalContent is empty", () => {
    const sections: AdrSections = {
      ...emptySections(),
      contextAndProblemStatement: "Only context filled in.",
      decisionOutcome: "Only outcome filled in.",
    };
    const additionalContent = "";

    const joined = joinSections(sections, additionalContent);
    const { sections: roundTrippedSections, additionalContent: roundTrippedAdditional } = splitSections(joined);

    expect(roundTrippedSections).toEqual(sections);
    expect(roundTrippedAdditional).toBe(additionalContent);
  });

  it("round trips when every field is empty and additionalContent is empty", () => {
    const joined = joinSections(emptySections(), "");
    const { sections: roundTrippedSections, additionalContent: roundTrippedAdditional } = splitSections(joined);

    expect(roundTrippedSections).toEqual(emptySections());
    expect(roundTrippedAdditional).toBe("");
  });

  it("reproduces additionalContent exactly when it is plain prose with no leading heading line of its own", () => {
    // This is the scenario the reserved '## Additional Content' heading
    // exists to disambiguate: without a heading wrapper, plain prose here
    // would be indistinguishable on re-parse from trailing content of the
    // last canonical section ("More Information").
    const sections: AdrSections = {
      ...emptySections(),
      contextAndProblemStatement: "Why are we doing this?",
      decisionOutcome: "Chosen option A.",
      moreInformation: "See link.",
    };
    const additionalContent = "Legacy free-form prose with no heading at all, just plain text.";

    const joined = joinSections(sections, additionalContent);
    const { sections: roundTrippedSections, additionalContent: roundTrippedAdditional } = splitSections(joined);

    expect(roundTrippedSections).toEqual(sections);
    expect(roundTrippedAdditional).toBe(additionalContent);
  });
});

describe("combinedSectionText", () => {
  it("includes content from all 8 sections and the catch-all", () => {
    const sections: AdrSections = {
      contextAndProblemStatement: "ctx-content",
      decisionDrivers: "drivers-content",
      consideredOptions: "options-content",
      decisionOutcome: "outcome-content",
      consequences: "consequences-content",
      confirmation: "confirmation-content",
      prosAndConsOfTheOptions: "pros-cons-content",
      moreInformation: "more-info-content",
    };
    const additionalContent = "catch-all-content";

    const combined = combinedSectionText(sections, additionalContent);

    expect(combined).toContain("ctx-content");
    expect(combined).toContain("drivers-content");
    expect(combined).toContain("options-content");
    expect(combined).toContain("outcome-content");
    expect(combined).toContain("consequences-content");
    expect(combined).toContain("confirmation-content");
    expect(combined).toContain("pros-cons-content");
    expect(combined).toContain("more-info-content");
    expect(combined).toContain("catch-all-content");
  });

  it("returns a string even when all inputs are empty", () => {
    const combined = combinedSectionText(emptySections(), "");
    expect(typeof combined).toBe("string");
  });
});
