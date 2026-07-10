import { useEffect, useState } from "react";
import type { Adr, AdrId, AdrRelation, AdrStatus } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { ComposePage, type ComposeDraft } from "./ComposePage.js";
import { TopicPicker } from "./TopicPicker.js";
import { PeopleEditor, type PeopleValue } from "./PeopleEditor.js";
import { RelationsEditor, type RelationTarget } from "./RelationsEditor.js";
import { OptionCardsEditor, type OptionCardsValue } from "./OptionCardsEditor.js";
import { SummaryControl } from "./SummaryControl.js";
import { CONFLICT_COPY, useComposeSave } from "./useComposeSave.js";

export interface ComposeContainerProps {
  apiClient: ApiClient;
  /** Session author name, submitted as the author of any create/update/move. */
  authorName: string;
  /**
   * Absent selects create mode; a decision id selects edit mode for that
   * decision (matching `portalStore`'s `{ kind: "compose"; id? }` view).
   */
  adrId?: AdrId;
  /** Candidate decisions the RelationsEditor can relate to (8.1 supplies these from the feed). */
  relationTargets?: RelationTarget[];
  /** Feed-backed relation-target title resolver for derived summaries (8.1 supplies it). */
  resolveTitle?: (id: AdrId) => string | undefined;
  /** Notified with the freshly created or freshly saved decision (8.1 navigates on it). */
  onSaved?: (adr: Adr) => void;
}

/** The full set of values needed to seed the compose form for a decision. */
interface ComposeSeed {
  draft: ComposeDraft;
  topic: string;
  people: PeopleValue;
  relations: AdrRelation[];
  options: OptionCardsValue;
  decisionOutcome: string;
  summary: string;
  tags: string[];
  date: string;
  additionalContent: string;
  baseBlobSha: string;
}

/** Containing-folder path of an ADR file ("" when it sits at the repo root). */
function folderOf(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

/** The empty create-mode seed (status defaults to "proposed" / In discussion). */
function emptySeed(): ComposeSeed {
  return {
    draft: {
      title: "",
      status: "proposed",
      contextAndProblemStatement: "",
      decisionDrivers: "",
      consequences: "",
      confirmation: "",
      moreInformation: "",
    },
    topic: "",
    people: { decisionMakers: [], consulted: [], informed: [] },
    relations: [],
    options: { consideredOptions: "", prosAndConsOfTheOptions: "" },
    decisionOutcome: "",
    summary: "",
    tags: [],
    date: "",
    additionalContent: "",
    baseBlobSha: "",
  };
}

/** Builds a seed from a loaded (or conflict-latest) decision record. */
function seedFromAdr(adr: Adr): ComposeSeed {
  return {
    draft: {
      title: adr.title,
      status: adr.status,
      contextAndProblemStatement: adr.contextAndProblemStatement,
      decisionDrivers: adr.decisionDrivers,
      consequences: adr.consequences,
      confirmation: adr.confirmation,
      moreInformation: adr.moreInformation,
    },
    topic: folderOf(adr.path),
    people: {
      decisionMakers: adr.decisionMakers ?? [],
      consulted: adr.consulted ?? [],
      informed: adr.informed ?? [],
    },
    relations: adr.relations ?? [],
    options: {
      consideredOptions: adr.consideredOptions,
      prosAndConsOfTheOptions: adr.prosAndConsOfTheOptions,
    },
    decisionOutcome: adr.decisionOutcome,
    summary: adr.summary ?? "",
    tags: adr.tags ?? [],
    date: adr.date,
    additionalContent: adr.additionalContent,
    baseBlobSha: adr.blobSha,
  };
}

type LoadState =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "ready"; seed: ComposeSeed };

/**
 * Wires the compose form's save flows (task 7.6; design.md ComposePage "save via
 * existing create/update incl. 409 recovery UI"; Req 8.5, 11.1, 15.5).
 *
 * Composes the tested ComposePage skeleton (7.1) with its sibling slot editors
 * (7.2-7.4), owns the lifted slot state the skeleton does not (topic, people,
 * relations, options, outcome, summary), and on publish assembles the full
 * decision and persists it through {@link useComposeSave} — `createAdr` in create
 * mode, `updateAdr` with the loaded `baseBlobSha` in edit mode. A `409` stale
 * write runs the preserved reload-latest recovery with the verbatim
 * {@link CONFLICT_COPY} message (8.5); a successful save invalidates `["feed"]`
 * and the decision's per-id queries so the feed/article refresh.
 *
 * The live-preview rail, the saved-revision AI affordance, and the fully lifted
 * live draft (status-driven outcome lock across the whole form) are wired by task
 * 8.1 when it mounts this into the App; this container focuses on the save
 * mechanism, payload assembly, conflict recovery, and query invalidation.
 */
