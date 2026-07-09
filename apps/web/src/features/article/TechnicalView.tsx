import type { AdrId } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { HistoryTimeline } from "../history-timeline/HistoryTimeline.js";
import { CompareLauncher } from "../diff-viewer/CompareLauncher.js";
import { useRawAdr } from "../../hooks/useRawAdr.js";
import "../../styles/article.css";

export interface TechnicalViewProps {
  /** Data source: raw content, history, and the comparison flows. */
  apiClient: ApiClient;
  /** The decision whose raw record + history is shown. */
  adrId: AdrId;
  /**
   * Return-to-article toggle callback (Req 7.5). Technical view is the
   * "escape hatch" over the friendly article: this component owns only the
   * *exit* affordance and calls `onClose` when the user leaves. The *entry*
   * toggle lives on the article header, and the article↔technical switch over
   * `portalStore.view.technical` (`toggleTechnicalView`) is wired by the App
   * shell (task 8.1) — this file stays a self-contained, additive component so
   * it can be unit-tested in isolation and mounted without editing ArticlePage,
   * the store, or App.
   */
  onClose: () => void;
}

/**
 * Per-decision Technical view escape hatch (design.md "UI compositions" →
 * TechnicalView; Req 7, 1.6).
 *
 * This is the engineer-facing full-fidelity counterpart of the friendly
 * article: the plain-language vocabulary layer is deliberately bypassed and
 * every stored value appears verbatim. It presents:
 *
 * - The decision's **raw Markdown content** and **file path** from
 *   `getRawAdr` (via {@link useRawAdr}, key `["raw", id]`). The markdown is
 *   rendered in a `<pre>` so the exact bytes — frontmatter `status`/relation
 *   `type` enums and canonical `##` MADR headings — are shown verbatim, never
 *   their friendly labels (Req 7.2, 1.6).
 * - The decision's **real git commit history** with per-version viewing by
 *   reusing {@link HistoryTimeline} unchanged (Req 7.3).
 * - The existing **version-diff and ADR-to-ADR comparison** flows by reusing
 *   {@link CompareLauncher} unchanged — it hosts `VersionDiffView` (version
 *   diffs, Req 7.3) and `AdrCompareView` (ADR-to-ADR comparison, Req 7.4).
 * - A **"Return to article"** toggle that calls {@link TechnicalViewProps.onClose}
 *   to go back to the friendly article presentation (Req 7.5).
 *
 * The reused history/diff/compare components are imported as-is (never
 * rebuilt): TechnicalView is purely a composition + a raw-content pane.
 */
export function TechnicalView({ apiClient, adrId, onClose }: TechnicalViewProps) {
  const raw = useRawAdr(apiClient, adrId);

  return (
    <div className="technical" data-testid="technical-view">
      <header className="technical__header">
        <div className="technical__heading-group">
          <h1 className="technical__title">Technical view</h1>
          <p className="technical__subtitle">
            The raw MADR record and its real git history, shown verbatim.
          </p>
        </div>
        {/* Return-to-article toggle (Req 7.5). */}
        <button
          type="button"
          data-testid="technical-view-return"
          className="btn btn--secondary"
          onClick={onClose}
        >
          Return to article
        </button>
      </header>

      {/* Raw Markdown content + file path (Req 7.2); canonical values verbatim (1.6). */}
      <section className="technical__section" aria-label="Raw record">
        {raw.isPending ? (
          <div className="state state--loading" data-testid="technical-view-raw-loading">
            <span className="state__spinner" aria-hidden="true" />
            <p className="state__message">Loading raw record…</p>
          </div>
        ) : raw.isError || !raw.data ? (
          <div className="state state--error" data-testid="technical-view-raw-error">
            <p className="state__message">Failed to load the raw record.</p>
          </div>
        ) : (
          <div className="technical__raw">
            <div className="technical__path-row">
              <span className="technical__path-label">File</span>
              <span className="technical__path" data-testid="technical-view-path">
                {raw.data.path}
              </span>
            </div>
            <pre className="technical__raw-content" data-testid="technical-view-raw">
              {raw.data.markdown}
            </pre>
          </div>
        )}
      </section>

      {/* Real git commit history + per-version viewing, reused as-is (Req 7.3). */}
      <section className="technical__section" aria-label="Version history">
        <h2 className="technical__section-title">Version history</h2>
        <HistoryTimeline apiClient={apiClient} adrId={adrId} />
      </section>

      {/* Version-diff + ADR-to-ADR comparison, reused as-is (Req 7.3, 7.4). */}
      <section className="technical__section" aria-label="Compare">
        <h2 className="technical__section-title">Compare</h2>
        <CompareLauncher apiClient={apiClient} />
      </section>
    </div>
  );
}
