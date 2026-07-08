import { useQuery } from "@tanstack/react-query";
import type { SummarySuggestionResult } from "@adr/shared";
import type { ApiClient } from "../api/client.js";

/**
 * On-demand AI summary suggestion for the compose form (design.md
 * `useSummarySuggestion`, Req 13.1). Keyed by the design's
 * `["summary-suggestion", id, blobSha]` so a new saved revision (new blob
 * sha) is a distinct cache entry, mirroring the server's blob-sha-keyed
 * suggestion cache (13.2).
 *
 * Strictly on-demand: the query runs **only** while the caller-controlled
 * `enabled` flag is true AND both `adrId` and `blobSha` are non-null; it
 * never refetches on window focus (disabled app-wide in
 * `createQueryClient`). `data` is the `SummarySuggestionResult` union
 * itself — the unavailable variant (`no-provider` / `provider-error`) is a
 * normal result, NOT an error (13.5). Only a transport-level non-`ok`
 * envelope is rethrown as a query error; the hook itself never throws.
 */
export interface SummarySuggestionQuery {
  data?: SummarySuggestionResult;
  isPending: boolean;
  isError: boolean;
}

export function useSummarySuggestion(
  apiClient: ApiClient,
  adrId: string | null,
  blobSha: string | null,
  enabled: boolean,
): SummarySuggestionQuery {
  const active = enabled && adrId !== null && blobSha !== null;

  const suggestion = useQuery<SummarySuggestionResult>({
    queryKey: ["summary-suggestion", adrId, blobSha],
    enabled: active,
    queryFn: async (): Promise<SummarySuggestionResult> => {
      const result = await apiClient.getSummarySuggestion(adrId as string);
      if (!result.ok) {
        throw new Error(`getSummarySuggestion failed with status ${result.status}`);
      }
      return result.suggestion;
    },
  });

  return {
    data: suggestion.data,
    isPending: suggestion.isPending,
    isError: suggestion.isError,
  };
}
