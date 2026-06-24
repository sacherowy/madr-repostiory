/** Shared base props for primitives that forward styling/test hooks. Mirrors the
 * shape used by StatusBadge/RelationChip/MonoChip so all primitives stay
 * consistent. */
export interface BasePrimitiveProps {
  /** Optional extra class appended after the primitive's own design-system class. */
  className?: string;
  /** Optional test hook; primitives never invent testids, callers opt in. */
  "data-testid"?: string;
}

export interface SimilarityMeterProps extends BasePrimitiveProps {
  /** Normalized similarity in [0, 1]; clamped before rendering. */
  score: number;
}

/**
 * Clamps a similarity score into the rendered `[0, 1]` range (design.md
 * precondition). The score is documented as finite, but to keep the primitive
 * total we guard non-finite input: `NaN` falls back to 0, while `±Infinity`
 * clamps to the corresponding bound via the surrounding min/max.
 */
function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

/**
 * Renders a similarity score as a teal-gradient meter plus a monospace numeric
 * value per the "Miara podobieństwa" spec (Req 8.1). The track/fill/value
 * styling lives in base.css (`.meter`, `.meter__track`, `.meter__fill`,
 * `.meter__value`); the primitive only sets the fill width inline, proportional
 * to the clamped score (Req 8.2), so the proportion is directly assertable and
 * does not depend on CSS the test environment cannot compute. The value is
 * formatted to two decimals (e.g. `0.86`) in the monospace `.meter__value`
 * element. Pure presentational: no data access.
 */
export function SimilarityMeter({
  score,
  className,
  "data-testid": dataTestId,
}: SimilarityMeterProps) {
  const clamped = clampScore(score);

  const classes = ["meter", className].filter(Boolean).join(" ");

  return (
    <span className={classes} data-testid={dataTestId}>
      <span className="meter__track">
        <span className="meter__fill" style={{ width: `${clamped * 100}%` }} aria-hidden="true" />
      </span>
      <span className="meter__value">{clamped.toFixed(2)}</span>
    </span>
  );
}
