import { describe, it, expect } from "vitest";
import type { AdrStatus, RelationType } from "./types.js";
import type { RelationDirection } from "./vocabulary.js";
import { STATUS_LABELS, relationLabel, PEOPLE_LABELS } from "./vocabulary.js";

describe("STATUS_LABELS (requirement 1.1)", () => {
  it("maps every stored status to its exact plain-language label", () => {
    expect(STATUS_LABELS).toEqual({
      proposed: "In discussion",
      accepted: "Decided",
      deprecated: "Retired",
      superseded: "Replaced",
      rejected: "Rejected",
    });
  });

  it("covers all five AdrStatus values and nothing else", () => {
    const statuses: AdrStatus[] = [
      "proposed",
      "accepted",
      "deprecated",
      "superseded",
      "rejected",
    ];
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([...statuses].sort());
  });
});

describe("relationLabel (requirement 1.2)", () => {
  it("labels outgoing relations with the exact plain-language strings", () => {
    expect(relationLabel("supersedes", "outgoing")).toBe("Replaces");
    expect(relationLabel("superseded-by", "outgoing")).toBe("Replaced by");
    expect(relationLabel("depends-on", "outgoing")).toBe("Builds on");
    expect(relationLabel("relates-to", "outgoing")).toBe("Related to");
    expect(relationLabel("conflicts-with", "outgoing")).toBe("Conflicts with");
  });

  it("flips the supersedes pair for incoming relations", () => {
    expect(relationLabel("supersedes", "incoming")).toBe("Replaced by");
    expect(relationLabel("superseded-by", "incoming")).toBe("Replaces");
  });

  it("keeps symmetric relation types direction-independent", () => {
    const symmetric: RelationType[] = ["depends-on", "relates-to", "conflicts-with"];
    const directions: RelationDirection[] = ["outgoing", "incoming"];
    for (const type of symmetric) {
      const labels = directions.map((direction) => relationLabel(type, direction));
      expect(labels[0]).toBe(labels[1]);
    }
    expect(relationLabel("depends-on", "incoming")).toBe("Builds on");
    expect(relationLabel("relates-to", "incoming")).toBe("Related to");
    expect(relationLabel("conflicts-with", "incoming")).toBe("Conflicts with");
  });
});

describe("PEOPLE_LABELS (requirement 1.5)", () => {
  it("maps the three stored people fields to their exact plain-language labels", () => {
    expect(PEOPLE_LABELS).toEqual({
      decisionMakers: "Decision owner",
      consulted: "Input from",
      informed: "Kept informed",
    });
  });
});

describe("barrel export (design File Structure Plan)", () => {
  it("re-exports the vocabulary through the package barrel", async () => {
    const barrel = await import("./index.js");
    expect(barrel.STATUS_LABELS).toBe(STATUS_LABELS);
    expect(barrel.relationLabel).toBe(relationLabel);
    expect(barrel.PEOPLE_LABELS).toBe(PEOPLE_LABELS);
  });
});
