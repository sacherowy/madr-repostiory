import { describe, expect, it } from "vitest";
import type { AdrSections } from "@adr/shared";
import { parseAdr, serializeAdr } from "./parse.js";

/** All 8 MADR section fields empty, for spreading into test fixtures that
 * only care about a subset of fields. */
const emptySections: AdrSections = {
  contextAndProblemStatement: "",
  decisionDrivers: "",
  consideredOptions: "",
  decisionOutcome: "",
  consequences: "",
  confirmation: "",
  prosAndConsOfTheOptions: "",
  moreInformation: "",
};

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
      ...emptySections,
      additionalContent: "Body text.",
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
      ...emptySections,
      additionalContent: "Body text.",
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
    expect(adr.additionalContent).not.toMatch(/^# Some Title$/m);
    expect(adr.additionalContent).toBe("Body text.");
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
    expect(adr.additionalContent).toBe("Body text.");
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
    expect(adr.additionalContent).toBe("Body text with no heading.");
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
    expect(adr.additionalContent).toBe("Body text with no heading.");
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
      ...emptySections,
      additionalContent: "Body text.",
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
      ...emptySections,
      additionalContent: "Body text.",
      path: "examples/0001-title.md",
      blobSha: "sha1",
    };

    const serialized = serializeAdr(adr);
    const reparsed = parseAdr(serialized, adr.path, adr.blobSha);

    expect(reparsed.title).toBe("Some Title");
    expect(reparsed.additionalContent).toBe("Body text.");
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
    expect(adr.additionalContent).toBe("Body content here.\nMore body content.");

    const serialized = serializeAdr(adr);
    expect(serialized).not.toMatch(/^title:/m);

    const reparsed = parseAdr(serialized, adr.path, adr.blobSha);
    expect(reparsed.title).toBe("Some Title");
    expect(reparsed.additionalContent).toBe(adr.additionalContent);
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
    expect(reparsed.additionalContent).toBe("Body text with no heading.");
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
    expect(reparsed.additionalContent).toBe("Body text with no heading.");
  });
});

describe("parseAdr MADR section splitting", () => {
  it("populates the matching section fields from body headings and leaves the rest empty", () => {
    const raw = [
      "---",
      "id: ADR-0001",
      "status: accepted",
      "date: 2024-01-01",
      "---",
      "# Some Title",
      "",
      "## Context and Problem Statement",
      "We need to decide something.",
      "",
      "## Decision Outcome",
      "We chose option A.",
    ].join("\n");

    const adr = parseAdr(raw, "examples/0001-title.md", "sha1");

    expect(adr.contextAndProblemStatement).toBe("We need to decide something.\n");
    expect(adr.decisionOutcome).toBe("We chose option A.");
    expect(adr.decisionDrivers).toBe("");
    expect(adr.consideredOptions).toBe("");
    expect(adr.consequences).toBe("");
    expect(adr.confirmation).toBe("");
    expect(adr.prosAndConsOfTheOptions).toBe("");
    expect(adr.moreInformation).toBe("");
    expect(adr.additionalContent).toBe("");
  });

  it("routes non-MADR-heading content (e.g. a legacy free-form body) entirely into additionalContent", () => {
    const adr = parseAdr(EXAMPLE_FIXTURE_RAW, "examples/0001-uzycie-gita-jako-zrodla-prawdy.md", "sha1");

    expect(adr.title).toBe("Użycie gita jako źródła prawdy dla ADR");
    expect(adr.contextAndProblemStatement).toBe("");
    expect(adr.decisionDrivers).toBe("");
    expect(adr.consideredOptions).toBe("");
    expect(adr.decisionOutcome).toBe("");
    expect(adr.consequences).toBe("");
    expect(adr.confirmation).toBe("");
    expect(adr.prosAndConsOfTheOptions).toBe("");
    expect(adr.moreInformation).toBe("");
    expect(adr.additionalContent).toContain("## Kontekst");
    expect(adr.additionalContent).toContain("## Decyzja");
    expect(adr.additionalContent).toContain("## Konsekwencje");
  });
});

