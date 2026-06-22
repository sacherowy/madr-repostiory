import { useState } from "react";
import type { CommitMeta } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { VersionDiffView } from "./VersionDiffView.js";
import { AdrCompareView } from "./AdrCompareView.js";

export interface CompareLauncherProps {
  apiClient: ApiClient;
}

type HistoryLoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; adrId: string; history: CommitMeta[] };

interface VersionSelection {
  adrId: string;
  sha: string;
}

interface AdrPairSubmission {
  idA: string;
  idB: string;
}

/**
 * Self-contained selection flow for both comparison views (Req 7.1/7.3,
 * 8.1/8.3). Deliberately has no `adrId`/`folder` props from the shell — the
 * task only asks for the selection UI itself, not pre-population from an
 * already-open ADR, so both sub-flows below own their own free-text id entry.
 *
 * Neither sub-flow re-implements a rejection check that its rendered view
 * already owns: `VersionDiffView` short-circuits the "only one version"
 * case client-side and relays the "two different ADRs" case from the
 * backend's real 400; `AdrCompareView` relays the self-compare case from the
 * backend's real 400 too (both by design — see their own doc-comments).
 * This component's only job is making every one of those scenarios
 * reachable through clicks.
 */
export function CompareLauncher({ apiClient }: CompareLauncherProps) {
  const [adrIdInput, setAdrIdInput] = useState("");
  const [historyState, setHistoryState] = useState<HistoryLoadState>({ kind: "idle" });
  const [fromSelection, setFromSelection] = useState<VersionSelection | null>(null);
  const [toSelection, setToSelection] = useState<VersionSelection | null>(null);

  const [idAInput, setIdAInput] = useState("");
  const [idBInput, setIdBInput] = useState("");
  const [adrPair, setAdrPair] = useState<AdrPairSubmission | null>(null);

  async function handleLoadHistory() {
    const id = adrIdInput;
    setHistoryState({ kind: "loading" });
    try {
      const result = await apiClient.getHistory(id);
      if (!result.ok) {
        setHistoryState({ kind: "error" });
        return;
      }
      setHistoryState({ kind: "loaded", adrId: id, history: result.history });
    } catch {
      setHistoryState({ kind: "error" });
    }
  }

  function handleMarkFrom(adrId: string, sha: string) {
    setFromSelection({ adrId, sha });
  }

  function handleMarkTo(adrId: string, sha: string) {
    setToSelection({ adrId, sha });
  }

  function handleCompareAdrs() {
    setAdrPair({ idA: idAInput, idB: idBInput });
  }

  const anchorAdrId = fromSelection?.adrId ?? toSelection?.adrId ?? "";

  return (
    <div data-testid="compare-launcher">
      <section data-testid="compare-version-section">
        <label htmlFor="compare-version-adr-id-input">ADR id (version history)</label>
        <input
          id="compare-version-adr-id-input"
          data-testid="compare-version-adr-id-input"
          type="text"
          value={adrIdInput}
          onChange={(event) => setAdrIdInput(event.target.value)}
        />
        <button
          data-testid="compare-version-load-history-button"
          type="button"
          onClick={handleLoadHistory}
        >
          Load history
        </button>

        {historyState.kind === "loading" ? (
          <div data-testid="compare-version-history-loading">Loading…</div>
        ) : null}

        {historyState.kind === "error" ? (
          <div data-testid="compare-version-history-error">Failed to load history.</div>
        ) : null}

        {historyState.kind === "loaded" ? (
          <ul data-testid="compare-version-history-list">
            {historyState.history.map((commit) => (
              <li
                key={commit.sha}
                data-testid={`compare-version-history-entry-${commit.sha}`}
                data-sha={commit.sha}
              >
                <span data-testid={`compare-version-history-author-${commit.sha}`}>{commit.author}</span>{" "}
                <span data-testid={`compare-version-history-date-${commit.sha}`}>{commit.date}</span>{" "}
                <span data-testid={`compare-version-history-message-${commit.sha}`}>{commit.message}</span>{" "}
                <button
                  data-testid={`compare-version-mark-from-${commit.sha}`}
                  type="button"
                  onClick={() => handleMarkFrom(historyState.adrId, commit.sha)}
                >
                  Mark as From
                </button>
                <button
                  data-testid={`compare-version-mark-to-${commit.sha}`}
                  type="button"
                  onClick={() => handleMarkTo(historyState.adrId, commit.sha)}
                >
                  Mark as To
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div data-testid="compare-version-from-selected">
          From: {fromSelection ? `${fromSelection.adrId}@${fromSelection.sha}` : "none"}
        </div>
        <div data-testid="compare-version-to-selected">
          To: {toSelection ? `${toSelection.adrId}@${toSelection.sha}` : "none"}
        </div>

        <VersionDiffView
          apiClient={apiClient}
          adrId={anchorAdrId}
          fromSha={fromSelection?.sha}
          toSha={toSelection?.sha}
        />
      </section>

      <section data-testid="compare-adr-section">
        <label htmlFor="compare-adr-id-a-input">ADR id A</label>
        <input
          id="compare-adr-id-a-input"
          data-testid="compare-adr-id-a-input"
          type="text"
          value={idAInput}
          onChange={(event) => setIdAInput(event.target.value)}
        />
        <label htmlFor="compare-adr-id-b-input">ADR id B</label>
        <input
          id="compare-adr-id-b-input"
          data-testid="compare-adr-id-b-input"
          type="text"
          value={idBInput}
          onChange={(event) => setIdBInput(event.target.value)}
        />
        <button data-testid="compare-adr-submit-button" type="button" onClick={handleCompareAdrs}>
          Compare ADRs
        </button>

        {adrPair ? (
          <AdrCompareView apiClient={apiClient} idA={adrPair.idA} idB={adrPair.idB} />
        ) : null}
      </section>
    </div>
  );
}
