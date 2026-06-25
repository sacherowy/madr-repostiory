import type { CommitMeta, SimilarityResult } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { MonoChip } from "../../components/MonoChip.js";
import { SimilarityMeter } from "../../components/SimilarityMeter.js";
import { useInspectorPreviews } from "../../hooks/useInspectorPreviews.js";

export interface InspectorRailProps {
  /** Threaded to `useInspectorPreviews`; the rail performs no data fetching of its own. */
  apiClient: ApiClient;
  /** Selected ADR; `null` means nothing is selected (no ADR previews — Req 6.5). */
  adrId: string | null;
  /** Similarity scope (selected folder), forwarded to the previews hook. */
  folder: string | null;
  /** Open/closed state owned by App (defaults false). Collapsed by default — Req 6.2. */
  open: boolean;
  /** Toggles the rail open/closed (App owns the state). */
  onToggle: () => void;
  /** Navigates into the corresponding full aspect (Req 6.4). */
  onOpenAspect: (aspect: "similar" | "history") => void;
}

/** Top-N cap so the previews stay compact; full data lives in the aspects (Req 6.1). */
const PREVIEW_LIMIT = 4;

/**
 * Collapsed-by-default contextual inspector rail (design.md `InspectorRail`,
 * Req 6.1–6.5, 9.2). The open/closed state is owned by App and reflected via the
 * `open` prop — this component never imports the workspace store. When open with
 * an ADR selected it renders a read-only top-Similar preview (similarity meters)
 * and a recent-history preview sourced from `useInspectorPreviews`; each section
 * links into its full aspect via `onOpenAspect`. Graceful loading/empty/error
 * states come straight from the query state; offline-empty similarity (`data` is
 * `[]`) is an EMPTY preview, never an error.
 */
export function InspectorRail({
  apiClient,
  adrId,
  folder,
  open,
  onToggle,
  onOpenAspect,
}: InspectorRailProps) {
  // Queries are enabled only while open && adrId !== null (the hook gates on this).
  const { similar, history } = useInspectorPreviews(apiClient, adrId, folder, open);

  return (
    <aside
      data-testid="inspector-rail"
      className="inspector glass"
      aria-label="Inspector"
      data-open={open ? "true" : "false"}
    >
      <div className="inspector__bar">
        <button
          type="button"
          data-testid="inspector-toggle"
          className="btn btn--ghost inspector__toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Collapse inspector" : "Expand inspector"}
        >
          {open ? "Hide inspector" : "Show inspector"}
        </button>
      </div>

      {open ? (
        adrId === null ? (
          <div data-testid="inspector-empty" className="inspector__hint state state--empty">
            <p className="state__message">Select an ADR to see related context.</p>
          </div>
        ) : (
          <div className="inspector__body">
            <SimilarPreview
              similar={similar}
              onViewAll={() => onOpenAspect("similar")}
            />
            <HistoryPreview
              history={history}
              onViewAll={() => onOpenAspect("history")}
            />
          </div>
        )
      ) : null}
    </aside>
  );
}

interface SimilarPreviewProps {
  similar: { data?: SimilarityResult[]; isPending: boolean; isError: boolean };
  onViewAll: () => void;
}

function SimilarPreview({ similar, onViewAll }: SimilarPreviewProps) {
  return (
    <section data-testid="inspector-similar" className="inspector__section">
      <div className="inspector__section-head">
        <h2 className="inspector__section-title">Similar</h2>
        <button
          type="button"
          data-testid="inspector-similar-view-all"
          className="btn btn--ghost inspector__view-all"
          onClick={onViewAll}
        >
          View all
        </button>
      </div>
      <SimilarBody similar={similar} />
    </section>
  );
}

function SimilarBody({
  similar,
}: {
  similar: { data?: SimilarityResult[]; isPending: boolean; isError: boolean };
}) {
  if (similar.isError) {
    return (
      <div data-testid="inspector-similar-error" className="state state--error">
        <p className="state__message">Failed to load similar ADRs.</p>
      </div>
    );
  }
  if (similar.isPending || similar.data === undefined) {
    return (
      <div data-testid="inspector-similar-loading" className="state state--loading">
        <span className="state__spinner" aria-hidden="true" />
        <p className="state__message">Loading…</p>
      </div>
    );
  }
  if (similar.data.length === 0) {
    return (
      <div data-testid="inspector-similar-empty" className="state state--empty">
        <p className="state__message">No similar ADRs in this scope.</p>
      </div>
    );
  }
  return (
    <ul className="inspector__list">
      {similar.data.slice(0, PREVIEW_LIMIT).map((result) => (
        <li
          key={result.adr.id}
          data-testid={`inspector-similar-${result.adr.id}`}
          className="inspector__item card"
        >
          <div className="inspector__item-head">
            <MonoChip variant="id" value={result.adr.id} />
            <span className="inspector__item-title">{result.adr.title}</span>
          </div>
          <SimilarityMeter score={result.score} />
        </li>
      ))}
    </ul>
  );
}

interface HistoryPreviewProps {
  history: { data?: CommitMeta[]; isPending: boolean; isError: boolean };
  onViewAll: () => void;
}

function HistoryPreview({ history, onViewAll }: HistoryPreviewProps) {
  return (
    <section data-testid="inspector-history" className="inspector__section">
      <div className="inspector__section-head">
        <h2 className="inspector__section-title">Recent history</h2>
        <button
          type="button"
          data-testid="inspector-history-view-all"
          className="btn btn--ghost inspector__view-all"
          onClick={onViewAll}
        >
          View all
        </button>
      </div>
      <HistoryBody history={history} />
    </section>
  );
}

function HistoryBody({
  history,
}: {
  history: { data?: CommitMeta[]; isPending: boolean; isError: boolean };
}) {
  if (history.isError) {
    return (
      <div data-testid="inspector-history-error" className="state state--error">
        <p className="state__message">Failed to load history.</p>
      </div>
    );
  }
  if (history.isPending || history.data === undefined) {
    return (
      <div data-testid="inspector-history-loading" className="state state--loading">
        <span className="state__spinner" aria-hidden="true" />
        <p className="state__message">Loading…</p>
      </div>
    );
  }
  if (history.data.length === 0) {
    return (
      <div data-testid="inspector-history-empty" className="state state--empty">
        <p className="state__message">No recent changes.</p>
      </div>
    );
  }
  return (
    <ul className="inspector__list">
      {history.data.slice(0, PREVIEW_LIMIT).map((commit) => (
        <li
          key={commit.sha}
          data-testid={`inspector-history-${commit.sha}`}
          className="inspector__item card"
        >
          <div className="inspector__item-head">
            <span className="inspector__item-author">{commit.author}</span>
            <MonoChip variant="sha" value={commit.sha} />
          </div>
          <p className="inspector__item-message">{commit.message}</p>
        </li>
      ))}
    </ul>
  );
}
