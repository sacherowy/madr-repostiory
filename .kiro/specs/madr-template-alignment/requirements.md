# Requirements Document

## Introduction

The ADR Manager already implements git-backed ADRs with MADR-inspired structure, but its data model and serialization diverge from the official MADR template (`adr/madr`, `develop` branch, `template/adr-template.md`) in four ways: the decision-participant field is named `deciders` instead of `decision-makers` and lacks `consulted`/`informed`; the status vocabulary lacks `rejected`; new ADRs are created with an empty body instead of the MADR section skeleton; and the title lives in frontmatter instead of the body's first-level (H1) heading as MADR specifies. Because of this, ADRs exported or committed from this system are not directly portable to other MADR-aware tooling, and new ADRs omit the structure MADR uses to guide authors through a complete decision record.

This feature aligns the ADR data model and serialization with the official MADR template: renaming `deciders` to `decision-makers` and adding optional `consulted`/`informed` fields; adding `rejected` to the status vocabulary; scaffolding new ADR bodies with the MADR section structure; and relocating the ADR title from frontmatter to the body's H1 heading. The existing relations-based supersession model, the non-MADR `id`/`tags`/`relations` frontmatter fields, and the underlying git/persistence architecture are preserved unchanged; legacy ADR files that still use the old field name or title placement continue to be readable.

The "ADR Manager" subject in the acceptance criteria below refers to the system as a whole — the shared ADR data model and parsing/serialization, the API, and the web client — since this feature changes a data model shared across all three.

## Boundary Context

- **In scope**: Renaming `deciders` to `decision-makers` in ADR frontmatter and adding optional `consulted`/`informed` fields, across creation, editing, viewing, the API, and comparison; adding `rejected` as a valid ADR status, including in the status selector; scaffolding new ADR bodies with the MADR section headings (required and optional) instead of an empty body; relocating the ADR title from a frontmatter field to the body's H1 heading, with consistent handling in creation, editing, viewing, search, and comparison; backward-compatible reading of existing ADR files that still use `deciders` and/or a frontmatter `title`; and migrating this repository's existing example ADR fixture(s) to the new format.
- **Out of scope**: Renaming or removing the existing non-MADR frontmatter fields `id`, `tags`, or `relations`; any change to how the relations-based supersession model is structured, validated, or displayed — status and relations remain independent, and no relation is required when status is `superseded` or `rejected`; encoding a superseding ADR's identifier inside the status value itself (MADR's "superseded by ADR-0123" string convention is not adopted); and any change to git-as-source-of-truth, the mechanics of rebuilding the search index, or the optimistic-concurrency conflict model, beyond what's needed to carry the renamed/relocated fields through them.
- **Adjacent expectations**: This feature depends on the existing relations graph, the non-MADR fields, search indexing, comparison, and persistence/concurrency behavior continuing to work exactly as today for everything this feature does not change; it does not own fixing pre-existing gaps in those areas. External MADR-aware tooling that reads exported/committed ADR files is expected to recognize `decision-makers`/`consulted`/`informed`, the MADR status vocabulary including `rejected`, and a body that begins with an H1 title — this feature does not implement or test against any specific external tool, only the shape of the files it produces.

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

### Requirement 3: MADR Body Scaffold for New ADRs

**Objective:** As an ADR author, I want a new ADR to start with the MADR section structure, so that I'm guided to write a complete decision record instead of starting from a blank document.

#### Acceptance Criteria
1. When a new ADR is created, the ADR Manager shall populate its body with the MADR section headings, in order: Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome, Consequences, Confirmation, Pros and Cons of the Options, and More Information.
2. The ADR Manager shall present the sections the MADR template marks as required (Context and Problem Statement, Decision Outcome) distinguishably from the sections it marks as optional (all others).
3. The ADR Manager shall leave each scaffolded section's content empty for the author to fill in.

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
