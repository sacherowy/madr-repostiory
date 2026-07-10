import { useQuery } from "@tanstack/react-query";
import type { Adr, CommitMeta, RelationView, SimilarityResult } from "@adr/shared";
import type { ApiClient } from "../api/client.js";

/**
 * Everything the decision article page needs (design.md `useDecision`,
 * Req 6): four independent, parallel queries — the ADR itself, its
 * relations, its git history, and its similar decisions — each keyed by the
 * design's per-id keys `["adr", id]`, `["relations", id]`, `["history", id]`,
 * and `["similar", id, null]`.
 *
 * The history and similar keys deliberately match `useInspectorPreviews`'
 * keys exactly (`["history", adrId]` / `["similar", adrId, folder]` with the
 * folder slot `null`, i.e. own-folder scope) so warm caches are shared, and
 * a save can invalidate all of a decision's data via the `["similar", id]`
 * prefix and friends.
 *
 * All queries run **only** while `adrId !== null`; otherwise no fetch happens
 * and each dataset reports the disabled query's state (`data` undefined). A
 * non-`ok` envelope is rethrown as a query error on that dataset only; the
 * hook itself never throws. Offline-empty similarity (`emptyScope`) is an
 * EMPTY list, not an error.
 */
interface DecisionAspect<T> {
  data?: T;
  isPending: boolean;
  isError: boolean;
}

export interface DecisionData {
  adr: DecisionAspect<Adr>;
  relations: DecisionAspect<RelationView[]>;
  history: DecisionAspect<CommitMeta[]>;
  similar: DecisionAspect<SimilarityResult[]>;
}

/**
 * Resolves the similarity scope the same way `useInspectorPreviews` and
 * `useAspectCounts` do for a null folder: the ADR's own containing folder
 * (the path up to the last "/", or "." when the path has no containing
 * folder). A non-`ok` `getAdr` falls back to the whole-repo sentinel "."
 * rather than throwing — similarity then degrades on its own terms.
 */
async function resolveOwnScope(apiClient: ApiClient, adrId: string): Promise<string> {
  const adrResult = await apiClient.getAdr(adrId);
  if (!adrResult.ok) {
    return ".";
  }
  const lastSlash = adrResult.adr.path.lastIndexOf("/");
  return lastSlash === -1 ? "." : adrResult.adr.path.slice(0, lastSlash);
}

export function useDecision(apiClient: ApiClient, adrId: string | null): DecisionData {
  const enabled = adrId !== null;

  const adr = useQuery<Adr>({
    queryKey: ["adr", adrId],
    enabled,
    queryFn: async (): Promise<Adr> => {
      const result = await apiClient.getAdr(adrId as string);
      if (!result.ok) {
        throw new Error(`getAdr failed with status ${result.status}`);
      }
      return result.adr;
    },
  });

  const relations = useQuery<RelationView[]>({
    queryKey: ["relations", adrId],
    enabled,
    queryFn: async (): Promise<RelationView[]> => {
      const result = await apiClient.getRelations(adrId as string);
      if (!result.ok) {
        throw new Error(`getRelations failed with status ${result.status}`);
      }
      return result.relations;
    },
  });

  const history = useQuery<CommitMeta[]>({
    // Shared with `useInspectorPreviews`' history query; history is not
    // scoped, so the ADR id alone keys it.
    queryKey: ["history", adrId],
    enabled,
    queryFn: async (): Promise<CommitMeta[]> => {
      const result = await apiClient.getHistory(adrId as string);
      if (!result.ok) {
        throw new Error(`getHistory failed with status ${result.status}`);
      }
      return result.history;
    },
  });

  const similar = useQuery<SimilarityResult[]>({
    // The trailing `null` is `useInspectorPreviews`' folder slot: the article
    // page has no folder selection, which is exactly that hook's
    // "derive-from-own-folder" case, so the two share one cache entry.
    queryKey: ["similar", adrId, null],
    enabled,
    queryFn: async (): Promise<SimilarityResult[]> => {
      const scope = await resolveOwnScope(apiClient, adrId as string);
      const result = await apiClient.getSimilar(adrId as string, scope);
      if (!result.ok) {
        throw new Error(`getSimilar failed with status ${result.status}`);
      }
      // Offline-empty similarity is an EMPTY related-reading list, not an error.
      return result.kind === "ranked" ? result.results : [];
    },
  });

  return {
    adr: { data: adr.data, isPending: adr.isPending, isError: adr.isError },
    relations: {
      data: relations.data,
      isPending: relations.isPending,
      isError: relations.isError,
    },
    history: { data: history.data, isPending: history.isPending, isError: history.isError },
    similar: { data: similar.data, isPending: similar.isPending, isError: similar.isError },
  };
}
