import type { SearchHit, SearchIndex } from "../ports/search.js";

/**
 * Thin pass-through over SearchIndex for keyword search. Ranking/ordering of
 * results (Req 9.1/9.2) is the index's job (bm25()), not this service's —
 * this service never re-sorts. Selecting a result (9.4) is a frontend
 * navigation concern; this service simply returns enough info (SearchHit[])
 * for a caller to do that.
 *
 * Zero I/O: depends only on the injected SearchIndex. Never writes to the
 * index (upsert/remove are never called from here).
 */
export class SearchService {
  constructor(private readonly index: SearchIndex) {}

  async search(query: string, limit?: number): Promise<SearchHit[]> {
    return this.index.search(query, limit);
  }
}
