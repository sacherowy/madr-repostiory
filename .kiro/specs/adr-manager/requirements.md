# Requirements Document

## Project Description (Input)
ADR Manager: A git-overlay application for managing Architecture Decision Records (MADR format). Problem: teams maintaining ADRs as plain Markdown files in git lack a GUI, relationship tracking (supersedes/superseded-by/relates-to/depends-on/conflicts-with), version history visualization, structured comparisons, and semantic similarity search. Current situation: ADRs exist only as versioned Markdown files in git with no tooling layer; git remains the sole source of truth and SQLite is only a rebuildable secondary projection/index (cache of Gemini text-embedding-004 embeddings keyed by blob SHA, plus search index). Tech stack: React+Vite+TypeScript frontend (apps/web), Node.js+Fastify+TypeScript backend (apps/api), pure TypeScript domain core with zero I/O (packages/core) using hexagonal architecture (GitPort, EmbeddingProvider, EmbeddingStore, SearchIndex ports), simple-git for git access, better-sqlite3 for the projection. What should change: build a GUI to create/edit ADRs, link them via typed relations, browse git-derived history/diffs, compare ADR versions and ADR-to-ADR fields, and run semantic similarity search scoped to a folder/branch of the ADR tree using cached embeddings. Concurrency uses optimistic locking on blob SHA with per-repo write queue. Roadmap items (status lifecycle, tags, schema validation, supersedes detection, export) are out of scope for this first spec and should be tracked separately.

## Introduction
Teams that maintain Architecture Decision Records as plain MADR-format Markdown files in git today have no tooling beyond a text editor and raw git commands: there is no GUI for authoring, no visibility into typed relationships between decisions, no consolidated history or comparison view, and no way to discover related or duplicate decisions elsewhere in the ADR tree. The ADR Manager introduces a GUI overlay for authoring and browsing ADRs while keeping the version-controlled ADR repository as the sole source of truth. It adds typed relationships between ADRs, version history, version-to-version and ADR-to-ADR comparisons, keyword search, and semantic similarity search scoped to a folder subtree. Authentication and authorization are not part of this iteration: the system is accessible to anyone who can reach it, consistent with a trusted internal-tool deployment, and identity is recorded as a free-text author name per change rather than through a login session.

## Boundary Context (Optional)
- **In scope**: Creating and editing ADRs through a GUI; organizing ADRs into folders; browsing and navigating the ADR/folder tree; declaring and viewing typed relationships between ADRs; viewing version history; comparing two versions of the same ADR; comparing two different ADRs field by field; keyword search across ADRs; semantic similarity search scoped to a folder subtree; optimistic concurrency control on concurrent edits; full recoverability of search and similarity data from the ADR repository.
- **Out of scope**: Status lifecycle workflow or enforcement beyond selecting a status value; tag taxonomy management; ADR schema validation beyond the required-field checks stated in these requirements; automatic detection of `supersedes` relationships; export to other formats; user authentication, login sessions, and role-based permissions (no access control in this iteration).
- **Adjacent expectations**: This feature expects a version-controlled ADR repository to already exist and be reachable by the system; it does not own provisioning or initial setup of that repository. It expects a similarity-ranking capability to be available for semantic search to function, but does not own configuring or selecting the underlying provider of that capability.

## Requirements

### Requirement 1: ADR Creation and Editing
**Objective:** As an ADR author, I want to create and edit Architecture Decision Records through a guided editor, so that I can document decisions without manually writing MADR-formatted Markdown by hand.

#### Acceptance Criteria
1. When a user creates a new ADR, the ADR Manager shall generate a unique identifier and pre-fill the required MADR fields (id, title, status, date) before the user enters content.
2. When a user saves a new or edited ADR, the ADR Manager shall persist the title, status, date, deciders, tags, relations, and body content as a single saved version.
3. If a user submits an ADR without a title or without body content, then the ADR Manager shall reject the save and display which required fields are missing.
4. While editing an existing ADR, the ADR Manager shall display the currently saved content so the user can see what they are changing.
5. When a user opens an ADR for editing, the ADR Manager shall present the editable status value as one of: proposed, accepted, deprecated, or superseded.
6. The ADR Manager shall allow a user to enter their name as the recorded author of a saved change.

### Requirement 2: Optimistic Concurrency Control for Saves
**Objective:** As an ADR author working alongside other contributors, I want to be warned when my edit conflicts with someone else's, so that I never silently overwrite another person's change.

#### Acceptance Criteria
1. While a user is editing an ADR, the ADR Manager shall track the version of the ADR that was loaded into the editor.
2. If another user's change has been saved to the same ADR since the current user loaded it, then the ADR Manager shall reject the current user's save and inform them that a newer version exists.
3. When a save is rejected due to a conflicting newer version, the ADR Manager shall allow the user to reload the latest version before retrying their change.
4. While multiple users attempt to save changes to the same ADR at the same time, the ADR Manager shall apply the saves one at a time so that no save is lost or corrupted.
5. When a save succeeds, the ADR Manager shall confirm the save and update the editor to reflect the newly saved version.

### Requirement 3: Folder-Based Organization
**Objective:** As an ADR maintainer, I want to organize ADRs into folders, so that related decisions are grouped consistently with how the team manages the repository.

#### Acceptance Criteria
1. When a user creates a new folder, the ADR Manager shall add it to the folder tree at the location the user specified.
2. When a user moves an ADR to a different folder, the ADR Manager shall update the ADR's location while preserving its identifier, content, relations, and history.
3. If a user attempts to create a folder with a name that already exists at the same location, then the ADR Manager shall reject the action and inform the user of the conflict.

