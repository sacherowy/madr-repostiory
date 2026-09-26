import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { JudgmentKey } from "@adr/core";
import { SqliteJudgmentStore } from "./sqliteJudgmentStore.js";
import { SqliteSummaryStore } from "./sqliteSummaryStore.js";

const key = (overrides: Partial<JudgmentKey> = {}): JudgmentKey => ({
  targetBlobSha: "sha-target",
  candidateBlobSha: "sha-candidate",
  judgmentVersion: "jev-1#1",
  ...overrides,
});

describe("SqliteJudgmentStore", () => {
  let dir: string;
  let dbPath: string;
  let store: SqliteJudgmentStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "adr-judgment-"));
    dbPath = join(dir, "test.sqlite");
    store = new SqliteJudgmentStore(dbPath);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null for a key that was never stored", () => {
    expect(store.get(key())).toBeNull();
  });

  it("returns the stored judgment after set", () => {
    store.set(key(), { probability: 0.82, relation: "duplicate" });

    expect(store.get(key())).toEqual({ probability: 0.82, relation: "duplicate" });
  });

  it("accepts the inclusive probability bounds 0 and 1", () => {
    store.set(key({ candidateBlobSha: "zero" }), { probability: 0, relation: "unrelated" });
    store.set(key({ candidateBlobSha: "one" }), { probability: 1, relation: "duplicate" });

    expect(store.get(key({ candidateBlobSha: "zero" }))).toEqual({ probability: 0, relation: "unrelated" });
    expect(store.get(key({ candidateBlobSha: "one" }))).toEqual({ probability: 1, relation: "duplicate" });
  });

  it("replaces the judgment when set is called again for the same key", () => {
    store.set(key(), { probability: 0.2, relation: "unrelated" });
    store.set(key(), { probability: 0.9, relation: "supersedes" });

    expect(store.get(key())).toEqual({ probability: 0.9, relation: "supersedes" });
  });

  it("isolates entries by judgment version", () => {
    store.set(key({ judgmentVersion: "jev-1#1" }), { probability: 0.3, relation: "unrelated" });

    expect(store.get(key({ judgmentVersion: "jev-1#2" }))).toBeNull();
    expect(store.get(key({ judgmentVersion: "jev-2#1" }))).toBeNull();

    store.set(key({ judgmentVersion: "jev-1#2" }), { probability: 0.7, relation: "conflicts" });

    expect(store.get(key({ judgmentVersion: "jev-1#1" }))).toEqual({ probability: 0.3, relation: "unrelated" });
    expect(store.get(key({ judgmentVersion: "jev-1#2" }))).toEqual({ probability: 0.7, relation: "conflicts" });
  });

  it("treats keys as directional: (A, B) and (B, A) are distinct entries", () => {
    store.set(key({ targetBlobSha: "sha-a", candidateBlobSha: "sha-b" }), {
      probability: 0.9,
      relation: "supersedes",
    });

    expect(store.get(key({ targetBlobSha: "sha-b", candidateBlobSha: "sha-a" }))).toBeNull();

    store.set(key({ targetBlobSha: "sha-b", candidateBlobSha: "sha-a" }), {
      probability: 0.4,
      relation: "constrains",
    });

    expect(store.get(key({ targetBlobSha: "sha-a", candidateBlobSha: "sha-b" }))).toEqual({
      probability: 0.9,
      relation: "supersedes",
    });
    expect(store.get(key({ targetBlobSha: "sha-b", candidateBlobSha: "sha-a" }))).toEqual({
      probability: 0.4,
      relation: "constrains",
    });
  });

  it("rejects an out-of-range probability through the table constraint", () => {
    expect(() => store.set(key(), { probability: 1.5, relation: "duplicate" })).toThrow(/CHECK constraint/);
    expect(() => store.set(key(), { probability: -0.1, relation: "duplicate" })).toThrow(/CHECK constraint/);
    expect(store.get(key())).toBeNull();
  });

  it("enforces the probability range in the table itself, independent of the adapter", () => {
    const db = new Database(dbPath);
    try {
      expect(() =>
        db
          .prepare(
            `INSERT INTO jev_judgment_cache
               (target_blob_sha, candidate_blob_sha, judgment_version, probability, relation)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run("a", "b", "v", 2, "duplicate")
      ).toThrow(/CHECK constraint/);
    } finally {
      db.close();
    }
  });

  it("persists across separate connections to the same database file", () => {
    store.set(key(), { probability: 0.65, relation: "conflicts" });

    const reopened = new SqliteJudgmentStore(dbPath);
    expect(reopened.get(key())).toEqual({ probability: 0.65, relation: "conflicts" });
  });

  it("coexists with the summary cache in the same database file", () => {
    const summaries = new SqliteSummaryStore(dbPath);
    summaries.set("sha-target", "A summary next to a judgment.");
    store.set(key(), { probability: 0.5, relation: "constrains" });

    expect(store.get(key())).toEqual({ probability: 0.5, relation: "constrains" });
    expect(summaries.get("sha-target")).toBe("A summary next to a judgment.");
  });
});
