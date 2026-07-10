import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteSummaryStore } from "./sqliteSummaryStore.js";
import { SqliteEmbeddingStore } from "./sqlite.js";

describe("SqliteSummaryStore", () => {
  let dir: string;
  let dbPath: string;
  let store: SqliteSummaryStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "adr-summary-"));
    dbPath = join(dir, "test.sqlite");
    store = new SqliteSummaryStore(dbPath);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null for a blob SHA that was never stored", () => {
    expect(store.get("abc123")).toBeNull();
  });

  it("returns the stored summary after set", () => {
    store.set("abc123", "We chose Postgres because it fits our scale.");

    expect(store.get("abc123")).toBe("We chose Postgres because it fits our scale.");
  });

  it("replaces the summary when set is called again for the same blob SHA", () => {
    store.set("abc123", "First summary.");
    store.set("abc123", "Second summary.");

    expect(store.get("abc123")).toBe("Second summary.");
  });

  it("keeps entries for different blob SHAs independent", () => {
    store.set("sha-a", "Summary A.");
    store.set("sha-b", "Summary B.");

    expect(store.get("sha-a")).toBe("Summary A.");
    expect(store.get("sha-b")).toBe("Summary B.");
  });

  it("persists across separate connections to the same database file", () => {
    store.set("abc123", "Persisted summary.");

    const reopened = new SqliteSummaryStore(dbPath);
    expect(reopened.get("abc123")).toBe("Persisted summary.");
  });

  it("coexists with the embedding cache in the same database file", () => {
    const embeddings = new SqliteEmbeddingStore(dbPath);
    embeddings.set("abc123", [0.1, 0.2]);
    store.set("abc123", "A summary next to an embedding.");

    expect(store.get("abc123")).toBe("A summary next to an embedding.");
    expect(embeddings.get("abc123")).toEqual([0.1, 0.2]);
  });
});
