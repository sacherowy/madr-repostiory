import type { AdrStatus } from "@adr/shared";

/**
 * Pure lock/prefill rules for the compose form's Decision Outcome
 * (design.md File Structure Plan → `features/compose/outcome.ts`; Req 9.2-9.4).
 *
 * No React, no side effects: the two functions here are the whole logic behind
 * the "Mark as chosen" prefill and the UI-only outcome lock. The lock is a
 * presentation concern only — the save API's validation is untouched (Req 9.5),
 * so nothing in this module (or its caller) alters what the backend accepts.
 */

/**
 * Builds the canonical MADR outcome phrasing "Chosen option: X, because Y" from
 * a chosen option (Req 9.2). The reason clause is omitted when no `because` is
 * supplied. The exact string produced round-trips through
 * `parseCanonicalOutcome` from `@adr/shared`: the option (and reason, when
 * present) is recovered verbatim, matching the unquoted editor form that
 * `derive.ts` documents as "the unquoted form written by the editor".
 */
export function buildChosenOutcome(optionTitle: string, because?: string): string {
  const option = optionTitle.trim();
  const reason = because?.trim();
  return reason ? `Chosen option: ${option}, because ${reason}` : `Chosen option: ${option}`;
}

/**
 * Whether the Decision Outcome field is locked in the form UI (Req 9.3-9.4).
 *
 * Locked only while a decision is In discussion (stored `proposed`) and no
 * option has been marked as chosen (Req 9.3). Choosing an option unlocks it, and
 * setting the status to Decided (stored `accepted`) — or any status other than
 * `proposed` — leaves it unlocked (Req 9.4; Req 9.3 scopes the lock to the "In
 * discussion + no chosen option" case only). Enforcement is UI-only (Req 9.5).
 */
export function isOutcomeLocked(status: AdrStatus, hasChosenOption: boolean): boolean {
  return status === "proposed" && !hasChosenOption;
}
