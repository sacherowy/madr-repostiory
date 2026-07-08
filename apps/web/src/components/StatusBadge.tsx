import { STATUS_LABELS, type AdrStatus } from "@adr/shared";

export interface BasePrimitiveProps {
  /** Optional extra class appended after the primitive's own design-system class. */
  className?: string;
  /** Optional test hook; primitives never invent testids, callers opt in. */
  "data-testid"?: string;
}

type KnownStatus = AdrStatus;

export interface StatusBadgeProps extends BasePrimitiveProps {
  /** Accepts the typed status or any raw string; unknown values fall back to neutral. */
  status: KnownStatus | (string & {});
}

/**
 * Plain-language display label for each of the five known statuses comes from
 * the shared vocabulary layer (`STATUS_LABELS` in @adr/shared, Requirement 1.1):
 * `proposed` → "In discussion", `accepted` → "Decided", `deprecated` →
 * "Retired", `superseded` → "Replaced", `rejected` → "Rejected". The dot colors
 * are unchanged — only the label text is sourced from the vocabulary table. An
 * unknown status has no entry there and falls back to its raw value verbatim.
 */
function isKnownStatus(status: string): status is KnownStatus {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, status);
}

/**
 * Renders an ADR status as a colored dot plus a human-readable label (Req 4.1,
 * 4.2). Known statuses get the `badge badge--<status>` modifier whose colors
 * derive from the `--<status>` / `--<status>-bg` tokens via base.css; any value
 * outside the five known statuses gets the neutral `badge` treatment with the
 * raw value as its label (Req 4.3). Pure presentational: no data access, and
 * the reserved danger tokens are never used here (status is non-error).
 */
export function StatusBadge({ status, className, "data-testid": dataTestId }: StatusBadgeProps) {
  const known = isKnownStatus(status);
  const label = known ? STATUS_LABELS[status] : status;

  const classes = ["badge", known ? `badge--${status}` : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} data-testid={dataTestId}>
      <span className="badge__dot" aria-hidden="true" />
      <span className="badge__label">{label}</span>
    </span>
  );
}
