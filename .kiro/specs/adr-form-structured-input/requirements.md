# Requirements Document

## Project Description (Input)
Restructure the ADR edit form information architecture and add structured input, building on the shipped adr-form-collapsible-sections feature. All changes are UI-only in EditAdrForm (AdrEditor.tsx) with no API, data-model, storage, or markdown file-format changes — structured data is owned by the editor and serialized to/from the existing AdrSections string fields and the existing decisionMakers/consulted/informed arrays.

Four changes:
1. Nesting: Render the MADR level-3 sub-sections Consequences and Confirmation inside the Decision Outcome collapsible body (they are ### children of ## Decision Outcome per MADR_SECTIONS level metadata and joinSections serialization), instead of as flat top-level collapsibles.
2. People with roles: Replace the three fixed inputs (Decision Makers, Consulted, Informed) with a dynamic list where each row is a person name plus a role chosen from the fixed set {Decision Maker, Consulted, Informed}. On save, group rows by role back into the existing decisionMakers/consulted/informed arrays; on load, expand those arrays into rows. Move the People group up next to the record metadata (Title/Status/Date/Tags).
3. Semantic reorder: Group Context and Problem Statement with Decision Drivers; reunite Considered Options with Pros and Cons of the Options; keep the Decision cluster (Decision Outcome + nested Consequences/Confirmation) together; supplementary (More Information, Additional Content, Relations) last. Visual/DOM order only — joinSections still serializes canonical MADR order so the saved file is unchanged.
4. Structured options: Merge Considered Options and Pros and Cons of the Options into a single structured Option[] editor. Each option row has a description field, a pros field, and a cons field, with add/remove. On save serialize the list into the existing consideredOptions and prosAndConsOfTheOptions markdown strings (canonical MADR: options listed under Considered Options, and per-option ### title + description + Good/Bad bullets under Pros and Cons). On load parse those strings back into rows; accept that non-canonical or hand-edited existing markdown may not round-trip cleanly into structured rows.

Preserve existing data-testid attributes on textareas where they still exist, and update the E2E and unit tests affected by the layout and interaction changes.

## Introduction

The ADR edit form (`EditAdrForm`) currently renders Consequences and Confirmation as flat top-level collapsible sections even though they are MADR sub-sections of Decision Outcome, keeps Decision Makers/Consulted/Informed as three separate free-text inputs lower in the form, keeps Considered Options and Pros and Cons of the Options as two unsynchronized free-text areas, and orders sections without regard to their narrative relationships. This feature restructures the form's information architecture — nesting the Decision Outcome sub-sections, replacing the People inputs with a single roled list positioned next to the record metadata, merging Considered Options and Pros and Cons into one structured option editor, and reordering the remaining sections into narrative groups — without changing the API, data model, or saved markdown file format.

## Boundary Context

- **In scope**: `EditAdrForm` only — nesting Consequences/Confirmation inside Decision Outcome, the People-with-roles list and its relocation next to the record metadata, the structured Considered Options/Pros and Cons editor, the visual/DOM reordering of section groups, and updates to the E2E and unit tests affected by these layout and interaction changes.
- **Out of scope**: `CreateAdrForm` — it retains its existing three separate Decision Makers/Consulted/Informed inputs and does not gain the People-with-roles UI or the structured options editor. API behavior, data model, storage, and the markdown file format are unchanged. Relations section behavior is unchanged (only its position moves).
- **Adjacent expectations**: The canonical MADR section order used to serialize the saved ADR content is unaffected by this feature; only the on-screen/DOM order changes. Existing `data-testid` attributes on section textareas that remain unchanged by this feature (Context and Problem Statement, Decision Drivers, Decision Outcome, Consequences, Confirmation, More Information, Additional Content) must remain stable. Hand-edited or non-canonical existing Considered Options/Pros and Cons content may not parse cleanly into structured option rows on load; the ADR Editor must still load without error in that case. Because `CreateAdrForm` is out of scope, a user creating a new ADR will see the older three-input People layout while editing the same ADR afterward shows the new People-with-roles layout — this inconsistency is accepted as an adjacent-system boundary of this feature.

## Requirements

### Requirement 1: Nested Decision Outcome Sub-sections

**Objective:** As an ADR author, I want the Consequences and Confirmation inputs to appear inside the Decision Outcome section, so that the form reflects that they are part of the decision outcome rather than separate top-level topics.

#### Acceptance Criteria
1. When the ADR edit form loads, the ADR Editor shall render the Consequences input and the Confirmation input inside the body of the Decision Outcome section.
2. The ADR Editor shall not render Consequences or Confirmation as independent top-level sections.
3. While the Decision Outcome section is collapsed, the ADR Editor shall hide the Consequences input and the Confirmation input along with the rest of the Decision Outcome content.
4. While the Decision Outcome section is expanded, the ADR Editor shall display the Consequences input and the Confirmation input.

---

### Requirement 2: People with Roles

**Objective:** As an ADR author, I want to record each stakeholder as one row with a name and a role, so that I can manage decision makers, consulted parties, and informed parties from a single, always-visible list next to the record metadata.

#### Acceptance Criteria
1. The ADR Editor shall render the People group as an always-visible block adjacent to the Title, Status, Date, and Tags fields, without collapse or expand interaction.
2. The ADR Editor shall allow the user to add a new person row consisting of a name field and a role field.
3. The ADR Editor shall restrict the role field of each person row to the fixed set: Decision Maker, Consulted, Informed.
4. The ADR Editor shall allow the user to remove any existing person row.
5. When the ADR edit form loads with an ADR that has existing decision makers, consulted parties, or informed parties, the ADR Editor shall create one person row per existing name, populated with that name and the role corresponding to the list it came from.
6. When the user saves the ADR, the ADR Editor shall record each person row's name under the stakeholder category matching its selected role.
7. When the user saves the ADR with a person row whose name is blank, the ADR Editor shall exclude that row from the saved stakeholder categories.
8. The ADR Editor shall not render Decision Makers, Consulted, and Informed as three separate fixed inputs.

---

### Requirement 3: Structured Considered Options Editor

**Objective:** As an ADR author, I want to describe each considered option together with its pros and cons in one place, so that I don't have to keep two separate free-text sections in sync.

#### Acceptance Criteria
1. The ADR Editor shall render Considered Options and Pros and Cons of the Options as a single structured list of option rows, each with a description field, a pros field, and a cons field.
2. The ADR Editor shall allow the user to add a new option row.
3. The ADR Editor shall allow the user to remove any existing option row.
4. When the ADR edit form loads with an ADR that has existing considered options and pros/cons content, the ADR Editor shall parse that content into option rows populated with description, pros, and cons where they can be identified.
5. When the user saves the ADR, the ADR Editor shall serialize the option rows into the Considered Options and the Pros and Cons of the Options content following canonical MADR structure.
6. When the user saves the ADR with an option row whose description, pros, and cons are all blank, the ADR Editor shall exclude that row from the saved content.
7. If the existing Considered Options or Pros and Cons of the Options content cannot be parsed into option rows, then the ADR Editor shall still load the ADR without error and without discarding the ADR's other section content.

---

### Requirement 4: Section Grouping and Visual Order

**Objective:** As an ADR author, I want related MADR sections positioned near each other, so that I can follow the decision narrative without jumping around the form.

#### Acceptance Criteria
1. The ADR Editor shall position the Decision Drivers section immediately adjacent to the Context and Problem Statement section.
2. The ADR Editor shall position the structured Options group (Requirement 3) as a single group, separate from the Context and Problem Statement / Decision Drivers group.
3. The ADR Editor shall position the Decision Outcome section, including its nested Consequences and Confirmation content (Requirement 1), as a single uninterrupted group.
4. The ADR Editor shall position More Information, Additional Content, and Relations after the Context and Problem Statement / Decision Drivers group, the structured Options group, and the Decision Outcome group.
5. The ADR Editor shall preserve the canonical MADR section order in the saved ADR content regardless of the on-screen order of sections.

---

### Requirement 5: Preserved Identifiers and Test Compatibility

**Objective:** As a developer maintaining automated tests, I want element identifiers to remain stable wherever the underlying field is unchanged, so that unaffected tests keep passing after the restructuring.

#### Acceptance Criteria
1. The ADR Editor shall preserve the existing `data-testid` attribute on every MADR section textarea that continues to exist unchanged by this feature (Context and Problem Statement, Decision Drivers, Decision Outcome, Consequences, Confirmation, More Information, Additional Content).
2. The ADR Editor shall provide a stable, distinct identifier for each interactive element introduced by the structured Options editor and the People group, suitable for automated test interaction.
