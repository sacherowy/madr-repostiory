import { useEffect, useState } from "react";
import type { Adr, AdrRelation, AdrStatus, RelationType } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";

const ADR_STATUSES: AdrStatus[] = ["proposed", "accepted", "deprecated", "superseded"];
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
  const [missingFields, setMissingFields] = useState<string[] | null>(null);

  async function handleCreate() {
    const result = await apiClient.createAdr({ title, folder: folder ?? ".", author: authorName });
    if (result.ok) {
      setMissingFields(null);
      onAdrSaved(result.adr);
      return;
    }
    setMissingFields(result.missingFields);
  }

  return (
    <div data-testid="adr-editor-create">
      <div>
        <label htmlFor="adr-editor-title-input">Title</label>
        <input
          id="adr-editor-title-input"
          data-testid="title-input"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <button data-testid="create-button" type="button" onClick={handleCreate}>
        Create
      </button>
      {missingFields !== null ? (
        <p data-testid="missing-fields-message">Missing fields: {missingFields.join(", ")}</p>
      ) : null}
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
  const [deciders, setDeciders] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [relations, setRelations] = useState<AdrRelation[]>([]);

  const [relationType, setRelationType] = useState<RelationType>(RELATION_TYPES[0]);
  const [relationTarget, setRelationTarget] = useState("");

  const [missingFields, setMissingFields] = useState<string[] | null>(null);
  const [missingTargets, setMissingTargets] = useState<string[] | null>(null);
  const [conflictLatest, setConflictLatest] = useState<Adr | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  function applyLoadedAdr(adr: Adr) {
    setTitle(adr.title);
    setStatus(adr.status);
    setDate(adr.date);
    setDeciders((adr.deciders ?? []).join(", "));
    setTags((adr.tags ?? []).join(", "));
    setBody(adr.body);
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

  function handleAddRelation() {
    if (!relationTarget) return;
    setRelations((current) => [...current, { type: relationType, target: relationTarget }]);
    setRelationTarget("");
  }

  function handleRemoveRelation(index: number) {
    setRelations((current) => current.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const result = await apiClient.updateAdr(adrId, {
      title,
      status,
      date,
      deciders: splitCsv(deciders),
      tags: splitCsv(tags),
      relations,
      body,
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
    return <div data-testid="adr-editor-loading">Loading…</div>;
  }

  if (loadState.kind === "notFound") {
    return <div data-testid="adr-editor-not-found">ADR not found.</div>;
  }

  return (
    <div data-testid="adr-editor-edit">
      <div>
        <label htmlFor="adr-editor-title-input">Title</label>
        <input
          id="adr-editor-title-input"
          data-testid="title-input"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="adr-editor-status-select">Status</label>
        <select
          id="adr-editor-status-select"
          data-testid="status-select"
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

      <div>
        <label htmlFor="adr-editor-date-input">Date</label>
        <input
          id="adr-editor-date-input"
          data-testid="date-input"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="adr-editor-deciders-input">Deciders</label>
        <input
          id="adr-editor-deciders-input"
          data-testid="deciders-input"
          type="text"
          value={deciders}
          onChange={(event) => setDeciders(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="adr-editor-tags-input">Tags</label>
        <input
          id="adr-editor-tags-input"
          data-testid="tags-input"
          type="text"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="adr-editor-body-textarea">Body</label>
        <textarea
          id="adr-editor-body-textarea"
          data-testid="body-textarea"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>

      <div data-testid="relations-editor">
        <select
          data-testid="relation-type-select"
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
          type="text"
          value={relationTarget}
          onChange={(event) => setRelationTarget(event.target.value)}
        />
        <button data-testid="add-relation-button" type="button" onClick={handleAddRelation}>
          Add relation
        </button>

        <ul>
          {relations.map((relation, index) => (
            <li key={`${relation.type}-${relation.target}-${index}`}>
              {relation.type} → {relation.target}
              <button
                data-testid="remove-relation-button"
                type="button"
                onClick={() => handleRemoveRelation(index)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      <button data-testid="save-button" type="button" onClick={handleSave}>
        Save
      </button>

      {saveSuccess ? <p data-testid="save-success-message">Saved.</p> : null}

      {missingFields !== null ? (
        <p data-testid="missing-fields-message">Missing fields: {missingFields.join(", ")}</p>
      ) : null}

      {missingTargets !== null ? (
        <p data-testid="invalid-relations-message">
          Relation targets not found: {missingTargets.join(", ")}
        </p>
      ) : null}

      {conflictLatest !== null ? (
        <div data-testid="conflict-message">
          <p>{CONFLICT_COPY}</p>
          <button data-testid="reload-latest-button" type="button" onClick={handleReloadLatest}>
            Reload latest version
          </button>
        </div>
      ) : null}
    </div>
  );
}
