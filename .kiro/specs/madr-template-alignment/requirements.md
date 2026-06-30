# Requirements Document

## Introduction

The ADR Manager already implements git-backed ADRs with MADR-inspired structure, but its data model and serialization diverge from the official MADR template (`adr/madr`, `develop` branch, `template/adr-template.md`) in four ways: the decision-participant field is named `deciders` instead of `decision-makers` and lacks `consulted`/`informed`; the status vocabulary lacks `rejected`; new ADRs are created with a single free-text body instead of the MADR template's section-by-section structure; and the title lives in frontmatter instead of the body's first-level (H1) heading as MADR specifies. Because of this, ADRs exported or committed from this system are not directly portable to other MADR-aware tooling, and new ADRs omit the structure MADR uses to guide authors through a complete decision record section by section.

This feature aligns the ADR data model and serialization with the official MADR template: renaming `deciders` to `decision-makers` and adding optional `consulted`/`informed` fields; adding `rejected` to the status vocabulary; restructuring ADR content into discrete, individually editable fields matching the MADR section structure (in place of a single free-text body), serialized to and from canonical MADR Markdown; and relocating the ADR title from frontmatter to the body's H1 heading. The existing relations-based supersession model, the non-MADR `id`/`tags`/`relations` frontmatter fields, and the underlying git/persistence architecture are preserved unchanged; legacy ADR files that still use the old field name, title placement, or a body that doesn't map to the MADR sections continue to be readable without data loss.

The "ADR Manager" subject in the acceptance criteria below refers to the system as a whole — the shared ADR data model and parsing/serialization, the API, and the web client — since this feature changes a data model shared across all three.

## Boundary Context

- **In scope**: Renaming `deciders` to `decision-makers` in ADR frontmatter and adding optional `consulted`/`informed` fields, across creation, editing, viewing, the API, and comparison; adding `rejected` as a valid ADR status, including in the status selector; restructuring ADR content into eight discrete, individually editable fields — one per MADR section, required and optional — in place of a single free-text body, with canonical Markdown serialization on write and lossless handling of legacy or non-conforming body content on read; relocating the ADR title from a frontmatter field to the body's H1 heading, with consistent handling in creation, editing, viewing, search, and comparison; backward-compatible reading of existing ADR files that still use `deciders`, a frontmatter `title`, and/or a body that doesn't map cleanly to the eight MADR sections; and migrating this repository's existing example ADR fixture(s) to the new format.
- **Out of scope**: Renaming or removing the existing non-MADR frontmatter fields `id`, `tags`, or `relations`; any change to how the relations-based supersession model is structured, validated, or displayed — status and relations remain independent, and no relation is required when status is `superseded` or `rejected`; encoding a superseding ADR's identifier inside the status value itself (MADR's "superseded by ADR-0123" string convention is not adopted); any change to git-as-source-of-truth, the mechanics of rebuilding the search index, or the optimistic-concurrency conflict model, beyond what's needed to carry the renamed/relocated/restructured fields through them; and reorganizing or translating existing non-MADR-section body content — including this repository's already-migrated example fixture, which uses non-MADR section headings — into the eight discrete MADR sections, since such content continues to be preserved through the catch-all field described in Requirement 3.
- **Adjacent expectations**: This feature depends on the existing relations graph, the non-MADR fields, search indexing, comparison, and persistence/concurrency behavior continuing to work exactly as today for everything this feature does not change; it does not own fixing pre-existing gaps in those areas. External MADR-aware tooling that reads exported/committed ADR files is expected to recognize `decision-makers`/`consulted`/`informed`, the MADR status vocabulary including `rejected`, and a body that begins with an H1 title followed by the eight MADR section headings in canonical order for ADRs whose content maps cleanly to them (non-conforming legacy content may retain its original structure) — this feature does not implement or test against any specific external tool, only the shape of the files it produces.

## Requirements

### Requirement 1: Decision-Participant Frontmatter Fields

**Objective:** As an ADR author, I want the people involved in a decision recorded using MADR's decision-participant field names, so that my ADRs are portable to other MADR-compatible tooling.

#### Acceptance Criteria
1. When a new ADR is created, the ADR Manager shall record the people who made the decision under a `decision-makers` field instead of `deciders`.
2. The ADR Manager shall support optional `consulted` and `informed` fields, for listing people consulted for input and people kept informed, respectively.
3. When a user creates or edits an ADR, the ADR Manager shall let the user view and edit `decision-makers`, `consulted`, and `informed`.
4. The ADR Manager's API shall accept and return `decision-makers`, `consulted`, and `informed` instead of `deciders` for ADR create, update, and read operations.
5. When the ADR Manager compares two ADRs or two versions of an ADR, it shall compare the `decision-makers` field where it previously compared `deciders`, and shall include `consulted` and `informed` alongside the other compared fields.

### Requirement 2: Rejected Status, Independent of Relations

**Objective:** As an ADR author, I want to mark a considered-and-declined decision as rejected, so that I can use MADR's standard status vocabulary without conflating it with supersession.

