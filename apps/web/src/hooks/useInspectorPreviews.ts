import { useQuery } from "@tanstack/react-query";
import type { CommitMeta, SimilarityResult } from "@adr/shared";
import type { ApiClient } from "../api/client.js";

/**
 * Top-Similar and recent-history previews for the inspector rail (design.md
 * `useInspectorPreviews`, Req 6.1 / 6.3 / 10.4). A read-only TanStack Query
 * wrapper over `ApiClient`: two independent queries (similar / history) that
 * fetch the *full* preview data and share their query keys with the
 * corresponding full aspects so opening an aspect reuses the warm cache (Req
 * 6.3, 10.4).
 *
 * Both queries run **only** while `enabled && adrId !== null`; otherwise no
 * fetch happens and each sub-result reports the disabled query's state (`data`
 * undefined). Offline-empty similarity (`emptyScope`) is an EMPTY preview, not
 * an error. A non-`ok` / rejected query surfaces `isError` to the UI; the hook
 * itself never throws.
 */
export interface InspectorPreviews {
  similar: { data?: SimilarityResult[]; isPending: boolean; isError: boolean };
  history: { data?: CommitMeta[]; isPending: boolean; isError: boolean };
}

/**
 * Resolves the similarity scope the same way `SimilarityPanel` and
 * `useAspectCounts` do: use the selected folder when present, otherwise derive
 * it from the ADR's own containing folder (the path up to the last "/", or "."
 * when the path has no containing folder). A non-`ok` `getAdr` falls back to the
 * whole-repo sentinel "." rather than throwing.
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
    return ".";
  }
  const lastSlash = adrResult.adr.path.lastIndexOf("/");
  return lastSlash === -1 ? "." : adrResult.adr.path.slice(0, lastSlash);
}

export function useInspectorPreviews(
  apiClient: ApiClient,
  adrId: string | null,
  folder: string | null,
  enabled: boolean,
): InspectorPreviews {
  const active = enabled && adrId !== null;

  const similar = useQuery<SimilarityResult[]>({
    // `scope` is part of the key so a folder change re-fetches and the result
    // can be shared with the full Similar aspect's own scoped query (Req 6.3).
    queryKey: ["similar", adrId, folder],
    enabled: active,
    queryFn: async (): Promise<SimilarityResult[]> => {
      const scope = await resolveScope(apiClient, adrId as string, folder);
      const result = await apiClient.getSimilar(adrId as string, scope);
      if (!result.ok) {
        // Surface as a query error so the preview shows its error state.
        throw new Error(`getSimilar failed with status ${result.status}`);
      }
      // Offline-empty similarity is an EMPTY preview, not an error.
      return result.kind === "ranked" ? result.results : [];
    },
  });

  const history = useQuery<CommitMeta[]>({
    // Shared with the full History aspect's query (Req 6.3); history is not
    // scoped, so the ADR id alone keys it.
    queryKey: ["history", adrId],
    enabled: active,
    queryFn: async (): Promise<CommitMeta[]> => {
      const result = await apiClient.getHistory(adrId as string);
      if (!result.ok) {
        throw new Error(`getHistory failed with status ${result.status}`);
      }
      return result.history;
    },
  });

  return {
    similar: {
      data: similar.data,
      isPending: similar.isPending,
      isError: similar.isError,
    },
    history: {
      data: history.data,
      isPending: history.isPending,
      isError: history.isError,
    },
  };
}
