import type { Adr, SimilarityResult } from "@adr/shared";
import type { GitPort } from "../ports/git.js";
import type { JudgedAdr, JudgmentKey, JudgmentStore, PairJudgment, SimilarityJudge } from "../ports/similarityJudge.js";
import { parseAdr } from "../adr/parse.js";
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
 * Zero I/O beyond the injected ports; never calls an embedding port (7.2).
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

    const controller = new AbortController();
    const targetJudged = judgedAdr(target);
    const results: SimilarityResult[] = [];
    for (const candidate of selected) {
      const judgment = await this.judgmentFor(target, targetJudged, candidate, controller.signal);
      const other = candidate.item;
      results.push({
        adr: { id: other.id, title: other.title, status: other.status, path: other.path },
        score: judgment.probability,
        lineage: candidate.position,
        relation: judgment.relation,
      });
    }

    results.sort(
      (a, b) =>
        b.score - a.score ||
        (a.lineage?.level ?? 0) - (b.lineage?.level ?? 0) ||
        comparePaths(a.adr.path, b.adr.path)
    );
    return { kind: "ranked", results, coverage: { judged: selected.length, total: lineage.length } };
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