#### Acceptance Criteria
1. The ADR Manager shall support `rejected` as a valid ADR status, alongside the existing `proposed`, `accepted`, `deprecated`, and `superseded` values.
2. When a user sets an ADR's status, the ADR Manager shall offer `rejected` as one of the selectable values.
3. The ADR Manager shall continue to track ADR supersession exclusively through the existing relations mechanism, independent of the status value.
4. The ADR Manager shall not require a relation to exist when an ADR's status is set to `superseded` or `rejected`.

### Requirement 3: Structured MADR Sections as Discrete ADR Fields

**Objective:** As an ADR author, I want each MADR section to be its own field I can fill in directly, so that I'm guided section by section to write a complete decision record instead of editing one undifferentiated block of text.

#### Acceptance Criteria
1. The ADR Manager shall represent an ADR's content as eight individually editable fields, one per MADR section — Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome, Consequences, Confirmation, Pros and Cons of the Options, and More Information, in that order — replacing the single free-text body field used previously.
2. When a user creates or edits an ADR, the ADR Manager shall let the user view and edit each of the eight section fields independently of the others.
3. The ADR Manager shall present the sections the MADR template marks as required (Context and Problem Statement, Decision Outcome) distinguishably from the sections it marks as optional (all others).
4. When a new ADR is created, the ADR Manager shall leave each of the eight section fields empty for the author to fill in.
5. When the ADR Manager writes an ADR to its underlying file, it shall serialize the eight section fields as Markdown headings and their content, in the same order, heading text, and heading level as the official MADR template, so the committed file remains a standard, portable, human-readable MADR Markdown document.
6. The ADR Manager shall provide one additional field, separate from the eight MADR section fields, to hold body content that does not belong to any of the eight sections.
7. When the ADR Manager reads an ADR file whose body does not consist solely of the eight MADR section headings with their content — including a legacy free-form body, non-MADR headings, headings out of MADR order, or content preceding the first heading — it shall populate each of the eight section fields whose heading text matches, and place all remaining content into the field from Criterion 6, without losing or corrupting any of it.
8. When an ADR is saved, the ADR Manager shall serialize the eight section fields per Criterion 5, followed by the content of the field from Criterion 6 if it is non-empty, so that content not mapped to one of the eight sections is preserved across reads and writes rather than discarded.
9. The ADR Manager's API shall accept and return each of the eight section fields, and the field from Criterion 6, independently for ADR create, update, and read operations.
10. When the ADR Manager compares two ADRs or two versions of an ADR, it shall compare each of the eight section fields and the field from Criterion 6 individually, in place of its previous comparison of a single combined body field.
11. When the ADR Manager indexes ADRs for search, it shall index the combined content of the eight section fields and the field from Criterion 6, producing search results equivalent to today's whole-body-based indexing.

### Requirement 4: Title Sourced from the Body Heading

**Objective:** As an ADR author, I want my ADR's title to live in the document body as MADR specifies, so that the file I commit is a self-contained, portable MADR document.

#### Acceptance Criteria
1. When a new ADR is created, the ADR Manager shall write the ADR's title as the body's first-level (H1) heading, and shall no longer store a separate frontmatter `title` field for new ADRs.
2. When an ADR is read, the ADR Manager shall derive its title from the body's first H1 heading.
3. When a user edits an ADR's title, the ADR Manager shall update the body's H1 heading accordingly.
4. When the ADR Manager displays an ADR, it shall present the H1-derived title as the ADR's heading.
5. When the ADR Manager indexes ADRs for search or compares ADRs by title, it shall use the H1-derived title and shall produce results equivalent to today's frontmatter-title-based behavior.
6. If an ADR's body has no H1 heading and no legacy frontmatter `title` field, then the ADR Manager shall treat the ADR as having a missing required title and report it consistently with its existing missing-required-field handling.

### Requirement 5: Backward Compatibility and Fixture Migration

**Objective:** As a maintainer, I want existing ADR files written before this change to keep working, so that no ADR history is lost or broken by the realignment.

#### Acceptance Criteria
1. When the ADR Manager reads an ADR file whose frontmatter contains the legacy `deciders` key, it shall treat it as equivalent to `decision-makers` without error or data loss.
2. When an ADR using the legacy `deciders` key is next saved, the ADR Manager shall persist it using `decision-makers`.
3. When the ADR Manager reads an ADR file that has no H1 heading in its body but has a legacy frontmatter `title` field, it shall fall back to that frontmatter value as the ADR's title.
4. The ADR Manager shall update this repository's existing example ADR fixture(s) to use `decision-makers` and a body H1 title in place of `deciders` and a frontmatter `title`.
5. After migration, the ADR Manager shall continue to read, display, index, and compare the migrated example fixture(s) correctly.

### Requirement 6: Continuity of Persistence and Conflict Behavior

**Objective:** As a maintainer, I want this realignment to preserve the system's existing storage and concurrency guarantees, so that ADR history and conflict handling remain reliable.

#### Acceptance Criteria
1. The ADR Manager shall continue to use git as the source of truth for ADR content and history.
2. The ADR Manager shall continue to detect and reject conflicting concurrent edits using its existing content-version-based concurrency check, regardless of the frontmatter and title changes introduced by this feature.
3. The ADR Manager shall continue to support rebuilding its search index from the current set of ADR files, correctly reflecting the renamed/added frontmatter fields and the H1-derived title.
