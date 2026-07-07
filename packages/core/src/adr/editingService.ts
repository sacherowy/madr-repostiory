import type { Adr, CreateAdrRequest, UpdateAdrRequest } from "@adr/shared";
import type { GitPort } from "../ports/git.js";
import type { SearchIndex } from "../ports/search.js";
import { RelationGraphService } from "../relations/relationGraphService.js";
import { parseAdr, serializeAdr } from "./parse.js";
import { combinedSectionText } from "./sections.js";

/**
 * Optional author-owned one-line short description accepted in create/update
 * payloads (11.1) and passed through onto the Adr explicitly. Declared as a
 * local intersection rather than on `CreateAdrRequest`/`UpdateAdrRequest` in
 * `@adr/shared` because those are the HTTP request DTOs — extending them
 * additively is the API-contract change (15.3) owned by the routes work, while
 * this service only needs its own payload types to carry the field.
 */
export type SummaryCarrier = { summary?: string };

/** `create`'s payload: the shared create DTO plus the optional author summary. */
export type CreateAdrInput = CreateAdrRequest & SummaryCarrier;

/**
 * `UpdateAdrRequest` bundles `author`/`baseBlobSha` into the same object, but
 * `save`'s call signature (per design.md) takes them as separate trailing
 * parameters instead — mirrors the system flow where the route layer passes
 * `baseBlobSha` through a dedicated concurrency-check step.
 */
export type SaveAdrInput = Omit<UpdateAdrRequest, "author" | "baseBlobSha"> & SummaryCarrier;

export type SaveResult =
  | { kind: "saved"; adr: Adr }
  | { kind: "conflict"; latest: Adr }
  | { kind: "invalid"; missingFields: string[] }
  | { kind: "invalidRelations"; missingTargets: string[] };

const ID_PATTERN = /^adr-(\d+)$/;

/** Omits a key entirely when its value is undefined, rather than setting the
 * key to an explicit `undefined` value. This matters because serializeAdr
 * pipes frontmatter straight into js-yaml's dumper, which throws on a literal
 * `undefined` property value (it has no YAML representation) — whereas a
 * genuinely absent key is simply skipped, exactly like every other ADR
 * fixture in this codebase that omits deciders/tags rather than nulling them. */
function withoutUndefined<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) result[key] = obj[key];
  }
  return result;
}

/** Normalizes a blank (empty/whitespace-only) summary to `undefined` so it is
 * dropped by the withoutUndefined spread like any other absent optional
 * frontmatter field, instead of persisting a meaningless `summary: ''` key.
 * A blank string carries no author framing — absence is the valid state for
 * summary-less records (11.3), and every downstream consumer (the derivation
 * ladder) already treats non-blank as the only "author summary present"
 * signal, so an empty key would be pure frontmatter noise. Non-blank values
 * pass through verbatim (author-owned prose is never rewritten). */
function normalizeSummary(summary: string | undefined): string | undefined {
  return summary !== undefined && summary.trim() !== "" ? summary : undefined;
}

/**
 * Creates new ADRs (generated id + pre-filled frontmatter) and saves edits as
 * new committed versions, enforcing optimistic concurrency (via blob sha
 * comparison) and relation-target integrity before any commit happens.
 *
 * Zero I/O beyond the injected ports/services: GitPort, RelationGraphService,
 * SearchIndex. Does not serialize concurrent calls itself — safe to call only
 * one-at-a-time per repo (WriteQueue's job, a later task, out of scope here).
 */
export class AdrEditingService {
  constructor(
    private readonly git: GitPort,
    private readonly relations: RelationGraphService,
    private readonly searchIndex: SearchIndex
  ) {}

  /**
   * Generates the next sequential id (repo-wide scan, gap-not-filled — see
   * nextId), commits an ADR pre-filled with status "proposed", today's date,
   * and every MADR section field (plus additionalContent) left empty for the
   * author to fill in, and returns it with the genuine post-commit blob sha.
   * Never touches SearchIndex: a freshly created ADR has nothing meaningful
   * to index yet (it becomes searchable once the user saves real content via
   * save()).
   */
  async create(input: CreateAdrInput, author: string): Promise<Adr> {
    const id = await this.nextId();
    const path = input.folder === "." ? `${id}.md` : `${input.folder}/${id}.md`;
    const date = new Date().toISOString().slice(0, 10);

    const adr: Adr = {
      ...withoutUndefined({
        summary: normalizeSummary(input.summary),
        decisionMakers: input.decisionMakers,
        consulted: input.consulted,
        informed: input.informed,
        tags: input.tags,
      }),
      id,
      title: input.title,
      status: "proposed",
      date,
      contextAndProblemStatement: "",
      decisionDrivers: "",
      consideredOptions: "",
      decisionOutcome: "",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      path,
      blobSha: "",
    };

    await this.git.writeAndCommit(path, serializeAdr(adr), `create ${id}`, author);
    const blobSha = await this.git.currentBlobSha(path);

    return { ...adr, blobSha: blobSha as string };
  }

