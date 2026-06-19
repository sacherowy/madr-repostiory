# Implementation Plan

- [ ] 1. Foundation: shared contracts, infrastructure adapters, and test tooling

- [ ] 1.1 (P) Extend git access with tree listing, move, and rename-aware history
  - Add the ability to list every folder and ADR file under a given root path, classified as folder or ADR entry, including folders that contain only a placeholder file
  - Add the ability to move an ADR to a new path as a single committed change without losing its identifier or content
  - Change version history retrieval so it keeps following an ADR's history across a prior move/rename
  - A repository created in a temporary directory demonstrates: moving a file produces one new commit, and requesting that file's history afterward returns entries from both before and after the move
  - _Requirements: 3.2, 4.1, 4.5, 6.1_
  - _Boundary: GitPort, SimpleGitAdapter_

- [ ] 1.2 (P) Define shared view and request types for tree, relations, history, comparison, and similarity
  - Add the data shapes the API and web app will exchange for: folder/ADR tree nodes, relation views, version diff views, ADR-to-ADR field comparisons, and similarity results
  - Add the request shapes for creating an ADR, saving an ADR (including the concurrency token and author), creating a folder, and moving an ADR
  - The new types compile and are importable from the shared package by both the API and web workspaces
  - _Requirements: 4.2, 5.1, 6.1, 7.1, 8.1, 9.1, 10.1, 10.2_
  - _Boundary: Shared Types_

- [ ] 1.3 (P) Build a keyword search index backed by SQLite full-text search
  - Create a search index that stores an ADR's id, title, body, and tags, and supports adding/replacing an entry, removing an entry, and searching with results ranked by closeness of match
  - Re-adding the same ADR id never produces duplicate results for that id
  - A search against a small set of indexed ADRs returns the entry with the matching word in its title ranked above an entry where the match only appears in the body
  - _Requirements: 9.1, 9.2, 11.2, 11.3, 11.4_
  - _Boundary: SqliteSearchIndex_

- [ ] 1.4 (P) Build a per-repository write queue that serializes save operations
  - Add a mechanism that runs submitted write jobs strictly one at a time, in the order they were submitted, regardless of how many are submitted concurrently
  - Two jobs submitted at the same instant resolve in submission order, with the second always observing the effects of the first
  - _Requirements: 2.4_
  - _Boundary: WriteQueue_

- [ ] 1.5 (P) Wire the ADR Manager visual design system into the web app
  - Add the design system's color, typography, spacing, and shape tokens as CSS custom properties, loaded once at app startup
  - Add the Google Fonts reference for the design system's three typefaces
  - Loading the web app in a browser renders text in the design system's typefaces and exposes the documented CSS custom properties on the root element
  - _Boundary: Frontend Design Tokens_

- [ ] 1.6 (P) Set up component-level test tooling for the web app
  - Add a component-test framework (test runner plus a React rendering/assertion library) as a new dependency, replacing the current placeholder test script — the web workspace has no test runner installed today
  - Add the configuration needed to render React components and assert on their output under that framework
  - Running the web app's test command executes a trivial smoke test against a rendered component and passes
  - _Boundary: Web Test Tooling_

- [ ] 2. Core domain services for ADR editing, organization, and discovery

- [ ] 2.1 (P) Implement relationship computation and validation between ADRs
  - Compute, for a given ADR, every relationship it participates in — both the ones it declares and the ones other ADRs declare pointing to it — deriving the matching reciprocal type (e.g., a "supersedes" declaration produces a derived "superseded-by" view on the target)
  - Provide a check for whether a given ADR id exists, for use before a relationship is committed
  - Removing a relationship from an ADR's declared list causes its reciprocal to stop appearing on the target ADR the next time relationships are computed, with no separate removal step
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 11.1_
  - _Boundary: RelationGraphService_

