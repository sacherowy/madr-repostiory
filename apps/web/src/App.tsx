import { useMemo, useState } from "react";

import { createApiClient } from "./api/client.js";
import type { ApiClient } from "./api/client.js";
import { AdrEditor } from "./features/adr-editor/AdrEditor.js";
import { FolderTree } from "./features/folder-tree/FolderTree.js";
import { RelationsPanel } from "./features/relations-graph/RelationsPanel.js";
import { HistoryTimeline } from "./features/history-timeline/HistoryTimeline.js";

// Szkielet GUI. Docelowe features (osobne katalogi w src/features/):
//   adr-editor · folder-tree · relations-graph · history-timeline · diff-viewer · similarity-panel · search
//
// This shell owns only local view-state (selected folder, selected ADR, active panel, session
// author name). Each feature component built in task group 5 will own its own ApiClient calls.

type ActivePanel = "editor" | "relations" | "history" | "comparison" | "similarity";

const PANEL_TABS: ActivePanel[] = ["editor", "relations", "history", "comparison", "similarity"];

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

  const [searchAdrIdInput, setSearchAdrIdInput] = useState("");

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
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>ADR Manager</h1>
      <p>Nakładka na git do zarządzania Architecture Decision Records.</p>
      <p>Źródłem prawdy jest repozytorium git; SQLite to tylko projekcja do wyszukiwania.</p>

      <div>
        <label htmlFor="author-name-input">Session author name</label>
        <input
          id="author-name-input"
          data-testid="author-name-input"
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

      <div data-testid="search-panel-placeholder">
        <p>Search (placeholder — replaced by SearchPanel in task 5.6)</p>
        <input
          data-testid="search-adr-id-input"
          type="text"
          value={searchAdrIdInput}
          onChange={(event) => setSearchAdrIdInput(event.target.value)}
        />
        <button
          data-testid="select-adr-from-search-button"
          type="button"
          onClick={() => handleSelectAdr(searchAdrIdInput)}
        >
          Select ADR (search)
        </button>
      </div>

      <div role="tablist">
        {PANEL_TABS.map((panel) => (
          <button
            key={panel}
            type="button"
            data-testid={`panel-tab-${panel}`}
            aria-current={activePanel === panel ? "true" : undefined}
            onClick={() => handleSwitchPanel(panel)}
          >
            {panel}
          </button>
        ))}
      </div>

      {activePanel === "editor" ? (
        <div data-testid="panel-editor">
          <AdrEditor
            adrId={selectedAdrId}
            folder={selectedFolder}
            authorName={authorName}
            apiClient={apiClient}
            onAdrSaved={(adr) => setSelectedAdrId(adr.id)}
          />
        </div>
      ) : selectedAdrId === null ? (
        <div data-testid="panel-empty">Select an ADR first to view this panel.</div>
      ) : activePanel === "relations" ? (
        <div data-testid="panel-relations">
          <RelationsPanel apiClient={apiClient} adrId={selectedAdrId} />
        </div>
      ) : activePanel === "history" ? (
        <div data-testid="panel-history">
          <HistoryTimeline apiClient={apiClient} adrId={selectedAdrId} />
        </div>
      ) : (
        <div data-testid={`panel-${activePanel}`}>
          {activePanel} — adr: {selectedAdrId}
        </div>
      )}
    </main>
  );
}
