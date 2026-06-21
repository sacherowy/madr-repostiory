import { useEffect, useState } from "react";
import type { FieldComparison } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";

export interface AdrCompareViewProps {
  apiClient: ApiClient;
  idA: string;
  idB: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "rejected"; reason: string }
  | { kind: "loaded"; fields: FieldComparison[] };

/**
 * Renders two ADRs' fields side by side (Req 8.1, 8.2). The self-compare
 * rejection (Req 8.3) is relayed verbatim from the backend's own
 * invalidReason — this component never duplicates that idA===idB check.
 */
export function AdrCompareView({ apiClient, idA, idB }: AdrCompareViewProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    async function fetchComparison() {
      try {
        const result = await apiClient.compareAdrs(idA, idB);
        if (cancelled) return;
        if (!result.ok) {
          if (result.kind === "invalidReason") {
            setState({ kind: "rejected", reason: result.reason });
          } else {
            setState({ kind: "error" });
          }
          return;
        }
        setState({ kind: "loaded", fields: result.comparison.fields });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    }

    fetchComparison();

    return () => {
      cancelled = true;
    };
  }, [apiClient, idA, idB]);

  if (state.kind === "loading") {
    return <div data-testid="adr-compare-loading">Loading…</div>;
  }

  if (state.kind === "rejected") {
    return <div data-testid="adr-compare-rejection">{state.reason}</div>;
  }

  if (state.kind === "error") {
    return <div data-testid="adr-compare-error">Failed to load that comparison.</div>;
  }

  return (
    <table data-testid="adr-compare">
      <tbody>
        {state.fields.map((field) => (
          <tr
            key={field.field}
            data-testid={`adr-compare-field-${field.field}`}
            data-field={field.field}
            data-differs={field.differs ? "true" : "false"}
          >
            <th scope="row">{field.field}</th>
            <td data-testid={`adr-compare-field-${field.field}-a`}>{field.a}</td>
            <td data-testid={`adr-compare-field-${field.field}-b`}>{field.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
