import { useEffect, useState } from "react";
import type { Adr, AdrRelation, AdrSections, AdrStatus, MadrSectionMeta, RelationType } from "@adr/shared";
import { MADR_SECTIONS } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { MonoChip } from "../../components/MonoChip.js";
import { RelationChip } from "../../components/RelationChip.js";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { PeopleEditor } from "./PeopleEditor.js";
import { rowsFromStakeholders, stakeholdersFromRows, type PersonRow, type StakeholderRole } from "../compose/people.js";
import { OptionsEditor } from "./OptionsEditor.js";
import { parseOptions, serializeOptions, type OptionRow } from "../compose/options.js";

const ADR_STATUSES: AdrStatus[] = ["proposed", "accepted", "deprecated", "superseded", "rejected"];
const RELATION_TYPES: RelationType[] = [
  "supersedes",
  "superseded-by",
  "relates-to",
  "depends-on",
  "conflicts-with",
];

const CONFLICT_COPY = "Plik zmienił się od ostatniego odczytu. Odśwież i zapisz ponownie.";

export interface AdrEditorProps {
  /** `null` selects create mode; a string id selects edit mode for that ADR. */
  adrId: string | null;
  /** Target folder for a newly created ADR (create mode only). Falls back to "." when null. */
  folder: string | null;
  /** Session author name (from the shell), submitted as the author of any save. */
  authorName: string;
  apiClient: ApiClient;
  /** Called with the freshly created or freshly saved Adr so the shell can track its id. */
  onAdrSaved: (adr: Adr) => void;
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** camelCase section key -> kebab-case testid segment, e.g. "contextAndProblemStatement" -> "context-and-problem-statement". */
function toKebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Returns the first non-blank line of value, truncated to 80 characters with … when over limit. */
export function firstLine(value: string): string {
  const line = value.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

/**
 * `sections` no longer carries `consideredOptions`/`prosAndConsOfTheOptions` —
 * `optionRows` is the sole client-side source of truth for that content (see
 * research.md "Decision: `optionRows` as sole source of truth for option
 * content"), so those two keys are removed from the type entirely rather than
 * kept as a second, parallel copy.
 */
type EditableAdrSections = Omit<AdrSections, "consideredOptions" | "prosAndConsOfTheOptions">;

function emptySections(): EditableAdrSections {
  return {
    contextAndProblemStatement: "",
    decisionDrivers: "",
    decisionOutcome: "",
    consequences: "",
    confirmation: "",
    moreInformation: "",
  };
}

/** Type guard narrowing MadrSectionMeta down to the keys still rendered generically. */
function isEditableSection(
  meta: MadrSectionMeta
): meta is MadrSectionMeta & { key: keyof EditableAdrSections } {
  return meta.key !== "consideredOptions" && meta.key !== "prosAndConsOfTheOptions";
}

export function AdrEditor(props: AdrEditorProps) {
  if (props.adrId === null) {
    return <CreateAdrForm folder={props.folder} authorName={props.authorName} apiClient={props.apiClient} onAdrSaved={props.onAdrSaved} />;
  }
  return (
    <EditAdrForm
      key={props.adrId}
      adrId={props.adrId}
      authorName={props.authorName}
      apiClient={props.apiClient}
      onAdrSaved={props.onAdrSaved}
    />
  );
}

interface CreateAdrFormProps {
  folder: string | null;
  authorName: string;
  apiClient: ApiClient;
  onAdrSaved: (adr: Adr) => void;
}

function CreateAdrForm({ folder, authorName, apiClient, onAdrSaved }: CreateAdrFormProps) {
  const [title, setTitle] = useState("");
  const [decisionMakers, setDecisionMakers] = useState("");
  const [consulted, setConsulted] = useState("");
  const [informed, setInformed] = useState("");
  const [missingFields, setMissingFields] = useState<string[] | null>(null);

  async function handleCreate() {
    const result = await apiClient.createAdr({
      title,
      folder: folder ?? ".",
      author: authorName,
      decisionMakers: splitCsv(decisionMakers),
      consulted: splitCsv(consulted),
      informed: splitCsv(informed),
    });
    if (result.ok) {
      setMissingFields(null);
      onAdrSaved(result.adr);
      return;
    }
    setMissingFields(result.missingFields);
  }

  return (
    <div data-testid="adr-editor-create" className="card">
      <span className="card__accent" aria-hidden="true" />
      <div className="card__body">
        <h2 className="card__title">New ADR</h2>
        <div className={`field${missingFields !== null ? " field--error" : ""}`}>
          <label className="field__label" htmlFor="adr-editor-title-input">
            Title
          </label>
          <input
            id="adr-editor-title-input"
            data-testid="title-input"
            className="field__input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="adr-editor-decision-makers-input">
            Decision Makers
          </label>
          <input
            id="adr-editor-decision-makers-input"
            data-testid="decision-makers-input"
            className="field__input"
            type="text"
            value={decisionMakers}
            onChange={(event) => setDecisionMakers(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="adr-editor-consulted-input">
            Consulted
          </label>
          <input
            id="adr-editor-consulted-input"
            data-testid="consulted-input"
            className="field__input"
            type="text"
            value={consulted}
            onChange={(event) => setConsulted(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="adr-editor-informed-input">
            Informed
          </label>
          <input
            id="adr-editor-informed-input"
            data-testid="informed-input"
            className="field__input"
            type="text"
            value={informed}
            onChange={(event) => setInformed(event.target.value)}
          />
        </div>
        <div className="card__footer">
          <button
            data-testid="create-button"
            className="btn btn--primary"
            type="button"
            onClick={handleCreate}
          >
            Create
          </button>
        </div>
        {missingFields !== null ? (
          <p data-testid="missing-fields-message" className="state state--error state__message">
            Missing fields: {missingFields.join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface EditAdrFormProps {
  adrId: string;
  authorName: string;
  apiClient: ApiClient;
  onAdrSaved: (adr: Adr) => void;
}

type LoadState = { kind: "loading" } | { kind: "notFound" } | { kind: "loaded" };

function EditAdrForm({ adrId, authorName, apiClient, onAdrSaved }: EditAdrFormProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [baseBlobSha, setBaseBlobSha] = useState("");

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<AdrStatus>("proposed");
  const [date, setDate] = useState("");
  const [peopleRows, setPeopleRows] = useState<PersonRow[]>([]);
  const [tags, setTags] = useState("");
  const [sections, setSections] = useState<EditableAdrSections>(emptySections());
  const [optionRows, setOptionRows] = useState<OptionRow[]>([]);
  const [additionalContent, setAdditionalContent] = useState("");
  const [relations, setRelations] = useState<AdrRelation[]>([]);

  const [relationType, setRelationType] = useState<RelationType>(RELATION_TYPES[0]);
  const [relationTarget, setRelationTarget] = useState("");

  const [missingFields, setMissingFields] = useState<string[] | null>(null);
  const [missingTargets, setMissingTargets] = useState<string[] | null>(null);
  const [conflictLatest, setConflictLatest] = useState<Adr | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(
    () => new Set(MADR_SECTIONS.filter((m) => m.required).map((m) => m.key))
  );

  function toggleSection(key: string): void {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyLoadedAdr(adr: Adr) {
    setTitle(adr.title);
    setStatus(adr.status);
    setDate(adr.date);
    setPeopleRows(rowsFromStakeholders(adr.decisionMakers ?? [], adr.consulted ?? [], adr.informed ?? []));
    setTags((adr.tags ?? []).join(", "));
    setSections({
      contextAndProblemStatement: adr.contextAndProblemStatement,
      decisionDrivers: adr.decisionDrivers,
      decisionOutcome: adr.decisionOutcome,
      consequences: adr.consequences,
      confirmation: adr.confirmation,
      moreInformation: adr.moreInformation,
    });
    setOptionRows(parseOptions(adr.consideredOptions, adr.prosAndConsOfTheOptions));
    setAdditionalContent(adr.additionalContent);
    setRelations(adr.relations ?? []);
    setBaseBlobSha(adr.blobSha);
  }

  useEffect(() => {
    let cancelled = false;
    setLoadState({ kind: "loading" });
    setMissingFields(null);
    setMissingTargets(null);
    setConflictLatest(null);
    setSaveSuccess(false);

    apiClient
      .getAdr(adrId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setLoadState({ kind: "notFound" });
          return;
        }
        applyLoadedAdr(result.adr);
        setLoadState({ kind: "loaded" });
      })
      .catch(() => {
        // A network-level failure (e.g. no reachable API) is treated the
        // same as a 404: there's nothing more specific the user can do with
        // it from this form than from a genuine "not found".
        if (!cancelled) setLoadState({ kind: "notFound" });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adrId]);

  function handleSectionChange(key: keyof EditableAdrSections, value: string) {
    setSections((current) => ({ ...current, [key]: value }));
  }

  function handleAddRelation() {
    if (!relationTarget) return;
    setRelations((current) => [...current, { type: relationType, target: relationTarget }]);
    setRelationTarget("");
  }

  function handleRemoveRelation(index: number) {
    setRelations((current) => current.filter((_, i) => i !== index));
  }

  function handleAddPersonRow() {
    setPeopleRows((current) => [
      ...current,
      { id: crypto.randomUUID(), name: "", role: "Decision Maker" },
    ]);
  }

  function handleRemovePersonRow(id: string) {
    setPeopleRows((current) => current.filter((row) => row.id !== id));
  }

  function handlePersonNameChange(id: string, name: string) {
    setPeopleRows((current) => current.map((row) => (row.id === id ? { ...row, name } : row)));
  }

  function handlePersonRoleChange(id: string, role: StakeholderRole) {
    setPeopleRows((current) => current.map((row) => (row.id === id ? { ...row, role } : row)));
  }

  function handleAddOptionRow() {
    setOptionRows((current) => [
      ...current,
      { id: crypto.randomUUID(), description: "", pros: "", cons: "" },
    ]);
  }

  function handleRemoveOptionRow(id: string) {
    setOptionRows((current) => current.filter((row) => row.id !== id));
  }

  function handleOptionDescriptionChange(id: string, description: string) {
    setOptionRows((current) => current.map((row) => (row.id === id ? { ...row, description } : row)));
  }

  function handleOptionProsChange(id: string, pros: string) {
    setOptionRows((current) => current.map((row) => (row.id === id ? { ...row, pros } : row)));
  }

  function handleOptionConsChange(id: string, cons: string) {
    setOptionRows((current) => current.map((row) => (row.id === id ? { ...row, cons } : row)));
  }

  async function handleSave() {
    const result = await apiClient.updateAdr(adrId, {
      title,
      status,
      date,
      ...stakeholdersFromRows(peopleRows),
      tags: splitCsv(tags),
      relations,
      ...sections,
      ...serializeOptions(optionRows),
      additionalContent,
      author: authorName,
      baseBlobSha,
    });

    if (result.ok) {
      setMissingFields(null);
      setMissingTargets(null);
      setConflictLatest(null);
      applyLoadedAdr(result.adr);
      setSaveSuccess(true);
      onAdrSaved(result.adr);
      return;
    }

    if (result.kind === "invalid") {
      setMissingFields(result.missingFields);
      setMissingTargets(null);
      setConflictLatest(null);
      setSaveSuccess(false);
      return;
    }

    if (result.kind === "invalidRelations") {
      setMissingTargets(result.missingTargets);
      setMissingFields(null);
      setConflictLatest(null);
      setSaveSuccess(false);
      return;
    }

    if (result.kind === "conflict") {
      setConflictLatest(result.latest);
      setMissingFields(null);
      setMissingTargets(null);
      setSaveSuccess(false);
      return;
    }

    // kind === "notFound"
    setLoadState({ kind: "notFound" });
  }

  function handleReloadLatest() {
    if (!conflictLatest) return;
    applyLoadedAdr(conflictLatest);
    setConflictLatest(null);
  }

  if (loadState.kind === "loading") {
    return (
      <div data-testid="adr-editor-loading" className="state state--loading">
        <span className="state__spinner" aria-hidden="true" />
        <p className="state__message">Loading…</p>
      </div>
    );
  }

  if (loadState.kind === "notFound") {
    return (
      <div data-testid="adr-editor-not-found" className="state state--error">
        <p className="state__title">ADR not found.</p>
      </div>
    );
  }

  /** Renders one generic MADR section CollapsibleSection + textarea, unchanged from before. */
  function renderSectionField(meta: MadrSectionMeta & { key: keyof EditableAdrSections }) {
    const testId = `${toKebabCase(meta.key)}-textarea`;
    const inputId = `adr-editor-${testId}`;
    return (
      <CollapsibleSection
        key={meta.key}
        sectionKey={meta.key}
        title={meta.heading}
        required={meta.required}
        isOpen={openSections.has(meta.key)}
        onToggle={() => toggleSection(meta.key)}
        preview={firstLine(sections[meta.key])}
      >
        <textarea
          id={inputId}
          data-testid={testId}
          aria-labelledby={`section-title-${meta.key}`}
          className="field__input"
          value={sections[meta.key]}
          onChange={(event) => handleSectionChange(meta.key, event.target.value)}
        />
      </CollapsibleSection>
    );
  }

  // consideredOptions/prosAndConsOfTheOptions are excluded from the generic loop —
  // they're rendered as the structured OptionsEditor instead, positioned (per
  // design.md JSX order item 5) immediately after Decision Drivers and before
  // Decision Outcome. consequences/confirmation are also excluded from the
  // generic loop: they're rendered manually inside Decision Outcome's own
  // CollapsibleSection body (task 4.3 / design.md JSX order item 6), each
  // preceded by its own visible label so their aria-labelledby references
  // keep resolving now that they no longer have their own CollapsibleSection
  // header to supply that id.
  const editableSections = MADR_SECTIONS.filter(isEditableSection);
  const decisionOutcomeIndex = editableSections.findIndex((meta) => meta.key === "decisionOutcome");
  const decisionOutcomeMeta = editableSections[decisionOutcomeIndex];
  const sectionsBeforeOptions = editableSections.slice(0, decisionOutcomeIndex);
  const sectionsAfterDecisionOutcome = editableSections
    .slice(decisionOutcomeIndex + 1)
    .filter((meta) => meta.key !== "consequences" && meta.key !== "confirmation");
  const optionsPreview = optionRows.find((row) => row.description.trim() !== "")?.description ?? "";

  return (
    <div data-testid="adr-editor-edit" className="card">
      <span className="card__accent" aria-hidden="true" />
      <div className="card__body">
        <div className="card__header">
          <h2 className="card__title">Edit ADR</h2>
          <div className="card__meta">
            <MonoChip variant="id" value={adrId} data-testid="adr-id-chip" />
            <MonoChip variant="sha" value={baseBlobSha} data-testid="adr-sha-chip" />
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="adr-editor-title-input">
            Title
          </label>
          <input
            id="adr-editor-title-input"
            data-testid="title-input"
            className="field__input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="adr-editor-status-select">
            Status <StatusBadge status={status} />
          </label>
          <select
            id="adr-editor-status-select"
            data-testid="status-select"
            className="field__input"
            value={status}
            onChange={(event) => setStatus(event.target.value as AdrStatus)}
          >
            {ADR_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="adr-editor-date-input">
            Date
          </label>
          <input
            id="adr-editor-date-input"
            data-testid="date-input"
            className="field__input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="adr-editor-tags-input">
            Tags
          </label>
          <input
            id="adr-editor-tags-input"
            data-testid="tags-input"
            className="field__input"
            type="text"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </div>

        <PeopleEditor
          rows={peopleRows}
          onAddRow={handleAddPersonRow}
          onRemoveRow={handleRemovePersonRow}
          onNameChange={handlePersonNameChange}
          onRoleChange={handlePersonRoleChange}
        />

        {sectionsBeforeOptions.map(renderSectionField)}

        <CollapsibleSection
          sectionKey="options"
          title="Considered Options"
          required={false}
          isOpen={openSections.has("options")}
          onToggle={() => toggleSection("options")}
          preview={optionsPreview}
        >
          <OptionsEditor
            rows={optionRows}
            onAddRow={handleAddOptionRow}
            onRemoveRow={handleRemoveOptionRow}
            onDescriptionChange={handleOptionDescriptionChange}
            onProsChange={handleOptionProsChange}
            onConsChange={handleOptionConsChange}
          />
        </CollapsibleSection>

        <CollapsibleSection
          sectionKey={decisionOutcomeMeta.key}
          title={decisionOutcomeMeta.heading}
          required={decisionOutcomeMeta.required}
          isOpen={openSections.has(decisionOutcomeMeta.key)}
          onToggle={() => toggleSection(decisionOutcomeMeta.key)}
          preview={firstLine(sections.decisionOutcome)}
        >
          <textarea
            id="adr-editor-decision-outcome-textarea"
            data-testid="decision-outcome-textarea"
            aria-labelledby="section-title-decisionOutcome"
            className="field__input"
            value={sections.decisionOutcome}
            onChange={(event) => handleSectionChange("decisionOutcome", event.target.value)}
          />
          <span id="section-title-consequences" className="field__label">
            Consequences
          </span>
          <textarea
            id="adr-editor-consequences-textarea"
            data-testid="consequences-textarea"
            aria-labelledby="section-title-consequences"
            className="field__input"
            value={sections.consequences}
            onChange={(event) => handleSectionChange("consequences", event.target.value)}
          />
          <span id="section-title-confirmation" className="field__label">
            Confirmation
          </span>
          <textarea
            id="adr-editor-confirmation-textarea"
            data-testid="confirmation-textarea"
            aria-labelledby="section-title-confirmation"
            className="field__input"
            value={sections.confirmation}
            onChange={(event) => handleSectionChange("confirmation", event.target.value)}
          />
        </CollapsibleSection>

        {sectionsAfterDecisionOutcome.map(renderSectionField)}

        <CollapsibleSection
          sectionKey="additionalContent"
          title="Additional Content"
          required={false}
          isOpen={openSections.has("additionalContent")}
          onToggle={() => toggleSection("additionalContent")}
          preview={firstLine(additionalContent)}
        >
          <textarea
            id="adr-editor-additional-content-textarea"
            data-testid="additional-content-textarea"
            aria-labelledby="section-title-additionalContent"
            className="field__input"
            value={additionalContent}
            onChange={(event) => setAdditionalContent(event.target.value)}
          />
        </CollapsibleSection>

        <div data-testid="relations-editor" className="field">
          <span className="field__label">Relations</span>
          <div className="card__header">
            <select
              data-testid="relation-type-select"
              className="field__input"
              value={relationType}
              onChange={(event) => setRelationType(event.target.value as RelationType)}
            >
              {RELATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <input
              data-testid="relation-target-input"
              className="field__input"
              type="text"
              value={relationTarget}
              onChange={(event) => setRelationTarget(event.target.value)}
            />
            <button
              data-testid="add-relation-button"
              className="btn btn--secondary"
              type="button"
              onClick={handleAddRelation}
            >
              Add relation
            </button>
          </div>

          <ul className="card__meta">
            {relations.map((relation, index) => (
              <li
                key={`${relation.type}-${relation.target}-${index}`}
                className="card__header"
              >
                <RelationChip type={relation.type} target={relation.target} />
                <button
                  data-testid="remove-relation-button"
                  className="btn btn--danger"
                  type="button"
                  onClick={() => handleRemoveRelation(index)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card__footer">
        <button
          data-testid="save-button"
          className="btn btn--primary"
          type="button"
          onClick={handleSave}
        >
          Save
        </button>

        {saveSuccess ? (
          <p data-testid="save-success-message" className="badge badge--accepted">
            Saved.
          </p>
        ) : null}

        {missingFields !== null ? (
          <p data-testid="missing-fields-message" className="state state--error state__message">
            Missing fields: {missingFields.join(", ")}
          </p>
        ) : null}

        {missingTargets !== null ? (
          <p data-testid="invalid-relations-message" className="state state--error state__message">
            Relation targets not found: {missingTargets.join(", ")}
          </p>
        ) : null}

        {conflictLatest !== null ? (
          <div data-testid="conflict-message" className="state state--error">
            <p className="state__message">{CONFLICT_COPY}</p>
            <button
              data-testid="reload-latest-button"
              className="btn btn--secondary"
              type="button"
              onClick={handleReloadLatest}
            >
              Reload latest version
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
