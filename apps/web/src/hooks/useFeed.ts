import { useQuery } from "@tanstack/react-query";
import type { FeedCard } from "@adr/shared";
import type { ApiClient } from "../api/client.js";

/**
 * Feed cards for the Home/Topics/People surfaces (design.md `useFeed`,
 * Req 2.3). A read-only TanStack Query wrapper over `ApiClient.getFeed`
 * keyed by the design's `["feed"]` key, so every consumer (HomePage,
 * TopicsPage, PeoplePage, AttentionDigest, search-result rendering) shares
 * one cached fetch and saves can invalidate it by that key.
 *
 * A non-`ok` envelope is rethrown as a query error so `isError` reaches the
 * UI; the hook itself never throws. Refetch-on-focus/retry behavior comes
 * from `createQueryClient`'s app-wide defaults (both disabled).
 */
export interface FeedQuery {
  data?: FeedCard[];
  isPending: boolean;
  isError: boolean;
}

export function useFeed(apiClient: ApiClient): FeedQuery {
  const feed = useQuery<FeedCard[]>({
    queryKey: ["feed"],
    queryFn: async (): Promise<FeedCard[]> => {
      const result = await apiClient.getFeed();
      if (!result.ok) {
        throw new Error(`getFeed failed with status ${result.status}`);
      }
      return result.cards;
    },
  });

  return { data: feed.data, isPending: feed.isPending, isError: feed.isError };
}
