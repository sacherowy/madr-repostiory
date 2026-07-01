# Requirements Document

## Project Description (Input)
Restructure the ADR edit form information architecture and add structured input, building on the shipped adr-form-collapsible-sections feature. All changes are UI-only in EditAdrForm (AdrEditor.tsx) with no API, data-model, storage, or markdown file-format changes — structured data is owned by the editor and serialized to/from the existing AdrSections string fields and the existing decisionMakers/consulted/informed arrays.

Four changes:
1. Nesting: Render the MADR level-3 sub-sections Consequences and Confirmation inside the Decision Outcome collapsible body (they are ### children of ## Decision Outcome per MADR_SECTIONS level metadata and joinSections serialization), instead of as flat top-level collapsibles.
2. People with roles: Replace the three fixed inputs (Decision Makers, Consulted, Informed) with a dynamic list where each row is a person name plus a role chosen from the fixed set {Decision Maker, Consulted, Informed}. On save, group rows by role back into the existing decisionMakers/consulted/informed arrays; on load, expand those arrays into rows. Move the People group up next to the record metadata (Title/Status/Date/Tags).
3. Semantic reorder: Group Context and Problem Statement with Decision Drivers; reunite Considered Options with Pros and Cons of the Options; keep the Decision cluster (Decision Outcome + nested Consequences/Confirmation) together; supplementary (More Information, Additional Content, Relations) last. Visual/DOM order only — joinSections still serializes canonical MADR order so the saved file is unchanged.
4. Structured options: Merge Considered Options and Pros and Cons of the Options into a single structured Option[] editor. Each option row has a description field, a pros field, and a cons field, with add/remove. On save serialize the list into the existing consideredOptions and prosAndConsOfTheOptions markdown strings (canonical MADR: options listed under Considered Options, and per-option ### title + description + Good/Bad bullets under Pros and Cons). On load parse those strings back into rows; accept that non-canonical or hand-edited existing markdown may not round-trip cleanly into structured rows.

Preserve existing data-testid attributes on textareas where they still exist, and update the E2E and unit tests affected by the layout and interaction changes.

## Requirements
<!-- Will be generated in /kiro-spec-requirements phase -->
