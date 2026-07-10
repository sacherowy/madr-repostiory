import { useEffect, useState } from "react";
import type { AdrId, FolderNode } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";

export interface TopicPickerProps {
  apiClient: ApiClient;
  /** Session author name, submitted as the author of folder creation / move. */
  authorName: string;
  /**
   * Absent selects create mode (the author simply chooses/creates the topic the
   * new decision will live in). A decision id selects edit mode: changing the
   * topic MOVES the stored record (`moveAdr`).
   */
  adrId?: AdrId;
  /** Currently selected topic (folder path; "" before a choice is made). */
  value: string;
  /** Reports the chosen topic (folder path) once selection/creation/move settles. */
  onChange: (path: string) => void;
}

/** A folder presented as a browsable topic. */
interface TopicOption {
  path: string;
  name: string;
  depth: number;
}

/**
 * Flattens the folder tree into a depth-tagged list of topics. The repository
 * root (`path === "."`) is surfaced under the plain-language label "General"
 * rather than its raw "." folder name (Req 1.3 presents folders as Topics).
 */
function flattenTopics(node: FolderNode, depth = 0): TopicOption[] {
  const self: TopicOption = {
    path: node.path,
    name: node.path === "." || node.path === "" ? "General" : node.name,
    depth,
  };
  const children = node.folders.flatMap((child) => flattenTopics(child, depth + 1));
  return [self, ...children];
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; topics: TopicOption[] };

/**
 * Topic picker for the compose form (design.md "UI compositions" → ComposePage:
 * "TopicPicker wraps getTree+createFolder+moveAdr"; File Structure Plan →
 * `features/compose/TopicPicker.tsx`; Req 8.4, 1.3).
 *
 * Wraps the existing folder API: it lists folders as plain-language Topics
 * (`getTree`), lets the author create a new topic (`createFolder`), and — in edit
 * mode only — moves the record when the author changes its topic (`moveAdr`). In
 * create mode selecting a topic just records the chosen folder path (task 7.6's
 * save wires it into `createAdr`); no move happens because there is nothing saved
 * to move yet.
 *
 * This is the one compose editor that talks to the real backend, so its tests
 * apply the teardown-race rule (await a settled marker; closeAllConnections +
 * app.close in afterEach).
 */
export function TopicPicker({ apiClient, authorName, adrId, value, onChange }: TopicPickerProps) {
  const isEdit = adrId !== undefined;
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [newTopic, setNewTopic] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  async function loadTopics(isCancelled: () => boolean = () => false) {
    setLoadState({ kind: "loading" });
    try {
      const result = await apiClient.getTree();
      if (isCancelled()) return;
      if (!result.ok) {
        setLoadState({ kind: "error" });
        return;
      }
      setLoadState({ kind: "loaded", topics: flattenTopics(result.tree) });
    } catch {
      // A network-level failure is treated the same as an `ok:false` response,
      // mirroring FolderTree's own getTree().catch() handling.
      if (!isCancelled()) setLoadState({ kind: "error" });
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadTopics(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelectTopic(path: string) {
    if (path === value) return;
    setMoveError(null);

    // Create mode: nothing is saved yet, so just record the chosen folder.
    if (!isEdit) {
      onChange(path);
      return;
    }

    // Edit mode: changing the topic moves the stored record.
    const result = await apiClient.moveAdr(adrId as AdrId, { targetFolder: path, author: authorName });
    if (result.ok) {
      onChange(path);
      await loadTopics();
      return;
    }
    if (result.kind === "invalid") {
      setMoveError(`Missing fields: ${result.missingFields.join(", ")}`);
      return;
    }
    // kind === "notFound"
    setMoveError("This decision could not be found to move.");
  }

  async function handleCreateTopic() {
    const path = newTopic.trim();
    if (path === "") return;
    const result = await apiClient.createFolder({ path, author: authorName });
    if (result.ok) {
      setCreateError(null);
      setNewTopic("");
      await loadTopics();
      // Choose the freshly created topic — routing through handleSelectTopic so
      // edit mode also moves the record into the new topic.
      await handleSelectTopic(path);
      return;
    }
    if (result.kind === "invalid") {
      setCreateError(`Missing fields: ${result.missingFields.join(", ")}`);
      return;
    }
    // kind === "conflict"
    setCreateError("A topic already exists at that path.");
  }

  return (
    <section className="topic-picker" data-testid="compose-topic-picker">
      <div className="topic-picker__head">
        <h3 className="topic-picker__title">Topic</h3>
        <p className="topic-picker__helper">
          {isEdit
            ? "Which topic does this decision belong to? Changing it moves the decision."
            : "Which topic should this decision live under?"}
        </p>
      </div>

      {loadState.kind === "loading" ? (
        <div data-testid="compose-topic-loading" className="state state--loading">
          <span className="state__spinner" aria-hidden="true" />
          <p className="state__message">Loading topics…</p>
        </div>
      ) : null}

      {loadState.kind === "error" ? (
        <div data-testid="compose-topic-error" className="state state--error">
          <p className="state__message">Failed to load topics.</p>
        </div>
      ) : null}

      {loadState.kind === "loaded" ? (
        <div className="topic-picker__options" role="group" aria-label="Topic" data-testid="compose-topic-options">
          {loadState.topics.map((topic) => {
            const isActive = topic.path === value;
            return (
              <button
                key={topic.path}
                type="button"
                data-testid={`compose-topic-option-${topic.path}`}
                className={`topic-picker__option${isActive ? " is-active" : ""}`}
                style={{ "--topic-depth": topic.depth } as React.CSSProperties}
                aria-pressed={isActive}
                onClick={() => handleSelectTopic(topic.path)}
              >
                {topic.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {moveError !== null ? (
        <p data-testid="compose-topic-move-error" className="state state--error state__message">
          {moveError}
        </p>
      ) : null}

      <div className="topic-picker__create field">
        <label className="field__label" htmlFor="compose-new-topic-input">
          New topic
        </label>
        <div className="topic-picker__create-row">
          <input
            id="compose-new-topic-input"
            data-testid="compose-new-topic-input"
            className="field__input"
            type="text"
            value={newTopic}
            placeholder="e.g. decisions/platform"
            onChange={(event) => setNewTopic(event.target.value)}
          />
          <button
            type="button"
            data-testid="compose-new-topic-create"
            className="btn btn--secondary"
            onClick={handleCreateTopic}
          >
            Create topic
          </button>
        </div>
        {createError !== null ? (
          <p data-testid="compose-topic-create-error" className="state state--error state__message">
            {createError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
