import type { LineagePosition, SimilarityRelation } from "@adr/shared";

/** One side of a judged pair, as sent to the judge. */
export interface JudgedAdr {
  title: string;
  /** combinedSectionText(adr, adr.additionalContent) */
  text: string;
}

export interface JudgePair {
  target: JudgedAdr;
  candidate: JudgedAdr;
  /** Part of the prompt, not of the cache key (D-Cache). */
  position: LineagePosition;
}

export interface PairJudgment {
  /** 0..1 inclusive */
  probability: number;
  relation: SimilarityRelation;
}

/** Pairwise judge of whether two ADRs address the same or an overlapping decision (3.1). */
export interface SimilarityJudge {
  /** Stable identity of model + prompt version; part of every cache key (6.1). */
  readonly judgmentVersion: string;
  /**
   * Resolves only with a validated judgment; otherwise rejects with SimilarityProviderError.
   * When `signal` aborts, rejects promptly with category "aborted" (7.6, 7.7).
   */
  judge(pair: JudgePair, signal: AbortSignal): Promise<PairJudgment>;
}

export interface JudgmentKey {
  targetBlobSha: string;
  candidateBlobSha: string;
  judgmentVersion: string;
}

/** Derived, rebuildable cache of validated judgments (6.1, 6.4, 6.5). */
export interface JudgmentStore {
  get(key: JudgmentKey): PairJudgment | null;
  set(key: JudgmentKey, judgment: PairJudgment): void;
}
