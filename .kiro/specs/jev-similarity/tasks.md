# Implementation Plan

- [ ] 1. Foundation: shared similarity contracts and the core strategy seam
- [x] 1.1 Add the additive similarity result metadata to the shared types
  - Introduce the relation label set (duplicate, supersedes, conflicts, constrains, related, unrelated), the lineage position (direction and level) and the coverage pair (judged, total)
  - Extend the similarity result with optional lineage and relation fields, leaving the existing adr and score fields untouched
  - Workspace typecheck passes and the existing shared, core, api and web test suites stay green with no call-site changes
  - _Requirements: 3.5, 4.5, 5.2, 5.3, 5.6_

- [x] 1.2 Introduce the strategy seam, the typed provider failure and the judging/caching ports in core
  - Declare the similarity finder contract (find similar by id, scope and options) with an exhaustive-comparison option, and an optional coverage on the ranked result variant
  - Make the existing embedding similarity service implement the contract; it accepts and ignores the options argument and never reports coverage, with no ranking, scope or cache change
  - Add the typed provider-failure error carrying a failure category (network, timeout, http-status, invalid-response, budget, aborted) and an optional HTTP status, with messages free of secrets and ADR content
  - Add the Jev-agnostic judge port (versioned judgment identity, abortable pairwise judge) and judgment store port (get/set by target revision, candidate revision and judgment version)
  - Re-export the new contract, error and port modules from the core package entry point (the lineage and Jev service modules add their own re-exports in 2.1 and 2.2)
  - Existing embedding similarity tests pass unchanged, plus a new test showing the embedding service ignores the exhaustive option and returns no coverage
  - _Requirements: 1.3, 3.1, 5.3, 5.7, 6.1, 7.1, 7.5_

- [ ] 2. Core: Jev similarity strategy
- [x] 2.1 (P) Implement pure lineage candidate selection
  - Anchor at the folder containing the target; include every ADR in the anchor and its descendants except the target, and the ADRs directly in each ancestor up to and including the repository root
  - Exclude sibling-branch folders using segment-based folder comparison, so that a folder named like a prefix of another is never treated as its ancestor
  - Label each candidate with direction and level, and return the full lineage ordered by ascending level, then down before up, then ascending path
  - Re-export the lineage selection from the core package entry point
  - Unit tests over a multi-level tree (anchor, child, ancestors, sibling team, unrelated top-level folder, root-level ADRs, prefix trap) pass and assert included sets, labels and order
  - _Boundary: selectLineage_
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8_

- [x] 2.2 Implement the Jev similarity service: candidate loading, cap, cache-first judging and ranking
  - List and parse all repository ADRs, locate the target by id (unknown id raises the plain not-found error), and ignore the requested scope
  - Select the lineage; an empty lineage returns the existing empty-scope result
  - Judge the first configured-maximum candidates of the lineage order, or all of them when an exhaustive comparison is requested, and report coverage as judged and total
  - For each selected candidate, look up the cache by both blob revisions and the judge's judgment version; on a hit skip the judge, on a miss send title, combined section text and lineage position of both ADRs to the judge and store the validated result
  - Build results with the probability as score plus lineage and relation, ranked by score descending, then level ascending, then path ascending
  - Re-export the Jev similarity service and its options from the core package entry point
  - Unit tests with an in-memory git port, a substitute judge and a map store pass for: unknown id, empty lineage, scope ignored, ranking and tie-break, additive fields, cache hit skips the judge, edited blob re-judged, 150 candidates capped to 100 with coverage 100 of 150, and exhaustive judging all 150 with coverage 150 of 150
  - _Depends: 1.2, 2.1_
  - _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.6, 4.7, 4.8, 4.9, 5.2, 5.4, 5.6, 6.1, 6.2, 6.3, 8.1_

- [x] 2.3 Add bounded concurrency, fail-fast cancellation and the request time budget to the Jev similarity service
  - Keep at most the configured number of judgments in flight per request
  - Share one abort signal per request; on the first provider failure start no further judgments, abort those in flight, wait for them to settle and reject with that first failure (never a secondary aborted one)
  - Arm a request budget timer that aborts outstanding judgments and rejects with the budget category, and clear it when the request settles
  - Keep successfully validated judgments in the cache even when the request as a whole fails, and never return partial rankings or touch an embedding port
  - Unit tests pass for: an instrumented judge never exceeding the concurrency ceiling, a mid-batch failure (first error propagated, no calls started after it, in-flight signals aborted, earlier valid judgments cached), and the budget elapsing under fake timers (budget rejection, completed judgments cached)
  - _Requirements: 6.5, 7.1, 7.2, 7.4, 7.6, 7.7, 8.1_

