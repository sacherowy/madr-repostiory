import { useState } from "react";
import type { SearchHit } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";

export interface SearchPanelProps {
  apiClient: ApiClient;
  onSelectAdr: (id: string) => void;
}

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; hits: SearchHit[] };

/**
 * Keyword search box + ranked results list. Submission is an explicit user
 * action (button click or Enter/form-submit), never live-as-you-type —
 * mirrors every other explicit-action control in this codebase (FolderTree's
 * "create folder"/"move" buttons, AdrEditor's "save" button). Ranking (Req
 * 9.2) is entirely the backend's job (bm25() in SqliteSearchIndex); the
 * results are rendered in exactly the order `apiClient.search` returns them,
 * never re-sorted here.
 *
 * A `SearchHit` carries only `id` and `score` (no title/snippet — see
 * `@adr/shared`'s own doc-comment on why that type is intentionally minimal),
 * so each result can only display those two fields.
 */
export function SearchPanel({ apiClient, onSelectAdr }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "loading" });
    try {
      const result = await apiClient.search(query);
      if (!result.ok) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: "loaded", hits: result.hits });
    } catch {
      // A network-level failure (mirroring RelationsPanel's/HistoryTimeline's
      // own catch handling) is treated the same as an `ok:false` response:
      // there's nothing more specific the user can do with it.
      setState({ kind: "error" });
    }
  }

  return (
    <div data-testid="search-panel">
      <form data-testid="search-form" onSubmit={handleSubmit}>
        <label htmlFor="search-query-input">Search</label>
        <input
          id="search-query-input"
          data-testid="search-query-input"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button data-testid="search-submit-button" type="submit">
          Search
        </button>
      </form>

      {state.kind === "loading" ? <div data-testid="search-loading">Searching…</div> : null}

      {state.kind === "error" ? <div data-testid="search-error">Search failed.</div> : null}

      {state.kind === "loaded" && state.hits.length === 0 ? (
        <div data-testid="search-no-results">No results found.</div>
      ) : null}

      {state.kind === "loaded" && state.hits.length > 0 ? (
        <ul data-testid="search-results">
          {state.hits.map((hit) => (
            <li key={hit.id}>
              <button
                data-testid={`search-result-${hit.id}`}
                type="button"
                onClick={() => onSelectAdr(hit.id)}
              >
                {hit.id} (score: {hit.score})
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
