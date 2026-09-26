import {
  SimilarityProviderError,
  type JudgePair,
  type PairJudgment,
  type SimilarityJudge,
} from "@adr/core";
import { SIMILARITY_RELATIONS, type SimilarityRelation } from "@adr/shared";
import type { ValidatedJevConfig } from "../../similarityConfig.js";

/**
 * Version of the questions sent to Jev. Bump it whenever the instructions or
 * criteria change, so cached judgments from the old prompt stop matching (6.1).
 */
export const JEV_PROMPT_VERSION = "1";

const RELATION_CRITERIA: Record<SimilarityRelation, string> = {
  duplicate: "The candidate records the same decision as the target.",
  supersedes: "One of the two ADRs replaces or overrides the other.",
  conflicts: "The candidate makes a decision that contradicts the target.",
  constrains: "One ADR limits, refines or sets preconditions for the other.",
  related: "The ADRs touch a shared topic but make independent decisions.",
  unrelated: "The ADRs have nothing meaningful in common.",
};

/** Outbound request body for `POST {JEV_ENDPOINT}` (design: API Contract (outbound)). */
interface JevRequest {
  model: string;
  state: {
    target: { title: string; text: string };
    candidate: { title: string; text: string; direction: "down" | "up"; level: number };
  };
  questions: {
    similar: {
      type: "noul";
      instructions: string;
      criteria: { true: string; false: string };
    };
    relation: {
      type: "choice";
      instructions: string;
      criteria: Record<SimilarityRelation, string>;
    };
  };
}

function buildRequest(model: string, pair: JudgePair): JevRequest {
  return {
    model,
    state: {
      target: { title: pair.target.title, text: pair.target.text },
      candidate: {
        title: pair.candidate.title,
        text: pair.candidate.text,
        direction: pair.position.direction,
        level: pair.position.level,
      },
    },
    questions: {
      similar: {
        type: "noul",
        instructions:
          "Do the target and candidate ADRs address the same or an overlapping architectural decision?",
        criteria: {
          true: "Both ADRs decide the same question or overlapping parts of it.",
          false: "The ADRs decide different, non-overlapping questions.",
        },
      },
      relation: {
        type: "choice",
        instructions: "How does the candidate ADR relate to the target ADR?",
        criteria: RELATION_CRITERIA,
      },
    },
  };
}

/**
 * SimilarityJudge over the Jev decisions HTTP API (TokenRouter
 * `/api/alpha/decisions`). One request per pair; its own timeout is combined
 * with the caller's signal. Every failure is a SimilarityProviderError whose
 * message holds only the category and status, never the key, the response
 * body or ADR content (2.7, 7.5). Logs nothing itself.
 */
export class JevSimilarityJudge implements SimilarityJudge {
  readonly judgmentVersion: string;

  constructor(
    private readonly config: ValidatedJevConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.judgmentVersion = `${config.model}#${JEV_PROMPT_VERSION}`;
  }

  async judge(pair: JudgePair, signal: AbortSignal): Promise<PairJudgment> {
    if (signal.aborted) throw providerError("aborted");
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);
    // Caller abort wins over the own timeout when both have fired (7.7).
    const abortCategory = (): "aborted" | "timeout" | null =>
      signal.aborted ? "aborted" : timeout.aborted ? "timeout" : null;

    let status: number;
    let text: string;
    try {
      const res = await this.fetchImpl(this.config.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildRequest(this.config.model, pair)),
        signal: combined,
      });
      status = res.status;
      text = await res.text();
    } catch {
      throw providerError(abortCategory() ?? "network");
    }

    if (status < 200 || status > 299) throw providerError("http-status", status);

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw providerError("invalid-response");
    }
    const judgment = parseJevAnswers(body);
    if (!judgment) throw providerError("invalid-response");
    return judgment;
  }
}

function providerError(
  category: "network" | "timeout" | "http-status" | "invalid-response" | "aborted",
  httpStatus: number | null = null
): SimilarityProviderError {
  const detail = httpStatus === null ? category : `${category} ${httpStatus}`;
  return new SimilarityProviderError(category, httpStatus, `Jev request failed: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRelation(value: unknown): value is SimilarityRelation {
  return (SIMILARITY_RELATIONS as readonly unknown[]).includes(value);
}

/**
 * Pure; returns null when the body does not match the expected answer shape
 * (3.6). Field paths confirmed against a live TokenRouter response
 * (research.md, 2026-09-26): `answers.similar.noul` (probability) and
 * `answers.relation.choice`, falling back to the arg-max of
 * `answers.relation.probabilities`. The distribution need not sum to exactly 1
 * because Jev rounds its probabilities.
 */
export function parseJevAnswers(body: unknown): PairJudgment | null {
  if (!isRecord(body) || !isRecord(body.answers)) return null;
  const { similar, relation } = body.answers;
  if (!isRecord(similar) || !isRecord(relation)) return null;

  const probability = similar.noul;
  if (typeof probability !== "number" || !Number.isFinite(probability)) return null;
  if (probability < 0 || probability > 1) return null;

  const chosen = relation.choice !== undefined ? relation.choice : argMax(relation.probabilities);
  if (!isRelation(chosen)) return null;

  return { probability, relation: chosen };
}

/** The option with the highest probability; null for an empty or malformed distribution. */
function argMax(distribution: unknown): string | null {
  if (!isRecord(distribution)) return null;
  let best: string | null = null;
  let bestValue = -Infinity;
  for (const [option, value] of Object.entries(distribution)) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (value > bestValue) {
      best = option;
      bestValue = value;
    }
  }
  return best;
}
