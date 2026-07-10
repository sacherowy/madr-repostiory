import { useState } from "react";
import { PEOPLE_LABELS } from "@adr/shared";
import {
  rowsFromStakeholders,
  stakeholdersFromRows,
  type PersonRow,
  type StakeholderRole,
} from "./people.js";

/**
 * The three stored people arrays as they live on an `Adr`. This is the state
 * shape ComposePage/task 7.6 assembles and passes down; the editor never rewrites
 * the stored field names — it only maps them to plain-language labels for display
 * (Req 1.5).
 */
export interface PeopleValue {
  decisionMakers: string[];
  consulted: string[];
  informed: string[];
}

export interface PeopleEditorProps {
  /** Seed values (the three stored role arrays); read once to build the rows. */
  value: PeopleValue;
  /** Reports the regrouped role arrays whenever the author edits the people. */
  onChange: (next: PeopleValue) => void;
}

/**
 * Plain-language label for each stored stakeholder role (Req 1.5 / 8.4): the
 * author sees "Decision owner" / "Input from" / "Kept informed", never the raw
 * stored `decisionMakers` / `consulted` / `informed` field names.
 */
const ROLE_LABELS: Record<StakeholderRole, string> = {
  "Decision Maker": PEOPLE_LABELS.decisionMakers,
  Consulted: PEOPLE_LABELS.consulted,
  Informed: PEOPLE_LABELS.informed,
};

/** Role order shown in each row's picker (owner → input → informed). */
const ROLE_ORDER: readonly StakeholderRole[] = ["Decision Maker", "Consulted", "Informed"];

/**
 * People editor for the compose form (design.md "UI compositions" → ComposePage;
 * File Structure Plan → `features/compose/PeopleEditor.tsx`; Req 8.4, 1.5).
 *
 * Rebuilt from the old `adr-editor/PeopleEditor` on the relocated
 * `compose/people.ts` helpers: it expands the three stored role arrays into one
 * editable row per person (`rowsFromStakeholders`), lets the author add, remove,
 * rename, and re-label people, and reports the regrouped arrays back
 * (`stakeholdersFromRows`). Roles are shown with the plain-language people labels
 * from `@adr/shared` (`PEOPLE_LABELS`) instead of the stored field names.
 *
 * Row identity (each row's random id) is held in local state so editing a name
 * never regenerates keys and drops focus; `value` is the initial seed and the
 * lifted source of truth is the parent's `onChange` target (wired by task 8.1 /
 * 7.6).
 */
export function PeopleEditor({ value, onChange }: PeopleEditorProps) {
  const [rows, setRows] = useState<PersonRow[]>(() =>
    rowsFromStakeholders(value.decisionMakers, value.consulted, value.informed)
  );

  /** Apply a row change locally and report the regrouped stored arrays upward. */
  function commit(next: PersonRow[]) {
    setRows(next);
    onChange(stakeholdersFromRows(next));
  }

  function handleAdd() {
    commit([...rows, { id: crypto.randomUUID(), name: "", role: "Decision Maker" }]);
  }

  function handleRemove(id: string) {
    commit(rows.filter((row) => row.id !== id));
  }

  function handleName(id: string, name: string) {
    commit(rows.map((row) => (row.id === id ? { ...row, name } : row)));
  }

  function handleRole(id: string, role: StakeholderRole) {
    commit(rows.map((row) => (row.id === id ? { ...row, role } : row)));
  }

  return (
    <section className="people-editor" data-testid="compose-people-editor">
      <div className="people-editor__head">
        <h3 className="people-editor__title">People</h3>
        <p className="people-editor__helper">
          Who owns this decision, who gave input, and who should be kept informed?
        </p>
      </div>

      {rows.map((row) => (
        <div className="people-editor__row" key={row.id} data-testid={`compose-person-row-${row.id}`}>
          <div className="field">
            <label className="field__label" htmlFor={`compose-person-name-${row.id}`}>
              Name
            </label>
            <input
              id={`compose-person-name-${row.id}`}
              data-testid={`compose-person-name-${row.id}`}
              className="field__input"
              type="text"
              value={row.name}
              placeholder="e.g. Ada Lovelace"
              onChange={(event) => handleName(row.id, event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`compose-person-role-${row.id}`}>
              Role
            </label>
            <select
              id={`compose-person-role-${row.id}`}
              data-testid={`compose-person-role-${row.id}`}
              className="field__input"
              value={row.role}
              onChange={(event) => handleRole(row.id, event.target.value as StakeholderRole)}
            >
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            data-testid={`compose-person-remove-${row.id}`}
            className="btn"
            onClick={() => handleRemove(row.id)}
          >
            Remove
          </button>
        </div>
      ))}

      <button type="button" data-testid="compose-person-add" className="btn btn--secondary" onClick={handleAdd}>
        Add person
      </button>
    </section>
  );
}
