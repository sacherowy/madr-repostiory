import Database from "better-sqlite3";
import type { SummaryStore } from "@adr/core";

export class SqliteSummaryStore implements SummaryStore {
  private db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS summary_cache (
         blob_sha TEXT PRIMARY KEY,
         summary  TEXT NOT NULL
       )`
    );
  }

  get(blobSha: string): string | null {
    const row = this.db
      .prepare("SELECT summary FROM summary_cache WHERE blob_sha = ?")
      .get(blobSha) as { summary: string } | undefined;
    return row ? row.summary : null;
  }

  set(blobSha: string, summary: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO summary_cache (blob_sha, summary) VALUES (?, ?)")
      .run(blobSha, summary);
  }
}