- [ ] 3. API: similarity configuration and Jev adapters
- [x] 3.1 (P) Implement the similarity configuration parser with aggregated validation and document the variables
  - Parse the strategy setting (trimmed, case-insensitive; absent or blank means embedding) and, only under jev, the endpoint, API key, model and the four numeric settings with their defaults and bounds
  - Accept only absolute https endpoints, or http with a loopback host; enforce the budget-not-shorter-than-timeout rule only when both values are individually valid
  - Collect every issue into one result and render them as a single multi-line message naming each variable and rule, never the API key value; ignore all Jev settings under embedding
  - Mint the validated Jev configuration only inside the parser through a non-exported brand, so hand-written object literals cannot satisfy the Jev configuration type
  - Expose the parse result from the application config module as a separate export, leaving the existing config object unchanged; add commented entries for the strategy and Jev variables to the example environment file and the configuration table of the README
  - Unit tests pass for every case in the design's configuration test list, including three simultaneous issues in one result and the key value absent from the formatted message
  - _Boundary: similarityConfig, example environment file, README configuration table_
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

- [x] 3.2 Implement the Jev HTTP judge adapter and answer parsing
  - Build one decisions request per pair with the pinned model, a state holding target and candidate (title, text, direction, level), a probability question and a relation choice question whose options are exactly the shared relation label set; send the bearer key header
  - Combine the adapter's own timeout with the caller's abort signal and map outcomes to failure categories: own timeout, caller abort, fetch rejection, non-success status, and unparsable or invalid answers
  - Parse answers strictly from the confirmed live response shape: probability in range, chosen relation (falling back to the arg-max of the distribution) within the allowed set, without requiring the distribution to sum to exactly 1
  - Expose the judgment version as model plus prompt version, starting at prompt version 1
  - Tests against a local loopback stub endpoint pass for: request headers and both questions present, valid answer parsed, 401 and 500 as http-status, delayed response as timeout, out-of-range probability, unknown relation and missing answers as invalid-response, caller abort as aborted, and no error message containing the key
  - _Depends: 3.1_
  - _Requirements: 2.7, 3.1, 3.2, 3.5, 3.6, 7.1, 7.3, 7.5, 7.7, 8.2_

- [x] 3.3 (P) Implement the SQLite judgment store
  - Create the judgment cache table on demand in the existing SQLite file, keyed by target revision, candidate revision and judgment version, with a range check on the probability
  - Replace on write and return null for a missing key, following the existing summary store pattern
  - Tests pass for the round trip, isolation by judgment version, directional keys and rejection of an out-of-range probability by the table constraint
  - _Boundary: SqliteJudgmentStore_
  - _Depends: 1.2_
  - _Requirements: 6.1, 6.4_

- [ ] 4. API integration: composition, startup, health and route
- [x] 4.1 Select the similarity strategy in the composition root
  - Remove the implicit default configuration of the container builder; every existing caller (server entrypoint, API and web tests) already passes a configuration and must keep compiling unchanged
  - Accept an optional similarity configuration (absent means embedding) and expose the similarity finder through the interface, plus the active strategy name
  - Under embedding wire exactly today's embedding service; under jev wire the Jev service with the HTTP judge, the SQLite judgment store and the validated options, without wiring embeddings into similarity
  - Container tests pass: no similarity config yields the embedding service with strategy embedding; a jev config obtained from the parser with a loopback endpoint yields the Jev service with strategy jev; all existing callers compile unchanged
  - _Depends: 2.3, 3.1, 3.2, 3.3_
  - _Requirements: 1.3, 1.4, 1.5, 2.9, 6.4, 7.2, 8.3_

- [x] 4.2 Fail fast at startup and report the active strategy in the health endpoint
  - Extract the entrypoint's configuration gate into a small testable startup step: when the parse failed it writes the formatted issues to stderr and exits with code 1 before any container is built; otherwise the entrypoint builds the container with the validated similarity configuration
  - Add the active strategy name, read from the container, to the health response and nothing else about similarity
  - Server tests pass showing the health response carries the strategy and no Jev values, and a startup-step test (with stubbed stderr and exit) shows an invalid configuration produces one aggregated message, exit code 1 and no container build
  - _Requirements: 1.5, 2.1, 2.6, 2.7, 5.5_

- [x] 4.3 (P) Extend the similar-ADRs route with exhaustive comparison, coverage headers and the provider-unavailable response
  - Read the exhaustive query option like scope (first value of a repeated key; only the literal true enables it) and pass it to the finder
  - For ranked results that carry coverage, set the judged and total count headers; keep the response body unchanged
  - Map the typed provider failure to 503 with a provider-unavailable body and a warning log with category and HTTP status only; map every other error to 404; log judged and total for exhaustive requests
  - Route tests with a substitute finder pass for: provider failure of any category (including budget) returning 503, plain error returning 404, lineage and relation passed through, exhaustive values mapped correctly, headers present only with coverage, and an identical body in both cases
  - _Boundary: Similarity route_
  - _Depends: 4.1_
  - _Requirements: 4.9, 5.1, 5.4, 5.6, 5.7, 7.1, 7.5, 7.6_

