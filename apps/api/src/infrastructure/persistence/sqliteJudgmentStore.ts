import Database from "better-sqlite3";
import type { JudgmentKey, JudgmentStore, PairJudgment } from "@adr/core";
import type { SimilarityRelation } from "@adr/shared";

export class SqliteJudgmentStore implements JudgmentStore {
  private db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS jev_judgment_cache (
         target_blob_sha    TEXT NOT NULL,
         candidate_blob_sha TEXT NOT NULL,
         judgment_version   TEXT NOT NULL,
         probability        REAL NOT NULL CHECK (probability >= 0 AND probability <= 1),
         relation           TEXT NOT NULL,
         PRIMARY KEY (target_blob_sha, candidate_blob_sha, judgment_version)
       )`
    );
  }

  get(key: JudgmentKey): PairJudgment | null {
    const row = this.db
      .prepare(
        `SELECT probability, relation FROM jev_judgment_cache
         WHERE target_blob_sha = ? AND candidate_blob_sha = ? AND judgment_version = ?`
      )
      .get(key.targetBlobSha, key.candidateBlobSha, key.judgmentVersion) as
      | { probability: number; relation: string }
      | undefined;
    return row ? { probability: row.probability, relation: row.relation as SimilarityRelation } : null;
  }

  set(key: JudgmentKey, judgment: PairJudgment): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO jev_judgment_cache
           (target_blob_sha, candidate_blob_sha, judgment_version, probability, relation)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        key.targetBlobSha,
        key.candidateBlobSha,
        key.judgmentVersion,
        judgment.probability,
        judgment.relation
      );
  }
}
