/**
 * Optional text-generation port for one-sentence summary suggestions (13.1).
 * `null` at the composition root means no provider is configured (13.5).
 */
export interface SummaryProvider {
  generateSummary(input: { title: string; context: string; outcome: string }): Promise<string>;
}

/** Suggestion cache keyed by the saved revision's blob SHA — derived, replayable (13.2). */
export interface SummaryStore {
  get(blobSha: string): string | null;
  set(blobSha: string, summary: string): void;
}
