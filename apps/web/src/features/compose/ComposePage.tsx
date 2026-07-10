import { useState, type ReactNode } from "react";
import { STATUS_LABELS, type AdrId, type AdrSections, type AdrStatus } from "@adr/shared";
import { FRIENDLY_SECTIONS } from "../article/sectionNames.js";
import { PromptCard } from "./PromptCard.js";
import "../../styles/compose.css";

/**
 * The narrative MADR sections ComposePage owns as prompt cards. The remaining
 * sections are handled by mount slots so sibling tasks fill them additively:
 * `consideredOptions` / `prosAndConsOfTheOptions` / `decisionOutcome` live in the
 * option-cards slot (task 7.3, which also owns the outcome lock/prefill), the
 * short description lives in the summary-control slot (task 7.4). Keeping those
 * out of the prompt-card loop mirrors ArticlePage, which likewise hosts the
 * option slot at the Considered Options position rather than a raw section.
 */
type PromptSectionKey =
  | "contextAndProblemStatement"
  | "decisionDrivers"
  | "consequences"
  | "confirmation"
  | "moreInformation";

/** Sections rendered above the option-cards slot (the framing of the decision). */
const SECTIONS_BEFORE_OPTIONS: readonly PromptSectionKey[] = [
  "contextAndProblemStatement",
  "decisionDrivers",
];

/** Sections rendered below the option-cards slot (the outworking of the decision). */
const SECTIONS_AFTER_OPTIONS: readonly PromptSectionKey[] = [
  "consequences",
  "confirmation",
  "moreInformation",
];

/** Per-section helper text + example placeholder shown inside each prompt card (Req 8.1). */
const SECTION_PROMPTS: Record<PromptSectionKey, { helper: string; placeholder: string }> = {
  contextAndProblemStatement: {
    helper: "What situation made this decision necessary? Set the scene in a few plain sentences.",
    placeholder: "e.g. Our reporting data is spread across spreadsheets that no longer scale…",
  },
  decisionDrivers: {
    helper: "What mattered most as you weighed the choice? List the forces at play.",
    placeholder: "e.g. Reporting teams need ad-hoc queries; the platform must pass audit…",
  },
  consequences: {
    helper: "Once this is in place, what changes for the team — the upsides and the trade-offs?",
    placeholder: "e.g. Reporting can self-serve, but we take on a database to operate…",
  },
  confirmation: {
    helper: "How will you know the decision is actually working?",
    placeholder: "e.g. A reporting dashboard ships and passes the quarterly audit…",
  },
  moreInformation: {
    helper: "Anything else worth linking or noting for future readers?",
    placeholder: "e.g. Links to the spike, related decisions, or vendor docs…",
  },
};

/** Stored statuses in the order their plain-word segments appear (Req 8.2). */
const STATUS_SEGMENTS: readonly AdrStatus[] = [
  "proposed",
  "accepted",
  "deprecated",
  "superseded",
  "rejected",
];

/**
 * The slice of decision content ComposePage owns directly (title, status, and the
 * narrative prompt-card sections). The option/people/relation/summary state lives
 * in the sibling slot components and is assembled with this draft by task 7.6's
 * save wiring; keeping the draft scoped to what this page controls keeps the
 * skeleton pure and its publish gate honest.
 */
export interface ComposeDraft {
  title: string;
  status: AdrStatus;
  contextAndProblemStatement: string;
  decisionDrivers: string;
  consequences: string;
  confirmation: string;
  moreInformation: string;
}

export interface ComposePageProps {
  /**
   * Absent selects create mode; a decision id selects edit mode for that
   * decision — matching `portalStore`'s `{ kind: "compose"; id? }` view.
   */
  adrId?: AdrId;
  /**
   * Edit-mode preload seam: the loaded decision's values, seeded into the form on
   * first render. Create mode leaves this undefined (empty form). The actual load
   * + save round-trip (createAdr/updateAdr, 409 recovery) is wired by task 7.6;
   * this page stays a controlled skeleton so its gate/structure tests stay pure.
   */
  initialDraft?: ComposeDraft;
  /**
   * Fired with the current draft when the author publishes/saves. Task 7.6
   * replaces the parent's handler with the real save; the gate itself (title +
   * context) lives here (Req 8.3).
   */
  onPublish?: (draft: ComposeDraft) => void;
  /** Mount slot: topic / people / relations editors (task 7.2). */
  topicPeopleRelations?: ReactNode;
  /** Mount slot: option cards + Mark-as-chosen + outcome (task 7.3). */
  optionCards?: ReactNode;
  /** Mount slot: short-description summary control (task 7.4). */
  summaryControl?: ReactNode;
  /** Mount slot: live feed-card preview rail (task 7.5). */
  previewRail?: ReactNode;
}

/** The empty create-mode draft (status defaults to "In discussion" — Req 8.3). */
function emptyDraft(): ComposeDraft {
  return {
    title: "",
    status: "proposed",
    contextAndProblemStatement: "",
    decisionDrivers: "",
    consequences: "",
    confirmation: "",
    moreInformation: "",
  };
}

/** Friendly-name + canonical-heading lookup, sourced from the article's mapping. */
function friendlyFor(key: keyof AdrSections) {
  const section = FRIENDLY_SECTIONS.find((s) => s.key === key);
  // FRIENDLY_SECTIONS is derived from MADR_SECTIONS, which contains every section
  // key, so this is always defined; the fallback keeps the type total.
  return section ?? { key, friendlyName: key, canonicalHeading: key };
}