### Requirement 4: ADR and Folder Tree Navigation
**Objective:** As an ADR reader, I want to browse a tree of folders and ADRs, so that I can quickly locate and navigate to the decision I'm looking for.

#### Acceptance Criteria
1. The ADR Manager shall display, by default, the full folder tree starting from the root of the ADR repository.
2. The ADR Manager shall display each ADR entry in the tree with at least its title, identifier, and status.
3. When a user expands a folder in the tree, the ADR Manager shall display that folder's direct subfolders and ADRs.
4. When a user collapses an expanded folder, the ADR Manager shall hide that folder's subfolders and ADRs without removing them from the tree structure.
5. If a folder contains no subfolders and no ADRs, then the ADR Manager shall display it as empty rather than omitting it from the tree.
6. When a user selects a folder in the tree, the ADR Manager shall display only the ADRs contained in that folder and its subfolders.
7. When a user selects an ADR in the tree, the ADR Manager shall open that ADR for viewing.

### Requirement 5: ADR Relationships
**Objective:** As an ADR author, I want to link ADRs to one another with typed relationships, so that readers understand how decisions relate, supersede, or conflict with each other.

#### Acceptance Criteria
1. When a user adds a relationship from one ADR to another, the ADR Manager shall require the user to select one relationship type from: supersedes, superseded-by, relates-to, depends-on, conflicts-with.
2. When a user saves an ADR with a "supersedes" relationship to another ADR, the ADR Manager shall display a corresponding "superseded-by" relationship on the target ADR.
3. When viewing an ADR, the ADR Manager shall display all relationships in which that ADR participates, whether the relationship was declared on this ADR or on another ADR pointing to it.
4. If a user attempts to create a relationship pointing to an ADR that does not exist, then the ADR Manager shall reject the action and inform the user the target ADR could not be found.
5. When a user removes a relationship, the ADR Manager shall remove the corresponding reciprocal relationship if one was displayed.

### Requirement 6: Version History
**Objective:** As an ADR reader, I want to see the history of changes to an ADR, so that I understand how a decision evolved over time.

#### Acceptance Criteria
1. When a user views an ADR's history, the ADR Manager shall display a chronological timeline of every saved version, including the author, date, and change message of each version.
2. When a user selects a specific historical version from the timeline, the ADR Manager shall display the full content of the ADR as it existed at that version.
3. The ADR Manager shall display the history timeline in order from the most recent saved version to the earliest.
4. If an ADR has only one saved version, then the ADR Manager shall display that single version in the timeline without indicating any prior versions.

### Requirement 7: Version Comparison
**Objective:** As an ADR reader, I want to compare two versions of the same ADR, so that I can see exactly what changed between them.

#### Acceptance Criteria
1. When a user selects two versions of the same ADR for comparison, the ADR Manager shall display the differences between the content of the two versions.
2. The ADR Manager shall visually distinguish added, removed, and unchanged content in a version comparison.
3. If a user selects only one version, or selects versions from two different ADRs, for a version comparison, then the ADR Manager shall reject the comparison and explain that two versions of the same ADR are required.

### Requirement 8: ADR-to-ADR Comparison
**Objective:** As an ADR reader, I want to compare two different ADRs field by field, so that I can evaluate how their decisions, context, or status differ.

#### Acceptance Criteria
1. When a user selects two different ADRs for comparison, the ADR Manager shall display their title, status, date, deciders, tags, and body content side by side.
2. The ADR Manager shall visually distinguish fields that differ between the two compared ADRs from fields that are identical.
3. If a user attempts to compare an ADR against itself, then the ADR Manager shall reject the comparison and inform the user that two distinct ADRs are required.

### Requirement 9: Full-Text Search
**Objective:** As an ADR reader, I want to search ADRs by keyword, so that I can quickly find decisions relevant to a topic.

#### Acceptance Criteria
1. When a user enters a search term, the ADR Manager shall return ADRs whose title, tags, or body content match the term.
2. The ADR Manager shall rank search results so that closer matches appear before weaker matches.
3. If no ADR matches the search term, then the ADR Manager shall inform the user that no results were found.
4. When a user selects a search result, the ADR Manager shall open that ADR for viewing.

### Requirement 10: Semantic Similarity Search
**Objective:** As an ADR author, I want to find ADRs that are conceptually similar to one I'm viewing, so that I can avoid duplicating past decisions or find related context.

#### Acceptance Criteria
1. When a user requests similar ADRs for a given ADR, the ADR Manager shall return other ADRs from the same folder subtree ranked by similarity of meaning rather than exact keyword match.
2. The ADR Manager shall display a similarity score or ranking for each suggested ADR.
3. If the folder subtree contains no other ADRs, then the ADR Manager shall inform the user that no similar ADRs are available in that scope.
4. When an ADR's content is saved with changes to its body, the ADR Manager shall ensure subsequent similarity results reflect the updated content.

### Requirement 11: Projection Rebuild and Resilience
**Objective:** As an ADR Manager operator, I want the search and similarity data to be fully recoverable from the repository, so that no operational data store is a single point of failure for ADR content.

#### Acceptance Criteria
1. The ADR Manager shall treat the version-controlled ADR repository as the sole authoritative source for ADR content, status, relations, tags, and history.
2. When an operator triggers a rebuild of the search and similarity data, the ADR Manager shall regenerate it entirely from the current state of the repository without modifying any ADR content.
3. If the search and similarity data is deleted or corrupted, then the ADR Manager shall be able to fully restore search and similarity functionality by rebuilding from the repository, with no loss of ADR content, relations, or history.
4. The ADR Manager shall allow a rebuild to be triggered repeatedly without producing duplicate or inconsistent results.
