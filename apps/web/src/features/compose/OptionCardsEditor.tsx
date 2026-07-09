import { useId, useState } from "react";
import type { AdrStatus } from "@adr/shared";
import { parseOptions, serializeOptions, type OptionRow } from "./options.js";
import { buildChosenOutcome, isOutcomeLocked } from "./outcome.js";
import "../../styles/compose.css";

/**
 * The stored option markdown as it lives on an `Adr`. This is the state shape
 * ComposePage / task 7.6 assembles and passes down; the editor parses it once
 * into editable rows and reports regrouped markdown back through `onChange`.
 */
export interface OptionCardsValue {
  consideredOptions: string;
  prosAndConsOfTheOptions: string;
}

export interface OptionCardsEditorProps {
  /** Seed values (the two stored option strings); read once to build the rows. */
  value: OptionCardsValue;
  /** Reports the regrouped option markdown whenever the author edits options. */
  onChange: (next: OptionCardsValue) => void;
  /** Current decision status — drives the UI-only outcome lock (Req 9.3-9.4). */
  status: AdrStatus;
  /** Controlled Decision Outcome value (rendered here per the design). */
  decisionOutcome: string;
  /** Reports Decision Outcome edits — the prefill on choose and free edits. */
  onDecisionOutcomeChange: (value: string) => void;
  /** Id of the option currently marked chosen (undefined = none chosen). */
  chosenOptionId?: string;
  /** Reports the newly chosen option id (or undefined to clear the choice). */
  onMarkChosen: (id: string | undefined) => void;
}

