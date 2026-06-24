import { useEffect, useState } from "react";
import type { Adr, CommitMeta } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { MonoChip } from "../../components/MonoChip.js";

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
    return (
      <div data-testid="history-timeline-loading" className="state state--loading">
        <span className="state__spinner" aria-hidden="true" />
        <p className="state__message">Loading…</p>
      </div>
    );
  }

  if (loadState.kind === "error") {
    return (
      <div data-testid="history-timeline-error" className="state state--error">
        <p className="state__message">Failed to load history.</p>
      </div>
    );
  }

  return (
    <div data-testid="history-timeline" className="history">
      <ul className="history__list">
        {loadState.history.map((commit) => (
          <li
            key={commit.sha}
            data-testid={`history-entry-${commit.sha}`}
            data-sha={commit.sha}
            className="history__entry card"
          >
            <div className="card__body history__entry-body">
              <div className="card__header">
                <span className="history__author" data-testid={`history-entry-author-${commit.sha}`}>
                  {commit.author}
                </span>
                <MonoChip variant="sha" value={commit.sha} />
              </div>
              <div className="card__meta">
                <span data-testid={`history-entry-date-${commit.sha}`}>{commit.date}</span>
              </div>
              <p
                className="history__message"
                data-testid={`history-entry-message-${commit.sha}`}
              >
                {commit.message}
              </p>
              <div className="card__footer history__entry-footer">
                <button
                  data-testid={`history-select-${commit.sha}`}
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => handleSelect(commit.sha)}
                >
                  View this version
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {selected.kind === "loading" ? (
        <div data-testid="history-version-loading" className="state state--loading">
          <span className="state__spinner" aria-hidden="true" />
          <p className="state__message">Loading version…</p>
        </div>
      ) : null}

      {selected.kind === "error" ? (
        <div data-testid="history-version-error" className="state state--error">
          <p className="state__message">Failed to load that version.</p>
        </div>
      ) : null}

      {selected.kind === "loaded" ? (
        <div data-testid="history-version-content" className="history__version card">
          <div className="card__body">
            <h3 data-testid="history-version-title" className="card__title">
              {selected.adr.title}
            </h3>
            <p data-testid="history-version-body">{selected.adr.body}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
