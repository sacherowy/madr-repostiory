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

describe("parseAdr title resolution", () => {
  it("derives the title from the body's first H1 heading and strips that line from body", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "---",
      "# Some Title",
      "",
      "Body text.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(adr.title).toBe("Some Title");
    expect(adr.body).not.toMatch(/^# Some Title$/m);
    expect(adr.body).toBe("Body text.");
  });

  it("finds the first H1 even when preceded by leading blank lines in the body", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "---",
      "",
      "",
      "# Some Title",
      "",
      "Body text.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(adr.title).toBe("Some Title");
    expect(adr.body).toBe("Body text.");
  });

  it("falls back to the legacy frontmatter title key when no H1 heading exists", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "title: Legacy",
      "---",
      "Body text with no heading.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(adr.title).toBe("Legacy");
    expect(adr.body).toBe("Body text with no heading.");
  });

  it("prefers the body H1 over a legacy frontmatter title when both are present", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "title: Legacy",
      "---",
      "# Body Heading",
      "",
      "Body text.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(adr.title).toBe("Body Heading");
  });

  it("returns an empty string title when neither an H1 heading nor a legacy frontmatter title exists", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "---",
      "Body text with no heading.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(adr.title).toBe("");
    expect(adr.body).toBe("Body text with no heading.");
  });

  it("does not leak a frontmatter-sourced title key onto the returned object beyond Adr.title", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "title: Legacy",
      "---",
      "Body text with no heading.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(Object.keys(adr).filter((key) => key === "title")).toHaveLength(1);
    expect(adr.title).toBe("Legacy");
  });
});

describe("serializeAdr title writing", () => {
  it("never writes a frontmatter title key", () => {
    const adr = {
      id: "ADR-0001",
      status: "accepted" as const,
      date: "2024-01-01",
      title: "Some Title",
      body: "Body text.",
      path: "examples/0001-title.md",
      blobSha: "sha1",
    };

    const serialized = serializeAdr(adr);

    expect(serialized).not.toMatch(/^title:/m);
  });

  it("prepends the title as the body's first-level heading", () => {
    const adr = {
      id: "ADR-0001",
      status: "accepted" as const,
      date: "2024-01-01",
      title: "Some Title",
      body: "Body text.",
      path: "examples/0001-title.md",
      blobSha: "sha1",
    };

    const serialized = serializeAdr(adr);
    const reparsed = parseAdr(serialized, adr.path, adr.blobSha);

    expect(reparsed.title).toBe("Some Title");
    expect(reparsed.body).toBe("Body text.");
  });
});

describe("parseAdr/serializeAdr title round-trip", () => {
  it("preserves title and body content through read-then-write-then-read", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "---",
      "# Some Title",
      "",
      "Body content here.",
      "More body content.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");
    expect(adr.title).toBe("Some Title");
    expect(adr.body).toBe("Body content here.\nMore body content.");

    const serialized = serializeAdr(adr);
    expect(serialized).not.toMatch(/^title:/m);

    const reparsed = parseAdr(serialized, adr.path, adr.blobSha);
    expect(reparsed.title).toBe("Some Title");
    expect(reparsed.body).toBe(adr.body);
  });

  it("round-trips a body with no heading and no legacy title to an empty title", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "---",
      "Body text with no heading.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");
    expect(adr.title).toBe("");

    const serialized = serializeAdr(adr);
    const reparsed = parseAdr(serialized, adr.path, adr.blobSha);

    expect(reparsed.title).toBe("");
    expect(reparsed.body).toBe("Body text with no heading.");
  });

  it("round-trips a legacy frontmatter title to a body H1 with no stray frontmatter title key on next save", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "title: Legacy",
      "---",
      "Body text with no heading.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");
    expect(adr.title).toBe("Legacy");

    const serialized = serializeAdr(adr);
    expect(serialized).not.toMatch(/^title:/m);
    expect(serialized).toMatch(/^# Legacy$/m);

    const reparsed = parseAdr(serialized, adr.path, adr.blobSha);
    expect(reparsed.title).toBe("Legacy");
    expect(reparsed.body).toBe("Body text with no heading.");
  });
});
