# Implementation Plan

- [ ] 1. Foundation: shared ADR type contract

- [x] 1.1 Rename the decision-participant field and add the consulted/informed fields
  - Replace the single decision-makers list field (currently named `deciders`) with the MADR-aligned name across the frontmatter shape and both the create and update request contracts
  - Add two new optional list fields, consulted and informed, alongside it in the same three shapes
  - Observable: the shared ADR type contract no longer declares the old field name anywhere, and declares the two new optional fields
  - _Requirements: 1.1, 1.2, 1.4_
  - _Boundary: AdrFrontmatter / Adr / CreateAdrRequest / UpdateAdrRequest_

- [ ] 1.2 Add the rejected status value and relocate the title field onto the domain type
  - Add a fifth status value, rejected, to the existing status vocabulary
  - Stop declaring title as a frontmatter field; declare it directly on the domain ADR type instead, since it will now be derived from the document body rather than stored as metadata
  - Observable: the status vocabulary accepts the new value, and the frontmatter shape no longer declares a title field while the domain ADR type still exposes one
  - _Requirements: 2.1, 4.1_
  - _Boundary: AdrStatus / AdrFrontmatter / Adr_

- [ ] 2. Foundation: parse/serialize translation boundary

- [ ] 2.1 Resolve the decision-participant field with backward-compatible reads
  - When reading an ADR, populate the renamed field from the new frontmatter key, falling back to the old key when the new one is absent
  - When writing an ADR, always write the new key and never the old one
  - Observable: reading a file that still uses the old key produces the same in-memory value as reading one that uses the new key, and saving either one afterward writes only the new key
  - _Requirements: 5.1, 5.2_
  - _Boundary: parseAdr / serializeAdr_

- [ ] 2.2 Derive the ADR title from the document body instead of frontmatter
  - When reading an ADR, take the title from the body's first top-level heading; if none exists, fall back to a legacy title stored in frontmatter; if neither exists, treat the title as missing
  - Strip the heading line used as the title out of the body content returned to callers, so it isn't shown twice
  - When writing an ADR, place the title back as the body's first top-level heading and never write a frontmatter title
  - Observable: round-tripping an ADR through read-then-write preserves its title and produces no frontmatter title key; a body with no heading and no legacy frontmatter title reads back with an empty title
  - _Requirements: 4.1, 4.2, 4.3, 4.6, 5.3_
  - _Boundary: parseAdr / serializeAdr_

- [ ] 3. Foundation: MADR body scaffold

- [ ] 3.1 (P) Create the MADR-aligned body scaffold for new ADRs
  - Define the initial body content new ADRs start with: the eight MADR section headings in order, at the same heading levels as the official template (with the two outcome-related sections nested under the decision-outcome section rather than flattened)
  - Mark the optional sections distinguishably from the two required sections, leaving every section's content empty
  - Observable: the scaffold contains exactly the eight headings in order at the correct levels, and the optional sections are visibly marked while the two required ones are not
  - _Requirements: 3.1, 3.2, 3.3_
  - _Boundary: MADR_BODY_SCAFFOLD_

- [ ] 4. Core: ADR creation and save orchestration

- [ ] 4.1 (P) Use the new scaffold and renamed fields when creating an ADR
  - When a new ADR is created, start its body from the MADR scaffold instead of leaving it empty, and record the renamed decision-participant field plus the new consulted/informed fields instead of the old field name
  - Observable: creating a new ADR produces a committed file whose body contains the MADR section headings and whose frontmatter uses the new field names
  - _Requirements: 1.1, 1.2, 3.3, 4.1, 6.1_
  - _Boundary: AdrEditingService_

- [ ] 4.2 Use the renamed fields when saving an ADR and confirm relation-independence
  - When an existing ADR is saved, persist the renamed decision-participant field and the consulted/informed fields instead of the old field name
  - Confirm that saving with a status of rejected or superseded succeeds without requiring any relation to exist, and that the relations-based supersession mechanism is untouched by the status value
  - Observable: saving an ADR with status rejected or superseded and no relations succeeds, and the saved file uses the new field names
  - _Requirements: 2.3, 2.4, 4.3, 6.2_
  - _Boundary: AdrEditingService_

- [ ] 5. Core: comparison field coverage