- [ ] 2.2 (P) Implement folder creation, ADR moves, and tree assembly
  - Add the ability to create a folder at a given location, rejecting the request if a folder already exists there
  - Add the ability to move an ADR to a different folder while preserving its identifier, content, relations, and history
  - Add the ability to assemble the full folder/ADR tree under a given root, including folders that have no subfolders or ADRs
  - Assembling the tree for a root containing one folder with only a placeholder file shows that folder as present and empty, not omitted
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.5, 4.6, 11.1_
  - _Boundary: FolderService_
  - _Depends: 1.1_

- [ ] 2.3 (P) Implement version history retrieval
  - Add the ability to return an ADR's full version timeline ordered from most recent to earliest, including author, date, and message per version
  - Add the ability to return an ADR's full content as it existed at a specific historical version
  - Requesting the timeline for an ADR with only one saved version returns exactly one entry with no indication of prior versions
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Boundary: HistoryService_
  - _Depends: 1.1_

- [ ] 2.4 (P) Implement version diff and ADR-to-ADR comparison
  - Add the ability to compare two versions of the same ADR and produce content differences tagged as added, removed, or unchanged, rejecting the request if the two versions belong to different ADRs
  - Add the ability to compare two different ADRs field by field (title, status, date, deciders, tags, body), flagging which fields differ, rejecting the request if the same ADR is compared against itself
  - Comparing two versions from different ADRs and comparing an ADR against itself both return a rejection result rather than a comparison
  - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_
  - _Boundary: ComparisonService_

- [ ] 2.5 (P) Implement keyword search ranking
  - Add a thin ranking pass-through that returns ADRs matching a query term, ordered by descending closeness of match
  - A query with no matching ADRs returns an empty result set rather than an error
  - _Requirements: 9.1, 9.2, 9.4_
  - _Boundary: SearchService_
  - _Depends: 1.3_

- [ ] 2.6 (P) Implement folder-scoped similarity ranking
  - Add the ability to rank ADRs within a folder subtree by similarity of meaning to a given ADR, using a cache-first lookup that only computes a new embedding on a cache miss
  - Add a distinct result for a subtree that contains no other ADRs besides the target
  - Re-running similarity for an ADR after its body content changes returns a result reflecting the updated content rather than a stale ranking
  - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - _Boundary: SimilarityService_

- [ ] 2.7 Implement ADR creation and concurrency-safe saving
  - Add the ability to create a new ADR with a generated identifier and pre-filled required fields
  - Add the ability to save an ADR's title, status, date, deciders, tags, relations, author, and body as one new version, rejecting the save with the list of missing fields when title or body is empty
  - Reject a save when the version the editor loaded no longer matches the ADR's current version, returning the latest version so the caller can offer a reload
  - Reject a save when any declared relationship target does not exist, returning which targets are missing
  - On a successful save, update the keyword search index so the change is reflected in search immediately
  - Saving an ADR with a stale base version returns a conflict result instead of committing, and saving with the current base version produces a new committed version reflected in a subsequent read
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.5, 5.1, 5.4_
  - _Boundary: AdrEditingService_
  - _Depends: 2.1_

- [ ] 3. Backend integration: composition root, API routes, and projection rebuild

- [ ] 3.1 Build the composition root wiring adapters into the core services
  - Instantiate the git adapter, search index, embedding store, and embedding provider, and use them to construct every core service exactly once per process
  - Starting the API process successfully constructs every service with no missing dependency errors
  - _Boundary: container.ts_
  - _Depends: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ] 3.2 (P) Implement ADR creation, retrieval, and concurrency-safe save endpoints
  - Expose endpoints to create an ADR, retrieve an ADR by id, and save an ADR's changes, routing saves through the write queue so concurrent saves to the same ADR never run simultaneously
  - Map each save outcome to the corresponding response: success, missing-field rejection, stale-version conflict, and missing-relation-target rejection
  - Two save requests issued concurrently against the same ADR resolve one at a time, with the second always seeing the first's committed result
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.4_
  - _Boundary: AdrRoutes_
  - _Depends: 3.1_