describe("parseAdr/serializeAdr MADR section round-trip", () => {
  it("reproduces all eight section fields, additionalContent, and title through write-then-read", () => {
    const adr = {
      id: "ADR-0001",
      status: "accepted" as const,
      date: "2024-01-01",
      title: "Some Title",
      contextAndProblemStatement: "Context text.",
      decisionDrivers: "Driver text.",
      consideredOptions: "Option text.",
      decisionOutcome: "Outcome text.",
      consequences: "Consequence text.",
      confirmation: "Confirmation text.",
      prosAndConsOfTheOptions: "Pros and cons text.",
      moreInformation: "More info text.",
      additionalContent: "Extra unmapped content.",
      path: "examples/0001-title.md",
      blobSha: "sha1",
    };

    const serialized = serializeAdr(adr);
    const reparsed = parseAdr(serialized, adr.path, adr.blobSha);

    expect(reparsed.title).toBe(adr.title);
    expect(reparsed.contextAndProblemStatement).toBe(adr.contextAndProblemStatement);
    expect(reparsed.decisionDrivers).toBe(adr.decisionDrivers);
    expect(reparsed.consideredOptions).toBe(adr.consideredOptions);
    expect(reparsed.decisionOutcome).toBe(adr.decisionOutcome);
    expect(reparsed.consequences).toBe(adr.consequences);
    expect(reparsed.confirmation).toBe(adr.confirmation);
    expect(reparsed.prosAndConsOfTheOptions).toBe(adr.prosAndConsOfTheOptions);
    expect(reparsed.moreInformation).toBe(adr.moreInformation);
    expect(reparsed.additionalContent).toBe(adr.additionalContent);
  });

  it("reproduces all eight section fields and additionalContent when several are empty", () => {
    const adr = {
      id: "ADR-0001",
      status: "accepted" as const,
      date: "2024-01-01",
      title: "Some Title",
      ...emptySections,
      contextAndProblemStatement: "Only this section is filled in.",
      additionalContent: "",
      path: "examples/0001-title.md",
      blobSha: "sha1",
    };

    const serialized = serializeAdr(adr);
    const reparsed = parseAdr(serialized, adr.path, adr.blobSha);

    expect(reparsed.title).toBe(adr.title);
    expect(reparsed.contextAndProblemStatement).toBe(adr.contextAndProblemStatement);
    expect(reparsed.decisionDrivers).toBe("");
    expect(reparsed.consideredOptions).toBe("");
    expect(reparsed.decisionOutcome).toBe("");
    expect(reparsed.consequences).toBe("");
    expect(reparsed.confirmation).toBe("");
    expect(reparsed.prosAndConsOfTheOptions).toBe("");
    expect(reparsed.moreInformation).toBe("");
    expect(reparsed.additionalContent).toBe("");
  });
});

/** Mirrors examples/0001-uzycie-gita-jako-zrodla-prawdy.md: a real committed
 * fixture whose body uses Polish, non-MADR headings (`## Kontekst`,
 * `## Decyzja`, `## Konsekwencje`) instead of the canonical MADR section
 * headings, exercising the documented fallback where none of the 8 section
 * fields match and all body content lands in `additionalContent`. */
const EXAMPLE_FIXTURE_RAW = [
  "---",
  'id: "0001"',
  "status: accepted",
  "date: 2026-06-17",
  "decision-makers: [pawel]",
  "tags: [architecture, storage]",
  "relations:",
  "  - type: relates-to",
  '    target: "0002"',
  "---",
  "",
  "# Użycie gita jako źródła prawdy dla ADR",
  "",
  "## Kontekst",
  "Aplikacja zarządza ADR-ami i potrzebuje wersjonowania, historii oraz porównań.",
  "",
  "## Decyzja",
  "Trzymamy ADR-y jako pliki Markdown z frontmatterem YAML w repozytorium git.",
  "Git jest jedynym źródłem prawdy; SQLite pełni rolę wtórnej projekcji do indeksowania",
  "(cache embeddingów, wyszukiwanie), zawsze odtwarzalnej przez `pnpm reindex`.",
  "",
  "## Konsekwencje",
  "- Pełna historia i diff za darmo z gita.",
  "- Brak stanu autorytatywnego poza repo → łatwy backup i migracja.",
  "- Współbieżne zapisy wymagają optymistycznej kontroli po SHA blobu.",
  "",
].join("\n");
