# Implementation Plan

- [ ] 1. Foundation: shared ADR type contract

- [x] 1.1 Rename the decision-participant field and add the consulted/informed fields
  - Replace the single decision-makers list field (currently named `deciders`) with the MADR-aligned name across the frontmatter shape and both the create and update request contracts
  - Add two new optional list fields, consulted and informed, alongside it in the same three shapes
  - Observable: the shared ADR type contract no longer declares the old field name anywhere, and declares the two new optional fields
  - _Requirements: 1.1, 1.2, 1.4_
  - _Boundary: AdrFrontmatter / Adr / CreateAdrRequest / UpdateAdrRequest_

- [x] 1.2 Add the rejected status value and relocate the title field onto the domain type
  - Add a fifth status value, rejected, to the existing status vocabulary
  - Stop declaring title as a frontmatter field; declare it directly on the domain ADR type instead, since it will now be derived from the document body rather than stored as metadata
  - Observable: the status vocabulary accepts the new value, and the frontmatter shape no longer declares a title field while the domain ADR type still exposes one
  - _Requirements: 2.1, 4.1_
  - _Boundary: AdrStatus / AdrFrontmatter / Adr_

- [ ] 2. Foundation: parse/serialize translation boundary

- [x] 2.1 Resolve the decision-participant field with backward-compatible reads
  - When reading an ADR, populate the renamed field from the new frontmatter key, falling back to the old key when the new one is absent
  - When writing an ADR, always write the new key and never the old one
  - Observable: reading a file that still uses the old key produces the same in-memory value as reading one that uses the new key, and saving either one afterward writes only the new key
  - _Requirements: 5.1, 5.2_
  - _Boundary: parseAdr / serializeAdr_

- [x] 2.2 Derive the ADR title from the document body instead of frontmatter
  - When reading an ADR, take the title from the body's first top-level heading; if none exists, fall back to a legacy title stored in frontmatter; if neither exists, treat the title as missing
  - Strip the heading line used as the title out of the body content returned to callers, so it isn't shown twice
  - When writing an ADR, place the title back as the body's first top-level heading and never write a frontmatter title
  - Observable: round-tripping an ADR through read-then-write preserves its title and produces no frontmatter title key; a body with no heading and no legacy frontmatter title reads back with an empty title
  - _Requirements: 4.1, 4.2, 4.3, 4.6, 5.3_
  - _Boundary: parseAdr / serializeAdr_

- [ ] 3. Foundation: MADR body scaffold

- [x] 3.1 (P) Create the MADR-aligned body scaffold for new ADRs (superseded by tasks 11-12)
  - Define the initial body content new ADRs start with: the eight MADR section headings in order, at the same heading levels as the official template (with the two outcome-related sections nested under the decision-outcome section rather than flattened)
  - Mark the optional sections distinguishably from the two required sections, leaving every section's content empty
  - Observable: the scaffold contains exactly the eight headings in order at the correct levels, and the optional sections are visibly marked while the two required ones are not
  - _Requirements: 3.1_
  - _Boundary: MADR_BODY_SCAFFOLD (removed in task 12.2)_

- [ ] 4. Core: ADR creation and save orchestration

- [x] 4.1 (P) Use the new scaffold and renamed fields when creating an ADR
  - When a new ADR is created, start its body from the MADR scaffold instead of leaving it empty, and record the renamed decision-participant field plus the new consulted/informed fields instead of the old field name
  - Observable: creating a new ADR produces a committed file whose body contains the MADR section headings and whose frontmatter uses the new field names
  - _Requirements: 1.1, 1.2, 4.1, 6.1_
  - _Boundary: AdrEditingService_

- [x] 4.2 Use the renamed fields when saving an ADR and confirm relation-independence
  - When an existing ADR is saved, persist the renamed decision-participant field and the consulted/informed fields instead of the old field name
  - Confirm that saving with a status of rejected or superseded succeeds without requiring any relation to exist, and that the relations-based supersession mechanism is untouched by the status value
  - Observable: saving an ADR with status rejected or superseded and no relations succeeds, and the saved file uses the new field names
  - _Requirements: 2.3, 2.4, 4.3, 6.2_
  - _Boundary: AdrEditingService_

- [ ] 5. Core: comparison field coverage

- [x] 5.1 (P) Extend ADR comparison to cover the renamed/new fields and the body-derived title
  - Add the consulted and informed fields to the set of fields compared between two ADRs or two versions of an ADR, and replace the old decision-participant field with its new name in that same comparison
  - Confirm the title comparison reflects each ADR's body-derived title with no special-casing needed beyond what already exists
  - Observable: comparing two ADRs that differ only in consulted, informed, or the renamed field reports those differences
  - _Requirements: 1.5, 4.5_
  - _Boundary: ComparisonService_

