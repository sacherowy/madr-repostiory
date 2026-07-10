import type { AdrStatus, RelationType } from "./types.js";

/**
 * Plain-language vocabulary layer (requirements 1.1, 1.2, 1.5).
 *
 * Single source of truth for the labels shown outside Technical view.
 * Pure constants only — stored enum values are never rewritten by this
 * module (1.6); it maps them to display strings and nothing else.
 */

/** Plain-language label for each of the five stored ADR statuses (1.1). */
export const STATUS_LABELS: Record<AdrStatus, string> = {
  proposed: "In discussion",
  accepted: "Decided",
  deprecated: "Retired",
  superseded: "Replaced",
  rejected: "Rejected",
};

export type RelationDirection = "outgoing" | "incoming";

/**
 * Labels for relations as authored on the source ADR (outgoing direction).
 */
const OUTGOING_RELATION_LABELS: Record<RelationType, string> = {
  supersedes: "Replaces",
  "superseded-by": "Replaced by",
  "depends-on": "Builds on",
  "relates-to": "Related to",
  "conflicts-with": "Conflicts with",
};

/**
 * Plain-language label for a stored relation type (1.2), direction-aware for
 * the supersedes pair: an incoming `supersedes` reads "Replaced by" and an
 * incoming `superseded-by` reads "Replaces". All other types are
 * direction-independent.
 */
export function relationLabel(type: RelationType, direction: RelationDirection): string {
  if (direction === "incoming") {
    if (type === "supersedes") return OUTGOING_RELATION_LABELS["superseded-by"];
    if (type === "superseded-by") return OUTGOING_RELATION_LABELS.supersedes;
  }
  return OUTGOING_RELATION_LABELS[type];
}

/** Plain-language labels for the stored people fields (1.5). */
export const PEOPLE_LABELS: { decisionMakers: string; consulted: string; informed: string } = {
  decisionMakers: "Decision owner",
  consulted: "Input from",
  informed: "Kept informed",
};
