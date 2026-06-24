/** Shared base props for primitives that forward styling/test hooks. Mirrors the
 * shape used by StatusBadge/RelationChip so all primitives stay consistent. */
export interface BasePrimitiveProps {
  /** Optional extra class appended after the primitive's own design-system class. */
  className?: string;
  /** Optional test hook; primitives never invent testids, callers opt in. */
  "data-testid"?: string;
}

export interface MonoChipProps extends BasePrimitiveProps {
  /** id -> teal id chip; sha -> neutral sha chip; status -> neutral status-key chip. */
  variant: "id" | "sha" | "status";
  value: string;
}

/**
 * The three machine-identifier variants each map to a `mono-chip--<variant>`
 * modifier whose color treatment is defined in the "Sygnatura" section of
 * base.css: `id` gets the teal treatment (`--teal-700`/`--teal-50`/`--teal-200`,
 * Req 6.1) while `sha` and `status` get the neutral treatment
 * (`--ink-500`/`--surface`, Req 6.2/6.3). The modifier is the variant key
 * itself, so it doubles as a lookup-free mapping.
 */
const VARIANT_MODIFIERS: Record<MonoChipProps["variant"], string> = {
  id: "mono-chip--id",
  sha: "mono-chip--sha",
  status: "mono-chip--status",
};

/**
 * Renders a machine identifier (ADR id, blob SHA, or raw status key) as a
 * monospace chip (the `.mono-chip` base is monospace in base.css) with the
 * variant's color treatment (Req 6.1–6.3). Pure presentational: no data access.
 */
export function MonoChip({ variant, value, className, "data-testid": dataTestId }: MonoChipProps) {
  const classes = ["mono-chip", VARIANT_MODIFIERS[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} data-testid={dataTestId}>
      {value}
    </span>
  );
}