- [ ] 5.1 (P) Extend ADR comparison to cover the renamed/new fields and the body-derived title
  - Add the consulted and informed fields to the set of fields compared between two ADRs or two versions of an ADR, and replace the old decision-participant field with its new name in that same comparison
  - Confirm the title comparison reflects each ADR's body-derived title with no special-casing needed beyond what already exists
  - Observable: comparing two ADRs that differ only in consulted, informed, or the renamed field reports those differences
  - _Requirements: 1.5, 4.5_
  - _Boundary: ComparisonService_

- [ ] 6. Core: editor UI fields

- [ ] 6.1 (P) Rename the edit form's decision-participant field and add consulted/informed inputs
  - In the existing ADR edit form, rename the decision-makers input to match the new field name and add two new optional inputs for consulted and informed, using the same comma-separated-list editing convention already used for tags
  - Observable: editing an ADR lets the user view and change decision-makers, consulted, and informed, and saving persists all three
  - _Requirements: 1.3_
  - _Boundary: AdrEditor (EditAdrForm)_

- [ ] 6.2 Add decision-participant inputs to the create form
  - In the ADR creation form, which today only collects a title, add the same three inputs (decision-makers, consulted, informed) used in the edit form, and pass their values through when creating the ADR
  - Observable: creating a new ADR lets the user enter decision-makers, consulted, and informed, and the created ADR reflects whatever values were entered
  - _Requirements: 1.3_
  - _Boundary: AdrEditor (CreateAdrForm)_

- [ ] 6.3 Make rejected selectable as an ADR status
  - Add the rejected value to the set of statuses a user can choose from when setting an ADR's status
  - Observable: the status selector offers rejected as a choice and selecting it is saveable
  - _Requirements: 2.2_
  - _Boundary: AdrEditor_

- [ ] 7. Core: status badge label

- [ ] 7.1 (P) Add a display label for the rejected status
  - Add a human-readable label for the rejected status alongside the existing status labels, so it renders the same way the other known statuses do rather than falling back to the neutral/unknown treatment
  - Observable: an ADR with status rejected renders with its own label, not the unknown-status fallback
  - _Requirements: 2.2_
  - _Boundary: StatusBadge_

- [ ] 8. Core: example fixture migration

- [ ] 8.1 (P) Migrate this repository's example ADR fixture to the realigned format
  - Update the example fixture's frontmatter to use the renamed decision-participant field, remove its frontmatter title, and add that title as the body's first heading above its existing content
  - Leave the fixture's existing section headings and written content otherwise unchanged
  - Observable: the example fixture file uses the new field name and has no frontmatter title, with the title now appearing as the body's first heading
  - _Requirements: 5.4_
  - _Boundary: Example fixture_

- [ ] 9. Integration: API and reindex verification

- [ ] 9.1 (P) Verify the ADR API carries the renamed/new fields and the body-derived title end to end
  - Confirm that creating and updating an ADR through the API accepts and returns decision-makers, consulted, and informed, and that reading an ADR with no frontmatter title returns the body-derived title
  - Confirm the existing concurrency-conflict and git-commit behavior is unaffected by these field changes
  - Observable: an API round trip through create, read, and update preserves the renamed/new fields and the derived title
  - _Requirements: 1.4, 6.1, 6.2_
  - _Boundary: API routes_

- [ ] 9.2 (P) Verify the search index rebuild reflects the realigned fields
  - Confirm rebuilding the index against the migrated example fixture, and against a fixture still using the legacy field name and frontmatter title, produces the correct title and tags in the index for both
  - Observable: reindexing both fixture styles produces equivalent, correct index entries
  - _Requirements: 5.5, 6.3_
  - _Boundary: reindex script_

- [ ] 10. Validation: end-to-end regression

- [ ] 10.1 Extend the ADR lifecycle end-to-end test for the realigned model
  - Cover creating an ADR and confirming its body contains the MADR section headings, entering decision-makers/consulted/informed on create and on edit and confirming both round-trip through save and reload, and selecting and saving status rejected without adding a relation
  - Observable: the end-to-end test passes covering all of the above in one ADR lifecycle
  - _Requirements: 1.3, 2.2, 2.4, 3.1, 3.3_

- [ ] 10.2 Verify the migrated example fixture's title displays consistently across the app
  - Load the migrated example fixture and confirm its body-derived title displays correctly in the folder tree, the ADR card, and the editor
  - Observable: all three surfaces show the same, correct title for the migrated fixture
  - _Requirements: 4.4, 5.5_
