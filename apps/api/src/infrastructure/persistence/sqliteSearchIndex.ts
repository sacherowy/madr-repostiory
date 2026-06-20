import Database from "better-sqlite3";
import type { SearchDoc, SearchHit, SearchIndex } from "@adr/core";

export class SqliteSearchIndex implements SearchIndex {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS adr_fts USING fts5(id UNINDEXED, title, body, tags)`
    );
  }

  upsert(doc: SearchDoc): void {
    this.db.prepare("DELETE FROM adr_fts WHERE id = ?").run(doc.id);
    this.db
      .prepare("INSERT INTO adr_fts (id, title, body, tags) VALUES (?, ?, ?, ?)")
      .run(doc.id, doc.title, doc.body, doc.tags.join(" "));
  }

  remove(id: string): void {
    this.db.prepare("DELETE FROM adr_fts WHERE id = ?").run(id);
  }

  /**
   * Returns every id currently present in the index. Not part of the
   * abstract `SearchIndex` port (which intentionally has no enumeration
   * method) — this is a concrete-class-only extension used by `reindex.ts`
   * to discover which ids are stale (no longer present in the repository)
   * since a fresh process has no memory other than what's persisted here.
   */
  ids(): string[] {
    const rows = this.db.prepare("SELECT id FROM adr_fts").all() as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  search(query: string, limit?: number): SearchHit[] {
    const matchExpression = toFtsMatchExpression(query);
    if (matchExpression === null) {
      return [];
    }
    const rows = this.db
      .prepare(
        // bm25() takes one weight per column in table-declaration order:
        // (id [UNINDEXED, ignored], title, body, tags). Weighting title
        // highest means a search term that appears in an ADR's title ranks
        // ahead of one where it only appears in the body (Req 9.2). bm25()
        // returns lower (more negative) scores for closer matches, so
        // ORDER BY ASC ranks the best match first.
        `SELECT id, bm25(adr_fts, 0.0, 10.0, 1.0, 2.0) AS score
           FROM adr_fts
          WHERE adr_fts MATCH ?
          ORDER BY score ASC
          LIMIT ?`
      )
      .all(matchExpression, limit ?? -1) as Array<{ id: string; score: number }>;
    return rows.map((row) => ({ id: row.id, score: row.score }));
  }
}

/**
 * Builds a safe FTS5 MATCH expression from a raw, untrusted user query.
 *
 * FTS5's default query syntax treats characters like `-`, `"`, `*`, `:` and
 * `(`/`)` specially (column filters, prefix queries, NOT, phrase queries,
 * etc.), so passing user input straight to MATCH can throw a SqliteError
 * for ordinary search text (e.g. a hyphenated word). To keep `search`
 * robust for arbitrary input, each whitespace-separated token is quoted as
 * an FTS5 string literal and the tokens are AND-ed together.
 *
 * Returns `null` when the query contains no searchable tokens.
 */
function toFtsMatchExpression(query: string): string | null {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" AND ");
}