/** First non-blank line of a multi-line pros/cons block, used as the "because". */
function firstReason(pros: string): string | undefined {
  for (const line of pros.split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return undefined;
}

/**
 * Option cards editor for the compose form (design.md "UI compositions" →
 * ComposePage, "OptionCardsEditor + outcome.ts implements lock/prefill
 * (9.1-9.5)"; File Structure Plan → `features/compose/OptionCardsEditor.tsx`;
 * Req 9.1-9.5).
 *
 * Renders each considered option as a card (description, pros, cons) with a
 * "Mark as chosen" action (Req 9.1). Marking an option chosen pre-fills the
 * Decision Outcome with the canonical "Chosen option: X, because Y" phrasing via
 * `buildChosenOutcome` — the reason is the option's first "Good, because" line —
 * so a round-trip through `parseCanonicalOutcome` recovers the choice (Req 9.2).
 *
 * The Decision Outcome field is authored here because its lock is tied to the
 * chosen option (ComposePage defers `decisionOutcome` to this slot). It is
 * disabled while `isOutcomeLocked(status, hasChosen)` — In discussion with no
 * chosen option (Req 9.3) — and unlocks on Mark-as-chosen or when the status is
 * Decided (accepted) (Req 9.4). The lock is UI-only; the save API's validation
 * is untouched (Req 9.5).
 *
 * Prop-driven and pure (no backend): option rows are held in local state (seeded
 * once, like {@link PeopleEditor}, so editing never regenerates keys and drops
 * focus), while the chosen option, the Decision Outcome, and the status are
 * lifted so task 8.1 / 7.6 can wire them into the draft and the live preview.
 */
export function OptionCardsEditor({
  value,
  onChange,
  status,
  decisionOutcome,
  onDecisionOutcomeChange,
  chosenOptionId,
  onMarkChosen,
}: OptionCardsEditorProps) {
  const [rows, setRows] = useState<OptionRow[]>(() =>
    parseOptions(value.consideredOptions, value.prosAndConsOfTheOptions),
  );
  const outcomeId = useId();

  const hasChosen = chosenOptionId !== undefined && rows.some((row) => row.id === chosenOptionId);
  const locked = isOutcomeLocked(status, hasChosen);

  /** Apply a row change locally and report the regrouped stored strings upward. */
  function commit(next: OptionRow[]) {
    setRows(next);
    onChange(serializeOptions(next));
  }

  function handleField(id: string, field: "description" | "pros" | "cons", fieldValue: string) {
    commit(rows.map((row) => (row.id === id ? { ...row, [field]: fieldValue } : row)));
  }

  function handleAdd() {
    commit([...rows, { id: crypto.randomUUID(), description: "", pros: "", cons: "" }]);
  }

  function handleRemove(id: string) {
    if (id === chosenOptionId) {
      onMarkChosen(undefined);
    }
    commit(rows.filter((row) => row.id !== id));
  }

  function handleMarkChosen(row: OptionRow) {
    if (row.id === chosenOptionId) {
      // Toggle the choice off; the outcome text is left as-authored.
      onMarkChosen(undefined);
      return;
    }
    onMarkChosen(row.id);
    onDecisionOutcomeChange(buildChosenOutcome(row.description, firstReason(row.pros)));
  }

  return (
    <section className="option-cards" data-testid="compose-option-cards">
      <div className="option-cards__head">
        <h3 className="option-cards__title">Options</h3>
        <span className="option-cards__tag" data-testid="compose-option-cards-tag">
          saved as MADR: Considered Options
        </span>
        <p className="option-cards__helper">
          List the options you weighed, then mark the one you chose — the Decision Outcome is
          written for you.
        </p>
      </div>

      <ul className="option-cards__list">
        {rows.map((row, index) => {
          const isChosen = row.id === chosenOptionId;
          const cardClasses = ["option-card", isChosen ? "is-chosen" : null].filter(Boolean).join(" ");
          return (
            <li
              key={row.id}
              className={cardClasses}
              data-testid={`compose-option-card-${index}`}
              data-chosen={isChosen ? "true" : "false"}
            >
              <div className="option-card__head">
                <div className="field option-card__desc-field">
                  <label className="field__label" htmlFor={`compose-option-desc-${index}`}>
                    Option
                  </label>
                  <input
                    id={`compose-option-desc-${index}`}
                    data-testid={`compose-option-desc-${index}`}
                    className="field__input"
                    type="text"
                    value={row.description}
                    placeholder="e.g. Managed Postgres service"
                    onChange={(event) => handleField(row.id, "description", event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className={["btn", isChosen ? "btn--primary" : "btn--secondary"].join(" ")}
                  data-testid={`compose-option-mark-${index}`}
                  aria-pressed={isChosen}
                  onClick={() => handleMarkChosen(row)}
                >
                  {isChosen ? "Chosen ✓" : "Mark as chosen"}
                </button>
              </div>

              <div className="option-card__grid">
                <div className="field">
                  <label className="field__label" htmlFor={`compose-option-pros-${index}`}>
                    Good, because
                  </label>
                  <textarea
                    id={`compose-option-pros-${index}`}
                    data-testid={`compose-option-pros-${index}`}
                    className="field__input option-card__reasons"
                    value={row.pros}
                    placeholder="One reason per line"
                    onChange={(event) => handleField(row.id, "pros", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`compose-option-cons-${index}`}>
                    Bad, because
                  </label>
                  <textarea
                    id={`compose-option-cons-${index}`}
                    data-testid={`compose-option-cons-${index}`}
                    className="field__input option-card__reasons"
                    value={row.cons}
                    placeholder="One reason per line"
                    onChange={(event) => handleField(row.id, "cons", event.target.value)}
                  />
                </div>
              </div>

              <div className="option-card__foot">
                {isChosen ? (
                  <span className="option-card__chosen" data-testid={`compose-option-chosen-${index}`}>
                    Chosen option
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn option-card__remove"
                  data-testid={`compose-option-remove-${index}`}
                  onClick={() => handleRemove(row.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="btn btn--secondary"
        data-testid="compose-option-add"
        onClick={handleAdd}
      >
        Add option
      </button>

      <div className="option-cards__outcome">
        <div className="option-cards__outcome-head">
          <label className="field__label" htmlFor={outcomeId}>
            Decision Outcome
          </label>
          <span className="option-cards__tag" data-testid="compose-outcome-tag">
            saved as MADR: Decision Outcome
          </span>
        </div>
        {locked ? (
          <p className="option-cards__lock-hint" id={`${outcomeId}-hint`} data-testid="compose-outcome-lock-hint">
            Mark an option as chosen, or set the status to “Decided”, to write the outcome.
          </p>
        ) : null}
        <textarea
          id={outcomeId}
          data-testid="compose-outcome-input"
          className="field__input option-cards__outcome-input"
          value={decisionOutcome}
          disabled={locked}
          aria-describedby={locked ? `${outcomeId}-hint` : undefined}
          placeholder='e.g. Chosen option: PostgreSQL, because it fits our reporting needs'
          onChange={(event) => onDecisionOutcomeChange(event.target.value)}
        />
      </div>
    </section>
  );
}
