import { useEffect, useState } from "react";
import type { DiffHunk } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";

export interface VersionDiffViewProps {
  apiClient: ApiClient;
  adrId: string;
  fromSha?: string;
  toSha?: string;
}

type LoadState =
  | { kind: "rejected"; reason: string }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; hunks: DiffHunk[] };

const INCOMPLETE_SELECTION_REASON = "both a 'from' and a 'to' version are required";

/** Maps a DiffHunk kind to its design-system diff-row modifier (base.css). */
const HUNK_ROW_CLASS: Record<DiffHunk["kind"], string> = {
  added: "diff__row--add",
  removed: "diff__row--del",
  unchanged: "diff__row--unchanged",
};

/**
 * Renders the diff between two versions of one ADR (Req 7.1, 7.2). The
 * "only one version selected" rejection (Req 7.3) is a pure client-side
 * short-circuit on fromSha/toSha — no point calling the backend for an
 * obviously incomplete selection. The "versions from different ADRs"
 * rejection falls out of the backend's own validation (the route only
 * accepts a single adrId, so a sha from another ADR's history simply isn't
 * found in this one's log) — this component just relays that reason text.
 */
export function VersionDiffView({ apiClient, adrId, fromSha, toSha }: VersionDiffViewProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!fromSha || !toSha) {
      setState({ kind: "rejected", reason: INCOMPLETE_SELECTION_REASON });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });

    async function fetchDiff(from: string, to: string) {
      try {
        const result = await apiClient.getVersionDiff(adrId, from, to);
        if (cancelled) return;
        if (!result.ok) {
          if (result.kind === "invalid") {
            setState({ kind: "rejected", reason: result.reason });
          } else {
            setState({ kind: "error" });
          }
          return;
        }
        setState({ kind: "loaded", hunks: result.diff.hunks });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    }

    fetchDiff(fromSha, toSha);

    return () => {
      cancelled = true;
    };
  }, [apiClient, adrId, fromSha, toSha]);

  if (state.kind === "rejected") {
    // Rejection is incomplete/invalid selection guidance, not a system error —
    // neutral empty-state treatment, danger red reserved for real errors.
    return (
      <div data-testid="version-diff-rejection" className="state state--empty">
        <p className="state__message">{state.reason}</p>
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div data-testid="version-diff-loading" className="state state--loading">
        <span className="state__spinner" aria-hidden="true" />
        <p className="state__message">Loading…</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div data-testid="version-diff-error" className="state state--error">
        <p className="state__message">Failed to load that comparison.</p>
      </div>
    );
  }

  return (
    <ul data-testid="version-diff" className="diff">
      {state.hunks.map((hunk, index) => (
        <li
          key={index}
          data-testid={`version-diff-hunk-${index}-${hunk.kind}`}
          data-kind={hunk.kind}
          className={`diff__row ${HUNK_ROW_CLASS[hunk.kind]}`}
        >
          <span className="diff__lineno" aria-hidden="true">
            {index + 1}
          </span>
          <span className="diff__content">{hunk.text}</span>
        </li>
      ))}
    </ul>
  );
}
