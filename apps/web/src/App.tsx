import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { createApiClient } from "./api/client.js";
import type { ApiClient } from "./api/client.js";
import { useWorkspaceStore } from "./state/workspaceStore.js";
import { ContextHeader } from "./components/ContextHeader.js";
import { AspectSwitcher } from "./components/AspectSwitcher.js";
import { ExplorerRail } from "./features/explorer/ExplorerRail.js";
import { CommandPalette } from "./features/command-palette/CommandPalette.js";
import { InspectorRail } from "./features/inspector/InspectorRail.js";
import { useAspectCounts } from "./hooks/useAspectCounts.js";
import { AdrEditor } from "./features/adr-editor/AdrEditor.js";
import { RelationsPanel } from "./features/relations-graph/RelationsPanel.js";
import { HistoryTimeline } from "./features/history-timeline/HistoryTimeline.js";
import { SimilarityPanel } from "./features/similarity-panel/SimilarityPanel.js";
import { CompareLauncher } from "./features/diff-viewer/CompareLauncher.js";

// Contextual four-zone shell (Req 1.1). All cross-zone view-state (selection,
// active aspect, comparison/palette/inspector flags, session author) lives in
// the Zustand `workspaceStore`; zones dispatch intent-named actions and never
// co-own state. Each feature panel still owns its own ApiClient calls.

interface AppProps {
  /** Optional injection seam mirroring AdrEditor's own DI pattern, used by tests to provide a
   * real test-server-backed client instead of the default relative-URL client (which can't
   * resolve in jsdom). Defaults to the production client when omitted. */
  apiClient?: ApiClient;
}

/**
 * Lightweight ADR summary for the context header. Derives a real title/status
 * from the backend when reachable, falling back to the id as title and a neutral
 * status while loading or on failure (the design treats title/status as inputs
 * wired by App, and explicitly does not block the header on a fetch — the id
 * chip is the essential element).
 */
function useAdrSummary(
  apiClient: ApiClient,
  adrId: string | null,
): { title: string; status: string } {
  const query = useQuery({
    queryKey: ["context-header", adrId],
    enabled: adrId !== null,
    queryFn: async () => {
      const result = await apiClient.getAdr(adrId as string);
      if (!result.ok) {
        return null;
      }
      return { title: result.adr.title, status: result.adr.status };
    },
  });

  if (adrId === null) {
    return { title: "", status: "" };
  }
  if (query.data == null) {
    // Loading or unreachable: fall back to the id as title and a neutral status.
    return { title: adrId, status: "" };
  }
  return { title: query.data.title, status: query.data.status };
}

