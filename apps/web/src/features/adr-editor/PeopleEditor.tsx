import type { PersonRow, StakeholderRole } from "../compose/people.js";

/**
 * Stateless list of person rows with add/remove and a role field per row.
 * Fully controlled by the parent — mirrors CollapsibleSection's contract
 * style of no internal state.
 */
export interface PeopleEditorProps {
  rows: PersonRow[];
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onNameChange: (id: string, name: string) => void;
  onRoleChange: (id: string, role: StakeholderRole) => void;
}

const STAKEHOLDER_ROLES: StakeholderRole[] = ["Decision Maker", "Consulted", "Informed"];

export function PeopleEditor({
  rows,
  onAddRow,
  onRemoveRow,
  onNameChange,
  onRoleChange,
}: PeopleEditorProps) {
  return (
    <div className="people-editor">
      {rows.map((row) => (
        <div className="people-editor__row" key={row.id}>
          <div className="field">
            <label className="field__label" htmlFor={`person-name-input-${row.id}`}>
              Name
            </label>
            <input
              id={`person-name-input-${row.id}`}
              data-testid={`person-name-input-${row.id}`}
              className="field__input"
              type="text"
              value={row.name}
              onChange={(event) => onNameChange(row.id, event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`person-role-select-${row.id}`}>
              Role
            </label>
            <select
              id={`person-role-select-${row.id}`}
              data-testid={`person-role-select-${row.id}`}
              className="field__input"
              value={row.role}
              onChange={(event) => onRoleChange(row.id, event.target.value as StakeholderRole)}
            >
              {STAKEHOLDER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            data-testid={`remove-person-button-${row.id}`}
            className="btn"
            onClick={() => onRemoveRow(row.id)}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" data-testid="add-person-button" className="btn" onClick={onAddRow}>
        Add person
      </button>
    </div>
  );
}
