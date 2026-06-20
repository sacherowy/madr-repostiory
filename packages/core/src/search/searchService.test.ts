import { describe, it, expect } from "vitest";
import type { SearchDoc, SearchHit, SearchIndex } from "../ports/search.js";
import { SearchService } from "./searchService.js";

/**
 * In-memory fake SearchIndex test double. Records every call made to it
 * (search/upsert/remove) so tests can assert SearchService's pass-through
 * behavior and its "never writes to the index" invariant, with zero actual
 * I/O — matches this package's zero-I/O constraint for its own tests.
 */
class FakeSearchIndex implements SearchIndex {
  public upsertCalls: SearchDoc[] = [];
  public removeCalls: string[] = [];
  public searchCalls: { query: string; limit?: number }[] = [];

  constructor(private hits: SearchHit[] = []) {}

  upsert(doc: SearchDoc): void {
    this.upsertCalls.push(doc);
  }

  remove(id: string): void {
    this.removeCalls.push(id);
  }

  search(query: string, limit?: number): SearchHit[] {
    this.searchCalls.push({ query, limit });
    return this.hits;
  }
}

describe("SearchService", () => {
  it("returns the index's hits in the exact same order, without re-sorting", async () => {
    // Intentionally non-alphabetical, non-id-ordered to prove no re-sorting.
    const hits: SearchHit[] = [
      { id: "adr-0007", score: 3.1 },
      { id: "adr-0001", score: 9.9 },
      { id: "adr-0003", score: 5.5 },
    ];
    const index = new FakeSearchIndex(hits);
    const svc = new SearchService(index);

    const result = await svc.search("caching");

    expect(result).toEqual(hits);
  });

  it("returns an empty result set (not an error) when the index finds no matches", async () => {
    const index = new FakeSearchIndex([]);
    const svc = new SearchService(index);

    const result = await svc.search("no-such-term-anywhere");

    expect(result).toEqual([]);
  });

  it("passes the limit argument through to the index unchanged when provided", async () => {
    const index = new FakeSearchIndex([{ id: "adr-0001", score: 1 }]);
    const svc = new SearchService(index);

    await svc.search("caching", 5);

    expect(index.searchCalls).toEqual([{ query: "caching", limit: 5 }]);
  });

  it("passes no implicit default limit through to the index when limit is omitted", async () => {
    const index = new FakeSearchIndex([]);
    const svc = new SearchService(index);

    await svc.search("caching");

    expect(index.searchCalls).toEqual([{ query: "caching", limit: undefined }]);
  });

  it("never writes to the index: only search is ever invoked, never upsert or remove", async () => {
    const index = new FakeSearchIndex([{ id: "adr-0002", score: 2 }]);
    const svc = new SearchService(index);

    await svc.search("caching");
    await svc.search("another query", 10);

    expect(index.upsertCalls).toEqual([]);
    expect(index.removeCalls).toEqual([]);
    expect(index.searchCalls.length).toBe(2);
  });
});
