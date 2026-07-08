import { describe, it, expect } from "vitest";
import { MADR_SECTIONS, type AdrSections } from "@adr/shared";
import { FRIENDLY_SECTIONS, friendlySectionName } from "./sectionNames.js";

describe("friendly section names (Req 6.3)", () => {
  it("maps every MADR section key to a friendly name and keeps its canonical heading", () => {
    // One friendly entry per canonical MADR section, in the same order, so the
    // article renders sections in MADR order under plain-language names while
    // still carrying the canonical heading for the subtle tag.
    expect(FRIENDLY_SECTIONS.map((s) => s.key)).toEqual(MADR_SECTIONS.map((s) => s.key));

    for (const section of MADR_SECTIONS) {
      const friendly = FRIENDLY_SECTIONS.find((s) => s.key === section.key);
      expect(friendly).toBeDefined();
      // The canonical MADR heading is preserved verbatim so it can be shown as
      // the subtle tag alongside the friendly name (Req 6.3).
      expect(friendly?.canonicalHeading).toBe(section.heading);
      // The friendly name is plain-language and never the raw canonical heading.
      expect(friendly?.friendlyName).toBeTruthy();
      expect(friendly?.friendlyName).not.toBe(section.heading);
    }
  });

  it("uses the proposal's canonical example friendly name for Context and Problem Statement", () => {
    const context = FRIENDLY_SECTIONS.find((s) => s.key === "contextAndProblemStatement");
    expect(context?.friendlyName).toBe("Why we needed to decide");
    expect(context?.canonicalHeading).toBe("Context and Problem Statement");
  });

  it("exposes a lookup helper returning the friendly name for a section key", () => {
    const keys: (keyof AdrSections)[] = [
      "contextAndProblemStatement",
      "decisionDrivers",
      "consideredOptions",
      "decisionOutcome",
      "consequences",
      "confirmation",
      "prosAndConsOfTheOptions",
      "moreInformation",
    ];
    for (const key of keys) {
      expect(friendlySectionName(key)).toBeTruthy();
    }
  });
});