  /**
   * Validates in cheapest-first order: missing fields (no I/O) -> id
   * resolution (throws on violated precondition, mirroring
   * HistoryService.findAdrById's precedent) -> concurrency check against the
   * resolved path's current blob sha -> relation-target existence -> commit.
   * Search-index upsert failure after a successful commit is swallowed
   * (non-fatal): indexing is a best-effort projection, not a correctness
   * gate on the save itself.
   */
  async save(
    id: string,
    input: SaveAdrInput,
    baseBlobSha: string,
    author: string
  ): Promise<SaveResult> {
    const missingFields: string[] = [];
    if (!input.title) missingFields.push("title");
    if (!input.contextAndProblemStatement) missingFields.push("contextAndProblemStatement");
    if (!input.decisionOutcome) missingFields.push("decisionOutcome");
    if (missingFields.length > 0) return { kind: "invalid", missingFields };

    const found = await this.findAdrById(id);

    const currentBlobSha = await this.git.currentBlobSha(found.path);
    if (currentBlobSha !== baseBlobSha) {
      const raw = await this.git.read(found.path);
      const latest = parseAdr(raw, found.path, currentBlobSha as string);
      return { kind: "conflict", latest };
    }

    const missingTargets: string[] = [];
    for (const relation of input.relations ?? []) {
      const exists = await this.relations.targetExists(relation.target);
      if (!exists) missingTargets.push(relation.target);
    }
    if (missingTargets.length > 0) return { kind: "invalidRelations", missingTargets };

    const adr: Adr = {
      ...withoutUndefined({
        summary: normalizeSummary(input.summary),
        decisionMakers: input.decisionMakers,
        consulted: input.consulted,
        informed: input.informed,
        tags: input.tags,
        relations: input.relations,
      }),
      id,
      title: input.title,
      status: input.status,
      date: input.date,
      contextAndProblemStatement: input.contextAndProblemStatement,
      decisionDrivers: input.decisionDrivers,
      consideredOptions: input.consideredOptions,
      decisionOutcome: input.decisionOutcome,
      consequences: input.consequences,
      confirmation: input.confirmation,
      prosAndConsOfTheOptions: input.prosAndConsOfTheOptions,
      moreInformation: input.moreInformation,
      additionalContent: input.additionalContent,
      path: found.path,
      blobSha: "",
    };

    await this.git.writeAndCommit(found.path, serializeAdr(adr), `save ${id}`, author);
    const newBlobSha = await this.git.currentBlobSha(found.path);
    const saved: Adr = { ...adr, blobSha: newBlobSha as string };

    try {
      this.searchIndex.upsert({
        id,
        title: input.title,
        body: combinedSectionText(input, input.additionalContent),
        tags: input.tags ?? [],
      });
    } catch {
      // Indexing failure must not fail the save (best-effort projection).
    }

    return { kind: "saved", adr: saved };
  }

  /** Repo-wide sequential id scheme: scans every current ADR's frontmatter
   * id for the `adr-NNNN` pattern, takes the max matched number (ignoring
   * non-matching ids and defaulting to 0 when none match), and returns one
   * past that, zero-padded to at least 4 digits. Deliberately does NOT fill
   * gaps (e.g. existing adr-0001/adr-0003 -> next is adr-0004, not adr-0002). */
  private async nextId(): Promise<string> {
    const files = await this.git.listAdrFiles(".");
    let max = 0;
    for (const file of files) {
      const raw = await this.git.read(file.path);
      const adr = parseAdr(raw, file.path, file.blobSha);
      const match = ID_PATTERN.exec(adr.id);
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `adr-${String(max + 1).padStart(4, "0")}`;
  }

  /** Scans every current ADR file to find the one whose frontmatter id
   * matches; GitPort has no find-by-id lookup (mirrors HistoryService's /
   * ComparisonService's existing scan pattern). Throws since save() trusts
   * its id-resolves precondition rather than handling the failure gracefully
   * (the SaveResult union has no "notFound" variant). */
  private async findAdrById(id: string): Promise<{ path: string; adr: Adr }> {
    const files = await this.git.listAdrFiles(".");
    for (const file of files) {
      const raw = await this.git.read(file.path);
      const adr = parseAdr(raw, file.path, file.blobSha);
      if (adr.id === id) return { path: file.path, adr };
    }
    throw new Error(`ADR not found: ${id}`);
  }
}
