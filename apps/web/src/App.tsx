import { useMemo, useState } from "react";

import { createApiClient } from "./api/client.js";
import type { ApiClient } from "./api/client.js";
import { AdrEditor } from "./features/adr-editor/AdrEditor.js";
import { FolderTree } from "./features/folder-tree/FolderTree.js";
import { RelationsPanel } from "./features/relations-graph/RelationsPanel.js";
import { HistoryTimeline } from "./features/history-timeline/HistoryTimeline.js";
import { SearchPanel } from "./features/search/SearchPanel.js";
import { SimilarityPanel } from "./features/similarity-panel/SimilarityPanel.js";
import { CompareLauncher } from "./features/diff-viewer/CompareLauncher.js";

// Szkielet GUI. Docelowe features (osobne katalogi w src/features/):
//   adr-editor · folder-tree · relations-graph · history-timeline · diff-viewer · similarity-panel · search
//
// This shell owns only local view-state (selected folder, selected ADR, active panel, session
// author name). Each feature component built in task group 5 will own its own ApiClient calls.

type ActivePanel = "editor" | "relations" | "history" | "comparison" | "similarity";

const PANEL_TABS: ActivePanel[] = ["editor", "relations", "history", "comparison", "similarity"];

// Human-readable labels for the panel switcher (Req 2.2): tab buttons show
// these instead of the raw internal state keys, while the keys still drive the
// preserved `data-testid="panel-tab-<key>"` hooks below.
const PANEL_LABELS: Record<ActivePanel, string> = {
  editor: "Editor",
  relations: "Relations",
  history: "History",
  comparison: "Comparison",
  similarity: "Similarity",
};

interface AppProps {
  /** Optional injection seam mirroring AdrEditor's own DI pattern, used by tests to provide a
   * real test-server-backed client instead of the default relative-URL client (which can't
   * resolve in jsdom). Defaults to the production client when omitted. */
  apiClient?: ApiClient;
}

export function App({ apiClient: injectedApiClient }: AppProps = {}) {
  const apiClient = useMemo(() => injectedApiClient ?? createApiClient(), [injectedApiClient]);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedAdrId, setSelectedAdrId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>("editor");
  const [authorName, setAuthorName] = useState("");

  function handleSelectFolder(folderPath: string) {
    setSelectedFolder(folderPath);
  }

  function handleSelectAdr(adrId: string) {
    setSelectedAdrId(adrId);
    setActivePanel("editor");
  }

  function handleSwitchPanel(panel: ActivePanel) {
    setActivePanel(panel);
  }

  return (
    <main className="app-shell">
      <aside className="app-shell__sidebar">
        <h1>ADR Manager</h1>
        <p>Nakładka na git do zarządzania Architecture Decision Records.</p>
        <p>Źródłem prawdy jest repozytorium git; SQLite to tylko projekcja do wyszukiwania.</p>

        <div className="field">
          <label className="field__label" htmlFor="author-name-input">
            Session author name
          </label>
          <input
            id="author-name-input"
            data-testid="author-name-input"
            className="field__input"
            type="text"
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
          />
        </div>

        <FolderTree
          apiClient={apiClient}
          authorName={authorName}
          onSelectFolder={handleSelectFolder}
          onSelectAdr={handleSelectAdr}
        />

        <SearchPanel apiClient={apiClient} onSelectAdr={handleSelectAdr} />
      </aside>

      <section className="app-shell__workspace">
        <div className="tab-bar" role="tablist" aria-label="Panels">
          {PANEL_TABS.map((panel) => (
            <button
              key={panel}
              type="button"
              role="tab"
              data-testid={`panel-tab-${panel}`}
              className={`tab${activePanel === panel ? " tab--active" : ""}`}
              aria-current={activePanel === panel ? "true" : undefined}
              aria-selected={activePanel === panel}
              onClick={() => handleSwitchPanel(panel)}
            >
              {PANEL_LABELS[panel]}
            </button>
          ))}
        </div>

        {activePanel === "editor" ? (
          <div className="app-shell__panel" role="tabpanel" data-testid="panel-editor">
            <AdrEditor
              adrId={selectedAdrId}
              folder={selectedFolder}
              authorName={authorName}
              apiClient={apiClient}
              onAdrSaved={(adr) => setSelectedAdrId(adr.id)}
            />
          </div>
        ) : activePanel === "comparison" ? (
          // Deliberately reachable without a pre-selected ADR (unlike
          // relations/history/similarity below, gated on selectedAdrId): both
          // CompareLauncher sub-flows own their own free-text ADR-id entry, so
          // there's nothing for the gate below to usefully prevent here.
          <div className="app-shell__panel" role="tabpanel" data-testid="panel-comparison">
            <CompareLauncher apiClient={apiClient} />
          </div>
        ) : selectedAdrId === null ? (
          <div
            className="app-shell__panel state state--empty"
            role="tabpanel"
            data-testid="panel-empty"
          >
            <p className="state__message">Select an ADR first to view this panel.</p>
          </div>
        ) : activePanel === "relations" ? (
          <div className="app-shell__panel" role="tabpanel" data-testid="panel-relations">
            <RelationsPanel apiClient={apiClient} adrId={selectedAdrId} />
          </div>
        ) : activePanel === "history" ? (
          <div className="app-shell__panel" role="tabpanel" data-testid="panel-history">
            <HistoryTimeline apiClient={apiClient} adrId={selectedAdrId} />
          </div>
        ) : (
          <div className="app-shell__panel" role="tabpanel" data-testid="panel-similarity">
            <SimilarityPanel apiClient={apiClient} adrId={selectedAdrId} folder={selectedFolder} />
          </div>
        )}
      </section>
    </main>
  );
}
