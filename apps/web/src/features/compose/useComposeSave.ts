import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Adr, AdrId, AdrRelation } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import type { ComposeDraft } from "./ComposePage.js";
import type { PeopleValue } from "./PeopleEditor.js";
import type { OptionCardsValue } from "./OptionCardsEditor.js";

/**
 * Verbatim stale-write recovery copy preserved from the previous editor
 * (`adr-editor/AdrEditor`'s `CONFLICT_COPY`). Requirement 8.5 requires the
 * existing user-facing conflict message content to be preserved unchanged, so
 * the string lives here as a single source of truth reused by the compose
 * conflict UI (and pinned by a test) rather than being re-typed.
 */
export const CONFLICT_COPY = "Plik zmienił się od ostatniego odczytu. Odśwież i zapisz ponownie.";

/**
 * The full compose state gathered for a save: the draft ComposePage owns
 * (title/status/narrative sections) plus every sibling slot's value
 * (topic/people/relations/options/outcome/summary), and — in edit mode — the
 * loaded record's concurrency token and the fields the compose form does not
 * author but must not clobber on a full-document save (date, additionalContent).
 */
export interface ComposeSaveInput {
  draft: ComposeDraft;
  /** Chosen topic path from TopicPicker; "" (no choice) maps to the repo root ".". */
  topic: string;
  people: PeopleValue;
  relations: AdrRelation[];
  options: OptionCardsValue;
  /** Decision Outcome authored in the option-cards slot (7.3). */
  decisionOutcome: string;
  /** Layer-1 author summary (11.1); blank normalizes to an absent field. */
  summary: string;
  tags?: string[];
  /** Edit mode: the loaded record's date, preserved through the save. */
  date?: string;
  /** Edit mode: content the compose form does not edit but a full-document save must keep. */
  additionalContent?: string;
  /** Edit mode: optimistic-concurrency token from the loaded record. */
  baseBlobSha?: string;
}

/**
 * Result of a save attempt, surfaced so the compose UI can render the matching
 * feedback (success / stale-write conflict / validation error). `conflict`
 * carries the latest record so the recovery flow can reload it (8.5).
 */
export type ComposeSaveOutcome =
  | { kind: "idle" }
  | { kind: "created"; adr: Adr }
  | { kind: "saved"; adr: Adr }
  | { kind: "conflict"; latest: Adr }
  | { kind: "invalid"; missingFields: string[] }
  | { kind: "invalidRelations"; missingTargets: string[] }
  | { kind: "notFound" };

export interface UseComposeSave {
  outcome: ComposeSaveOutcome;
  saving: boolean;
  save(input: ComposeSaveInput): Promise<ComposeSaveOutcome>;
  reset(): void;
}

/** Normalizes a blank (whitespace-only) summary to `undefined` so the DTO omits
 * it and the server stores no `summary` key — mirrors the editing service's
 * server-side normalization (11.3), keeping the round-trip consistent. */
function normalizeSummary(summary: string): string | undefined {
  return summary.trim() === "" ? undefined : summary;
}

/**
 * The compose save mechanism (task 7.6; design.md ComposePage "save via existing
 * create/update incl. 409 recovery UI"; "Implementation Notes (web)": saves
 * invalidate `["feed"]` and the per-id keys).
 *
 * Assembles the full decision payload from the ComposePage draft plus every
 * sibling slot's value and persists it through the unchanged endpoints:
 * `createAdr` in create mode, `updateAdr` (with the loaded `baseBlobSha`) in edit
 * mode. On a successful save it invalidates the shared read-model queries so the
 * feed and the decision's article/per-id data refetch. A `409` stale-write is
 * surfaced as `{ kind: "conflict", latest }` — never a thrown error — so the UI
 * can run the preserved reload-latest recovery with {@link CONFLICT_COPY} (8.5).
 *
 * The API route behavior is untouched: this only assembles request bodies (now
 * type-safe with `summary` on the shared DTOs) and reads the existing
 * discriminated result envelope.
 */
export function useComposeSave(
  apiClient: ApiClient,
  authorName: string,
  adrId?: AdrId
): UseComposeSave {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<ComposeSaveOutcome>({ kind: "idle" });
  const [saving, setSaving] = useState(false);

  /** Invalidate the shared feed read-model and a decision's per-id queries so
   * every surface (Home feed, article, Technical view raw) refetches (design
   * "Implementation Notes (web)"). Prefix keys (e.g. `["similar", id]`) match the
   * fuller keys the hooks register (`["similar", id, null]`) via TanStack's
   * default partial matching. */
  async function invalidate(id: AdrId): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["feed"] }),
      queryClient.invalidateQueries({ queryKey: ["adr", id] }),
      queryClient.invalidateQueries({ queryKey: ["relations", id] }),
      queryClient.invalidateQueries({ queryKey: ["history", id] }),
      queryClient.invalidateQueries({ queryKey: ["similar", id] }),
      queryClient.invalidateQueries({ queryKey: ["raw", id] }),
    ]);
  }

  async function save(input: ComposeSaveInput): Promise<ComposeSaveOutcome> {
    setSaving(true);
    try {
      const result = adrId === undefined
        ? await createNew(input)
        : await saveExisting(adrId, input);
      setOutcome(result);
      return result;
    } finally {
      setSaving(false);
    }
  }

  async function createNew(input: ComposeSaveInput): Promise<ComposeSaveOutcome> {
    const result = await apiClient.createAdr({
      title: input.draft.title,
      folder: input.topic.trim() === "" ? "." : input.topic,
      author: authorName,
      decisionMakers: input.people.decisionMakers,
      consulted: input.people.consulted,
      informed: input.people.informed,
      tags: input.tags,
      summary: normalizeSummary(input.summary),
    });
    if (result.ok) {
      await invalidate(result.adr.id);
      return { kind: "created", adr: result.adr };
    }
    return { kind: "invalid", missingFields: result.missingFields };
  }

  async function saveExisting(id: AdrId, input: ComposeSaveInput): Promise<ComposeSaveOutcome> {
    const result = await apiClient.updateAdr(id, {
      title: input.draft.title,
      status: input.draft.status,
      date: input.date ?? "",
      contextAndProblemStatement: input.draft.contextAndProblemStatement,
      decisionDrivers: input.draft.decisionDrivers,
      consideredOptions: input.options.consideredOptions,
      decisionOutcome: input.decisionOutcome,
      consequences: input.draft.consequences,
      confirmation: input.draft.confirmation,
      prosAndConsOfTheOptions: input.options.prosAndConsOfTheOptions,
      moreInformation: input.draft.moreInformation,
      additionalContent: input.additionalContent ?? "",
      decisionMakers: input.people.decisionMakers,
      consulted: input.people.consulted,
      informed: input.people.informed,
      tags: input.tags,
      relations: input.relations,
      summary: normalizeSummary(input.summary),
      author: authorName,
      baseBlobSha: input.baseBlobSha ?? "",
    });

    if (result.ok) {
      await invalidate(id);
      return { kind: "saved", adr: result.adr };
    }
    if (result.kind === "conflict") {
      return { kind: "conflict", latest: result.latest };
    }
    if (result.kind === "invalid") {
      return { kind: "invalid", missingFields: result.missingFields };
    }
    if (result.kind === "invalidRelations") {
      return { kind: "invalidRelations", missingTargets: result.missingTargets };
    }
    return { kind: "notFound" };
  }

  function reset() {
    setOutcome({ kind: "idle" });
  }

  return { outcome, saving, save, reset };
}