- [ ] 6. Core: editor UI fields

- [x] 6.1 (P) Rename the edit form's decision-participant field and add consulted/informed inputs
  - In the existing ADR edit form, rename the decision-makers input to match the new field name and add two new optional inputs for consulted and informed, using the same comma-separated-list editing convention already used for tags
  - Observable: editing an ADR lets the user view and change decision-makers, consulted, and informed, and saving persists all three
  - _Requirements: 1.3_
  - _Boundary: AdrEditor (EditAdrForm)_

- [x] 6.2 Add decision-participant inputs to the create form
  - In the ADR creation form, which today only collects a title, add the same three inputs (decision-makers, consulted, informed) used in the edit form, and pass their values through when creating the ADR
  - Observable: creating a new ADR lets the user enter decision-makers, consulted, and informed, and the created ADR reflects whatever values were entered
  - _Requirements: 1.3_
  - _Boundary: AdrEditor (CreateAdrForm)_

- [x] 6.3 Make rejected selectable as an ADR status
  - Add the rejected value to the set of statuses a user can choose from when setting an ADR's status
  - Observable: the status selector offers rejected as a choice and selecting it is saveable
  - _Requirements: 2.2_
  - _Boundary: AdrEditor_

- [ ] 7. Core: status badge label

- [x] 7.1 (P) Add a display label for the rejected status
  - Add a human-readable label for the rejected status alongside the existing status labels, so it renders the same way the other known statuses do rather than falling back to the neutral/unknown treatment
  - Observable: an ADR with status rejected renders with its own label, not the unknown-status fallback
  - _Requirements: 2.2_
  - _Boundary: StatusBadge_

- [ ] 8. Core: example fixture migration

- [x] 8.1 (P) Migrate this repository's example ADR fixture to the realigned format
  - Update the example fixture's frontmatter to use the renamed decision-participant field, remove its frontmatter title, and add that title as the body's first heading above its existing content
  - Leave the fixture's existing section headings and written content otherwise unchanged
  - Observable: the example fixture file uses the new field name and has no frontmatter title, with the title now appearing as the body's first heading
  - _Requirements: 5.4_
  - _Boundary: Example fixture_

- [ ] 9. Integration: API and reindex verification

- [x] 9.1 (P) Verify the ADR API carries the renamed/new fields and the body-derived title end to end
  - Confirm that creating and updating an ADR through the API accepts and returns decision-makers, consulted, and informed, and that reading an ADR with no frontmatter title returns the body-derived title
  - Confirm the existing concurrency-conflict and git-commit behavior is unaffected by these field changes
  - Observable: an API round trip through create, read, and update preserves the renamed/new fields and the derived title
  - _Requirements: 1.4, 6.1, 6.2_
  - _Boundary: API routes_

- [x] 9.2 (P) Verify the search index rebuild reflects the realigned fields
  - Confirm rebuilding the index against the migrated example fixture, and against a fixture still using the legacy field name and frontmatter title, produces the correct title and tags in the index for both
  - Observable: reindexing both fixture styles produces equivalent, correct index entries
  - _Requirements: 5.5, 6.3_
  - _Boundary: reindex script_

- [ ] 10. Validation: end-to-end regression

- [x] 10.1 Extend the ADR lifecycle end-to-end test for the realigned model
  - Cover creating an ADR and confirming its body contains the MADR section headings, entering decision-makers/consulted/informed on create and on edit and confirming both round-trip through save and reload, and selecting and saving status rejected without adding a relation
  - Observable: the end-to-end test passes covering all of the above in one ADR lifecycle
  - _Requirements: 1.3, 2.2, 2.4_

- [x] 10.2 Verify the migrated example fixture's title displays consistently across the app
  - Load the migrated example fixture and confirm its body-derived title displays correctly in the folder tree, the ADR card, and the editor
  - Observable: all three surfaces show the same, correct title for the migrated fixture
  - _Requirements: 4.4, 5.5_

- [ ] 11. Foundation: shared section metadata and type contract

- [x] 11.1 (P) Define the canonical MADR section metadata and discrete-fields shape
  - Declare eight section fields, one per MADR section, and an ordered metadata array describing each section's heading text, heading level, required flag, and key, as the single source every other component reads from instead of hardcoding heading text or order independently
  - Mark exactly the two MADR-required sections (Context and Problem Statement, Decision Outcome) as required in that metadata, and the remaining six as optional
  - Observable: a new shared module exports the eight-field shape and the ordered metadata array, importable by both the core/API layer and the web UI
  - _Requirements: 3.1, 3.3_
  - _Boundary: AdrSections / MADR_SECTIONS_

