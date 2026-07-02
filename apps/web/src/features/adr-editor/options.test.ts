import { describe, it, expect } from "vitest";
import type { OptionRow } from "./options.js";
import { parseOptions, serializeOptions } from "./options.js";

describe("serializeOptions", () => {
  it("emits one considered-options bullet and one pros-and-cons block per row", () => {
    const rows: OptionRow[] = [
      { id: "1", description: "Use Postgres", pros: "Mature\nWidely used", cons: "Heavier ops" },
      { id: "2", description: "Use SQLite", pros: "Simple", cons: "" },
    ];

    const result = serializeOptions(rows);

    expect(result.consideredOptions).toBe("* Use Postgres\n* Use SQLite");
    expect(result.prosAndConsOfTheOptions).toBe(
      [
        "### Use Postgres",
        "* Good, because Mature",
        "* Good, because Widely used",
        "* Bad, because Heavier ops",
        "",
        "### Use SQLite",
        "* Good, because Simple",
      ].join("\n"),
    );
  });

  it("emits only the heading line when both pros and cons are empty", () => {
    const rows: OptionRow[] = [{ id: "1", description: "Use SQLite", pros: "", cons: "" }];

    const result = serializeOptions(rows);

    expect(result.consideredOptions).toBe("* Use SQLite");
    expect(result.prosAndConsOfTheOptions).toBe("### Use SQLite");
  });

  it("excludes a row whose description, pros, and cons are all blank after trimming", () => {
    const rows: OptionRow[] = [
      { id: "1", description: "Use Postgres", pros: "Mature", cons: "" },
      { id: "2", description: "   ", pros: "  \n ", cons: "" },
      { id: "3", description: "Use SQLite", pros: "", cons: "" },
    ];

    const result = serializeOptions(rows);

    expect(result.consideredOptions).toBe("* Use Postgres\n* Use SQLite");
    expect(result.prosAndConsOfTheOptions).toBe(["### Use Postgres", "* Good, because Mature", "", "### Use SQLite"].join("\n"));
  });

  it("does not exclude a row that has a description but empty pros/cons", () => {
    const rows: OptionRow[] = [{ id: "1", description: "Use SQLite", pros: "", cons: "" }];

    const result = serializeOptions(rows);

    expect(result.consideredOptions).toBe("* Use SQLite");
    expect(result.prosAndConsOfTheOptions).toBe("### Use SQLite");
  });

  it("produces empty strings for zero rows", () => {
    expect(serializeOptions([])).toEqual({ consideredOptions: "", prosAndConsOfTheOptions: "" });
  });

  it("replaces a newline embedded in description with a space defensively", () => {
    const rows: OptionRow[] = [{ id: "1", description: "Use\nPostgres", pros: "", cons: "" }];

    const result = serializeOptions(rows);

    expect(result.consideredOptions).toBe("* Use Postgres");
    expect(result.prosAndConsOfTheOptions).toBe("### Use Postgres");
  });
});

describe("parseOptions", () => {
  it("produces zero rows for two empty strings", () => {
    expect(parseOptions("", "")).toEqual([]);
  });

  it("parses multi-line pros/cons into multiple bullets with prefixes stripped", () => {
    const consideredOptions = "* Use Postgres";
    const prosAndConsOfTheOptions = [
      "### Use Postgres",
      "* Good, because Mature",
      "* Good, because Widely used",
      "* Bad, because Heavier ops",
      "* Bad, because More config",
    ].join("\n");

    const rows = parseOptions(consideredOptions, prosAndConsOfTheOptions);

    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Use Postgres");
    expect(rows[0].pros).toBe("Mature\nWidely used");
    expect(rows[0].cons).toBe("Heavier ops\nMore config");
  });

  it("assigns a stable, unique id string to every row", () => {
    const rows = parseOptions("* Use Postgres\n* Use SQLite", "### Use Postgres\n\n### Use SQLite");

    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("degrades gracefully without throwing when there are more considered-options bullets than pros-and-cons blocks", () => {
    const consideredOptions = "* Use Postgres\n* Use SQLite";
    const prosAndConsOfTheOptions = "### Use Postgres\n* Good, because Mature";

    let rows: OptionRow[] = [];
    expect(() => {
      rows = parseOptions(consideredOptions, prosAndConsOfTheOptions);
    }).not.toThrow();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ description: "Use Postgres", pros: "Mature", cons: "" });
    expect(rows[1]).toMatchObject({ description: "Use SQLite", pros: "", cons: "" });
  });

  it("degrades gracefully without throwing when there are more pros-and-cons blocks than considered-options bullets", () => {
    const consideredOptions = "* Use Postgres";
    const prosAndConsOfTheOptions = ["### Use Postgres", "* Good, because Mature", "", "### Use SQLite", "* Good, because Simple"].join(
      "\n",
    );

    let rows: OptionRow[] = [];
    expect(() => {
      rows = parseOptions(consideredOptions, prosAndConsOfTheOptions);
    }).not.toThrow();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ description: "Use Postgres", pros: "Mature", cons: "" });
    expect(rows[1]).toMatchObject({ description: "Use SQLite", pros: "Simple", cons: "" });
  });

  it("never throws on plain prose with no bullets or headings at all, and produces zero rows", () => {
    const proseConsideredOptions = "This is just some free-form text.\nNo bullets here.";
    const proseProsAndCons = "Some notes about options that don't follow the grammar at all.";

    let rows: OptionRow[] = [];
    expect(() => {
      rows = parseOptions(proseConsideredOptions, proseProsAndCons);
    }).not.toThrow();

    expect(rows).toEqual([]);
  });

  it("ignores non-bullet lines within consideredOptions and non-heading lines outside a block", () => {
    const consideredOptions = "Some preamble\n* Use Postgres\nRandom trailing line";
    const prosAndConsOfTheOptions = "Preamble not under a heading\n### Use Postgres\n* Good, because Mature\nNot a bullet line";

    const rows = parseOptions(consideredOptions, prosAndConsOfTheOptions);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ description: "Use Postgres", pros: "Mature", cons: "" });
  });
});

describe("round trip", () => {
  it("reproduces description/pros/cons content exactly for rows produced by serializeOptions", () => {
    const rows: OptionRow[] = [
      { id: "a", description: "Use Postgres", pros: "Mature\nWidely used", cons: "Heavier ops" },
      { id: "b", description: "Use SQLite", pros: "Simple", cons: "Limited concurrency\nNo network access" },
      { id: "c", description: "Use MySQL", pros: "", cons: "" },
    ];

    const serialized = serializeOptions(rows);
    const parsed = parseOptions(serialized.consideredOptions, serialized.prosAndConsOfTheOptions);

    expect(parsed.map(({ description, pros, cons }) => ({ description, pros, cons }))).toEqual(
      rows.map(({ description, pros, cons }) => ({ description, pros, cons })),
    );
  });

  it("drops a fully-blank row before the round trip even begins, so it never reappears from parseOptions", () => {
    const rows: OptionRow[] = [
      { id: "a", description: "Use Postgres", pros: "Mature", cons: "" },
      { id: "b", description: "", pros: "", cons: "" },
    ];

    const serialized = serializeOptions(rows);
    const parsed = parseOptions(serialized.consideredOptions, serialized.prosAndConsOfTheOptions);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ description: "Use Postgres", pros: "Mature", cons: "" });
  });
});
