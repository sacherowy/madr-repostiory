import type { Adr, SummarySuggestionResult } from "@adr/shared";
import type { SummaryProvider, SummaryStore } from "../ports/summaries.js";

/**
 * Cache-first, degradation-safe suggestion orchestration (13.1, 13.2, 13.5).
 *
 * - No provider configured → `no-provider` without touching the store.
 * - Cache hit on the ADR's blob SHA short-circuits the provider entirely.
 * - Provider failures (thrown errors or blank output) → `provider-error`,
 *   never cached, so the next attempt retries generation.
 */
export class SummarySuggestionService {
  constructor(
    private readonly provider: SummaryProvider | null,
    private readonly store: SummaryStore,
  ) {}

  async suggest(adr: Adr): Promise<SummarySuggestionResult> {
    if (this.provider === null) {
      return { available: false, reason: "no-provider" };
    }

    const cached = this.store.get(adr.blobSha);
    if (cached !== null) {
      return { available: true, suggestion: cached };
    }

    let suggestion: string;
    try {
      suggestion = await this.provider.generateSummary({
        title: adr.title,
        context: adr.contextAndProblemStatement,
        outcome: adr.decisionOutcome,
      });
    } catch {
      return { available: false, reason: "provider-error" };
    }

    if (suggestion.trim() === "") {
      // A blank suggestion is useless to the author; treat it like a provider
      // failure and do not poison the cache with it.
      return { available: false, reason: "provider-error" };
    }

    this.store.set(adr.blobSha, suggestion);
    return { available: true, suggestion };
  }
}
