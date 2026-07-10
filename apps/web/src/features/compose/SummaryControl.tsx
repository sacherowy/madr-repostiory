import { useState } from "react";
import {
  resolveShortDescription,
  type AdrId,
  type DerivationInput,
  type ShortDescriptionSource,
} from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { useSummarySuggestion } from "../../hooks/useSummarySuggestion.js";
import "../../styles/compose.css";

export interface SummaryControlProps {
  /** Layer-1 author-owned summary value (frontmatter `summary`, Req 11.1-11.2). Controlled. */
  summary: string;
  /** Reports edits to the author summary field — also the target of "Use this" (13.3). */
  onSummaryChange: (value: string) => void;
  /**
   * Layer-2 derivation inputs: everything {@link resolveShortDescription} needs
   * except `summary` (which is the controlled field above). Combined with
   * `summary` to compute the current effective short description + its source
   * for the ladder indicator (Req 10.3, 12.1-12.4).
   */
  derivation: Omit<DerivationInput, "summary">;
  /** Title lookup for the "Replaced by <title>" derivation (12.3); defaults to none. */
  resolveTitle?: (id: AdrId) => string | undefined;
  /**
   * Edit-mode: the decision id. Absent selects create mode, where the AI
   * affordance is omitted (availability boundary — design System Flows).
   */
  adrId?: AdrId;
  /**
   * Edit-mode: the last-saved revision's blob sha, keying the suggestion cache
   * (13.2). The parent (8.1) passes it only for a saved revision whose
   * suggestion is current; while absent, the AI affordance is omitted and a
   * save hint stands in.
   */
  blobSha?: string;
  /** Api client the suggestion hook uses; only reached in edit mode. */
  apiClient: ApiClient;
}

/** Human labels for the short-description source ladder shown in the indicator. */
const SOURCE_LABELS: Record<ShortDescriptionSource, string> = {
  summary: "Your summary",
  derived: "Auto-derived",
};

/**
 * Short-description summary control for the compose form (design.md "UI
 * compositions" → ComposePage: "SummaryControl shows the source ladder, the
 * author field (11), and — in edit mode only, for the last-saved revision — the
 * AI suggestion with Use this / Write my own"; File Structure Plan →
 * `features/compose/SummaryControl.tsx`; Req 10.3, 11, 13.3-13.5).
 *
 * Three layers of the short-description pipeline, surfaced honestly:
 *  - Layer 1 (Req 11): the author-owned `summary` field. When non-blank it wins.
 *  - Layer 2 (Req 12): the deterministic derivation. Both layers are resolved by
 *    the shared {@link resolveShortDescription}, whose `source` drives the ladder
 *    indicator — "Your summary" when the field is non-empty, "Auto-derived" when
 *    empty (Req 10.3).
 *  - Layer 3 (Req 13): the optional AI suggestion, offered in edit mode only for
 *    the last-saved revision (needs `adrId` + `blobSha`) via
 *    {@link useSummarySuggestion}. "Use this" copies the sentence into the author
 *    field — the ONLY path that writes AI text, and never automatically (13.3) —
 *    at which point it becomes layer 1. "Write my own" sets the suggestion aside
 *    so the author's text overrides it (13.4). When no provider/offline/create
 *    mode/unsaved, the AI affordance is absent and a quiet hint stands in, the
 *    deterministic ladder carrying the short description without error (13.5).
 *
 * Prop-driven and additive: the layer-1 field is lifted (ComposePage/8.1 wires
 * it into the draft and the live preview); the component owns only the
 * "set aside" (dismissed) UI state.
 */
export function SummaryControl({
  summary,
  onSummaryChange,
  derivation,
  resolveTitle,
  adrId,
  blobSha,
  apiClient,
}: SummaryControlProps) {
  // "Write my own" / accepted → set the suggestion aside for this session.
  const [dismissed, setDismissed] = useState(false);

  // Effective short description + its source across layers 1-2 (Req 10.3, 12).
  const effective = resolveShortDescription(
    { ...derivation, summary },
    { resolveTitle: resolveTitle ?? (() => undefined) },
  );

  // The AI suggestion exists only for a saved revision (availability boundary).
  const isSavedRevision = adrId !== undefined && blobSha !== undefined;
  const suggestion = useSummarySuggestion(
    apiClient,
    adrId ?? null,
    blobSha ?? null,
    isSavedRevision,
  );

  const offered =
    isSavedRevision && suggestion.data?.available === true ? suggestion.data.suggestion : null;
  const showSuggestion = offered !== null && !dismissed;

  function handleUseThis() {
    if (offered === null) return;
    // 13.3: acceptance is the only path that copies AI text into layer 1.
    onSummaryChange(offered);
    setDismissed(true);
  }

  return (
    <section className="summary-control" data-testid="compose-summary-control">
      <div className="summary-control__head">
        <h3 className="summary-control__title">Short description</h3>
        <span className="option-cards__tag" data-testid="compose-summary-tag">
          saved as MADR: summary
        </span>
      </div>
      <p className="summary-control__helper">
        The one-line summary shown on the feed card. Write your own, or leave it blank to use the
        auto-derived line.
      </p>

      <div className="compose__field">
        <label className="field__label" htmlFor="compose-summary-input">
          Your summary
        </label>
        <input
          id="compose-summary-input"
          data-testid="compose-summary-input"
          className="field__input"
          type="text"
          value={summary}
          placeholder="e.g. We chose PostgreSQL for reporting because it fits our audit needs"
          onChange={(event) => onSummaryChange(event.target.value)}
        />
      </div>

      <div
        className="summary-control__source"
        data-testid="compose-summary-source"
        data-source={effective.source}
      >
        <span className="summary-control__source-label">Feed shows</span>
        <span className="summary-control__source-badge">{SOURCE_LABELS[effective.source]}</span>
        <span className="summary-control__source-text" data-testid="compose-summary-effective">
          {effective.text || "—"}
        </span>
      </div>

      {renderAiArea()}
    </section>
  );

  function renderAiArea(): JSX.Element {
    // Availability boundary (design System Flows): AI only for saved revisions.
    if (!isSavedRevision) {
      return (
        <p className="summary-control__ai-hint" data-testid="compose-summary-ai-hint">
          AI suggestions appear here once you save this decision.
        </p>
      );
    }
    if (!dismissed && suggestion.isPending) {
      return (
        <p
          className="summary-control__ai-hint is-subdued"
          data-testid="compose-summary-ai-hint"
        >
          Looking for an AI suggestion…
        </p>
      );
    }
    if (showSuggestion && offered !== null) {
      return (
        <div className="summary-control__suggestion" data-testid="compose-summary-suggestion">
          <span className="summary-control__suggestion-label">AI suggestion</span>
          <p
            className="summary-control__suggestion-text"
            data-testid="compose-summary-suggestion-text"
          >
            {offered}
          </p>
          <div className="summary-control__suggestion-actions">
            <button
              type="button"
              className="btn btn--primary"
              data-testid="compose-summary-use"
              onClick={handleUseThis}
            >
              Use this
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              data-testid="compose-summary-write-own"
              onClick={() => setDismissed(true)}
            >
              Write my own
            </button>
          </div>
        </div>
      );
    }
    // Unavailable (no-provider / provider-error / query error / set aside): a
    // subdued hint stands in for the affordance; the ladder still resolves (13.5).
    return (
      <p className="summary-control__ai-hint is-subdued" data-testid="compose-summary-ai-hint">
        {dismissed
          ? "Writing your own — the AI suggestion is set aside."
          : "AI suggestions aren’t available right now; the auto-derived line is used."}
      </p>
    );
  }
}
