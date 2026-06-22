import { useEffect, useState } from "react";
import type { SimilarityResult } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";

export interface SimilarityPanelProps {
  apiClient: ApiClient;
  adrId: string;
  folder: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "emptyScope" }
  | { kind: "ranked"; results: SimilarityResult[] };

/**
 * Folder-scoped similarity suggestions (Req 10.1, 10.2, 10.3). Scope is the
 * currently selected folder from the tree; when none is selected, this falls
 * back to the open ADR's own containing folder (derived from `Adr.path` via
 * `getAdr`, mirroring the `"."` whole-repo sentinel `getTree`/the similarity
 * route already use when a path has no containing folder). Ranking (Req
 * 10.1, 10.2) is entirely the backend's job (`SimilarityService`); results
 * are rendered in exactly the order `apiClient.getSimilar` returns them,
 * never re-sorted here — mirrors SearchPanel's own convention.
 */
export function SimilarityPanel({ apiClient, adrId, folder }: SimilarityPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    function applyResult(result: Awaited<ReturnType<ApiClient["getSimilar"]>>) {
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: "error" });
        return;
      }
      if (result.kind === "emptyScope") {
        setState({ kind: "emptyScope" });
        return;
      }
      setState({ kind: "ranked", results: result.results });
    }

    async function resolveScopeAndFetch() {
      try {
        let scope = folder;
        if (scope === null) {
          const adrResult = await apiClient.getAdr(adrId);
          if (cancelled) return;
          if (!adrResult.ok) {
            setState({ kind: "error" });
            return;
          }
          const lastSlash = adrResult.adr.path.lastIndexOf("/");
          scope = lastSlash === -1 ? "." : adrResult.adr.path.slice(0, lastSlash);
        }

        const result = await apiClient.getSimilar(adrId, scope);
        applyResult(result);
      } catch {
        // A network-level failure from either getAdr or getSimilar (mirroring
        // SearchPanel's/RelationsPanel's own catch handling) is treated the
        // same as an `ok:false` response: there's nothing more specific the
        // user can do with it.
        if (!cancelled) setState({ kind: "error" });
      }
    }

    resolveScopeAndFetch();

    return () => {
      cancelled = true;
    };
  }, [apiClient, adrId, folder]);

  if (state.kind === "loading") {
    return <div data-testid="similarity-loading">Loading…</div>;
  }

  if (state.kind === "error") {
    return <div data-testid="similarity-error">Failed to load similar ADRs.</div>;
  }

  if (state.kind === "emptyScope") {
    return <div data-testid="similarity-empty">No similar ADRs are available in that scope.</div>;
  }

  return (
    <ul data-testid="similarity-results">
      {state.results.map((result) => (
        <li key={result.adr.id} data-testid={`similarity-result-${result.adr.id}`}>
          {result.adr.title} ({result.adr.id}) — score: {result.score}
        </li>
      ))}
    </ul>
  );
}
