import { useState } from "react";
import type { SearchHit } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { MonoChip } from "../../components/MonoChip.js";

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
    <div data-testid="search-panel" className="search">
      <form data-testid="search-form" onSubmit={handleSubmit} className="search__form">
        <div className="field">
          <label htmlFor="search-query-input" className="field__label">
            Search
          </label>
          <input
            id="search-query-input"
            data-testid="search-query-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="field__input"
            placeholder="Search ADRs by keyword…"
          />
        </div>
        <button data-testid="search-submit-button" type="submit" className="btn btn--primary">
          Search
        </button>
      </form>

      {state.kind === "loading" ? (
        <div data-testid="search-loading" className="state state--loading">
          <span className="state__spinner" aria-hidden="true" />
          <p className="state__message">Searching…</p>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div data-testid="search-error" className="state state--error">
          <p className="state__message">Search failed.</p>
        </div>
      ) : null}

      {state.kind === "loaded" && state.hits.length === 0 ? (
        <div data-testid="search-no-results" className="state state--empty">
          <p className="state__title">No results found.</p>
          <p className="state__message">
            Try a different keyword to find the decisions you’re looking for.
          </p>
        </div>
      ) : null}

      {state.kind === "loaded" && state.hits.length > 0 ? (
        <ul data-testid="search-results" className="search__results">
          {state.hits.map((hit) => (
            <li key={hit.id} className="search__result-item">
              {/*
               * Card treatment, not the full AdrCard primitive: a `SearchHit`
               * carries only `id` and `score` (no title/status — see this
               * component's own doc-comment and @adr/shared), and AdrCard
               * requires id+title+status. Fetching the missing fields is out
               * of scope (behavior/API preserved), so each result is rendered
               * truthfully from the real data only — the ADR id as a MonoChip
               * and the raw relevance score in the footer.
               */}
              <button
                data-testid={`search-result-${hit.id}`}
                type="button"
                onClick={() => onSelectAdr(hit.id)}
                className="card search__result-card"
              >
                <span className="card__accent" aria-hidden="true" />
                <span className="card__body search__result-body">
                  <span className="card__header">
                    <MonoChip variant="id" value={hit.id} />
                  </span>
                </span>
                <span className="card__footer search__result-footer">
                  <span className="search__result-score mono">score: {hit.score}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
