import type { Adr, SimilarityResult } from "@adr/shared";
import type { GitPort } from "../ports/git.js";
import type { JudgedAdr, JudgmentKey, JudgmentStore, PairJudgment, SimilarityJudge } from "../ports/similarityJudge.js";
import { parseAdr } from "../adr/parse.js";
import { SimilarityProviderError } from "./errors.js";
import { combinedSectionText } from "../adr/sections.js";
import { selectLineage, type LineageCandidate } from "./lineageScope.js";
import type { FindSimilarOptions, SimilarityFinder, SimilarityFindResult } from "./similarityService.js";

export interface JevSimilarityOptions {
  /** Cap on judged lineage candidates (4.8); validated 1..1000, default 100. */
  maxCandidates: number;
  /** Maximum judgments in flight (7.4); validated 1..16. */
  concurrency: number;
  /** Time budget for a whole request in ms (7.6); validated 1000..600000, ≥ timeoutMs. */
  requestBudgetMs: number;
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function judgedAdr(adr: Adr): JudgedAdr {
  return { title: adr.title, text: combinedSectionText(adr, adr.additionalContent) };
}

/**
 * The `SimilarityFinder` of the Jev strategy (1.4). Ranks the target's lineage
 * (its folder, descendants and direct ancestors; see selectLineage) by the
 * probability, judged pairwise by a SimilarityJudge, that each candidate
 * addresses the same or an overlapping decision (3.1–3.5).
 *
 * Judgments are resolved cache-first against JudgmentStore, keyed by both blob
 * SHAs and the judge's judgmentVersion, so an edited ADR or a new prompt/model
 * is re-judged (6.1–6.3). The requested scope is ignored (4.6); the first
 * `maxCandidates` of the lineage order are judged, or all of them when
 * `exhaustive` is requested, and the coverage is reported (4.8, 4.9, 5.6).
 *
 * Judging runs with bounded concurrency under a per-request time budget; the
 * first provider failure or the budget rejects the whole request (7.1, 7.4,
 * 7.6, 7.7). Zero I/O beyond the injected ports; never calls an embedding
 * port (7.2).
 */
export class JevSimilarityService implements SimilarityFinder {
  constructor(
    private readonly git: GitPort,
    private readonly judge: SimilarityJudge,
    private readonly store: JudgmentStore,
    private readonly options: JevSimilarityOptions
  ) {}

  async findSimilar(
    id: string,
    _scopePath: string,
    options?: FindSimilarOptions
  ): Promise<SimilarityFindResult> {
    const files = await this.git.listAdrFiles(".");
    const adrs: Adr[] = [];
    for (const file of files) {
      const raw = await this.git.read(file.path);
      adrs.push(parseAdr(raw, file.path, file.blobSha));
    }

    const target = adrs.find((adr) => adr.id === id);
    if (!target) throw new Error(`ADR not found: ${id}`);

    const lineage = selectLineage(adrs, target.path);
    if (lineage.length === 0) return { kind: "emptyScope" };

    const selected = options?.exhaustive ? lineage : lineage.slice(0, this.options.maxCandidates);

    const judgments = await this.judgeAll(target, selected);
    const results: SimilarityResult[] = selected.map((candidate, i) => {
      const other = candidate.item;
      return {
        adr: { id: other.id, title: other.title, status: other.status, path: other.path },
        score: judgments[i].probability,
        lineage: candidate.position,
        relation: judgments[i].relation,
      };
    });

    results.sort(
      (a, b) =>
        b.score - a.score ||
        (a.lineage?.level ?? 0) - (b.lineage?.level ?? 0) ||
        comparePaths(a.adr.path, b.adr.path)
    );
    return { kind: "ranked", results, coverage: { judged: selected.length, total: lineage.length } };
  }

  /**
   * Judges every selected candidate with at most `concurrency` judgments in
   * flight (7.4), sharing one AbortSignal. The first failure, or the request
   * budget elapsing, wins: no further judgment starts and the signal aborts
   * the ones in flight (7.6, 7.7). After a judgment failure the in-flight ones
   * are awaited before rejecting with that first failure; the budget is a hard
   * stop and rejects without waiting. Judgments that complete validly are
   * cached either way (6.5). Resolves only when every candidate was judged,
   * so no partial ranking is ever returned (7.1).
   */
  private async judgeAll(target: Adr, selected: LineageCandidate<Adr>[]): Promise<PairJudgment[]> {
    const controller = new AbortController();
    const targetJudged = judgedAdr(target);
    const judgments: PairJudgment[] = new Array(selected.length);
    let failure: { error: unknown } | null = null;
    const fail = (error: unknown): void => {
      if (failure) return;
      failure = { error };
      controller.abort(error);
    };

    let next = 0;
    const worker = async (): Promise<void> => {
      while (!failure && next < selected.length) {
        const i = next++;
        try {
          judgments[i] = await this.judgmentFor(target, targetJudged, selected[i], controller.signal);
        } catch (error) {
          fail(error);
        }
      }
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const budgetElapsed = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        fail(
          new SimilarityProviderError(
            "budget",
            null,
            `Similarity request exceeded its time budget of ${this.options.requestBudgetMs} ms`
          )
        );
        resolve();
      }, this.options.requestBudgetMs);
    });

    const workerCount = Math.max(1, Math.min(this.options.concurrency, selected.length));
    // Workers never reject: every judgment error is routed through fail().
    const workers = Promise.all(Array.from({ length: workerCount }, worker));
    try {
      await Promise.race([workers, budgetElapsed]);
    } finally {
      clearTimeout(timer);
    }

    const settled = failure as { error: unknown } | null;
    if (settled) throw settled.error;
    return judgments;
  }

  private async judgmentFor(
    target: Adr,
    targetJudged: JudgedAdr,
    candidate: LineageCandidate<Adr>,
    signal: AbortSignal
  ): Promise<PairJudgment> {
    const key: JudgmentKey = {
      targetBlobSha: target.blobSha,
      candidateBlobSha: candidate.item.blobSha,
      judgmentVersion: this.judge.judgmentVersion,
    };
    const cached = this.store.get(key);
    if (cached) return cached;

    const judgment = await this.judge.judge(
      { target: targetJudged, candidate: judgedAdr(candidate.item), position: candidate.position },
      signal
    );
    this.store.set(key, judgment);
    return judgment;
  }
}
