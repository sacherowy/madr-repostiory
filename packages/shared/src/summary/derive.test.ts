import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { AdrRelation } from "../types.js";
import type { DerivationContext, DerivationInput } from "./derive.js";
import { parseCanonicalOutcome, resolveShortDescription } from "./derive.js";

/** Fully empty input; individual tests override only what they need. */
function makeInput(overrides: Partial<DerivationInput> = {}): DerivationInput {
  return {
    status: "accepted",
    decisionOutcome: "",
    consideredOptions: "",
    decisionDrivers: "",
    contextAndProblemStatement: "",
    date: "",
    relations: [],
    ...overrides,
  };
}

/** Context whose resolver never finds a title. */
const emptyCtx: DerivationContext = { resolveTitle: () => undefined };

/** Context resolving from a fixed id→title map. */
function ctxWith(titles: Record<string, string>): DerivationContext {
  return { resolveTitle: (id) => titles[id] };
}

describe("parseCanonicalOutcome (requirement 12.1 canonical pattern)", () => {
  it("parses the quoted MADR form: Chosen option: \"X\", because Y", () => {
    expect(parseCanonicalOutcome('Chosen option: "PostgreSQL", because it fits our reporting needs.')).toEqual({
      option: "PostgreSQL",
      because: "it fits our reporting needs.",
    });
  });

  it("parses the unquoted form written by the editor (requirement 9.2 phrasing)", () => {
    expect(parseCanonicalOutcome("Chosen option: PostgreSQL, because it fits our reporting needs.")).toEqual({
      option: "PostgreSQL",
      because: "it fits our reporting needs.",
    });
  });

  it("parses the bold-markdown variant used in the approved proposal: **Chosen option: X**, because Y", () => {
    expect(parseCanonicalOutcome("**Chosen option: PostgreSQL**, because we already have the skills in-house.")).toEqual({
      option: "PostgreSQL",
      because: "we already have the skills in-house.",
    });
  });

  it("parses a bold option token: Chosen option: **X**, because Y", () => {
    expect(parseCanonicalOutcome("Chosen option: **PostgreSQL**, because it works.")).toEqual({
      option: "PostgreSQL",
      because: "it works.",
    });
  });

  it("parses an option with no because clause (fixture form: 'Chosen option: Postgres')", () => {
    expect(parseCanonicalOutcome("Chosen option: Postgres")).toEqual({ option: "Postgres" });
  });

  it("only reads the first line, ignoring trailing section prose", () => {
    expect(
      parseCanonicalOutcome("Chosen option: Postgres, because it scales.\n\nMongoDB is documented for the record."),
    ).toEqual({ option: "Postgres", because: "it scales." });
  });

  it("returns null when the text does not match the canonical pattern", () => {
    expect(parseCanonicalOutcome("We will use Postgres going forward.")).toBeNull();
    expect(parseCanonicalOutcome("Chosen option A.")).toBeNull();
    expect(parseCanonicalOutcome("")).toBeNull();
    expect(parseCanonicalOutcome("   ")).toBeNull();
  });

  it("returns null when the option itself is empty", () => {
    expect(parseCanonicalOutcome("Chosen option: , because reasons")).toBeNull();
  });
});

describe("summary precedence (requirement 11.2)", () => {
  it("uses the author summary verbatim with source 'summary' whenever it is non-blank", () => {
    const result = resolveShortDescription(
      makeInput({
        summary: "We picked Postgres for reporting.",
        status: "accepted",
        decisionOutcome: "Chosen option: MySQL, because nobody read this.",
      }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "We picked Postgres for reporting.", source: "summary" });
  });

  it("trims surrounding whitespace from the author summary", () => {
    const result = resolveShortDescription(makeInput({ summary: "  Neat summary.  " }), emptyCtx);
    expect(result).toEqual({ text: "Neat summary.", source: "summary" });
  });

  it("treats a whitespace-only summary as absent and falls back to derivation", () => {
    const result = resolveShortDescription(
      makeInput({ summary: "   ", status: "accepted", decisionOutcome: "Chosen option: Postgres, because it scales." }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "We chose Postgres — it scales.", source: "derived" });
  });
});