export function ComposeContainer({
  apiClient,
  authorName,
  adrId,
  relationTargets = [],
  resolveTitle,
  onSaved,
}: ComposeContainerProps) {
  const isEdit = adrId !== undefined;
  const [load, setLoad] = useState<LoadState>(
    isEdit ? { kind: "loading" } : { kind: "ready", seed: emptySeed() }
  );
  // Bumped on a conflict reload so the inner form remounts fresh from the latest
  // seed — the slot editors (PeopleEditor/OptionCardsEditor/TopicPicker) and
  // ComposePage seed once at mount, so a remount is how they re-read new values.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (adrId === undefined) {
      setLoad({ kind: "ready", seed: emptySeed() });
      return;
    }
    let cancelled = false;
    setLoad({ kind: "loading" });
    apiClient
      .getAdr(adrId)
      .then((result) => {
        if (cancelled) return;
        setLoad(result.ok ? { kind: "ready", seed: seedFromAdr(result.adr) } : { kind: "notFound" });
      })
      .catch(() => {
        // A network-level failure is treated like a 404, mirroring the previous
        // editor's load handling — there is nothing more specific to do here.
        if (!cancelled) setLoad({ kind: "notFound" });
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, adrId]);

  function handleReload(latest: Adr) {
    setLoad({ kind: "ready", seed: seedFromAdr(latest) });
    setGeneration((g) => g + 1);
  }

  if (load.kind === "loading") {
    return (
      <div data-testid="compose-loading" className="state state--loading">
        <span className="state__spinner" aria-hidden="true" />
        <p className="state__message">Loading…</p>
      </div>
    );
  }

  if (load.kind === "notFound") {
    return (
      <div data-testid="compose-not-found" className="state state--error">
        <p className="state__title">Decision not found.</p>
      </div>
    );
  }

  return (
    <ComposeForm
      key={`${adrId ?? "new"}-${generation}`}
      apiClient={apiClient}
      authorName={authorName}
      adrId={adrId}
      seed={load.seed}
      relationTargets={relationTargets}
      resolveTitle={resolveTitle}
      onSaved={onSaved}
      onReload={handleReload}
    />
  );
}

interface ComposeFormProps {
  apiClient: ApiClient;
  authorName: string;
  adrId?: AdrId;
  seed: ComposeSeed;
  relationTargets: RelationTarget[];
  resolveTitle?: (id: AdrId) => string | undefined;
  onSaved?: (adr: Adr) => void;
  onReload: (latest: Adr) => void;
}

/**
 * The mounted compose form for one decision revision: it holds the live slot
 * state (seeded once from `seed`), renders ComposePage with every editor slot
 * filled, and runs the save on publish. Remounted (via the container's key) when
 * a conflict reload swaps in the latest revision.
 */
function ComposeForm({
  apiClient,
  authorName,
  adrId,
  seed,
  relationTargets,
  resolveTitle,
  onSaved,
  onReload,
}: ComposeFormProps) {
  const [topic, setTopic] = useState(seed.topic);
  const [people, setPeople] = useState<PeopleValue>(seed.people);
  const [relations, setRelations] = useState<AdrRelation[]>(seed.relations);
  const [options, setOptions] = useState<OptionCardsValue>(seed.options);
  const [decisionOutcome, setDecisionOutcome] = useState(seed.decisionOutcome);
  const [chosenOptionId, setChosenOptionId] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState(seed.summary);

  const { outcome, saving, save } = useComposeSave(apiClient, authorName, adrId);

  // The outcome-lock's status is the loaded/initial status; full live-status
  // lifting across the whole form is task 8.1's concern (the lock is UI-only, 9.5).
  const status: AdrStatus = seed.draft.status;

  async function handlePublish(draft: ComposeDraft) {
    const result = await save({
      draft,
      topic,
      people,
      relations,
      options,
      decisionOutcome,
      summary,
      tags: seed.tags,
      date: seed.date,
      additionalContent: seed.additionalContent,
      baseBlobSha: seed.baseBlobSha,
    });
    if (result.kind === "created" || result.kind === "saved") {
      onSaved?.(result.adr);
    }
  }

  return (
    <div data-testid="compose-container">
      <ComposePage
        adrId={adrId}
        initialDraft={seed.draft}
        onPublish={handlePublish}
        topicPeopleRelations={
          <>
            <TopicPicker
              apiClient={apiClient}
              authorName={authorName}
              adrId={adrId}
              value={topic}
              onChange={setTopic}
            />
            <PeopleEditor value={people} onChange={setPeople} />
            <RelationsEditor value={relations} onChange={setRelations} targets={relationTargets} />
          </>
        }
        optionCards={
          <OptionCardsEditor
            value={options}
            onChange={setOptions}
            status={status}
            decisionOutcome={decisionOutcome}
            onDecisionOutcomeChange={setDecisionOutcome}
            chosenOptionId={chosenOptionId}
            onMarkChosen={setChosenOptionId}
          />
        }
        summaryControl={
          <SummaryControl
            summary={summary}
            onSummaryChange={setSummary}
            derivation={{
              status,
              decisionOutcome,
              consideredOptions: options.consideredOptions,
              decisionDrivers: seed.draft.decisionDrivers,
              contextAndProblemStatement: seed.draft.contextAndProblemStatement,
              date: seed.date,
              relations,
            }}
            resolveTitle={resolveTitle}
            adrId={adrId}
            apiClient={apiClient}
          />
        }
      />

      <div className="compose__save-feedback" aria-live="polite">
        {outcome.kind === "saved" || outcome.kind === "created" ? (
          <p data-testid="compose-saved" className="badge badge--accepted">
            Saved.
          </p>
        ) : null}

        {outcome.kind === "invalid" ? (
          <p data-testid="compose-invalid" className="state state--error state__message">
            Missing fields: {outcome.missingFields.join(", ")}
          </p>
        ) : null}

        {outcome.kind === "invalidRelations" ? (
          <p data-testid="compose-invalid-relations" className="state state--error state__message">
            Relation targets not found: {outcome.missingTargets.join(", ")}
          </p>
        ) : null}

        {outcome.kind === "notFound" ? (
          <p data-testid="compose-save-not-found" className="state state--error state__message">
            This decision could not be found to save.
          </p>
        ) : null}

        {outcome.kind === "conflict" ? (
          <div data-testid="compose-conflict" className="state state--error">
            <p className="state__message">{CONFLICT_COPY}</p>
            <button
              type="button"
              data-testid="compose-conflict-reload"
              className="btn btn--secondary"
              disabled={saving}
              onClick={() => onReload(outcome.latest)}
            >
              Reload latest version
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
