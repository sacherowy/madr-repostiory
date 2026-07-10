import { useState } from "react";
import { relationLabel, type AdrId, type AdrRelation, type RelationType } from "@adr/shared";
import { RelationChip } from "../../components/RelationChip.js";

/**
 * A decision the author can relate the current decision to. Supplied from the
 * feed by task 8.1 so this editor stays pure (no fetching of its own).
 */
export interface RelationTarget {
  id: AdrId;
  title: string;
}

export interface RelationsEditorProps {
  /** Current relations on the decision. */
  value: AdrRelation[];
  /** Reports the new relation list whenever the author adds or removes one. */
  onChange: (next: AdrRelation[]) => void;
  /** Candidate decisions to relate to (from the feed; task 8.1 supplies these). */
  targets: RelationTarget[];
}

/**
 * Relation types offered in the picker, in plain-language reading order
 * (Replaces / Replaced by / Builds on / Related to / Conflicts with).
 */
const RELATION_TYPES: readonly RelationType[] = [
  "supersedes",
  "superseded-by",
  "depends-on",
  "relates-to",
  "conflicts-with",
];

/**
 * Relations editor for the compose form (design.md "UI compositions" →
 * ComposePage; File Structure Plan → `features/compose/RelationsEditor.tsx`; Req
 * 8.4, 1.2). Rebuilds the relation add/remove UI that lived in the old
 * `adr-editor/AdrEditor`, but with plain-language relation labels.
 *
 * The author picks a relation type (shown as its plain-language label via
 * `relationLabel(type, "outgoing")`) and a target decision (chosen by friendly
 * title, stored as its `AdrId`), then adds it; existing relations render as
 * `RelationChip`s (which already show the plain-language label) with the target's
 * title and a remove control. Presentational and fully controlled — the relation
 * list is owned by the parent via `value`/`onChange` (wired by task 8.1 / 7.6).
 */
export function RelationsEditor({ value, onChange, targets }: RelationsEditorProps) {
  const [type, setType] = useState<RelationType>("relates-to");
  const [target, setTarget] = useState<string>("");

  function handleAdd() {
    if (target === "") return;
    onChange([...value, { type, target }]);
    setTarget("");
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  const titleOf = (id: AdrId): string | undefined => targets.find((t) => t.id === id)?.title;

  return (
    <section className="relations-editor" data-testid="compose-relations-editor">
      <div className="relations-editor__head">
        <h3 className="relations-editor__title">Related decisions</h3>
        <p className="relations-editor__helper">
          Does this decision replace, build on, or relate to another one?
        </p>
      </div>

      <div className="relations-editor__add">
        <div className="field">
          <label className="field__label" htmlFor="compose-relation-type">
            Relationship
          </label>
          <select
            id="compose-relation-type"
            data-testid="compose-relation-type"
            className="field__input"
            value={type}
            onChange={(event) => setType(event.target.value as RelationType)}
          >
            {RELATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {relationLabel(t, "outgoing")}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="compose-relation-target">
            Decision
          </label>
          <select
            id="compose-relation-target"
            data-testid="compose-relation-target"
            className="field__input"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">Choose a decision…</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          data-testid="compose-relation-add"
          className="btn btn--secondary"
          disabled={target === ""}
          onClick={handleAdd}
        >
          Add relation
        </button>
      </div>

      <ul className="relations-editor__list" data-testid="compose-relation-list">
        {value.map((relation, index) => {
          const title = titleOf(relation.target);
          return (
            <li
              key={`${relation.type}-${relation.target}-${index}`}
              className="relations-editor__item"
              data-testid={`compose-relation-item-${index}`}
            >
              <RelationChip type={relation.type} target={relation.target} />
              {title !== undefined ? (
                <span className="relations-editor__target-title">{title}</span>
              ) : null}
              <button
                type="button"
                data-testid={`compose-relation-remove-${index}`}
                className="btn btn--danger"
                onClick={() => handleRemove(index)}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
