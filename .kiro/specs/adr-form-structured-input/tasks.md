# Implementation Plan

- [ ] 1. People row editor
- [x] 1.1 (P) Implement stakeholder row mapping logic
  - Define the person-row shape and the fixed Decision Maker / Consulted / Informed role set
  - Implement the bidirectional mapping between rows and the existing decisionMakers/consulted/informed lists, including dropping rows with a blank name when converting back
  - Unit tests cover: a full round trip for populated lists, blank-name rows excluded on save, and empty lists producing zero rows
  - Observable: running the new unit test file shows all round-trip and blank-filtering cases passing
  - _Requirements: 2.5, 2.6, 2.7_
  - _Boundary: people.ts_

- [x] 1.2 (P) Implement the People row editor component
  - Render one row per person with a name field and a role field restricted to the fixed role set
  - Support adding a new row and removing any existing row by its own identity (not position)
  - Assign stable, distinct identifiers to every row's fields and buttons for automated interaction
  - Component tests cover: add appends a row, remove removes only the targeted row, and field edits invoke the correct callback for the correct row
  - Observable: a rendered instance with two rows lets a test add a third row, remove the first, and see exactly the expected two remaining rows
  - _Requirements: 2.2, 2.3, 2.4, 5.2_
  - _Boundary: PeopleEditor_
  - _Depends: 1.1_

- [ ] 2. Structured options editor
- [x] 2.1 (P) Implement the option row markdown mapping
  - Define the option-row shape (description, pros, cons) and the bullet/heading markdown grammar for the two existing content fields
  - Implement parsing existing content into rows and serializing rows back into that markdown grammar, excluding rows that are entirely blank
  - Ensure parsing never throws on content that doesn't match the grammar, degrading to a best-effort row set instead
  - Unit tests cover: a full round trip for rows produced by the serializer, mismatched bullet/heading counts producing a best-effort result without throwing, and a fully blank row excluded on save
  - Observable: running the new unit test file shows the round-trip, malformed-input, and blank-row cases all passing
  - _Requirements: 3.4, 3.5, 3.6, 3.7_
  - _Boundary: options.ts_

- [ ] 2.2 (P) Implement the structured options editor component
  - Render one row per option with description, pros, and cons fields
  - Support adding a new row and removing any existing row by its own identity
  - Render the description field so it cannot hold multi-line text, preserving the one-row-per-line markdown grammar
  - Assign stable, distinct identifiers to every row's fields and buttons for automated interaction
  - Component tests cover: add appends a row, remove removes only the targeted row, and field edits invoke the correct callback for the correct row
  - Observable: a rendered instance with two rows lets a test add a third row, remove the first, and see exactly the expected two remaining rows
  - _Requirements: 3.1, 3.2, 3.3, 5.2_
  - _Boundary: OptionsEditor_
  - _Depends: 2.1_

- [ ] 3. Row layout styling for People and Options editors
  - Add row layout rules for both editors reusing existing field/button styling tokens, covering the name/role row and the description/pros/cons row
  - Observable: both editors render their rows in a legible, aligned layout matching the rest of the form's visual style, verified visually or via a snapshot/class-presence check
  - _Boundary: soft-ui.css (People/Options row styles)_
  - _Depends: 1.2, 2.2_

- [ ] 4. Edit form restructuring
- [ ] 4.1 Wire the People editor into the edit form
  - Replace the three Decision Makers/Consulted/Informed text inputs and their string state with the row-based People editor and its row state
  - Position the People editor as an always-visible block next to Title/Status/Date/Tags, with no collapse/expand control
  - Load existing decision makers, consulted parties, and informed parties into rows when an ADR is opened, and save rows back into those three categories on save, excluding blank-name rows
  - Update the existing edit-form test suite: remove assertions on the three old inputs and add row-based equivalents
  - Observable: opening an ADR with existing stakeholders shows one row per person with the correct role, and editing then saving persists the updated set through a reload
  - _Requirements: 2.1, 2.5, 2.6, 2.7, 2.8_
  - _Boundary: EditAdrForm_
  - _Depends: 1.1, 1.2_

- [ ] 4.2 Wire the structured options editor into the edit form
  - Replace the separate Considered Options and Pros and Cons of the Options textareas with the structured options editor and its row state, removing those two fields from the form's other section-content state entirely so the row state is the only place that content lives client-side
  - Load existing considered-options/pros-and-cons content into rows when an ADR is opened, and serialize rows back into that content on save
  - Update the existing edit-form test suite: remove assertions on the two old textareas and add row-based equivalents
  - Observable: opening an ADR with existing considered options shows one row per option with its pros/cons, and editing then saving persists the updated set through a reload
  - _Requirements: 3.4, 3.5_
  - _Boundary: EditAdrForm_
  - _Depends: 2.1, 2.2_

- [ ] 4.3 Nest Consequences and Confirmation inside Decision Outcome
  - Render the Consequences and Confirmation fields inside the Decision Outcome section's body instead of as their own top-level sections, each with its own visible label
  - Remove Consequences and Confirmation as independent collapsible sections
  - Update the existing edit-form test suite: assert both fields are hidden/shown together with Decision Outcome and keep their existing testids
  - Observable: collapsing Decision Outcome hides the Decision Outcome, Consequences, and Confirmation fields together, and expanding it shows all three with their existing field identifiers unchanged
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1_
  - _Boundary: EditAdrForm_

- [ ] 4.4 Reorder the remaining sections into narrative groups
  - Position Decision Drivers immediately adjacent to Context and Problem Statement, the structured Options group as its own cluster, the Decision Outcome group (with its nested content) as one uninterrupted cluster, and More Information/Additional Content/Relations last
  - Confirm the saved content's section order is unaffected by this on-screen reordering
  - Update the existing edit-form test suite for the new visual ordering where any layout-order assertions exist
  - Observable: the form displays sections in the new visual grouping while a save-then-reload round trip still produces the unchanged canonical section order in the saved content
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1_
  - _Boundary: EditAdrForm_

- [ ] 5. End-to-end journey validation
  - Update the create -> edit -> save lifecycle test to fill and assert the People rows and at least one structured option row instead of the old inputs/textareas
  - Update the Decision Outcome assertions to cover the nested Consequences/Confirmation fields inside it
  - Verify the existing save-conflict and reload-latest journey still passes with the updated form interactions
  - Observable: the full lifecycle test suite passes end-to-end against the restructured form, including the conflict/recover path
  - _Requirements: 1.1, 1.3, 1.4, 2.1, 2.5, 2.6, 2.7, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5_
  - _Boundary: apps/e2e/tests/adr-lifecycle.spec.ts_
