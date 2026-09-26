import { useCallback, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  Adr,
  CommitMeta,
  RelationView,
  SimilarityCoverage,
  SimilarityResult,
} from "@adr/shared";
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
 *
 * `similar` additionally exposes the failure status, the comparison coverage
 * and the compare-all / retry actions (jev-similarity design "useDecision
 * `similar`", Req 9.1, 9.3, 9.5). The exhaustive comparison uses the key
 * `["similar", id, null, "exhaustive"]`, still under the `["similar", id]`
 * prefix that a save invalidates.
 */
interface DecisionAspect<T> {
  data?: T;
  isPending: boolean;
  isError: boolean;
}

/** The similar-ADRs list plus how many candidates were actually compared. */
export interface SimilarView {
  /** `[]` for `emptyScope`. */
  results: SimilarityResult[];
  /** `null` when the backend reports no coverage (always under embedding). */
  coverage: SimilarityCoverage | null;
}

export interface SimilarAspect extends DecisionAspect<SimilarView> {
  /** HTTP status of the failure; 0 = network error; null when not failed. */
  errorStatus: number | null;
  /** true while an exhaustive request is in flight (Req 9.5). */
  isComparingAll: boolean;
  /** Switches to the exhaustive query (Req 9.5). */
  compareAll(): void;
  /** Refetches the currently active query (Req 9.3). */
  retry(): void;
}

export interface DecisionData {
  adr: DecisionAspect<Adr>;
  relations: DecisionAspect<RelationView[]>;
  history: DecisionAspect<CommitMeta[]>;
  similar: SimilarAspect;
}

/** Thrown by the similar query so the failure's HTTP status survives into `query.error`. */
export class SimilarRequestError extends Error {
  constructor(readonly status: number) {
    super(`getSimilar failed with status ${status}`);
    this.name = "SimilarRequestError";
  }
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

  // Compare-all is per viewed ADR: the flag resets whenever `adrId` changes
  // (adjusted during render rather than in an effect, so no capped→exhaustive
  // request for the new ADR is ever issued).
  const [exhaustive, setExhaustive] = useState(false);
  const [exhaustiveAdrId, setExhaustiveAdrId] = useState(adrId);
  if (exhaustiveAdrId !== adrId) {
    setExhaustiveAdrId(adrId);
    setExhaustive(false);
  }
  const exhaustiveActive = exhaustive && exhaustiveAdrId === adrId;

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

  const similar = useQuery<SimilarView>({
    // The trailing `null` is `useInspectorPreviews`' folder slot: the article
    // page has no folder selection, which is exactly that hook's
    // "derive-from-own-folder" case. The exhaustive comparison appends a
    // marker so both keys stay under the `["similar", id]` prefix.
    queryKey: exhaustiveActive ? ["similar", adrId, null, "exhaustive"] : ["similar", adrId, null],
    enabled,
    // While the exhaustive comparison is pending, keep showing the capped
    // result instead of an empty rail (Req 9.5). Only the same ADR's data is
    // carried over, so navigating never shows the previous ADR's list.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === adrId ? keepPreviousData(previous) : undefined,
    queryFn: async (): Promise<SimilarView> => {
      const scope = await resolveOwnScope(apiClient, adrId as string);
      const result = await apiClient.getSimilar(adrId as string, scope, {
        exhaustive: exhaustiveActive,
      });
      if (!result.ok) {
        throw new SimilarRequestError(result.status);
      }
      // Offline-empty similarity is an EMPTY related-reading list, not an error.
      return result.kind === "ranked"
        ? { results: result.results, coverage: result.coverage }
        : { results: [], coverage: null };
    },
  });

  const compareAll = useCallback((): void => setExhaustive(true), []);
  const { refetch: refetchSimilar } = similar;
  // The app-wide `retry: false` stays; this is the user-initiated retry of
  // whichever query (capped or exhaustive) is active (Req 9.3).
  const retry = useCallback((): void => {
    void refetchSimilar();
  }, [refetchSimilar]);

  return {
    adr: { data: adr.data, isPending: adr.isPending, isError: adr.isError },
    relations: {
      data: relations.data,
      isPending: relations.isPending,
      isError: relations.isError,
    },
    history: { data: history.data, isPending: history.isPending, isError: history.isError },
    similar: {
      data: similar.data,
      isPending: similar.isPending,
      isError: similar.isError,
      errorStatus: similar.isError
        ? similar.error instanceof SimilarRequestError
          ? similar.error.status
          : 0
        : null,
      isComparingAll: exhaustiveActive && similar.isFetching,
      compareAll,
      retry,
    },
  };
}