- [ ] 5. Web: Related reading feedback
- [x] 5.1 (P) Extend the API client's similar-ADRs call with exhaustive requests, coverage and failure status
  - Append the exhaustive query option only when requested
  - Return coverage when both count headers are present and parse as non-negative integers, otherwise null
  - Map a rejected fetch to a failure with status 0 and keep non-success statuses such as 503 as failures carrying their status
  - Client tests pass: against the real embedding backend coverage is null and ranked/empty-scope behavior is unchanged; with a stubbed fetch, headers become coverage, malformed headers become null, the exhaustive parameter is sent, 503 and network errors surface their status
  - _Boundary: ApiClient.getSimilar_
  - _Depends: 1.1_
  - _Requirements: 9.2, 9.4, 9.5_

- [x] 5.2 Extend the decision hook's similar query with error status, compare-all and retry
  - Expose results with coverage, the failure flag and failure status, and an in-progress flag for the exhaustive comparison
  - Switch to the exhaustive query on compare-all, keep the capped data visible while it is pending, and reset the flag when the viewed ADR changes; keep both query keys under the prefix already invalidated after a save
  - Retry refetches the currently active query; keep the app-wide no-automatic-retry behavior
  - Because the query data changes from a plain list to results-with-coverage, make the minimal app-shell change that passes the results list to the context rail, and rewrite the existing hook assertions that treated the data as a list, so the app and its tests stay green
  - Existing and new hook tests pass, the web typecheck is clean, and the new tests cover: failure exposing the error flag and status, retry refetching, compare-all requesting an exhaustive comparison while keeping the capped data then replacing it, and the flag resetting on ADR change
  - _Depends: 5.1_
  - _Requirements: 9.1, 9.3, 9.5_

- [x] 5.3 (P) Render the error, capped and comparing states in the Related reading area
  - Keep the hidden state for an empty scope and the existing list with the similarity meter when coverage is absent or complete
  - Show a status line "Compared {judged} of {total} related decisions." with a "Compare all {total}" button when fewer were judged than exist; while comparing, disable the button, change its label to the in-progress wording and mark the section busy
  - On failure keep the heading and show an alert message (provider wording for 503, generic wording otherwise) with a "Try again" button
  - Use native buttons and the existing rail classes and tokens, adding at most two small style classes without new colors
  - Component tests pass for every row of the design's state table, the status and alert roles, and keyboard activation of both buttons
  - _Boundary: ContextRail_
  - _Depends: 1.1_
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [x] 5.4 Wire the similar query state into the Related reading area
  - Pass the new props (coverage, failure status, the comparing flag and the retry and compare-all callbacks) from the decision hook into the context rail in the app shell, on top of the results list already wired in 5.2
  - Web test suite and web production build pass, and the decision view shows the error state instead of hiding the area when the similar request fails
  - _Depends: 5.2, 5.3_
  - _Requirements: 9.1, 9.4, 9.5_

- [ ] 6. Validation
- [ ] 6.1 Add an API integration test of the Jev strategy end to end against a local stub
  - Place the test in a dedicated Jev-strategy integration test file in the API app, reusing the loopback stub endpoint pattern established by the judge adapter tests in 3.2
  - Build a server whose container uses a jev configuration obtained from the parser with a loopback stub endpoint and a temporary repository with a nested folder hierarchy
  - Assert that a similar-ADRs request returns only lineage candidates ranked by the stub's probabilities with lineage and relation fields and both count headers, that a repeated request is served from the cache without new stub calls, that a stub failure returns 503 with the provider-unavailable body, and that health reports the jev strategy
  - The integration test passes offline
  - _Depends: 4.2, 4.3_
  - _Requirements: 1.4, 4.4, 5.5, 5.6, 6.2, 7.1, 8.2_

- [ ] 6.2 Confirm the embedding default is unchanged across all existing suites
  - Run the core and API unit suites, the web test suite and build, and the offline end-to-end suite with no Jev configuration present
  - All suites pass, including the existing similarity end-to-end journey, with no changes to embedding test expectations
  - _Depends: 5.4, 6.1_
  - _Requirements: 1.3, 5.1, 5.3, 8.3_

## Implementation Notes
- Jev config values can only be obtained through `parseSimilarityConfig` (branded type); tests build a jev config from an env object with an `http://127.0.0.1:<port>` endpoint and must keep `JEV_REQUEST_BUDGET_MS >= JEV_TIMEOUT_MS`.
- The loopback Jev stub pattern (a `node:http` server on 127.0.0.1 port 0, closed with `closeAllConnections` + `close`) lives in `apps/api/src/infrastructure/jev/jevSimilarityJudge.test.ts`; reuse it for the 6.1 integration test.
- The judge adapter uses `AbortSignal.any`/`AbortSignal.timeout` (Node >= 20.3).
- 5.3 added the test-only devDependency `@testing-library/user-event` to apps/web: design.md Testing Strategy requires `userEvent.keyboard`, which conflicts with the "No new npm dependencies" line under Allowed Dependencies; there are still no new runtime dependencies.
