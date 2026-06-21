import { useEffect, useState } from "react";
import type { RelationView } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";

export interface RelationsPanelProps {
  apiClient: ApiClient;
  adrId: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; relations: RelationView[] };

/**
 * Read-only display of every relationship an ADR participates in (both
 * declared-on-it and declared-elsewhere-pointing-to-it). Relation editing
 * lives in AdrEditor (task 5.1) — this component never writes anything.
 */
export function RelationsPanel({ apiClient, adrId }: RelationsPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setLoadState({ kind: "loading" });

    async function fetchRelations() {
      try {
        const result = await apiClient.getRelations(adrId);
        if (cancelled) return;
        if (!result.ok) {
          setLoadState({ kind: "error" });
          return;
        }
        setLoadState({ kind: "loaded", relations: result.relations });
      } catch {
        // A network-level failure (mirroring FolderTree's own fetchTree and
        // AdrEditor's getAdr().catch() handling) is treated the same as an
        // `ok:false` response: there's nothing more specific the user can do.
        if (!cancelled) setLoadState({ kind: "error" });
      }
    }

    fetchRelations();

    return () => {
      cancelled = true;
    };
  }, [apiClient, adrId]);

  if (loadState.kind === "loading") {
    return <div data-testid="relations-panel-loading">Loading…</div>;
  }

  if (loadState.kind === "error") {
    return <div data-testid="relations-panel-error">Failed to load relations.</div>;
  }

  if (loadState.relations.length === 0) {
    return <div data-testid="relations-panel-empty">This ADR has no relations.</div>;
  }

  return (
    <ul data-testid="relations-panel">
      {loadState.relations.map((relation) => (
        <li
          key={`${relation.direction}-${relation.type}-${relation.target}`}
          data-testid={`relation-item-${relation.direction}-${relation.type}-${relation.target}`}
        >
          <span data-testid="relation-direction">{relation.direction}</span>{" "}
          <span data-testid="relation-type">{relation.type}</span>{" "}
          <span data-testid="relation-target">{relation.target}</span>
        </li>
      ))}
    </ul>
  );
}