- [ ] 3.3 (P) Implement folder creation, move, and tree endpoints
  - Expose endpoints to create a folder, move an ADR to a different folder, and retrieve the folder/ADR tree from a given root
  - Requesting the tree from the repository root returns every folder and ADR, including empty folders
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.5, 4.6, 4.7_
  - _Boundary: FolderRoutes_
  - _Depends: 3.1_

- [ ] 3.4 (P) Implement the relations endpoint
  - Expose an endpoint that returns every relationship an ADR participates in, declared on it or pointing to it
  - Requesting relations for an ADR with a "supersedes" declaration elsewhere returns the derived "superseded-by" entry alongside any relations it declares itself
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - _Boundary: RelationRoutes_
  - _Depends: 3.1_

- [ ] 3.5 (P) Implement history, version content, and version diff endpoints
  - Expose endpoints to retrieve an ADR's version timeline, the full content of a specific historical version, and the diff between two versions of the same ADR
  - Requesting a diff between versions of two different ADRs returns a rejection rather than a diff
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3_
  - _Boundary: HistoryRoutes_
  - _Depends: 3.1_

- [ ] 3.6 (P) Implement the ADR-to-ADR comparison endpoint
  - Expose an endpoint that returns a field-by-field comparison of two different ADRs
  - Requesting a comparison of an ADR against itself returns a rejection rather than a comparison
  - _Requirements: 8.1, 8.2, 8.3_
  - _Boundary: CompareRoutes_
  - _Depends: 3.1_

- [ ] 3.7 (P) Implement the keyword search endpoint
  - Expose an endpoint that returns ranked ADRs matching a query term
  - A query with no matches returns an empty list with a successful status, not an error
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - _Boundary: SearchRoutes_
  - _Depends: 3.1_

- [ ] 3.8 (P) Implement the similarity search endpoint
  - Expose an endpoint that returns ADRs ranked by similarity to a given ADR within a folder subtree, including a distinct response when the subtree has no other ADRs
  - Requesting similarity for an ADR alone in its subtree returns the empty-scope response rather than an empty ranked list
  - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - _Boundary: SimilarityRoutes_
  - _Depends: 3.1_

- [ ] 3.9 Register all route plugins on the running API server
  - Replace the placeholder route registration with the seven route plugins built from the composition root
  - Starting the API process and requesting each new route returns its documented status code instead of a 404
  - _Boundary: server.ts_
  - _Depends: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 3.10 (P) Extend the projection rebuild script to cover keyword search
  - After the existing embedding rebuild step, also populate the keyword search index from the current repository state, then remove any indexed ADR id no longer present in the repository
  - Running the rebuild script twice in a row against an unchanged repository produces no duplicate or stale entries in either projection
  - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - _Boundary: reindex.ts_
  - _Depends: 1.3_

- [ ] 4. Frontend foundation: typed API access and application shell

- [ ] 4.1 Implement a typed client for every new API endpoint
  - Add one typed function per endpoint added in task group 3, returning the shared response types and surfacing error responses distinctly from success responses
  - Calling each client function against the running API returns a correctly typed result for both success and error responses
  - _Boundary: ApiClient_
  - _Depends: 3.9_

- [ ] 4.2 Wire the application shell with cross-panel navigation state
  - Replace the placeholder shell with one that tracks the selected folder, selected ADR, and active panel, and renders the corresponding feature area
  - Add the navigation behavior that selecting an ADR (from the tree or from search results) opens it in the editor panel
  - Selecting an ADR anywhere in the app updates the shell's state and renders that ADR in the editor
  - _Requirements: 4.7, 9.4_
  - _Boundary: App.tsx_
  - _Depends: 4.1_

- [ ] 5. Frontend feature panels

- [ ] 5.1 (P) Build the ADR editor panel
  - Build the create/edit form covering title, status (one of the four fixed values), date, deciders, tags, relations, author, and body, showing the currently saved content when editing
  - Show which fields are missing when a save is rejected for missing title or body
  - Show the conflict state when a save is rejected for a stale version, with an action to reload the latest version
  - Saving with a current version confirms success and updates the form to the newly saved version; saving with a stale version shows the conflict state instead
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.5, 5.1, 5.4_
  - _Boundary: AdrEditor_
  - _Depends: 4.2_

