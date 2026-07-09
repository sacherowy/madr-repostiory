import { describe, it, expect } from "vitest";
import type { PersonRow } from "./people.js";
import { rowsFromStakeholders, stakeholdersFromRows } from "./people.js";

describe("rowsFromStakeholders", () => {
  it("produces one row per name, in order: decisionMakers, then consulted, then informed", () => {
    const rows = rowsFromStakeholders(["Alice", "Bob"], ["Carol"], ["Dave", "Erin"]);

    expect(rows).toHaveLength(5);
    expect(rows.map((r) => [r.name, r.role])).toEqual([
      ["Alice", "Decision Maker"],
      ["Bob", "Decision Maker"],
      ["Carol", "Consulted"],
      ["Dave", "Informed"],
      ["Erin", "Informed"],
    ]);
  });

  it("assigns a stable, unique id string to every row", () => {
    const rows = rowsFromStakeholders(["Alice"], ["Bob"], ["Carol"]);

    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("produces zero rows for three empty arrays", () => {
    expect(rowsFromStakeholders([], [], [])).toEqual([]);
  });
});

describe("stakeholdersFromRows", () => {
  it("groups row names back into decisionMakers/consulted/informed arrays by role", () => {
    const rows: PersonRow[] = [
      { id: "1", name: "Alice", role: "Decision Maker" },
      { id: "2", name: "Bob", role: "Decision Maker" },
      { id: "3", name: "Carol", role: "Consulted" },
      { id: "4", name: "Dave", role: "Informed" },
    ];

    expect(stakeholdersFromRows(rows)).toEqual({
      decisionMakers: ["Alice", "Bob"],
      consulted: ["Carol"],
      informed: ["Dave"],
    });
  });

  it("excludes rows whose trimmed name is blank", () => {
    const rows: PersonRow[] = [
      { id: "1", name: "Alice", role: "Decision Maker" },
      { id: "2", name: "   ", role: "Decision Maker" },
      { id: "3", name: "", role: "Consulted" },
      { id: "4", name: "Dave", role: "Informed" },
    ];

    expect(stakeholdersFromRows(rows)).toEqual({
      decisionMakers: ["Alice"],
      consulted: [],
      informed: ["Dave"],
    });
  });

  it("produces empty arrays for zero rows", () => {
    expect(stakeholdersFromRows([])).toEqual({
      decisionMakers: [],
      consulted: [],
      informed: [],
    });
  });
});

describe("round trip", () => {
  it("reproduces the original arrays for a full populated round trip", () => {
    const decisionMakers = ["Alice", "Bob"];
    const consulted = ["Carol"];
    const informed = ["Dave", "Erin"];

    const rows = rowsFromStakeholders(decisionMakers, consulted, informed);
    const result = stakeholdersFromRows(rows);

    expect(result).toEqual({ decisionMakers, consulted, informed });
  });
});