describe("Decided derivation (requirement 12.1)", () => {
  it("renders 'We chose <option> — <reason>' from a canonical outcome", () => {
    const result = resolveShortDescription(
      makeInput({ status: "accepted", decisionOutcome: 'Chosen option: "Postgres", because it scales with our data.' }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "We chose Postgres — it scales with our data.", source: "derived" });
  });

  it("renders 'We chose <option>' when the canonical outcome has no because clause", () => {
    const result = resolveShortDescription(
      makeInput({ status: "accepted", decisionOutcome: "Chosen option: Postgres" }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "We chose Postgres", source: "derived" });
  });

  it("falls back to the first sentence of the outcome when the pattern does not match", () => {
    const result = resolveShortDescription(
      makeInput({
        status: "accepted",
        decisionOutcome: "We standardise on Postgres. Migration starts next quarter.",
      }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "We standardise on Postgres.", source: "derived" });
  });

  it("falls through to the context first sentence when the outcome is empty (postcondition: non-empty text when any source is non-empty)", () => {
    const result = resolveShortDescription(
      makeInput({
        status: "accepted",
        decisionOutcome: "",
        contextAndProblemStatement: "We need a database. It must support reporting.",
      }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "We need a database.", source: "derived" });
  });
});

describe("In-discussion derivation (requirement 12.2)", () => {
  it("weighs the first two option titles from the bullet-list grammar", () => {
    const result = resolveShortDescription(
      makeInput({ status: "proposed", consideredOptions: "* PostgreSQL\n* MongoDB" }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "Weighing PostgreSQL against MongoDB", source: "derived" });
  });

  it("appends '(+N more)' when more than two options are considered", () => {
    const result = resolveShortDescription(
      makeInput({ status: "proposed", consideredOptions: "* PostgreSQL\n* MongoDB\n* DynamoDB\n* SQLite" }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "Weighing PostgreSQL against MongoDB (+2 more)", source: "derived" });
  });

  it("appends the first decision driver as a key concern", () => {
    const result = resolveShortDescription(
      makeInput({
        status: "proposed",
        consideredOptions: "* PostgreSQL\n* MongoDB",
        decisionDrivers: "* Reporting flexibility\n* Team skills",
      }),
      emptyCtx,
    );
    expect(result).toEqual({
      text: "Weighing PostgreSQL against MongoDB. Key concern: Reporting flexibility",
      source: "derived",
    });
  });

  it("handles a single considered option", () => {
    const result = resolveShortDescription(
      makeInput({ status: "proposed", consideredOptions: "* PostgreSQL" }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "Considering PostgreSQL", source: "derived" });
  });

  it("recognises dash bullets, option headings, and bold titles", () => {
    const result = resolveShortDescription(
      makeInput({ status: "proposed", consideredOptions: "- **PostgreSQL**\n\n### MongoDB\n" }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "Weighing PostgreSQL against MongoDB", source: "derived" });
  });

  it("falls through to the generic fallback when no option titles are found", () => {
    const result = resolveShortDescription(
      makeInput({
        status: "proposed",
        consideredOptions: "",
        contextAndProblemStatement: "We need a database. Options are being gathered.",
      }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "We need a database.", source: "derived" });
  });
});

