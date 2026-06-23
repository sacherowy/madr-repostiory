import { useEffect, useState } from "react";
import type { FolderNode } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { AdrCard } from "../../components/AdrCard.js";
import { MonoChip } from "../../components/MonoChip.js";

export interface FolderTreeProps {
  apiClient: ApiClient;
  /** Session author name (from the shell), submitted as the author of folder creation/move. */
  authorName: string;
  onSelectFolder: (path: string) => void;
  onSelectAdr: (id: string) => void;
}

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "loaded"; tree: FolderNode };

export function FolderTree({ apiClient, authorName, onSelectFolder, onSelectAdr }: FolderTreeProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [currentRoot, setCurrentRoot] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [newFolderPath, setNewFolderPath] = useState("");
  const [folderMissingFields, setFolderMissingFields] = useState<string[] | null>(null);
  const [folderConflict, setFolderConflict] = useState(false);

  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [moveMissingFields, setMoveMissingFields] = useState<string[] | null>(null);
  const [moveNotFound, setMoveNotFound] = useState(false);

  async function fetchTree(root: string | undefined, isCancelled: () => boolean = () => false) {
    setLoadState({ kind: "loading" });
    try {
      const result = await apiClient.getTree(root);
      if (isCancelled()) return;
      if (!result.ok) {
        setLoadState({ kind: "error" });
        return;
      }
      setLoadState({ kind: "loaded", tree: result.tree });
    } catch {
      // A network-level failure (e.g. no reachable API, mirroring AdrEditor's
      // own getAdr().catch() handling) is treated the same as an `ok:false`
      // response: there's nothing more specific the user can do with it.
      if (!isCancelled()) setLoadState({ kind: "error" });
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchTree(undefined, () => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleExpanded(path: string) {
    setExpanded((current) => ({ ...current, [path]: !(current[path] ?? true) }));
  }

  async function handleSelectFolder(path: string) {
    onSelectFolder(path);
    setCurrentRoot(path);
    await fetchTree(path);
  }

  async function handleCreateFolder() {
    const result = await apiClient.createFolder({ path: newFolderPath, author: authorName });
    if (result.ok) {
      setFolderMissingFields(null);
      setFolderConflict(false);
      await fetchTree(currentRoot);
      return;
    }
    if (result.kind === "invalid") {
      setFolderMissingFields(result.missingFields);
      setFolderConflict(false);
      return;
    }
    // kind === "conflict"
    setFolderConflict(true);
    setFolderMissingFields(null);
  }

  async function handleMoveAdr(id: string) {
    const targetFolder = moveTargets[id] ?? "";
    const result = await apiClient.moveAdr(id, { targetFolder, author: authorName });
    if (result.ok) {
      setMoveMissingFields(null);
      setMoveNotFound(false);
      await fetchTree(currentRoot);
      return;
    }
    if (result.kind === "invalid") {
      setMoveMissingFields(result.missingFields);
      setMoveNotFound(false);
      return;
    }
    // kind === "notFound"
    setMoveNotFound(true);
    setMoveMissingFields(null);
  }

  function renderAdr(adrId: string, title: string, status: string) {
    return (
      <li key={adrId} data-testid={`adr-node-${adrId}`}>
        <AdrCard
          id={adrId}
          title={title}
          status={status}
          meta={
            <>
              {/* Raw status key preserved verbatim alongside the status badge so
                  machine-readable status text stays available (the badge shows a
                  capitalized human label). */}
              <MonoChip variant="status" value={status} />
              <button
                data-testid={`adr-select-${adrId}`}
                className="btn btn--secondary"
                type="button"
                onClick={() => onSelectAdr(adrId)}
              >
                Open
              </button>
              <div className="field">
                <label className="field__label" htmlFor={`move-target-input-${adrId}`}>
                  Move to folder
                </label>
                <div className="card__header">
                  <input
                    id={`move-target-input-${adrId}`}
                    data-testid={`move-target-input-${adrId}`}
                    className="field__input"
                    type="text"
                    value={moveTargets[adrId] ?? ""}
                    onChange={(event) =>
                      setMoveTargets((current) => ({ ...current, [adrId]: event.target.value }))
                    }
                  />
                  <button
                    data-testid={`move-button-${adrId}`}
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => handleMoveAdr(adrId)}
                  >
                    Move here
                  </button>
                </div>
              </div>
            </>
          }
        />
      </li>
    );
  }

  function renderFolder(node: FolderNode): React.ReactNode {
    const isExpanded = expanded[node.path] ?? true;
    return (
      <li key={node.path} data-testid={`folder-node-${node.path}`}>
        <div className="card__header">
          <button
            data-testid={`folder-toggle-${node.path}`}
            className="btn btn--ghost"
            type="button"
            onClick={() => toggleExpanded(node.path)}
          >
            {isExpanded ? "-" : "+"}
          </button>
          <span
            data-testid={`folder-select-${node.path}`}
            className="folder-tree__folder-name"
            onClick={() => handleSelectFolder(node.path)}
          >
            {node.name}
          </span>
        </div>
        {isExpanded ? (
          <ul className="folder-tree__children">
            {node.folders.map((child) => renderFolder(child))}
            {node.adrs.map((adr) => renderAdr(adr.id, adr.title, adr.status))}
          </ul>
        ) : null}
      </li>
    );
  }

  if (loadState.kind === "loading") {
    return (
      <div data-testid="folder-tree-loading" className="state state--loading">
        <span className="state__spinner" aria-hidden="true" />
        <p className="state__message">Loading…</p>
      </div>
    );
  }

  if (loadState.kind === "error") {
    return (
      <div data-testid="folder-tree-error" className="state state--error">
        <p className="state__message">Failed to load the folder tree.</p>
      </div>
    );
  }

  const folderFieldHasError = folderMissingFields !== null || folderConflict;

  return (
    <div data-testid="folder-tree" className="folder-tree">
      <div className={`field${folderFieldHasError ? " field--error" : ""}`}>
        <label className="field__label" htmlFor="new-folder-path-input">
          New folder path
        </label>
        <div className="card__header">
          <input
            id="new-folder-path-input"
            data-testid="new-folder-path-input"
            className="field__input"
            type="text"
            value={newFolderPath}
            onChange={(event) => setNewFolderPath(event.target.value)}
          />
          <button
            data-testid="create-folder-button"
            className="btn btn--primary"
            type="button"
            onClick={handleCreateFolder}
          >
            Create folder
          </button>
        </div>
        {folderMissingFields !== null ? (
          <p data-testid="folder-missing-fields-message" className="state state--error state__message">
            Missing fields: {folderMissingFields.join(", ")}
          </p>
        ) : null}
        {folderConflict ? (
          <p data-testid="folder-conflict-message" className="state state--error state__message">
            A folder already exists at that path.
          </p>
        ) : null}
      </div>

      {moveMissingFields !== null ? (
        <p data-testid="move-missing-fields-message" className="state state--error state__message">
          Missing fields: {moveMissingFields.join(", ")}
        </p>
      ) : null}
      {moveNotFound ? (
        <p data-testid="move-not-found-message" className="state state--error state__message">
          ADR not found.
        </p>
      ) : null}

      <ul className="folder-tree__root">{renderFolder(loadState.tree)}</ul>
    </div>
  );
}
