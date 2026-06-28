# Research & Design Decisions Template

---
**Purpose**: Capture discovery findings, architectural investigations, and rationale that inform the technical design.

**Usage**:
- Log research activities and outcomes during the discovery phase.
- Document design decision trade-offs that are too detailed for `design.md`.
- Provide references and evidence for future audits or reuse.
---

## Summary
- **Feature**: `madr-template-alignment`
- **Discovery Scope**: Extension (brownfield, light discovery)
- **Key Findings**:
  - The `Adr` domain type and the `AdrFrontmatter` YAML-serialized type can diverge without disrupting most consumers: `Adr.title` can remain a plain `string` field even after it stops being a literal frontmatter key, because every consumer (`AdrCard`, `ContextHeader`, `App.tsx`, `comparisonService`, `reindex.ts`, `AdrEditor.tsx`, `folderService.ts`) already reads `adr.title` generically and is agnostic to where it is physically stored.
  - All renaming/relocation logic can be isolated to a single boundary: `packages/core/src/adr/parse.ts` (`parseAdr`/`serializeAdr`). No other file needs to know about the legacy `deciders` key, the legacy frontmatter `title`, or the H1-extraction mechanics.
  - `relationGraphService.ts` is already fully decoupled from `status`, and `reindex.ts` already treats `title`/`body`/`tags` generically — both require zero code changes, which independently confirms Requirement 2.3/2.4 and Requirement 6.3 are satisfied by the existing architecture plus the `parse.ts` change alone.
  - The official MADR reference is pinned to [v4.0.0](https://github.com/adr/madr/releases/tag/4.0.0) (released 2024-09-17, commit `2475fe1973f66a12aaf58a91d8fa7b42c0f5ea3d`) rather than the `develop` branch. Fetching that pinned version verbatim also surfaced that upstream nests `### Consequences`/`### Confirmation` under `## Decision Outcome` rather than placing all 8 sections at one heading level — `design.md`'s scaffold has been corrected to match.
  - A `/kiro-validate-design` pass against the live codebase found that `CreateAdrForm` (`apps/web/src/features/adr-editor/AdrEditor.tsx`) has no fields beyond `title` today, while Req 1.3 requires `decision-makers`/`consulted`/`informed` to be editable on create as well as edit — the original design draft's AdrEditor Implementation Notes and Traceability row 1.3 only described `EditAdrForm`. Corrected in `design.md` to scope the same three inputs into `CreateAdrForm`.

## Research Log

### Current frontmatter/body shape and where `deciders`/`title` are touched
- **Context**: Requirement 1 renames `deciders`→`decision-makers` (+ adds `consulted`/`informed`); Requirement 4 relocates `title` to the body H1. Needed to find every touchpoint before deciding where translation logic lives.
- **Sources Consulted**: `packages/shared/src/types.ts`, `packages/core/src/adr/parse.ts`, `packages/core/src/adr/editingService.ts`, `apps/api/src/routes/adrs.ts`, `apps/web/src/api/client.ts`, `apps/web/src/features/adr-editor/AdrEditor.tsx`, `packages/core/src/compare/comparisonService.ts`, repo-wide grep for `deciders` (26 files) and `AdrStatus` (12 files).
- **Findings**:
  - `parseAdr` casts `matter(raw).data` directly to `AdrFrontmatter` with no validation or back-compat layer; `serializeAdr` destructures `body`/`path`/`blobSha` out of `Adr` and calls `matter.stringify(body, fm)` with everything else as frontmatter.
  - `deciders` is read/written in exactly three live application surfaces beyond types/serialization: `AdrEditor.tsx` (form state + `deciders-input` testid), `comparisonService.ts` (`FIELD_NAMES` array + `fieldValue()` comma-join switch), and the API DTOs (`CreateAdrRequest`/`UpdateAdrRequest`). Tests reference it in 26 files but those are mechanical renames, not design decisions.
  - `title` currently lives in `AdrFrontmatter` and is required by `editingService.save()`'s `missingFields` check (`!input.title`).
- **Implications**: A single translation point in `parse.ts` can absorb both the field rename and the title relocation. `AdrFrontmatter` (the literal YAML shape) and `Adr` (the domain shape consumed everywhere else) should diverge: `AdrFrontmatter` drops `title` and renames `deciders`→`decisionMakers`-mapped-to-`decision-makers`; `Adr` keeps `title: string` as a value derived by `parseAdr`, not a literal frontmatter passthrough.

### Internal field-naming convention: camelCase vs. literal kebab-case keys
- **Context**: MADR's on-disk key is `decision-makers` (kebab-case). The codebase has no existing example of a literal hyphenated TypeScript property key; needed to decide whether `Adr`/DTOs should use `"decision-makers"` as a quoted key (1:1 with YAML) or a camelCase identifier with translation at the YAML boundary.
- **Sources Consulted**: `packages/shared/src/types.ts` (existing camelCase multi-word fields: `baseBlobSha`, `blobSha`), `packages/core/src/adr/parse.ts`.
- **Findings**: Every other multi-word field in the codebase (including ones that map to frontmatter, like none currently hyphenated) follows camelCase. Hyphenated property keys would force bracket-notation access (`adr["decision-makers"]`) across forms, routes, and ~10+ test files, which is inconsistent with the rest of the codebase's style and adds friction with no behavioral benefit, since the actual on-disk key only needs to be literal at the gray-matter parse/stringify boundary.
- **Implications**: Use camelCase `decisionMakers` (plus `consulted`, `informed`) as the internal/DTO/API field name. `parse.ts` is the single explicit translation point to/from the literal `decision-makers` YAML key, and is also where legacy `deciders` is read as a fallback.

### `AdrSummary`/`FolderNode`/history/similarity consumers of `title`
- **Context**: Verify whether tree-building, history, and similarity surfaces construct summaries from frontmatter directly (which would need updating) or from already-parsed `Adr` objects (which would not).
- **Sources Consulted**: `packages/core/src/folders/folderService.ts`, `packages/core/src/history/historyService.ts`, `apps/api/src/routes/similarity.ts`, `apps/api/src/routes/history.ts`, `apps/api/src/container.ts`, `apps/web/src/App.tsx`.
- **Findings**: `folderService.buildTree()` calls `parseAdr(raw, file.path, file.blobSha)` and then builds `AdrSummary` as `{ id: adr.id, title: adr.title, status: adr.status, path: adr.path }` — purely derived from the already-parsed `Adr`. `historyService.ts`, `similarity.ts`, `history.ts`, and `container.ts` have zero references to `title`/`deciders`/`AdrFrontmatter`/`AdrSummary`. `App.tsx`'s `useAdrSummary` reads `result.adr.title` / `query.data.title` generically.
- **Implications**: None of these files require any change. This confirms the `parse.ts`-boundary design will propagate the H1-derived title and renamed fields everywhere automatically, with zero edits beyond the parse/serialize boundary and the few surfaces that explicitly model `deciders` (editor form, comparison field list, DTOs, status list/badge).

### MADR body section scaffold
- **Context**: Requirement 3 requires new ADRs to start with the 8 MADR section headings in order, with required (Context and Problem Statement, Decision Outcome) sections distinguishable from optional ones, all left empty.
- **Sources Consulted**: [`adr/madr` v4.0.0 `template/adr-template.md`](https://raw.githubusercontent.com/adr/madr/4.0.0/template/adr-template.md) (pinned tag, commit `2475fe1973f66a12aaf58a91d8fa7b42c0f5ea3d`, released 2024-09-17 — fetched and read verbatim rather than relied on from requirements.md's own wording), `packages/core/src/adr/editingService.ts` (`create()` currently sets `body: ""`).
- **Findings**: The official v4.0.0 template marks optional sections with an HTML comment (`<!-- This is an optional element... -->`) immediately under the heading. It also nests `### Consequences` and `### Confirmation` as subsections under `## Decision Outcome`, rather than placing all 8 sections at the same heading level — this nesting was missing from the original draft scaffold and has been corrected in `design.md`. This convention is already native to Markdown/MADR and requires no new parsing logic, since these scaffolded bodies are just initial content the author edits or replaces.
- **Implications**: Introduce one new constant module exporting the scaffold body text; `editingService.create()` substitutes it for the current `body: ""`. No parser changes needed — the scaffold is plain Markdown content within the existing `body` field. Requirement 3.1 only constrains heading presence and order, not heading depth, so matching upstream's `###` nesting for Consequences/Confirmation is a design-level refinement, not a requirements change.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Single translation boundary in `parse.ts` (selected) | `AdrFrontmatter` (literal YAML shape) diverges from `Adr` (domain shape); `parseAdr`/`serializeAdr` are the only code that know about legacy keys, H1 extraction, and the `decision-makers` YAML key | Minimal blast radius; every other consumer already treats `adr.title`/`adr.decisionMakers` as generic domain fields; isolates back-compat logic to one file | `parse.ts` becomes the single point of truth for the file format — must be tested thoroughly | Matches existing precedent: `parse.ts` already does the `matter()`/cast boundary work today |
| Frontmatter-literal hyphenated keys throughout | Use `"decision-makers"` as the literal TypeScript property name everywhere | Zero translation code | Forces bracket notation across forms/routes/tests; inconsistent with existing camelCase convention (`baseBlobSha`); larger diff for no behavioral gain | Rejected |
| Validation/migration layer (e.g. schema library, versioned migrations) | Introduce a formal schema-validation or migration-versioning mechanism for frontmatter | Would generalize to future field changes | No existing validation layer in `parse.ts` today (direct cast); over-engineered for a one-time rename + one new optional pair of fields; out of scope per Boundary Context (no validation library is requested) | Rejected — simplification lens: extend the existing direct-cast pattern, don't introduce new infrastructure |

## Design Decisions

### Decision: Separate `AdrFrontmatter` (YAML shape) from `Adr` (domain shape) for title
- **Context**: Requirement 4 moves `title` out of frontmatter into the body's H1, but `Adr.title` is consumed as a plain string by ~10 files across web/api/core.
- **Alternatives Considered**:
  1. Keep `title` only inside a body-parsing helper, with every consumer calling an `extractTitle(body)` function directly — rejected, duplicates extraction logic and loses the single-parse-point property.
  2. Drop `title` from `AdrFrontmatter`, keep it as a top-level field on `Adr`, computed once inside `parseAdr` — selected.
- **Selected Approach**: `AdrFrontmatter` no longer declares `title`. `Adr` (which already extends `AdrFrontmatter` plus `body`/`path`/`blobSha`) keeps its own `title: string` field, populated by `parseAdr` from the body's first H1 line, falling back to a legacy frontmatter `title` if no H1 is present (Req 5.3), or flagged as missing if neither exists (Req 4.6).
- **Rationale**: Preserves the existing `Adr extends AdrFrontmatter` shape conceptually (Adr is still "frontmatter plus body-derived extras") while changing only the one type's field list and one parse function's logic.
- **Trade-offs**: `Adr` and `AdrFrontmatter` are no longer structurally identical-plus-extras in the type system (a small departure from today's literal `extends`), but this is the minimal change that satisfies Req 4.1–4.6 without forcing every consumer to switch from `adr.title` to a function call.
- **Follow-up**: `serializeAdr` must prepend `# {title}\n\n` to `body` before frontmatter stringification, and must strip a duplicate leading H1 from `body` itself if the editor already wrote one (so editing the title via the dedicated title field doesn't produce two H1 lines) — verify this interaction is covered by `editingService.save()`'s flow when finalizing design.

### Decision: camelCase `decisionMakers`/`consulted`/`informed` as internal field names, mapped to kebab-case YAML keys at the `parse.ts` boundary
- **Context**: Requirement 1 requires the on-disk key to be exactly `decision-makers` for MADR-tooling portability, but the codebase's internal convention is camelCase.
- **Alternatives Considered**:
  1. Literal `"decision-makers"` TypeScript key — rejected (see Architecture Pattern Evaluation).
  2. camelCase `decisionMakers` with translation in `parse.ts` — selected.
- **Selected Approach**: `AdrFrontmatter`/`Adr`/`CreateAdrRequest`/`UpdateAdrRequest` use `decisionMakers: string[]`, `consulted?: string[]`, `informed?: string[]`. `parseAdr` reads `data["decision-makers"] ?? data.deciders ?? []` into `decisionMakers`. `serializeAdr` writes the frontmatter key as `"decision-makers"` (never `deciders`), satisfying Req 5.1/5.2 (legacy read, rewritten on next save).
- **Rationale**: Matches existing camelCase convention; keeps the back-compat/translation logic localized exactly where YAML is read and written today.
- **Trade-offs**: None significant — this is a pure renaming change with one extra `??` fallback.
- **Follow-up**: Apply the identical rename across `AdrEditor.tsx` (form field + testid, or keep testid stable if no test depends on renaming it — verify in design), `comparisonService.ts`'s `FIELD_NAMES`, and the ~26 grep-identified test files.

### Decision: New `MADR_BODY_SCAFFOLD` constant for `editingService.create()`
- **Context**: Requirement 3 requires new ADR bodies to start populated with the 8 MADR section headings instead of an empty string.
- **Alternatives Considered**:
  1. Inline the scaffold string literal directly inside `editingService.create()` — rejected, harder to test/review in isolation and mixes template content with orchestration logic.
  2. Separate constant module exporting the scaffold text — selected.
- **Selected Approach**: Add `packages/core/src/adr/madrTemplate.ts` exporting a single `MADR_BODY_SCAFFOLD: string` constant with the 8 headings in MADR order, optional sections marked with an HTML comment beneath the heading (mirroring MADR's own template convention), all section bodies empty. `editingService.create()` uses this constant as the initial `body` instead of `""`. The H1 title itself is not part of this constant — it is added by `serializeAdr` from `adr.title` at write time, keeping the scaffold orthogonal to the title-relocation logic.
- **Rationale**: Single-responsibility module, trivially unit-testable (assert heading order/presence), and keeps `editingService.create()`'s diff minimal.
- **Trade-offs**: None significant.
- **Follow-up**: Confirmed against MADR v4.0.0 (commit `2475fe1973f66a12aaf58a91d8fa7b42c0f5ea3d`): heading text and order match, and the scaffold's heading levels were corrected to nest Consequences/Confirmation as `###` under `## Decision Outcome`, mirroring the upstream template instead of flattening all 8 headings to one level.

### Decision: Add `rejected` to `AdrStatus` with no relation-linkage changes
- **Context**: Requirement 2 adds `rejected` as a status value, independent of relations (already decided with the user before design phase).
- **Alternatives Considered**: None — this is a straightforward literal-union extension; `relationGraphService.ts` was confirmed to already be fully status-independent, so there was no real alternative to evaluate.
- **Selected Approach**: Add `"rejected"` to the `AdrStatus` union in `packages/shared/src/types.ts`; add it to `ADR_STATUSES` in `AdrEditor.tsx` and `STATUS_LABELS` in `StatusBadge.tsx`. No changes to `relationGraphService.ts`, `editingService.save()`'s relation validation, or any "is relation required" logic, since none of that logic is keyed on status today.
- **Rationale**: Confirmed via code inspection (Req 2.3/2.4 are already satisfied by the existing architecture).
- **Trade-offs**: None.
- **Follow-up**: None.

## Risks & Mitigations
- Risk: A scaffolded new ADR's body already contains H1-like text if an author manually types `# Something` inside a section before saving, potentially producing two H1 headings after `serializeAdr` prepends the title H1 — Mitigation: `serializeAdr`/`parseAdr` define H1 extraction as "the first H1 line in the body," and the scaffold itself contains no H1, so this only arises from unusual manual authoring; document the single-H1 assumption in `design.md`'s parse/serialize contract and add a test for a body containing an incidental `#`-prefixed line that is not the true title (should not be misparsed as the title if it isn't the first line, and if it is the first line, last-write-wins is acceptable since MADR documents are expected to have exactly one H1).
- Risk: Renaming `deciders-input` testid (if changed) could break existing component/E2E tests that target it — Mitigation: decide in `design.md` whether to rename the testid to `decision-makers-input` (cleaner, matches Req 1.3 intent) or keep it stable; since Req 12-style "preserve existing testid" constraints don't apply to this spec (that's the frontend-redesign spec's rule), renaming is acceptable here but must be applied consistently to both the component and its tests in the same change.
- Risk: Legacy fixture migration (Req 5.4) must not break `examples/0001-uzycie-gita-jako-zrodla-prawdy.md`'s existing non-MADR section headings (`## Kontekst`/`## Decyzja`/`## Konsekwencje`, Polish) — Mitigation: migration only needs to relocate the title to H1 and rename `deciders`→`decision-makers` in this fixture; the spec's Boundary Context does not require translating or restructuring the body's existing section headings, only adding the H1 title above them.

## References
- [MADR template, v4.0.0](https://github.com/adr/madr/blob/4.0.0/template/adr-template.md) (released 2024-09-17, commit `2475fe1973f66a12aaf58a91d8fa7b42c0f5ea3d`) — canonical section structure, frontmatter field names, and optional-section comment convention this spec aligns with. Pinned to this tag rather than the `develop` branch for stable traceability.