/**
 * Friendly single-page decision create/edit form skeleton (design.md "UI
 * compositions" → ComposePage; Req 8.1-8.3).
 *
 * Lays out the compose surface: a title field, a plain-word status segmented
 * control (`STATUS_LABELS`, Req 8.2), the narrative MADR sections as prompt cards
 * carrying their canonical headings as subtle tags (Req 8.1), and labeled mount
 * slots for the pieces built by later tasks — topic/people/relations (7.2),
 * option cards (7.3), summary control (7.4), and the preview rail (7.5). Each
 * slot is an optional `ReactNode` seam (the same additive pattern HomePage and
 * ArticlePage use) so those tasks plug in with a one-line change and never edit
 * this file or each other's code.
 *
 * The publish gate (Req 8.3) requires only a title and a context; Decision
 * Drivers, Options, and every other section stay optional. Publishing calls
 * `onPublish` with the owned draft (status defaults to "proposed" / "In
 * discussion"); the real save — createAdr/updateAdr with 409 recovery — is wired
 * by task 7.6.
 */
export function ComposePage({
  adrId,
  initialDraft,
  onPublish,
  topicPeopleRelations,
  optionCards,
  summaryControl,
  previewRail,
}: ComposePageProps) {
  const isEdit = adrId !== undefined;
  const [draft, setDraft] = useState<ComposeDraft>(() => initialDraft ?? emptyDraft());

  function setField<K extends keyof ComposeDraft>(key: K, value: ComposeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  // Publish gate (Req 8.3): title + context required; everything else optional.
  const canPublish =
    draft.title.trim() !== "" && draft.contextAndProblemStatement.trim() !== "";

  function handlePublish() {
    if (!canPublish) return;
    onPublish?.(draft);
  }

  function renderPromptCard(key: PromptSectionKey) {
    const { friendlyName, canonicalHeading } = friendlyFor(key);
    const { helper, placeholder } = SECTION_PROMPTS[key];
    return (
      <PromptCard
        key={key}
        sectionKey={key}
        friendlyName={friendlyName}
        canonicalHeading={canonicalHeading}
        helperText={helper}
        placeholder={placeholder}
        value={draft[key]}
        onChange={(value) => setField(key, value)}
        required={key === "contextAndProblemStatement"}
      />
    );
  }

  return (
    <div className="compose" data-testid="compose-page">
      <div className="compose__layout">
        <main className="compose__main">
          <header className="compose__header">
            <h1 className="compose__title">{isEdit ? "Edit decision" : "New decision"}</h1>
            <p className="compose__lead">
              Capture the decision section by section — only a title and the context
              are needed to publish it as “{STATUS_LABELS.proposed}”.
            </p>
          </header>

          <div className="compose__field">
            <label className="field__label" htmlFor="compose-title">
              Title
            </label>
            <input
              id="compose-title"
              data-testid="compose-title-input"
              className="field__input"
              type="text"
              value={draft.title}
              placeholder="e.g. Adopt the decision feed portal"
              onChange={(event) => setField("title", event.target.value)}
            />
          </div>

          <div className="compose__field">
            <span className="field__label" id="compose-status-label">
              Status
            </span>
            <div
              className="compose__segment"
              role="group"
              aria-labelledby="compose-status-label"
              data-testid="compose-status-segment"
            >
              {STATUS_SEGMENTS.map((status) => {
                const isActive = draft.status === status;
                const classes = ["compose__segment-option", isActive ? "is-active" : null]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={status}
                    type="button"
                    className={classes}
                    data-testid={`compose-status-${status}`}
                    aria-pressed={isActive}
                    onClick={() => setField("status", status)}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Topic / people / relations editors (task 7.2). */}
          <div
            className="compose__slot"
            data-slot="topic-people-relations"
            data-testid="compose-slot-topic-people-relations"
          >
            {topicPeopleRelations}
          </div>

          {SECTIONS_BEFORE_OPTIONS.map(renderPromptCard)}

          {/* Option cards + Mark-as-chosen + Decision Outcome lock (task 7.3),
              hosted at the canonical Considered Options / Decision Outcome
              position so those sections are authored here rather than as raw
              prompt cards. */}
          <div
            className="compose__slot"
            data-slot="option-cards"
            data-testid="compose-slot-option-cards"
          >
            {optionCards}
          </div>

          {SECTIONS_AFTER_OPTIONS.map(renderPromptCard)}

          {/* Short-description summary control (task 7.4). */}
          <div
            className="compose__slot"
            data-slot="summary-control"
            data-testid="compose-slot-summary-control"
          >
            {summaryControl}
          </div>

          <div className="compose__footer">
            <button
              type="button"
              className="btn btn--primary"
              data-testid="compose-publish"
              disabled={!canPublish}
              onClick={handlePublish}
            >
              {isEdit ? "Save changes" : "Publish"}
            </button>
            {!canPublish ? (
              <p className="compose__gate-hint" data-testid="compose-publish-hint">
                Add a title and the context to publish this decision.
              </p>
            ) : null}
          </div>
        </main>

        {/* Live feed-card preview rail (task 7.5). */}
        <aside
          className="compose__rail compose__slot"
          data-slot="preview-rail"
          data-testid="compose-slot-preview-rail"
          aria-label="Live preview"
        >
          {previewRail}
        </aside>
      </div>
    </div>
  );
}
