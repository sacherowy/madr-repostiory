import { useEffect, useState } from "react";
import type { Adr, CommitMeta } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";

export interface HistoryTimelineProps {
  apiClient: ApiClient;
  adrId: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; history: CommitMeta[] };

type SelectedVersionState =
  | { kind: "idle" }
  | { kind: "loading"; sha: string }
  | { kind: "error"; sha: string }
  | { kind: "loaded"; sha: string; adr: Adr };

/**
 * Chronological version timeline (newest first, exactly as returned by
 * `apiClient.getHistory` — never re-sorted or inverted here, since the API's
 * order IS the contract per Req 6.3). Selecting an entry fetches and displays
 * that specific historical version's full content (Req 6.2), tracked in a
 * separate state slice so a selection-fetch failure never regresses the main
 * timeline (mirrors RelationsPanel's single-effect load pattern for the
 * timeline itself, task 5.3).
 */
export function HistoryTimeline({ apiClient, adrId }: HistoryTimelineProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<SelectedVersionState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    setLoadState({ kind: "loading" });
    setSelected({ kind: "idle" });

    async function fetchHistory() {
      try {
        const result = await apiClient.getHistory(adrId);
        if (cancelled) return;
        if (!result.ok) {
          setLoadState({ kind: "error" });
          return;
        }
        setLoadState({ kind: "loaded", history: result.history });
      } catch {
        // A network-level failure (mirroring RelationsPanel's own
        // fetchRelations().catch() handling) is treated the same as an
        // `ok:false` response: there's nothing more specific the user can do.
        if (!cancelled) setLoadState({ kind: "error" });
      }
    }

    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [apiClient, adrId]);

  async function handleSelect(sha: string) {
    setSelected({ kind: "loading", sha });
    try {
      const result = await apiClient.getVersionAt(adrId, sha);
      if (!result.ok) {
        setSelected({ kind: "error", sha });
        return;
      }
      setSelected({ kind: "loaded", sha, adr: result.adr });
    } catch {
      setSelected({ kind: "error", sha });
    }
  }

  if (loadState.kind === "loading") {
    return <div data-testid="history-timeline-loading">Loading…</div>;
  }

  if (loadState.kind === "error") {
    return <div data-testid="history-timeline-error">Failed to load history.</div>;
  }

  return (
    <div data-testid="history-timeline">
      <ul>
        {loadState.history.map((commit) => (
          <li key={commit.sha} data-testid={`history-entry-${commit.sha}`} data-sha={commit.sha}>
            <span data-testid={`history-entry-author-${commit.sha}`}>{commit.author}</span>{" "}
            <span data-testid={`history-entry-date-${commit.sha}`}>{commit.date}</span>{" "}
            <span data-testid={`history-entry-message-${commit.sha}`}>{commit.message}</span>{" "}
            <button
              data-testid={`history-select-${commit.sha}`}
              type="button"
              onClick={() => handleSelect(commit.sha)}
            >
              View this version
            </button>
          </li>
        ))}
      </ul>

      {selected.kind === "loading" ? (
        <div data-testid="history-version-loading">Loading version…</div>
      ) : null}

      {selected.kind === "error" ? (
        <div data-testid="history-version-error">Failed to load that version.</div>
      ) : null}

      {selected.kind === "loaded" ? (
        <div data-testid="history-version-content">
          <h3 data-testid="history-version-title">{selected.adr.title}</h3>
          <p data-testid="history-version-body">{selected.adr.body}</p>
        </div>
      ) : null}
    </div>
  );
}
