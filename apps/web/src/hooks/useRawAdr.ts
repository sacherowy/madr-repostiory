import { useQuery } from "@tanstack/react-query";
import type { AdrId, RawAdrContent } from "@adr/shared";
import type { ApiClient } from "../api/client.js";

/**
 * The exact stored bytes of a decision's MADR file for the Technical view
 * (design.md "UI compositions" → TechnicalView, Req 7.2). A read-only
 * TanStack Query wrapper over `ApiClient.getRawAdr` keyed by the design's
 * `["raw", id]` key (design.md Implementation Notes (web) query-key list), so
 * the raw content is cached per decision and a save can invalidate it by that
 * key.
 *
 * A non-`ok` envelope (e.g. 404 for an unknown id) is rethrown as a query
 * error so `isError` reaches the UI; the hook itself never throws.
 * Refetch-on-focus/retry behavior comes from `createQueryClient`'s app-wide
 * defaults (both disabled).
 */
export interface RawAdrQuery {
  data?: RawAdrContent;
  isPending: boolean;
  isError: boolean;
}

export function useRawAdr(apiClient: ApiClient, adrId: AdrId): RawAdrQuery {
  const raw = useQuery<RawAdrContent>({
    queryKey: ["raw", adrId],
    queryFn: async (): Promise<RawAdrContent> => {
      const result = await apiClient.getRawAdr(adrId);
      if (!result.ok) {
        throw new Error(`getRawAdr failed with status ${result.status}`);
      }
      return result.raw;
    },
  });

  return { data: raw.data, isPending: raw.isPending, isError: raw.isError };
}
