import type { ReactNode } from "react";
import type { AdrRelation } from "@adr/shared";
import { MonoChip } from "./MonoChip.js";
import { StatusBadge, type StatusBadgeProps } from "./StatusBadge.js";
import { RelationChip } from "./RelationChip.js";

/** Shared base props for primitives that forward styling/test hooks. Mirrors the
 * shape used by StatusBadge/RelationChip/MonoChip so all primitives stay consistent. */
export interface BasePrimitiveProps {
  /** Optional extra class appended after the primitive's own design-system class. */
  className?: string;
  /** Optional test hook; primitives never invent testids, callers opt in. */
  "data-testid"?: string;
}

export interface AdrCardProps extends BasePrimitiveProps {
  id: string;
  title: string;
  status: StatusBadgeProps["status"];
  relations?: ReadonlyArray<AdrRelation>;
  /** Optional footer metadata (date, deciders, sha, similarity). */
  meta?: ReactNode;
}

/**
 * Presents an ADR summary as a "Karta ADR" card (Req 3.1–3.3): a top accent, the
 * ADR id chip, the status badge, the title, optional relation chips, and an
 * optional metadata footer. It composes the committed primitives (MonoChip,
 * StatusBadge, RelationChip) rather than re-implementing their markup, and is
 * purely presentational (no state, no data access).
 *
 * Assertable accent (design.md "Assertable accent treatment"): the accent is a
 * real `<span class="card__accent">` child (styled with a real `border-top` /
 * `background` in base.css), NOT a `::before` pseudo-element, so the E2E design
 * check can read it directly via `toHaveCSS` on an actual element.
 */
export function AdrCard({
  id,
  title,
  status,
  relations,
  meta,
  className,
  "data-testid": dataTestId,
}: AdrCardProps) {
  const classes = ["card", className].filter(Boolean).join(" ");
  const hasRelations = relations !== undefined && relations.length > 0;

  return (
    <article className={classes} data-testid={dataTestId}>
      {/* Real, directly-assertable accent element (not a pseudo-element). */}
      <span className="card__accent" aria-hidden="true" />

      <div className="card__body">
        <div className="card__header">
          <MonoChip variant="id" value={id} />
          <StatusBadge status={status} />
        </div>

        <h3 className="card__title">{title}</h3>

        {hasRelations ? (
          <div className="card__meta">
            {relations.map((relation) => (
              <RelationChip
                key={`${relation.type}:${relation.target}`}
                type={relation.type}
                target={relation.target}
              />
            ))}
          </div>
        ) : null}
      </div>

      {meta !== undefined ? <div className="card__footer">{meta}</div> : null}
    </article>
  );
}
