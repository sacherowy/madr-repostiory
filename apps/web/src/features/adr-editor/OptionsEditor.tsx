import type { OptionRow } from "../compose/options.js";

/**
 * Stateless list of option rows with add/remove and description/pros/cons
 * fields per row. Fully controlled by the parent — mirrors
 * CollapsibleSection's and PeopleEditor's contract style of no internal
 * state.
 */
export interface OptionsEditorProps {
  rows: OptionRow[];
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  /** value is guaranteed single-line: the input element is a text input, not a textarea. */
  onDescriptionChange: (id: string, value: string) => void;
  onProsChange: (id: string, value: string) => void;
  onConsChange: (id: string, value: string) => void;
}

export function OptionsEditor({
  rows,
  onAddRow,
  onRemoveRow,
  onDescriptionChange,
  onProsChange,
  onConsChange,
}: OptionsEditorProps) {
  return (
    <div className="options-editor">
      {rows.map((row) => (
        <div className="options-editor__row" key={row.id}>
          <div className="field">
            <label className="field__label" htmlFor={`option-description-input-${row.id}`}>
              Description
            </label>
            <input
              id={`option-description-input-${row.id}`}
              data-testid={`option-description-input-${row.id}`}
              className="field__input"
              type="text"
              value={row.description}
              onChange={(event) => onDescriptionChange(row.id, event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`option-pros-textarea-${row.id}`}>
              Pros
            </label>
            <textarea
              id={`option-pros-textarea-${row.id}`}
              data-testid={`option-pros-textarea-${row.id}`}
              className="field__input"
              value={row.pros}
              onChange={(event) => onProsChange(row.id, event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`option-cons-textarea-${row.id}`}>
              Cons
            </label>
            <textarea
              id={`option-cons-textarea-${row.id}`}
              data-testid={`option-cons-textarea-${row.id}`}
              className="field__input"
              value={row.cons}
              onChange={(event) => onConsChange(row.id, event.target.value)}
            />
          </div>
          <button
            type="button"
            data-testid={`remove-option-button-${row.id}`}
            className="btn"
            onClick={() => onRemoveRow(row.id)}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" data-testid="add-option-button" className="btn" onClick={onAddRow}>
        Add option
      </button>
    </div>
  );
}
