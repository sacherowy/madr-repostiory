# Requirements Document

## Introduction
The ADR Manager currently ranks "similar ADRs" by comparing embedding vectors (Gemini `text-embedding-004`, or a deterministic offline fake) with cosine similarity, over the requested folder subtree. This feature adds an **alternative similarity strategy** based on TypeSafe **Jev**, a "System One" decision model that returns typed answers with probabilities instead of vectors. Under the Jev strategy each candidate ADR is judged **pairwise** against the target ADR, and the reported score is Jev's probability that the two ADRs address the same or an overlapping architectural decision.

The Jev strategy also changes **which ADRs are candidates**. It walks the organization hierarchy from the folder that contains the target ADR: *downward* through that folder's entire subtree, and *upward* through each ancestor folder, taking only the ADRs that sit directly in each ancestor. It never enters an ancestor's other child folders. This surfaces related decisions made at higher organizational levels without pulling in sibling teams' decisions.

The strategy is selected by an application configuration flag. The existing embedding strategy remains the default and its behavior is unchanged. Misconfiguration, for example the flag set to Jev with no Jev endpoint configured, is detected at startup and is never silently tolerated.

## Boundary Context
- **In scope**: selecting the similarity strategy through configuration; validating the Jev configuration at startup; the Jev pairwise judging adapter; lineage (down + ancestors-only-up) candidate selection for the Jev strategy; caching of Jev judgments; the error contract of the similar-ADRs endpoint under the Jev strategy; additive, optional result metadata.
- **Out of scope**: any change to the embedding strategy's ranking, scope semantics or caching; web UI changes beyond tolerating the additive fields; the `reindex` script (it remains embedding-only); pre-filtering or hybrid scoring that combines cosine and Jev; runtime (hot) switching of the strategy without a restart.
- **Adjacent expectations**: the existing `GET /api/adrs/:id/similar` contract (the `adr-manager` spec, Requirement 10) and the web client's `getSimilar` continue to work unchanged when the embedding strategy is active.

## Requirements

### Requirement 1: Similarity strategy selection by configuration
**Objective:** As an ADR Manager operator, I want to choose between the embedding strategy and the Jev strategy in the application configuration, so that I can adopt Jev without changing code and can switch back at any time.

#### Acceptance Criteria
1. The ADR Manager shall read the similarity strategy from a single configuration setting whose allowed values are `embedding` and `jev`.
2. If the similarity strategy setting is absent or blank, then the ADR Manager shall use the `embedding` strategy.
3. While the `embedding` strategy is active, the ADR Manager shall compute similar ADRs exactly as it did before this feature, including scope handling, ranking, caching and offline fallback.
4. While the `jev` strategy is active, the ADR Manager shall serve every similar-ADRs request with the Jev strategy, and shall not use embeddings to rank results.
5. The ADR Manager shall apply the selected strategy for the whole process lifetime; a change of strategy takes effect only after a restart.

### Requirement 2: Configuration validation and fail-fast startup
**Objective:** As an ADR Manager operator, I want invalid similarity configuration to be rejected at startup with a clear message, so that the service never runs in a half-configured state, such as the Jev strategy with no endpoint.

#### Acceptance Criteria
1. If the similarity strategy setting holds a value other than `embedding` or `jev` (case-insensitive, after trimming), then the ADR Manager shall refuse to start and shall report the invalid value together with the allowed values.
2. If the `jev` strategy is selected and the Jev endpoint URL is absent or blank, then the ADR Manager shall refuse to start and shall report that the Jev endpoint is required.
3. If the `jev` strategy is selected and the Jev API key is absent or blank, then the ADR Manager shall refuse to start and shall report that the Jev API key is required.
4. If the `jev` strategy is selected and the Jev endpoint is not an absolute URL using `https`, or `http` with a loopback host, then the ADR Manager shall refuse to start and shall report the invalid endpoint.
5. If the `jev` strategy is selected and an optional numeric Jev setting (request timeout, maximum candidates, request concurrency) is present but not a positive integer within its documented bounds, then the ADR Manager shall refuse to start and shall report the offending setting.
6. When several configuration problems exist, the ADR Manager shall report all of them in a single startup failure rather than one per restart.
7. The ADR Manager shall never include the Jev API key value in any startup message, log entry or HTTP response.
8. While the `embedding` strategy is active, the ADR Manager shall not require any Jev setting and shall ignore Jev settings that are present.
9. The ADR Manager shall make it impossible to construct the application's service container with the `jev` strategy but without a complete, validated Jev configuration.

### Requirement 3: Jev pairwise similarity scoring
**Objective:** As an ADR author, I want each candidate ADR to be scored by Jev against the ADR I am viewing, so that the ranking reflects whether the two ADRs address the same decision rather than only whether they share vocabulary.

