import { useEffect, useRef } from "react";
import type { ApiClient } from "../../api/client.js";
import { SearchPanel } from "../search/SearchPanel.js";

export interface CommandPaletteProps {
  open: boolean;
  apiClient: ApiClient;
  onClose: () => void;
  onSelectAdr: (id: string) => void;
  onNewAdr: () => void;
  onCompare: () => void;
}

/**
 * Cmd-K command palette (Req 4): an accessible modal dialog composing the
 * existing `SearchPanel` (reused verbatim for keyword search + jump) with three
 * action commands (New ADR, Compare, Focus search).
 *
 * Presentational/composition only: it never imports the workspace store and
 * never calls `apiClient` itself — `SearchPanel` owns the `apiClient.search`
 * call. CommandPalette only composes and wires callbacks:
 *   - selecting a search result selects the ADR AND closes (Req 4.3);
 *   - New ADR / Compare start their action then close (Req 4.4/4.5);
 *   - Focus search re-focuses the query field and does NOT close (Req 4.4);
 *   - Escape and overlay-click dismiss the palette without ever touching
 *     selection (Req 4.6) — dismissal only calls `onClose`.
 */
export function CommandPalette({
  open,
  apiClient,
  onClose,
  onSelectAdr,
  onNewAdr,
  onCompare,
}: CommandPaletteProps) {
  const queryInputRef = useRef<HTMLInputElement | null>(null);

  // On open, move focus into the dialog by focusing SearchPanel's query field
  // (Req 9.2: keyboard-operable; design "focus moved to the query field on
  // open"). SearchPanel renders `#search-query-input`; we locate it within the
  // palette root rather than reaching across the document.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const input = rootRef.current?.querySelector<HTMLInputElement>("#search-query-input");
    queryInputRef.current = input ?? null;
    input?.focus();
  }, [open]);

  if (!open) return null;

  function focusSearch() {
    const input =
      queryInputRef.current ??
      rootRef.current?.querySelector<HTMLInputElement>("#search-query-input") ??
      null;
    queryInputRef.current = input;
    input?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      ref={rootRef}
      data-testid="command-palette"
      className="command-palette"
      onKeyDown={handleKeyDown}
    >
      {/*
        Backdrop: a click on the overlay (outside the dialog panel) dismisses
        the palette (Req 4.6). The panel below stops propagation so clicks
        inside it never reach the overlay handler.
      */}
      <div
        data-testid="command-palette-overlay"
        className="command-palette__overlay"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="command-palette__panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="command-palette__search">
          <SearchPanel
            apiClient={apiClient}
            onSelectAdr={(id) => {
              onSelectAdr(id);
              onClose();
            }}
          />
        </div>

        <div
          className="command-palette__actions"
          role="group"
          aria-label="Command palette actions"
        >
          <button
            data-testid="command-action-new"
            type="button"
            className="btn btn--primary command-palette__action"
            onClick={() => {
              onNewAdr();
              onClose();
            }}
          >
            New ADR
          </button>
          <button
            data-testid="command-action-compare"
            type="button"
            className="btn command-palette__action"
            onClick={() => {
              onCompare();
              onClose();
            }}
          >
            Compare
          </button>
          <button
            data-testid="command-action-focus-search"
            type="button"
            className="btn command-palette__action"
            onClick={focusSearch}
          >
            Focus search
          </button>
        </div>
      </div>
    </div>
  );
}
