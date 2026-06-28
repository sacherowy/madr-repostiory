import { describe, expect, it } from "vitest";
import { parseAdr, serializeAdr } from "./parse.js";

describe("parseAdr decisionMakers resolution", () => {
  it("reads decisionMakers from the canonical decision-makers frontmatter key", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "decision-makers:",
      "  - Alice",
      "---",
      "# Title",
      "",
      "Body text.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(adr.decisionMakers).toEqual(["Alice"]);
  });

  it("falls back to the legacy deciders key when decision-makers is absent", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "deciders:",
      "  - Alice",
      "---",
      "# Title",
      "",
      "Body text.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(adr.decisionMakers).toEqual(["Alice"]);
  });

  it("prefers decision-makers over legacy deciders when both are present", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "decision-makers:",
      "  - Canonical",
      "deciders:",
      "  - Legacy",
      "---",
      "# Title",
      "",
      "Body text.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(adr.decisionMakers).toEqual(["Canonical"]);
  });

  it("leaves decisionMakers undefined when neither key is present", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "---",
      "# Title",
      "",
      "Body text.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(adr.decisionMakers).toBeUndefined();
  });
});

describe("serializeAdr decisionMakers writing", () => {
  it("writes decision-makers and never deciders when decisionMakers is defined", () => {
    const adr = {
      id: "ADR-0001",
      status: "accepted" as const,
      date: "2024-01-01",
      decisionMakers: ["Alice"],
      title: "Title",
      body: "Body text.",
      path: "examples/0001-title.md",
      blobSha: "sha1",
    };

    const serialized = serializeAdr(adr);

    expect(serialized).toContain("decision-makers");
    expect(serialized).not.toMatch(/^deciders:/m);
    expect(serialized).not.toContain("deciders:");
  });

  it("round-trips a legacy deciders file to canonical decision-makers on next save", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "deciders:",
      "  - Alice",
      "---",
      "# Title",
      "",
      "Body text.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");
    const serialized = serializeAdr(adr);

    expect(serialized).toContain("decision-makers");
    expect(serialized).not.toContain("deciders:");

    const reparsed = parseAdr(serialized, adr.path, adr.blobSha);
    expect(reparsed.decisionMakers).toEqual(["Alice"]);
  });

  it("never emits a deciders key even when decisionMakers is undefined", () => {
    const adr = {
      id: "ADR-0001",
      status: "accepted" as const,
      date: "2024-01-01",
      title: "Title",
      body: "Body text.",
      path: "examples/0001-title.md",
      blobSha: "sha1",
    };

    const serialized = serializeAdr(adr);

    expect(serialized).not.toContain("deciders:");
  });
});
