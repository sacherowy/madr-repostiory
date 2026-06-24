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
    return (
      <div data-testid="adr-compare-loading" className="state state--loading">
        <span className="state__spinner" aria-hidden="true" />
        <p className="state__message">Loading…</p>
      </div>
    );
  }

  if (state.kind === "rejected") {
    // Rejection is "selection invalid" guidance (e.g. self-compare), not a
    // system error — neutral empty-state treatment, danger reserved for errors.
    return (
      <div data-testid="adr-compare-rejection" className="state state--empty">
        <p className="state__message">{state.reason}</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div data-testid="adr-compare-error" className="state state--error">
        <p className="state__message">Failed to load that comparison.</p>
      </div>
    );
  }

  return (
    <table data-testid="adr-compare" className="diff compare">
      <tbody>
        {state.fields.map((field) => (
          <tr
            key={field.field}
            data-testid={`adr-compare-field-${field.field}`}
            data-field={field.field}
            data-differs={field.differs ? "true" : "false"}
            // Differing fields stand out via the BACKGROUND-only add modifier
            // (var(--add-bg)); identical fields stay on the default table
            // background. We deliberately omit the base `.diff__row` (it is
            // `display:flex`, which would destroy this real <table> layout) and
            // carry the visible distinction with `diff__row--add` alone. The
            // `compare__row*` hooks are forward-looking semantic anchors only.
            className={
              field.differs
                ? "diff__row--add compare__row compare__row--differs"
                : "compare__row compare__row--same"
            }
          >
            <th scope="row" className="compare__field">
              {field.field}
            </th>
            <td data-testid={`adr-compare-field-${field.field}-a`} className="compare__value">
              {field.a}
            </td>
            <td data-testid={`adr-compare-field-${field.field}-b`} className="compare__value">
              {field.b}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