describe("Replaced derivation (requirement 12.3)", () => {
  const relations: AdrRelation[] = [
    { type: "relates-to", target: "0002-other" },
    { type: "superseded-by", target: "0007-new-db" },
  ];

  it("renders 'Replaced by <title> on <date>' from the superseded-by relation via the title resolver", () => {
    const result = resolveShortDescription(
      makeInput({ status: "superseded", relations, date: "2026-07-01" }),
      ctxWith({ "0007-new-db": "Use CockroachDB" }),
    );
    expect(result).toEqual({ text: "Replaced by Use CockroachDB on 2026-07-01", source: "derived" });
  });

  it("omits the date suffix when the date is empty", () => {
    const result = resolveShortDescription(
      makeInput({ status: "superseded", relations, date: "" }),
      ctxWith({ "0007-new-db": "Use CockroachDB" }),
    );
    expect(result).toEqual({ text: "Replaced by Use CockroachDB", source: "derived" });
  });

  it("applies the same rule to Retired decisions that have a replacement (12.4's 'Retired without a replacement' carve-out)", () => {
    const result = resolveShortDescription(
      makeInput({ status: "deprecated", relations, date: "2026-07-01" }),
      ctxWith({ "0007-new-db": "Use CockroachDB" }),
    );
    expect(result).toEqual({ text: "Replaced by Use CockroachDB on 2026-07-01", source: "derived" });
  });

  it("falls through to the generic fallback when the title cannot be resolved", () => {
    const result = resolveShortDescription(
      makeInput({
        status: "superseded",
        relations,
        date: "2026-07-01",
        decisionOutcome: "Superseded by a newer decision. See relations.",
      }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "Superseded by a newer decision.", source: "derived" });
  });

  it("falls through to the generic fallback when there is no superseded-by relation", () => {
    const result = resolveShortDescription(
      makeInput({
        status: "superseded",
        relations: [{ type: "relates-to", target: "0002-other" }],
        contextAndProblemStatement: "Original context here. More detail follows.",
      }),
      ctxWith({ "0002-other": "Unrelated" }),
    );
    expect(result).toEqual({ text: "Original context here.", source: "derived" });
  });
});

describe("generic fallback (requirement 12.4)", () => {
  it("uses the first sentence of the outcome for Rejected decisions", () => {
    const result = resolveShortDescription(
      makeInput({
        status: "rejected",
        decisionOutcome: "Rejected in favour of the status quo. Revisit next year.",
      }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "Rejected in favour of the status quo.", source: "derived" });
  });

  it("uses the first sentence of the context when the outcome is empty (Retired without a replacement)", () => {
    const result = resolveShortDescription(
      makeInput({
        status: "deprecated",
        contextAndProblemStatement: "We once needed a message bus! That need has passed.",
      }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "We once needed a message bus!", source: "derived" });
  });

  it("collapses newlines when taking the first sentence", () => {
    const result = resolveShortDescription(
      makeInput({
        status: "rejected",
        decisionOutcome: "Rejected because the cost\nwas too high. Full stop.",
      }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "Rejected because the cost was too high.", source: "derived" });
  });

  it("uses the whole (whitespace-normalised) text when there is no sentence terminator", () => {
    const result = resolveShortDescription(
      makeInput({ status: "rejected", decisionOutcome: "Rejected without ceremony" }),
      emptyCtx,
    );
    expect(result).toEqual({ text: "Rejected without ceremony", source: "derived" });
  });
});

describe("empty-input tolerance (total function)", () => {
  it("returns an empty derived result when every source field is empty, without throwing", () => {
    expect(resolveShortDescription(makeInput(), emptyCtx)).toEqual({ text: "", source: "derived" });
  });

  it("never throws for any status when all fields are empty", () => {
    const statuses = ["proposed", "accepted", "deprecated", "superseded", "rejected"] as const;
    for (const status of statuses) {
      expect(resolveShortDescription(makeInput({ status }), emptyCtx)).toEqual({ text: "", source: "derived" });
    }
  });
});

describe("purity (requirement 12.5)", () => {
  it("imports nothing beyond package-local types and performs no I/O", () => {
    const source = readFileSync(fileURLToPath(new URL("./derive.ts", import.meta.url)), "utf8");
    const importSpecifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    for (const specifier of importSpecifiers) {
      expect(specifier).toMatch(/^\.\.?\/(types|vocabulary)\.js$/);
    }
    expect(source).not.toMatch(/\b(fetch|require|process|XMLHttpRequest)\s*\(/);
    expect(source).not.toContain("node:");
  });
});
