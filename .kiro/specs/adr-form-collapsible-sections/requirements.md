# Requirements Document

## Introduction

The ADR edit form currently renders all MADR section fields expanded at all times, resulting in an excessively long page (~1600 px for a new ADR). This feature shortens the form by collapsing optional MADR sections by default, visually distinguishing required sections without badge labels, moving Tags out of the People group into the always-visible top metadata block, and restructuring the People group to contain only Decision Makers, Consulted, and Informed.

## Boundary Context

- **In scope**: `EditAdrForm` only — section collapse/expand behaviour, required-section visual distinction (teal border + asterisk), content preview in collapsed headers, Tags field relocation, People group restructuring, and updating any existing E2E tests affected by the new layout.
- **Out of scope**: `CreateAdrForm` (contains no MADR section textareas and is not affected), save/load API behaviour, Relations section, server-side changes.
- **Adjacent expectations**: `MADR_SECTIONS` in `adrSections.ts` (the `required` flag and `heading` strings) is the authoritative source for which sections are required; this feature reads but does not modify it. Existing `data-testid` attributes on all textarea elements must remain unchanged. E2E tests that interact with optional section textareas must be updated by this feature to expand the relevant section before filling content.

## Requirements

### Requirement 1: Default Section Expansion State

**Objective:** As an ADR author, I want required sections to be open and optional sections to be closed when I open the edit form, so that the page is short and I can focus on the content that matters most.

#### Acceptance Criteria

1. When the ADR edit form loads, the ADR Editor shall render each required MADR section (Context and Problem Statement, Decision Outcome) in an expanded state showing its textarea.
2. When the ADR edit form loads, the ADR Editor shall render each optional MADR section (Decision Drivers, Considered Options, Consequences, Confirmation, Pros and Cons of the Options, More Information, Additional Content) in a collapsed state showing only the section header row.
3. When the ADR edit form loads, the ADR Editor shall render the People section (Decision Makers, Consulted, Informed) in an expanded state.
4. The ADR Editor shall apply the same collapsed/expanded defaults regardless of whether a section already contains content.

---

### Requirement 2: Section Expand and Collapse Interaction

**Objective:** As an ADR author, I want to click a section header to expand or collapse that section, so that I can access only the sections I need without scrolling past irrelevant fields.

#### Acceptance Criteria

1. When the user clicks a collapsed section header, the ADR Editor shall expand that section and reveal its input controls.
2. When the user clicks an expanded section header, the ADR Editor shall collapse that section and hide its input controls.
3. The ADR Editor shall display a chevron icon in each collapsible section header that visually indicates the current expanded or collapsed state.
4. When the user expands a section, the ADR Editor shall rotate the chevron icon to indicate the open state.
5. When the user collapses a section, the ADR Editor shall rotate the chevron icon to indicate the closed state.

---

### Requirement 3: Required Section Visual Distinction

**Objective:** As an ADR author, I want required sections to be visually distinct from optional sections without extra labels, so that I know which sections I must complete before saving.

#### Acceptance Criteria

1. The ADR Editor shall display a teal left-border accent on the header row and body area of each required section.
2. The ADR Editor shall display an asterisk character appended to the title text of each required section header.
3. The ADR Editor shall not display badge labels, pill components, or chip elements to indicate the required or optional status of any section.
4. The ADR Editor shall not apply a teal left-border accent to optional section headers.

---

### Requirement 4: Collapsed Section Content Preview

**Objective:** As an ADR author, I want to see a brief summary of a section's content without expanding it, so that I can scan the overall state of the form at a glance.

#### Acceptance Criteria

1. While a section is collapsed and its text input contains non-empty content, the ADR Editor shall display a single-line truncated preview of that content within the section header row.
2. While a section is collapsed and its text input is empty, the ADR Editor shall display the text "— empty" within the section header row.
3. When a section is expanded, the ADR Editor shall hide the content preview and the "— empty" indicator from the section header row.

---

### Requirement 5: Tags Field Placement

**Objective:** As an ADR author, I want the Tags field to always be visible in the top metadata area, so that I can tag ADRs without needing to expand any section.

#### Acceptance Criteria

1. The ADR Editor shall render the Tags field as a standalone always-visible input in the top metadata block, in proximity to the Title, Status, and Date fields.
2. The ADR Editor shall not render the Tags field inside the People section.
3. When the ADR edit form loads with an ADR that has existing tags, the ADR Editor shall populate the Tags field with those values.

---

### Requirement 6: People Section

**Objective:** As an ADR author, I want Decision Makers, Consulted, and Informed grouped in a collapsible section, so that the form is compact when stakeholder information is not the current focus.

#### Acceptance Criteria

1. The ADR Editor shall group the Decision Makers, Consulted, and Informed fields inside a single collapsible section labelled "People".
2. The ADR Editor shall not include the Tags field inside the People section.
3. While the People section is collapsed and at least one of Decision Makers, Consulted, or Informed contains a value, the ADR Editor shall display a summary of the non-empty values in the People section header row.
4. While the People section is collapsed and all three fields are empty, the ADR Editor shall display "— empty" in the People section header row.
