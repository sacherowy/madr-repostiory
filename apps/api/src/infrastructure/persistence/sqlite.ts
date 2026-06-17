import Database from "better-sqlite3";
import type { EmbeddingStore } from "@adr/core";

export class SqliteEmbeddingStore implements EmbeddingStore {
  private db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS embedding_cache (
         blob_sha TEXT PRIMARY KEY,
         vector   TEXT NOT NULL
       )`
    );
  }

  get(blobSha: string): number[] | null {
    const row = this.db
      .prepare("SELECT vector FROM embedding_cache WHERE blob_sha = ?")
      .get(blobSha) as { vector: string } | undefined;
    return row ? (JSON.parse(row.vector) as number[]) : null;
  }

  has(blobSha: string): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM embedding_cache WHERE blob_sha = ?")
      .get(blobSha);
  }

  set(blobSha: string, vector: number[]): void {
    this.db
      .prepare("INSERT OR REPLACE INTO embedding_cache (blob_sha, vector) VALUES (?, ?)")
      .run(blobSha, JSON.stringify(vector));
  }
}
