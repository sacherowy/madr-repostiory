import type { RelationType } from "@adr/shared";

/** Shared base props for primitives that forward styling/test hooks. Mirrors the
 * shape used by StatusBadge so all primitives stay consistent. */
export interface BasePrimitiveProps {
  /** Optional extra class appended after the primitive's own design-system class. */
  className?: string;
  /** Optional test hook; primitives never invent testids, callers opt in. */
  "data-testid"?: string;
}

export interface RelationChipProps extends BasePrimitiveProps {
  type: RelationType;
  /** Optional related ADR id to display alongside the marker. */
  target?: string;
  /** Optional relation direction (e.g. RelationsPanel's inbound/outbound); when
   * provided, rendered as the existing `relation-direction` testid span. */
  direction?: string;
}

/**
 * The five relation types each map to a `chip--<type>` modifier whose colored
 * marker is defined in base.css per the Relations table of docs/design.md
 * (Req 5.1): solid teal for supersedes/superseded-by, solid indigo for
 * depends-on, dashed slate for relates-to, solid danger for conflicts-with. The
 * modifier class is the type key itself, so it doubles as a lookup-free mapping
 * while still documenting the four visual families above.
 */
const RELATION_MODIFIERS: Record<RelationType, string> = {
  supersedes: "chip--supersedes",
  "superseded-by": "chip--superseded-by",
  "depends-on": "chip--depends-on",
  "relates-to": "chip--relates-to",
  "conflicts-with": "chip--conflicts-with",
};

/**
 * Renders a relation as a monospace chip (the `.chip` base is monospace in
 * base.css, Req 5.1) with the type's colored marker, usable identically in the
 * read-only relations view and the editor's relation controls (Req 5.2 — the
 * primitive is context-agnostic).
 *
 * Test-hook preservation (Req 12.2): when `direction`/`type`/`target` are shown
 * they are wrapped in distinct `data-testid="relation-direction" |
 * "relation-type" | "relation-target"` spans carrying their exact text, so the
 * existing `RelationsPanel` contract stays intact once it adopts this chip. The
 * hooks are never collapsed into a single opaque element. `direction` and
 * `target` are optional and their spans are omitted when not provided.
 */
export function RelationChip({
  type,
  target,
  direction,
  className,
  "data-testid": dataTestId,
}: RelationChipProps) {
  const classes = ["chip", RELATION_MODIFIERS[type], className].filter(Boolean).join(" ");

  return (
    <span className={classes} data-testid={dataTestId}>
      <span className="chip__marker" aria-hidden="true" />
      {direction !== undefined ? (
        <span data-testid="relation-direction">{direction}</span>
      ) : null}
      <span data-testid="relation-type">{type}</span>
      {target !== undefined ? <span data-testid="relation-target">{target}</span> : null}
    </span>
  );
}