- [x] 11.2 Replace the single body field with the eight section fields and a catch-all field on the domain and update-request types
  - Remove the single free-text body field from the domain ADR type and the update-request contract; compose both with the eight section fields from 11.1 and add one additional field to hold content that doesn't map to any of the eight sections
  - Leave the frontmatter shape, the create-request contract, and every other existing field on these types untouched
  - Observable: the domain ADR type and the update-request contract expose all eight section fields plus the catch-all field, and no longer declare a single body field anywhere
  - _Requirements: 3.1, 3.6, 3.9_
  - _Boundary: Adr / UpdateAdrRequest_
  - _Depends: 11.1_

- [ ] 12. Foundation: body-to-fields translation boundary

- [x] 12.1 (P) Implement the lossless split/join boundary between body text and the nine discrete fields
  - Build a function that scans body content for the eight canonical section headings (matching exact heading text and level) and assigns each recognized section's content to its field, routing everything else — unmatched headings, duplicate headings, and content before the first heading — into the catch-all field, in original document order, without losing any of it; one additional reserved heading (`## Additional Content`) is recognized the same way and marks the start of catch-all content, with the heading line itself stripped from it
  - Build the inverse function that always emits all eight canonical headings in canonical order and level, each followed by its field's content, then — only if the catch-all field's content is non-empty — emits the reserved `## Additional Content` heading followed by the catch-all field's content verbatim, so the boundary between the last canonical section and the catch-all is always unambiguous on re-read
  - Add a function that produces the combined plain-text content of all nine fields together, for use by search indexing and embedding-text construction
  - Observable: splitting a body containing all eight recognized headings reproduces each section's content correctly; splitting a body with no recognized headings places its entire content in the catch-all field with every section empty; joining a set of fields and then splitting the result reproduces the original fields exactly
  - _Requirements: 3.5, 3.6, 3.7, 3.8_
  - _Boundary: sections.ts (splitSections / joinSections / combined-text helper)_
  - _Depends: 11.1_

- [ ] 12.2 Wire the new split/join boundary into the parse/serialize translation boundary and remove the superseded scaffold module
  - When reading an ADR, split the body content remaining after title extraction into the nine fields using the new boundary, instead of returning it as a single body value
  - When writing an ADR, join the nine fields back into body text using the new boundary before prepending the title heading, instead of writing a single body value
  - Remove the now-unused body-scaffold module and its tests, since static scaffold text no longer applies once content is nine discrete fields
  - Observable: reading any existing ADR file produces an object with all nine fields populated (or empty) instead of a single body value, and round-tripping it through read-then-write reproduces the same nine field values
  - _Requirements: 3.5, 3.7, 3.8_
  - _Boundary: parseAdr / serializeAdr_
  - _Depends: 11.2, 12.1_

- [ ] 13. Core: ADR creation and save orchestration retrofit

- [ ] 13.1 (P) Use the nine discrete fields instead of the single body field when creating, saving, and indexing an ADR
  - When a new ADR is created, set all eight section fields and the catch-all field to empty instead of starting from scaffold text
  - When an ADR is saved, replace the single missing-body check with a check against the two MADR-required sections specifically, reporting each by its own field name when empty
  - When an ADR is saved, build the text passed to the search index from the combined content of all nine fields instead of the single body value
  - Observable: creating a new ADR produces a committed file with all eight section headings present and empty content; saving an ADR with either required section empty is rejected and reports that section's own field name; saving an ADR with content spread across multiple sections produces a search-index entry containing all of that content
  - _Requirements: 3.4, 3.11_
  - _Boundary: AdrEditingService_
  - _Depends: 12.2_

- [ ] 14. Core: comparison field coverage retrofit

- [ ] 14.1 (P) Extend ADR comparison to cover the nine discrete content fields individually
  - Replace the single body entry in the set of fields compared between two ADRs or two versions of an ADR with the eight section fields and the catch-all field, so a change to any one of them is detected individually instead of as one combined difference
  - Observable: comparing two ADRs that differ only in one section reports only that field as different, not a combined body difference
  - _Requirements: 3.10_
  - _Boundary: ComparisonService_
  - _Depends: 11.2_

- [ ] 15. Integration: embedding and reindex text construction

- [ ] 15.1 (P) Build reindex embedding/index text from the combined section content instead of the single body field
  - When the standalone reindex script builds the text it embeds and indexes for an ADR, use the combined content of all nine fields instead of the single body value
  - Observable: rebuilding the index from a fixture with content spread across multiple sections produces index/embedding text containing all of that content
  - _Requirements: 3.11, 6.3_
  - _Boundary: reindex script_
  - _Depends: 12.1_

- [ ] 15.2 (P) Build similarity embedding text from the combined section content instead of the single body field
  - When computing an ADR's embedding vector for similarity search, use the combined content of all nine fields instead of the single body value, through the same combined-text helper the reindex script uses, so the two call sites cannot drift apart
  - Observable: computing a similarity vector for a fixture with content spread across multiple sections reflects all of that content, matching what the reindex script produces for the same fixture
  - _Requirements: 6.3_
  - _Boundary: similarityService_
  - _Depends: 12.1_

