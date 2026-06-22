import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SearchDoc } from "@adr/core";
import { SqliteSearchIndex } from "./sqliteSearchIndex.js";

describe("SqliteSearchIndex", () => {
  let dir: string;
  let dbPath: string;
  let index: SqliteSearchIndex;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "adr-search-"));
    dbPath = join(dir, "test.sqlite");
    index = new SqliteSearchIndex(dbPath);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function doc(overrides: Partial<SearchDoc> = {}): SearchDoc {
    return {
      id: "0001",
      title: "Use Postgres",
      body: "We decided to use Postgres for persistence.",
      tags: ["database"],
      ...overrides,
    };
  }

  it("finds a doc by a word in its title after upsert", () => {
    index.upsert(doc({ id: "0001", title: "Use Postgres for storage" }));

    const hits = index.search("Postgres");

    expect(hits.map((h) => h.id)).toContain("0001");
  });

  it("re-adding the same id never produces duplicate hits for that id", () => {
    index.upsert(doc({ id: "0001", title: "Use Postgres for storage" }));
    index.upsert(doc({ id: "0001", title: "Use Postgres for storage, revised" }));
    index.upsert(doc({ id: "0001", title: "Use Postgres for storage, revised again" }));

    const hits = index.search("Postgres");

    const matchingHits = hits.filter((h) => h.id === "0001");
    expect(matchingHits).toHaveLength(1);
  });

  it("removes an entry so it is no longer returned by search", () => {
    index.upsert(doc({ id: "0001", title: "Use Postgres for storage" }));
    index.upsert(doc({ id: "0002", title: "Use MySQL for storage" }));

    index.remove("0001");
    const hits = index.search("Postgres");

    expect(hits.map((h) => h.id)).not.toContain("0001");
  });

  it("ranks a title match above a body-only match for the same search word", () => {
    // "kubernetes" appears in the title of 0002, and only in the body of 0001.
    index.upsert(
      doc({
        id: "0001",
        title: "Use Postgres for storage",
        body: "Some context that mentions kubernetes only in passing.",
        tags: ["database"],
      })
    );
    index.upsert(
      doc({
        id: "0002",
        title: "Adopt kubernetes for orchestration",
        body: "We will run all services on a managed cluster.",
        tags: ["infra"],
      })
    );

    const hits = index.search("kubernetes");

    expect(hits.map((h) => h.id)).toEqual(["0002", "0001"]);
  });

  it("respects an optional limit parameter", () => {
    index.upsert(doc({ id: "0001", title: "alpha shared-term decision" }));
    index.upsert(doc({ id: "0002", title: "beta shared-term decision" }));
    index.upsert(doc({ id: "0003", title: "gamma shared-term decision" }));

    const hits = index.search("shared-term", 2);

    expect(hits).toHaveLength(2);
  });

  it("matches a term that only appears in tags", () => {
    index.upsert(doc({ id: "0001", title: "Use Postgres", tags: ["scalability"] }));

    const hits = index.search("scalability");

    expect(hits.map((h) => h.id)).toContain("0001");
  });

  it("returns an empty array when nothing matches", () => {
    index.upsert(doc({ id: "0001", title: "Use Postgres for storage" }));

    const hits = index.search("nonexistentterm");

    expect(hits).toEqual([]);
  });

  it("ids() returns every upserted id", () => {
    index.upsert(doc({ id: "0001", title: "Use Postgres for storage" }));
    index.upsert(doc({ id: "0002", title: "Use MySQL for storage" }));
    index.upsert(doc({ id: "0003", title: "Use SQLite for storage" }));

    expect(index.ids().sort()).toEqual(["0001", "0002", "0003"]);
  });

  it("ids() no longer includes an id after remove(id) was called on it", () => {
    index.upsert(doc({ id: "0001", title: "Use Postgres for storage" }));
    index.upsert(doc({ id: "0002", title: "Use MySQL for storage" }));

    index.remove("0001");

    expect(index.ids()).not.toContain("0001");
    expect(index.ids()).toContain("0002");
  });
});
