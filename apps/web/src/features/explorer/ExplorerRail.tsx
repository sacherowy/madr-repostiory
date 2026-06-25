import { useState } from "react";
import type { ApiClient } from "../../api/client.js";
import { FolderTree } from "../folder-tree/FolderTree.js";

export interface ExplorerRailProps {
  apiClient: ApiClient;
  /** Session author name (from the shell), forwarded to FolderTree for create/move. */
  authorName: string;
  /** Id of the currently-selected ADR, forwarded to FolderTree for raised selection (Req 5.5). */
  selectedAdrId: string | null;
  /** Current folder location, the source of the path breadcrumb (Req 5.3). */
  selectedFolder: string | null;
  onSelectFolder: (path: string) => void;
  onSelectAdr: (id: string) => void;
}

/**
 * Splits a folder path on "/" into non-empty crumb segments. An empty/whitespace
 * path yields no segments so the caller can fall back to a root/empty state.
 */
function toCrumbs(folder: string | null): string[] {
  if (folder == null) return [];
  return folder
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/**
 * Tree View 2.0 explorer wrapper (design.md `ExplorerRail`). Owns a live filter
 * input (Req 5.2) and a path breadcrumb (Req 5.3) AROUND `FolderTree`, which
 * still owns all backend calls (tree fetch, folder create, ADR move). This
 * component is a presentational wrapper: it holds only the filter as local
 * state and derives the breadcrumb from props — it performs no data fetching of
 * its own and imports no store (App wires props later).
 */
export function ExplorerRail({
  apiClient,
  authorName,
  selectedAdrId,
  selectedFolder,
  onSelectFolder,
  onSelectAdr,
}: ExplorerRailProps) {
  // Local presentation state: the filter value flows down to FolderTree's
  // `filter` prop so typing narrows the visible tree (Req 5.2).
  const [filterValue, setFilterValue] = useState("");

  const crumbs = toCrumbs(selectedFolder);

  return (
    <div data-testid="explorer-rail" className="explorer-rail">
      <div className="field explorer-rail__filter">
        <label className="field__label" htmlFor="explorer-filter-input">
          Filter tree
        </label>
        <input
          id="explorer-filter-input"
          data-testid="explorer-filter-input"
          className="field__input"
          type="text"
          value={filterValue}
          onChange={(event) => setFilterValue(event.target.value)}
        />
      </div>

      {/* Path breadcrumb (Req 5.3). Labelled for assistive tech via <nav
          aria-label>; derived from selectedFolder, falling back to the selected
          ADR id, then a root/empty state when nothing is selected. */}
      <nav
        data-testid="explorer-breadcrumb"
        className="explorer-rail__breadcrumb"
        aria-label="Current location"
      >
        {crumbs.length > 0 ? (
          <ol className="explorer-rail__crumbs">
            {crumbs.map((crumb, index) => (
              <li
                key={`${crumb}-${index}`}
                className="explorer-rail__crumb"
                data-testid={`explorer-crumb-${crumb}`}
              >
                {crumb}
              </li>
            ))}
          </ol>
        ) : selectedAdrId != null ? (
          <span className="explorer-rail__crumb explorer-rail__crumb--adr">{selectedAdrId}</span>
        ) : (
          <span className="explorer-rail__crumb explorer-rail__crumb--root">All decisions</span>
        )}
      </nav>

      <FolderTree
        apiClient={apiClient}
        authorName={authorName}
        onSelectFolder={onSelectFolder}
        onSelectAdr={onSelectAdr}
        filter={filterValue}
        selectedAdrId={selectedAdrId}
      />
    </div>
  );
}