- [ ] 16. Core: editor UI fields retrofit

- [ ] 16.1 (P) Replace the single body textarea with one field per MADR section plus one for unmapped content in the edit form
  - In the existing ADR edit form, replace the single body field with one labeled textarea per MADR section, rendered from the shared section metadata in canonical order, plus one additional textarea for content that doesn't belong to any of the eight sections
  - Render the two MADR-required sections' labels distinguishably from the six optional ones, driven by the same shared metadata rather than hardcoded per field
  - Observable: editing an existing ADR shows eight separate section textareas in canonical order plus one additional-content textarea, with the two required ones visibly marked, and saving a change to any one of them persists independently of the others
  - _Requirements: 3.2, 3.3_
  - _Boundary: AdrEditor (EditAdrForm)_
  - _Depends: 11.1, 11.2_

- [ ] 17. Core: read-only history viewer fields retrofit

- [ ] 17.1 (P) Replace the single body paragraph with one read-only block per MADR section plus one for unmapped content in the history viewer
  - In the read-only historical-version viewer, replace the single body paragraph with one labeled, read-only block per MADR section, rendered from the same shared section metadata in canonical order, plus one additional block for unmapped content, shown only when non-empty
  - Observable: viewing a historical ADR version shows its eight section contents and any unmapped content in separate labeled blocks instead of one paragraph
  - _Requirements: 3.2_
  - _Boundary: HistoryTimeline_
  - _Depends: 11.1, 11.2_

- [ ] 18. Validation: end-to-end regression for structured sections

- [ ] 18.1 Add end-to-end coverage for creating and editing an ADR through its nine discrete fields
  - Cover creating an ADR and confirming all eight section fields render empty with the two required ones visibly distinguished from the six optional ones; filling in and saving multiple sections independently and confirming each round-trips through reload; confirming the additional-content field round-trips for content that doesn't map to any section
  - Observable: the end-to-end test passes covering ADR creation, independent per-section editing and reload, and additional-content round-tripping in one scenario
  - _Requirements: 3.2, 3.3, 3.4, 3.7_
  - _Depends: 13.1, 16.1_

- [ ] 18.2 Verify the migrated example fixture's content displays consistently as catch-all content across the app
  - Load the existing example fixture and confirm its non-MADR section headings and content appear in the additional-content field in both the editor and the history viewer, with all eight section fields empty
  - Observable: both the editor and the history viewer show the fixture's full original content in the additional-content field, with no content lost or duplicated
  - _Requirements: 5.5, 3.7_
  - _Depends: 12.2, 16.1, 17.1_

## Implementation Notes

- Task 9.1 found two pre-existing regressions from earlier tasks, fixed in the same commit: (1) `MADR_BODY_SCAFFOLD` (task 3.1) ended with a trailing newline, which `parseAdr`'s title-extraction `.trim()` (task 2.2) silently stripped on every read-back — so a freshly created ADR's in-memory body never matched a subsequent GET; fixed by removing the scaffold's trailing newline. (2) `apps/api/src/routes/compare.test.ts` still asserted 6 comparison fields after task 5.1 raised the count to 8 (added consulted/informed); updated the assertion to 8.
- Cross-task validation after all 17 sub-tasks reached `[x]` found 7 pre-existing `apps/web` test files (outside any task's boundary — leftovers from earlier specs) still referencing the `deciders` field removed by task 1.1: `App.test.tsx`, `SimilarityPanel.test.tsx`, `SearchPanel.test.tsx`, `RelationsPanel.test.tsx`, `HistoryTimeline.test.tsx`, `CompareLauncher.test.tsx`, `VersionDiffView.test.tsx`. This produced 38 real `tsc --noEmit` errors (TS2353/TS2339) invisible to `pnpm -r test` because vitest's esbuild transform doesn't type-check and neither canonical command (`pnpm -r test`, `pnpm -r build`) runs `tsc --noEmit` against `apps/web` (its `build` script is `vite build` only). Fixed by renaming `deciders` → `decisionMakers` in those 7 files; verified clean via a fresh `tsc --noEmit` run plus unchanged 231/231 vitest pass.
- Requirement 3 was rewritten during this spec's reopening (single scaffolded `body` field → eight discrete MADR section fields plus a catch-all). Tasks 3.1, 4.1, and 10.1 were completed under the old text and only ever built/tested the now-superseded `MADR_BODY_SCAFFOLD` approach (removed by task 12.2); their `_Requirements:_` citations to `3.1`/`3.2`/`3.3` have been corrected to stop claiming coverage of the rewritten acceptance criteria. Tasks 11-18 are the sole source of Requirement 3 coverage going forward.
