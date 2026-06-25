import type { ReactNode } from "react";
import { MonoChip } from "./MonoChip.js";
import { StatusBadge } from "./StatusBadge.js";

export interface ContextHeaderProps {
  /** The selected ADR identifier (rendered as a monospace id chip). */
  adrId: string;
  /** The ADR title. */
  title: string;
  /** The ADR status (rendered via StatusBadge; unknown values fall back neutral). */
  status: string;
  /** Optional supporting metadata (date, deciders, sha, …). */
  meta?: ReactNode;
  /** Fired when the inline Edit action is activated (opens the Edit aspect). */
  onEdit: () => void;
  /** Fired when the inline Compare action is activated (opens scoped comparison). */
  onCompare: () => void;
}

/**
 * Presents the selected ADR as an object header (Req 3.1–3.4): the identifier as
 * a monospace id chip (`MonoChip` variant="id"), the status as a `StatusBadge`,
 * the title, optional supporting metadata, and inline Edit/Compare controls.
 *
 * Purely presentational: it renders the ADR summary it is given and fires the
 * `onEdit` / `onCompare` callbacks — it never fetches data, reads the store, or
 * knows about aspects/overlays (those are wired in `App`).
 *
 * Accessibility (Req 9.3): the header is an accessible `region` labelled by the
 * ADR id, and each control carries an explicit, ADR-scoped accessible name so
 * assistive technology announces what is being acted on.
 */
export function ContextHeader({ adrId, title, status, meta, onEdit, onCompare }: ContextHeaderProps) {
  return (
    <section
      className="context-header"
      data-testid="context-header"
      role="region"
      aria-label={`ADR ${adrId} context`}
    >
      <div className="context-header__identity">
        <MonoChip variant="id" value={adrId} />
        <StatusBadge status={status} />
      </div>

      <h2 className="context-header__title">{title}</h2>

      {meta !== undefined ? <div className="context-header__meta">{meta}</div> : null}

      <div className="context-header__actions">
        <button
          type="button"
          className="btn"
          data-testid="context-edit"
          aria-label={`Edit ${adrId}`}
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className="btn"
          data-testid="context-compare"
          aria-label={`Compare ${adrId}`}
          onClick={onCompare}
        >
          Compare
        </button>
      </div>
    </section>
  );
}