#### Acceptance Criteria
1. While the `jev` strategy is active, when similar ADRs are requested for a target ADR, the ADR Manager shall obtain from Jev, for each candidate ADR, the probability that the target and the candidate address the same or an overlapping architectural decision.
2. The ADR Manager shall give Jev the title and the combined MADR section text of both the target ADR and the candidate ADR, together with the candidate's position relative to the target (direction and level).
3. The ADR Manager shall report that probability, a number between 0 and 1 inclusive, as the result's similarity score, and shall rank results by descending score.
4. When two results have equal scores, the ADR Manager shall order them by ascending level and then by path, so that the ranking is deterministic.
5. The ADR Manager shall also obtain from Jev the most likely relation between the candidate and the target, one of `duplicate`, `supersedes`, `conflicts`, `constrains`, `related` or `unrelated`, and shall include it in the result.
6. If Jev returns a response that is missing the probability, holds a value outside 0 to 1, or holds a relation outside the allowed set, then the ADR Manager shall treat that judgment as a provider failure (see Requirement 7) and shall not fabricate a score.

### Requirement 4: Lineage candidate scope
**Objective:** As an ADR author, I want the Jev strategy to consider the ADRs below the target's folder and the ADRs directly in each of its ancestor folders, but not those in sibling branches, so that I find related decisions at higher organizational levels without noise from unrelated teams.

#### Acceptance Criteria
1. While the `jev` strategy is active, the ADR Manager shall anchor candidate selection at the folder that currently contains the target ADR.
2. The ADR Manager shall include as candidates every ADR in the anchor folder and in all of its descendant folders, excluding the target ADR itself.
3. The ADR Manager shall include as candidates every ADR located directly in each ancestor folder of the anchor, up to and including the repository root.
4. The ADR Manager shall exclude every ADR located in a folder that is neither the anchor, a descendant of the anchor, nor an ancestor of the anchor.
5. The ADR Manager shall label each candidate with a direction (`down` for the anchor and its descendants, `up` for ancestors) and a level (0 for the anchor folder, the number of folders below the anchor for descendants, the number of folders above the anchor for ancestors).
6. While the `jev` strategy is active, the ADR Manager shall ignore the request's `scope` parameter for candidate selection.
7. If the lineage contains no candidate ADRs, then the ADR Manager shall return the existing empty-scope response.
8. If the lineage contains more candidates than the configured maximum, then the ADR Manager shall judge only the configured maximum, selected by ascending level, then `down` before `up`, then ascending path.

### Requirement 5: Result contract compatibility
**Objective:** As a web client developer, I want the similar-ADRs endpoint to keep its current contract under both strategies, so that the UI works without changes whichever strategy is configured.

#### Acceptance Criteria
1. The ADR Manager shall keep the similar-ADRs endpoint path, parameters, success status and response shape unchanged under both strategies: a ranked list of `{ adr, score }`, or the empty-scope object.
2. While the `jev` strategy is active, the ADR Manager shall add optional `lineage` (direction and level) and `relation` fields to each result, without changing the existing fields.
3. While the `embedding` strategy is active, the ADR Manager shall not add the `lineage` or `relation` fields.
4. When the target ADR does not exist, the ADR Manager shall respond with not-found under both strategies.
5. The ADR Manager shall expose the active similarity strategy name, and no other similarity setting, in the health endpoint response.

### Requirement 6: Judgment caching and freshness
**Objective:** As an ADR Manager operator, I want Jev judgments to be reused until either ADR changes, so that repeated views are fast and inexpensive while results never go stale.

#### Acceptance Criteria
1. The ADR Manager shall cache each Jev judgment keyed by the target ADR's content revision, the candidate ADR's content revision, the Jev model identifier and the prompt version.
2. When a cached judgment exists for a pair, the ADR Manager shall use it without calling Jev.
3. When either ADR's content is saved with changes, the ADR Manager shall compute a fresh judgment for that pair on the next similar-ADRs request.
4. The ADR Manager shall store the judgment cache as derived data that can be deleted and rebuilt from the repository without affecting any ADR content.
5. The ADR Manager shall cache only successful, validated judgments.

### Requirement 7: Provider failure handling and observability
**Objective:** As an ADR author and operator, I want Jev outages to be reported clearly rather than masked, so that I never mistake a degraded answer for a real ranking.

#### Acceptance Criteria
1. If a Jev request fails (network error, timeout, non-success status, or invalid response) for any candidate of a request, then the ADR Manager shall respond to that similar-ADRs request with a service-unavailable error whose body identifies the similarity provider as unavailable.
2. While the `jev` strategy is active, the ADR Manager shall not fall back to the embedding strategy when Jev fails.
3. The ADR Manager shall abort a Jev request that exceeds the configured timeout and treat it as a provider failure.
4. The ADR Manager shall limit the number of concurrent Jev requests per similar-ADRs request to the configured concurrency.
5. When a Jev request fails, the ADR Manager shall log the failure category and HTTP status (when present), without logging the API key or ADR content.

### Requirement 8: Offline testability
**Objective:** As an ADR Manager developer, I want the Jev strategy to be testable without network access or a real Jev key, so that the existing offline test suites keep passing.

#### Acceptance Criteria
1. The ADR Manager shall allow the Jev strategy's scoring, lineage selection, caching and failure handling to be exercised in automated tests with a substitute Jev judge and without network access.
2. The ADR Manager shall allow the Jev HTTP adapter to be exercised in automated tests against a local stub endpoint.
3. The existing unit, web and end-to-end test suites shall continue to pass without any Jev configuration.