export function App({ apiClient: injectedApiClient }: AppProps = {}) {
  const apiClient = useMemo(() => injectedApiClient ?? createApiClient(), [injectedApiClient]);

  const selectedFolder = useWorkspaceStore((s) => s.selectedFolder);
  const selectedAdrId = useWorkspaceStore((s) => s.selectedAdrId);
  const authorName = useWorkspaceStore((s) => s.authorName);
  const activeAspect = useWorkspaceStore((s) => s.activeAspect);
  const comparisonOpen = useWorkspaceStore((s) => s.comparisonOpen);
  const paletteOpen = useWorkspaceStore((s) => s.paletteOpen);
  const inspectorOpen = useWorkspaceStore((s) => s.inspectorOpen);

  const selectFolder = useWorkspaceStore((s) => s.selectFolder);
  const selectAdr = useWorkspaceStore((s) => s.selectAdr);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);
  const setAuthorName = useWorkspaceStore((s) => s.setAuthorName);
  const setAspect = useWorkspaceStore((s) => s.setAspect);
  const openCompare = useWorkspaceStore((s) => s.openCompare);
  const closeCompare = useWorkspaceStore((s) => s.closeCompare);
  const setPaletteOpen = useWorkspaceStore((s) => s.setPaletteOpen);
  const toggleInspector = useWorkspaceStore((s) => s.toggleInspector);

  const counts = useAspectCounts(apiClient, selectedAdrId, selectedFolder);
  const summary = useAdrSummary(apiClient, selectedAdrId);

  // Global Cmd/Ctrl-K opens the command palette from anywhere (Req 4.1).
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setPaletteOpen]);

  return (
    <div className="shell">
      <header className="shell__command-bar">
        <div className="command-bar" role="toolbar" aria-label="Command bar">
          <h1 className="command-bar__brand">ADR Manager</h1>

          <div className="field command-bar__author">
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

          <button
            type="button"
            data-testid="command-palette-open"
            className="btn"
            onClick={() => setPaletteOpen(true)}
          >
            Search (⌘K)
          </button>

          <button
            type="button"
            data-testid="command-bar-new-adr"
            className="btn btn--primary"
            onClick={() => clearSelection()}
          >
            New ADR
          </button>

          {/* Compare is exposed as an action, reachable with no selection
              (Req 2.5). Carries the migrated `panel-tab-comparison` hook. */}
          <button
            type="button"
            data-testid="panel-tab-comparison"
            className="btn"
            onClick={() => openCompare()}
          >
            Compare
          </button>
        </div>
      </header>

      <aside className="shell__explorer">
        <ExplorerRail
          apiClient={apiClient}
          authorName={authorName}
          selectedAdrId={selectedAdrId}
          selectedFolder={selectedFolder}
          onSelectFolder={selectFolder}
          onSelectAdr={selectAdr}
        />
      </aside>

      <section className="shell__object">
        {selectedAdrId === null ? (
          // Welcoming browse/create state (Req 1.3): NO aspect switcher, NO
          // "select an ADR first" placeholder. The create flow stays reachable
          // here so a new ADR can be authored directly.
          <div className="shell__object-browse" data-testid="center-browse">
            <div className="state state--empty">
              <p className="state__message">
                No ADR selected. Browse the explorer to open a decision, or create a new one
                below.
              </p>
            </div>
            <AdrEditor
              adrId={null}
              folder={selectedFolder}
              authorName={authorName}
              apiClient={apiClient}
              onAdrSaved={(adr) => selectAdr(adr.id)}
            />
          </div>
        ) : (
          <>
            <ContextHeader
              adrId={selectedAdrId}
              title={summary.title}
              status={summary.status}
              onEdit={() => setAspect("editor")}
              onCompare={openCompare}
            />

            <AspectSwitcher
              activeAspect={activeAspect}
              counts={counts}
              onSelectAspect={setAspect}
            />

            {activeAspect === "editor" ? (
              <div className="shell__aspect" role="tabpanel" data-testid="panel-editor">
                <AdrEditor
                  adrId={selectedAdrId}
                  folder={selectedFolder}
                  authorName={authorName}
                  apiClient={apiClient}
                  onAdrSaved={(adr) => selectAdr(adr.id)}
                />
              </div>
            ) : activeAspect === "relations" ? (
              <div className="shell__aspect" role="tabpanel" data-testid="panel-relations">
                <RelationsPanel apiClient={apiClient} adrId={selectedAdrId} />
              </div>
            ) : activeAspect === "history" ? (
              <div className="shell__aspect" role="tabpanel" data-testid="panel-history">
                <HistoryTimeline apiClient={apiClient} adrId={selectedAdrId} />
              </div>
            ) : (
              <div className="shell__aspect" role="tabpanel" data-testid="panel-similarity">
                <SimilarityPanel
                  apiClient={apiClient}
                  adrId={selectedAdrId}
                  folder={selectedFolder}
                />
              </div>
            )}
          </>
        )}
      </section>

      <aside className="shell__inspector">
        <InspectorRail
          apiClient={apiClient}
          adrId={selectedAdrId}
          folder={selectedFolder}
          open={inspectorOpen}
          onToggle={toggleInspector}
          onOpenAspect={(aspect) => setAspect(aspect === "similar" ? "similar" : "history")}
        />
      </aside>

      <CommandPalette
        open={paletteOpen}
        apiClient={apiClient}
        onClose={() => setPaletteOpen(false)}
        onSelectAdr={selectAdr}
        onNewAdr={clearSelection}
        onCompare={openCompare}
      />

      {comparisonOpen ? (
        // Comparison-as-action overlay (Req 2.5, 3.4, 11.2). Reachable with no
        // selection (command-bar Compare) and scoped from the header (header
        // Compare) — both call `openCompare()`. CompareLauncher owns its own id
        // entry. The container keeps the migrated `panel-comparison` hook.
        <div className="comparison-overlay" role="presentation">
          <div
            className="comparison-overlay__backdrop"
            data-testid="comparison-overlay-backdrop"
            onClick={() => closeCompare()}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Comparison"
            className="comparison-overlay__panel"
            data-testid="panel-comparison"
          >
            <div className="comparison-overlay__bar">
              <button
                type="button"
                data-testid="comparison-close"
                className="btn btn--ghost"
                onClick={() => closeCompare()}
              >
                Close
              </button>
            </div>
            <CompareLauncher apiClient={apiClient} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
