import { describe, it, expect } from "vitest";
import { parseCanonicalOutcome, type AdrStatus } from "@adr/shared";
import { buildChosenOutcome, isOutcomeLocked } from "./outcome.js";

/**
 * Pure lock/prefill logic for the compose form's Decision Outcome (Req 9.2-9.4).
 * No React, no backend — these assertions exercise the two pure functions
 * directly, including the round-trip through the shared canonical parser.
 */
describe("buildChosenOutcome (Req 9.2 canonical prefill)", () => {
  it("writes the canonical 'Chosen option: X, because Y' phrasing", () => {
    expect(buildChosenOutcome("PostgreSQL", "it fits our reporting needs")).toBe(
      "Chosen option: PostgreSQL, because it fits our reporting needs",
    );
  });

  it("omits the ', because' clause when no reason is supplied", () => {
    expect(buildChosenOutcome("PostgreSQL")).toBe("Chosen option: PostgreSQL");
    expect(buildChosenOutcome("PostgreSQL", "")).toBe("Chosen option: PostgreSQL");
    expect(buildChosenOutcome("PostgreSQL", "   ")).toBe("Chosen option: PostgreSQL");
  });

  it("trims the option title and reason", () => {
    expect(buildChosenOutcome("  PostgreSQL  ", "  it scales  ")).toBe(
      "Chosen option: PostgreSQL, because it scales",
    );
  });

  it("round-trips through parseCanonicalOutcome with a reason (Req 9.2)", () => {
    const outcome = buildChosenOutcome("PostgreSQL", "it scales with our data");
    expect(parseCanonicalOutcome(outcome)).toEqual({
      option: "PostgreSQL",
      because: "it scales with our data",
    });
  });

  it("round-trips through parseCanonicalOutcome without a reason (Req 9.2)", () => {
    const outcome = buildChosenOutcome("SQLite");
    expect(parseCanonicalOutcome(outcome)).toEqual({ option: "SQLite" });
  });

  it("round-trips a multi-word option title", () => {
    const outcome = buildChosenOutcome("Managed Postgres service", "less operational load");
    expect(parseCanonicalOutcome(outcome)).toEqual({
      option: "Managed Postgres service",
      because: "less operational load",
    });
  });
});

describe("isOutcomeLocked (Req 9.3-9.4 lock matrix)", () => {
  const statuses: AdrStatus[] = ["proposed", "accepted", "deprecated", "superseded", "rejected"];

  it("locks only while In discussion (proposed) with no chosen option (Req 9.3)", () => {
    expect(isOutcomeLocked("proposed", false)).toBe(true);
  });

  it("unlocks as soon as an option is chosen, whatever the status (Req 9.4)", () => {
    for (const status of statuses) {
      expect(isOutcomeLocked(status, true)).toBe(false);
    }
  });

  it("unlocks when the status is Decided (accepted) even with no chosen option (Req 9.4)", () => {
    expect(isOutcomeLocked("accepted", false)).toBe(false);
  });

  it("leaves every non-proposed status unlocked without a chosen option (Req 9.3 scope)", () => {
    expect(isOutcomeLocked("accepted", false)).toBe(false);
    expect(isOutcomeLocked("deprecated", false)).toBe(false);
    expect(isOutcomeLocked("superseded", false)).toBe(false);
    expect(isOutcomeLocked("rejected", false)).toBe(false);
  });

  it("covers the full status x chosen matrix: locked iff proposed && !chosen", () => {
    for (const status of statuses) {
      for (const hasChosen of [false, true]) {
        const expected = status === "proposed" && !hasChosen;
        expect(isOutcomeLocked(status, hasChosen)).toBe(expected);
      }
    }
  });
});