- [ ] 5.2 (P) Build the folder/ADR tree panel
  - Build the tree view showing the full repository tree by default, with each ADR entry showing title, id, and status
  - Add expand/collapse behavior that shows or hides a folder's direct children without removing them from the tree, and selection behavior that filters to a folder's subtree or opens a selected ADR
  - Expanding a folder containing only an empty subfolder shows that subfolder as present and empty
  - _Requirements: 3.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - _Boundary: FolderTree_
  - _Depends: 4.2_

- [ ] 5.3 (P) Build the relations panel
  - Build the display of every relationship an ADR participates in, each labeled with its type, and the controls to add a relationship (choosing one of the five fixed types) or remove one
  - Attempting to add a relationship to a nonexistent target shows the rejection message from the save
  - Adding a "supersedes" relationship and viewing the target ADR shows the derived "superseded-by" entry
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - _Boundary: RelationsPanel_
  - _Depends: 4.2_

- [ ] 5.4 (P) Build the history timeline panel
  - Build the chronological version list (most recent first) showing author, date, and message per version, with selection behavior that shows that version's full content
  - An ADR with a single saved version renders one entry with no implication of prior versions
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - _Boundary: HistoryTimeline_
  - _Depends: 4.2_

- [ ] 5.5 (P) Build the version diff and ADR comparison views
  - Build the version-to-version view that visually distinguishes added, removed, and unchanged content, and the ADR-to-ADR view that shows both ADRs' fields side by side with differing fields visually distinguished from identical ones
  - Attempting either comparison with an invalid selection (one version only, versions from different ADRs, or the same ADR twice) shows the corresponding rejection message instead of a comparison
  - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_
  - _Boundary: VersionDiffView, AdrCompareView_
  - _Depends: 4.2_

- [ ] 5.6 (P) Build the keyword search panel
  - Build the search box and ranked results list, with selecting a result opening that ADR
  - A query with no matches shows a message that no results were found
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - _Boundary: SearchPanel_
  - _Depends: 4.2_

- [ ] 5.7 (P) Build the similarity panel
  - Build the ranked list of similar ADRs with a visible similarity score or ranking per suggestion
  - A folder subtree with no other ADRs shows a message that no similar ADRs are available in that scope
  - _Requirements: 10.1, 10.2, 10.3_
  - _Boundary: SimilarityPanel_
  - _Depends: 4.2_

- [ ] 6. Validation: end-to-end flows and regression coverage

- [ ] 6.1 Verify the full create-edit-save flow including conflict recovery
  - Exercise creating an ADR, editing it, saving it, and recovering from a 409 conflict by reloading and retrying the save, end to end through the running app
  - The conflict path is exercised by forcing a second save against a stale version and confirming the editor reaches a successful saved state after reload
  - _Requirements: 1.2, 1.3, 2.2, 2.3, 2.5_

- [ ] 6.2 (P)* Verify tree browsing against a repository containing an empty folder
  - Exercise expand, collapse, and selection interactions against a tree that includes one folder with no subfolders or ADRs
  - The empty folder is shown as present and empty throughout expand/collapse/selection interactions
  - _Requirements: 4.4, 4.5_
  - _Boundary: FolderTree E2E_

- [ ] 6.3 (P)* Verify empty-state messaging for search and similarity
  - Exercise a no-match keyword search and a similarity request against a single-ADR folder, confirming each shows its documented empty-state message
  - Both empty-state messages render without an error state appearing instead
  - _Requirements: 9.3, 10.3_
  - _Boundary: SearchPanel E2E, SimilarityPanel E2E_

- [ ] 6.4 Run the full test suite across all workspaces and confirm no regressions
  - Run every unit, integration, and component test added across this feature together with the project's pre-existing tests
  - The full suite passes with no failing or skipped-unexpectedly tests
  - _Requirements: 11.1, 11.2, 11.3, 11.4_
