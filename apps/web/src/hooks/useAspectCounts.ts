import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "../api/client.js";

/**
 * Live aspect counts for the selected ADR (design.md `useAspectCounts`,
 * Req 2.4 / 10.4). A read-only TanStack Query wrapper over `ApiClient`: three
 * independent queries (relations / history / similar) keyed by ADR id + concern
 * so they cache, dedupe, and can share their warm cache with the full aspect
 * panels (Req 10.4).
 *
 * A count key is populated **only** when its query resolves successfully with a
 * usable value. Failures, non-`ok` responses, and offline-empty similarity
 * (`emptyScope`) leave the key absent ("where available", Req 2.4). The hook
 * never throws to the UI.
 */
export interface AspectCounts {
  relations?: number;
  history?: number;
  similar?: number;
}

/**
 * Sentinel returned by the relations/history query functions when the result is
 * not a usable count (non-`ok` response). Distinguishing "no count" from a real
 * `0` lets the hook omit the key while still letting TanStack Query cache the
 * resolved (non-throwing) outcome.
 */
const NO_COUNT = null;
type Count = number | typeof NO_COUNT;

/**
 * Resolves the similarity scope the same way `SimilarityPanel` does: use the
 * selected folder when present, otherwise derive it from the ADR's own
 * containing folder (the path up to the last "/", or "." when the path has no
 * containing folder).
 */
async function resolveScope(
  apiClient: ApiClient,
  adrId: string,
  folder: string | null,
): Promise<string> {
  if (folder !== null) {
    return folder;
  }
  const adrResult = await apiClient.getAdr(adrId);
  if (!adrResult.ok) {
    // No usable own-folder; fall back to the whole-repo sentinel rather than
    // throwing — the similarity query then degrades to an absent count.
    return ".";
  }
  const lastSlash = adrResult.adr.path.lastIndexOf("/");
  return lastSlash === -1 ? "." : adrResult.adr.path.slice(0, lastSlash);
}

export function useAspectCounts(
  apiClient: ApiClient,
  adrId: string | null,
  folder: string | null,
): AspectCounts {
  const enabled = adrId !== null;

  const relations = useQuery<Count>({
    queryKey: ["counts", "relations", adrId],
    enabled,
    queryFn: async (): Promise<Count> => {
      const result = await apiClient.getRelations(adrId as string);
      return result.ok ? result.relations.length : NO_COUNT;
    },
  });

  const history = useQuery<Count>({
    queryKey: ["counts", "history", adrId],
    enabled,
    queryFn: async (): Promise<Count> => {
      const result = await apiClient.getHistory(adrId as string);
      return result.ok ? result.history.length : NO_COUNT;
    },
  });

  const similar = useQuery<Count>({
    // `scope` is part of the key so a folder change re-fetches and the result
    // can be shared with the SimilarityPanel's own scoped query.
    queryKey: ["counts", "similar", adrId, folder],
    enabled,
    queryFn: async (): Promise<Count> => {
      const scope = await resolveScope(apiClient, adrId as string, folder);
      const result = await apiClient.getSimilar(adrId as string, scope);
      if (result.ok && result.kind === "ranked") {
        return result.results.length;
      }
      // Non-ok, or offline `emptyScope`: no usable count.
      return NO_COUNT;
    },
  });

  const counts: AspectCounts = {};
  if (relations.data !== undefined && relations.data !== NO_COUNT) {
    counts.relations = relations.data;
  }
  if (history.data !== undefined && history.data !== NO_COUNT) {
    counts.history = history.data;
  }
  if (similar.data !== undefined && similar.data !== NO_COUNT) {
    counts.similar = similar.data;
  }
  return counts;
}
