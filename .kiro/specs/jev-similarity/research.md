# Research & Design Decisions

## Summary
- **Feature**: `jev-similarity`
- **Discovery Scope**: Extension with a new external integration (light discovery on the codebase, plus targeted external research on TypeSafe Jev)
- **Key Findings**:
  - Jev is a *decision* model, not an embedding model. It answers typed questions (`noul` = yes/no probability, `choice` = distribution over supplied options, `score` = rubric level) about a supplied `state`. Similarity therefore has to be computed **pairwise** (target × candidate), not by comparing vectors. This rules out reusing `EmbeddingProvider`/`EmbeddingStore`.
  - The codebase already has the composition-root pattern this feature needs: `buildContainer` selects adapters from configuration (the blank-key → fake/`null` rule), core services depend only on ports, and SQLite caches keyed by blob SHA hold derived data (`embedding_cache`, `summary_cache`). The Jev strategy slots in as one more port + adapter + cache table.
  - There is currently **no configuration validation**: `config.ts` reads `process.env` with defaults and never fails. The "flag = jev but no endpoint" requirement needs a new validating parser and a type-level guarantee that the container cannot be built with a half-configured Jev strategy.

## Research Log

### Access route: TokenRouter
- **Context**: The product owner chose TokenRouter as the access path to Jev.
- **Sources Consulted**: The TokenRouter curl example provided by the product owner; OpenRouter's Jev documentation (it exposes the same `/api/alpha/decisions` path); the Effect-TS issue #8379.
- **Findings**:
  - Endpoint: `POST https://api.tokenrouter.com/api/alpha/decisions`, with the headers `Authorization: Bearer <key>` and `Content-Type: application/json`.
  - Model id: `typesafe/jev-1.13`. Request body: `{ model, state, questions: { [id]: { type: "noul" | "choice" | "score", instructions, criteria } } }`. `noul` criteria are `{ true, false }`, `choice` criteria are `{ option: description }`, and `score` criteria are an ordered array.
  - The endpoint is explicitly **alpha**: request/response shapes, model ids and pricing can change in breaking ways without deprecation.
  - Jev returns **rounded** probabilities, so choice distributions can total 0.99 (Effect-TS issue #8379).
  - `api.tokenrouter.com` was blocked by the egress proxy of the design environment (CONNECT 403) at design time. It is now reachable; see "Live verification against TokenRouter" below.
- **Implications**: `JEV_ENDPOINT` is documented as the TokenRouter URL but has no default (2.2). `JEV_MODEL` defaults to the pinned `typesafe/jev-1.13`. `parseJevAnswers` tolerates distributions that do not sum to exactly 1. The alpha status is added as risk R4 in the design.

### Live verification against TokenRouter (2026-09-26)
- **Context**: Closes Risk R1 (answer shape unconfirmed). Probed `POST https://api.tokenrouter.com/api/alpha/decisions` from the Claude Code cloud environment with a real `JEV_API_KEY`, using the exact `JevRequest` shape from the design (`state: { target, candidate }`, questions `similar` (noul) and `relation` (choice)).
- **Confirmed response shape** (HTTP 200):
  ```json
  {
    "model": "typesafe/jev-1.13-20260917",
    "answers": {
      "similar":  { "type": "noul", "noul": 0.87 },
      "relation": { "type": "choice", "choice": "conflicting",
                    "probabilities": { "duplicate": 0, "conflicting": 0.7, "refines": 0.01, "related": 0.29, "unrelated": 0 },
                    "confidence": 0.62 }
    },
    "usage": { "input_tokens": 548, "output_tokens": 76, "cost": 0.000023016 },
    "id": "gen-dec-…",
    "provider": "TypeSafe"
  }
  ```
  - `noul` answer: probability at `answers.<id>.noul`.
  - `choice` answer: chosen option at `answers.<id>.choice`, distribution at `answers.<id>.probabilities`, plus a `confidence` field.
  - `score` answer (not used by the design): `{ type, score: 2.26, legend: { "0": …, … }, probabilities: { "0": …, … }, confidence }`; `score` is the expected level, not an integer.
  - `usage.cost` (USD) is present in addition to token counts.
- **Semantic sanity check** (target: "Use PostgreSQL as the primary relational database"):

  | Candidate | `similar.noul` | `relation.choice` (confidence) |
  |-----------|----------------|--------------------------------|
  | Same decision reworded | 0.98 | duplicate (0.87) |
  | PgBouncer pooling for that PostgreSQL | 0.83 | refines (0.77) |
  | MySQL for billing | 0.87 | conflicting (0.62) |
  | Nightly DB backups to S3 | 0.37 | related (0.95) |
  | Tailwind CSS for the web app | 0.03 | unrelated (0.93) |

  The ranking and relations match human judgment.
- **Behavior**:
  - Latency 0.5–1.4 s per pair; 4 parallel requests completed in ~1.1 s with no throttling. Cost ≈ $0.00002 per pair.
  - **Not deterministic**: the same request repeated 3 times returned `noul` 0.36 / 0.38 / 0.41 (same `choice`). The judgment cache (6.1) is what keeps rankings stable between requests.
  - The response `model` is a **dated snapshot** (`typesafe/jev-1.13-20260917`) of the requested alias `typesafe/jev-1.13`. If the cache key uses only the requested id, a silent snapshot upgrade would not invalidate cached judgments.
  - A string `state` and a `noul` without `criteria` are both accepted.
- **Error responses** (all JSON `{ error: { message, type, code } }`):

  | Case | HTTP |
  |------|------|
  | Invalid API key | 401 `Invalid token` |
  | Unknown model (`typesafe/jev-9.99`) and also `typesafe/jev-latest` | 403 `This token has no access to model …` |
  | Empty `questions` | **500** `questions are required` (`code: invalid_request`) |
  | Unknown question `type` | **500** `… type must be noul, choice, or score` (`code: invalid_request`) |

  Request validation errors come back as 500 rather than 4xx, so a status code alone cannot tell a malformed request from a server fault.
- **Implications**:
  - `parseJevAnswers` reads `answers.similar.noul` and `answers.relation.choice` (falling back to the arg-max of `answers.relation.probabilities`). Probabilities summed to exactly 1 in all probes, but the tolerant check stays.
  - Consider including the returned snapshot `model` in the stored judgment (or the cache key) so a snapshot change is detectable.
  - Any retry policy must not retry 500s whose `error.code` is `invalid_request`.
  - `typesafe/jev-latest` is not available through TokenRouter with this key; the pinned `typesafe/jev-1.13` default is correct.

### TypeSafe Jev API surface
- **Context**: Requirement 3 needs a concrete request/response contract.
- **Sources Consulted**: The TypeSafe blog and docs (`typesafe.ai`, `docs.typesafe.ai`) were **not reachable** from the design environment (egress policy blocked them). Secondary sources were found through web search: jev-agent.com API reference, jevmodel.org API examples, MarkTechPost articles (2026-09-19, 2026-09-23), beam.ai, and alexmolas.com "Jev can't be calibrated" (2026-09-23).
- **Findings**:
  - Single endpoint: `POST https://api.typesafe.ai/v1/systemone`, with a `Authorization: Bearer <key>` header.
  - Request: `{ model: string, state: string | object | array, questions: { [id]: Question } }`.
  - Question types: `{ type: "noul", instructions, criteria?: { true, false } }`, `{ type: "choice", instructions, criteria: Record<option, description> }` (at most 255 options), `{ type: "score", instructions, criteria: string[] }` (2–10 levels).
  - Response: `{ model, answers: { [id]: … }, usage: { input_tokens, output_tokens } }`. The exact per-answer shape (field names for the noul probability and the choice distribution) was **not confirmed** from a primary source.
  - Model id used in examples: `jev-latest`. Official SDKs exist (`@typesafe-ai/sdk`, `typesafe-sdk`), and they add retries.
  - Claims: sub-second latency, $0.042 per 1M input tokens, free output. The "calibrated probability" claim is publicly disputed, so the score is treated as a ranking signal, not a guaranteed probability.
- **Implications**:
  - Response parsing is isolated in one pure function inside the adapter (`parseJevAnswers`). Only that function changes once the answer shape is confirmed against the official docs (open item, see Risks).
  - The endpoint URL is configuration (`JEV_ENDPOINT`) with **no default**. The operator must set it explicitly, which also makes the "no endpoint configured" failure mode explicit (2.2).

### Existing similarity implementation (codebase)
- **Context**: Requirements 1.3 and 5 require the embedding path to be unchanged.
- **Findings**:
  - `SimilarityService.findSimilar(id, scopePath)` returns `SimilarityFindResult` (`ranked` | `emptyScope`) and throws a plain `Error` when the id is not in scope. `routes/similarity.ts` maps **every** throw to 404.
  - `Container.similarity` is typed as the concrete `SimilarityService`, and `container.test.ts` asserts `toBeInstanceOf(SimilarityService)`.
  - The web client (`apps/web/src/api/client.ts` `getSimilar`) treats any non-200 as `{ ok: false, status }`, and `useDecision` surfaces it as `isError`. A new 503 needs no UI change.
  - The web always passes the ADR's own folder as `scope`, so anchoring the lineage at the ADR's folder is consistent with what the UI already asks for.
  - `GitPort.listAdrFiles(path)` is recursive (`git ls-tree -r`). No id → path index exists (`AdrEditingService.findAdrById` scans the tree privately).
- **Implications**:
  - Introduce a `SimilarityFinder` interface that both services implement, so the route and container depend on the interface. `SimilarityService` keeps its class identity, so existing tests keep passing.
  - The route must distinguish the provider failure (503) from not-found (404). This is done with a typed error class exported by core.

### Configuration handling (codebase)
- **Findings**: `config.ts` builds a plain object at import time. `config.test.ts` re-imports it with stubbed env. `server.ts` builds the container only in the entrypoint branch, and tests call `buildContainer` with literal configs.
- **Implications**: Validation belongs in a **pure parser** that returns a result union (testable without process exit). The entrypoint turns a failure into a single aggregated message and `process.exit(1)`. `config.ts` must not throw at import, because that would break every test importing it.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A. Strategy behind `SimilarityFinder` (selected) | Two core services implementing one interface; the container picks one from validated config | Embedding path untouched; route unchanged apart from the error mapping; each strategy testable in isolation | Two services share little code (only ADR loading) | Mirrors the existing adapter selection in `buildContainer` |
| B. Jev as an `EmbeddingProvider` | Force Jev behind the vector port | No new port | Impossible: Jev returns no vectors, so the semantics break | Rejected |
| C. Single `SimilarityService` with an internal `if (strategy)` | One class branching on the flag | Fewer files | Mixes two scopes, caches and error models; the core learns about configuration | Rejected (violates the ports-only rule for core) |
| D. Hybrid (cosine pre-filter + Jev re-rank) | Cheap first stage, Jev on the top-K | Scales to large scopes | Requires embeddings under the Jev strategy; out of scope (1.4) | Deferred; the interface allows it later |

## Design Decisions

### Decision: Validated, branded Jev configuration
- **Context**: 2.2–2.9. The operator must not be able to run the Jev strategy without an endpoint or key, and code must not be able to build such a container either.
- **Alternatives Considered**:
  1. Validate inside `buildContainer` and throw at runtime.
  2. A pure parser returning `Result<SimilarityConfig, ConfigIssue[]>`, where the Jev variant carries a brand only the parser can mint.
- **Selected Approach**: Option 2. `parseSimilarityConfig(env)` collects **all** issues (2.6). `SimilarityConfig` is a discriminated union and its `jev` member holds a `ValidatedJevConfig` branded type. `ContainerConfig.similarity` accepts only `SimilarityConfig`, so a hand-written object literal cannot satisfy it (2.9). The entrypoint fails fast before the container is built.
- **Rationale**: This turns the misconfiguration into a compile-time error for code and a startup error for operators. Nothing surfaces at request time.
- **Trade-offs**: Tests that need a Jev container must build its config through the parser, which is a small cost.

### Decision: No silent fallback to embeddings
- **Context**: 7.1, 7.2. A fallback would mix two incomparable score scales in one UI and hide outages.
- **Selected Approach**: A provider failure raises `SimilarityProviderError`, which the route maps to `503 { kind: "providerUnavailable" }`.
- **Trade-offs**: While Jev is down, related reading shows an error state. This is accepted, because the flag makes switching back one restart away.

### Decision: One Jev request per pair, bounded concurrency
- **Context**: 3.1, 7.4. Alternatively, all candidates could go in one `state` with one question per candidate.
- **Selected Approach**: One request per (target, candidate) pair, with `noul` + `choice` questions, a concurrency limit (default 4), and per-pair caching.
- **Rationale**: Per-pair requests map 1:1 onto the cache key (6.1), so a single edited ADR invalidates only its own pairs. Payload size stays bounded no matter how many candidates there are, and there are no undocumented batch limits to depend on.
- **Trade-offs**: More HTTP calls on a cold cache. This is mitigated by the cache and the `JEV_MAX_CANDIDATES` cap.

### Decision: Lineage computed in core as a pure function
- **Context**: Requirement 4.
- **Selected Approach**: `selectLineage(files, targetPath)` in `packages/core/src/similarity/lineageScope.ts`. It makes one recursive listing of the repository root and does all filtering in memory with POSIX path arithmetic (no `node:path` in core, which has zero I/O dependencies).
- **Rationale**: Pure, exhaustively unit-testable, and `GitPort` needs no change.
- **Revision (design review, 2026-09-26)**: the cap moved out of `selectLineage` into `JevSimilarityService`, so the full lineage size is known and can be reported as `coverage.total`.

### Decision: Candidate cap with a user override ("compare all")
- **Context**: 4.8, 4.9, 5.6, 9.4, 9.5. The product owner kept the default cap at 100 and asked that, once the cap applies, the user can decide to compare all candidates anyway.
- **Alternatives Considered**:
  1. Silent truncation (the original design).
  2. A new response body variant, e.g. `{ kind: "ranked", results, coverage }`.
  3. The unchanged body plus `X-Similarity-Judged` / `X-Similarity-Candidates` headers, and an `exhaustive=true` query parameter.
- **Selected Approach**: Option 3. The body contract (5.1) stays exactly as it is, the embedding strategy never sends the headers (5.7), and the web client reads them same-origin through the Vite proxy.
- **Trade-offs**: Headers are less discoverable than body fields. This is accepted in exchange for zero contract change.

### Decision: Per-request time budget, fail-fast cancellation
- **Context**: 7.6, 7.7. The per-call timeout alone allowed about 250 s per request with the defaults, and after a failure the queued calls kept running.
- **Selected Approach**: `JEV_REQUEST_BUDGET_MS` (default 120000, must be ≥ `JEV_TIMEOUT_MS`). One `AbortController` per request is aborted by the budget timer or by the first failure. It is passed to every `judge` call, and no new calls start after it aborts.
- **Rationale**: Bounds latency and wasted spend. Completed judgments are still cached, so a retry after a budget 503 resumes progress, which is what makes "compare all" usable on large lineages.
- **Trade-offs**: A very large exhaustive comparison may need several user retries. There is no progress streaming (non-goal).

### Decision: Visible "Related reading" failure state
- **Context**: Requirement 9. The web app previously rendered `similar.data ?? []`, so a 503 hid the section, and a Jev outage looked like "nothing related". The product owner rejected that.
- **Selected Approach**: A minimal change in `apps/web`: `ApiClient.getSimilar` (coverage + exhaustive), `useDecision` (`errorStatus`, `compareAll`, `retry`), and the `ContextRail` section (an error state with `role="alert"` and "Try again", plus a capped notice with `role="status"` and "Compare all N"). The app-wide `retry: false` query policy is kept.
- **Trade-offs**: `apps/web` enters the spec's boundary. This is limited to three touch points and has no visual redesign.

### Synthesis outcomes
- **Generalization**: Both strategies are "given an ADR, rank others". `SimilarityFinder` captures exactly that, and the lineage selector is independent of the Jev scorer. A later hybrid strategy can reuse both without interface changes. No further generalization is built now.
- **Build vs. adopt**: The official `@typesafe-ai/sdk` was considered and rejected for now. The project calls Gemini with plain `fetch` in hand-written adapters, the API is a single POST, the SDK's retry policy would interact with our timeout/503 contract, and its version and maintenance could not be verified from this environment. Adopting it later only changes `JevSimilarityJudge`.
- **Simplification**: The design has no strategy registry, no plugin loading and no hot reload (1.5). There is no separate "relation" endpoint, and UI work is limited to the "Related reading" states. The judgment cache is one table.

## Risks & Mitigations
- **Unconfirmed Jev answer shape** — Parsing is isolated in `parseJevAnswers`. Any shape mismatch is a provider failure (3.6), never a fabricated score. Confirming the official response schema is an implementation prerequisite (first task).
- **Calibration of probabilities is disputed** — Scores are used for ranking. The UI already shows them as a relative meter, and no thresholds are hard-coded.
- **Cold-cache latency on large lineages** — `JEV_MAX_CANDIDATES` (default 100), concurrency (default 4), per-pair caching, a timeout per call (default 10 s), and a time budget per request (default 120 s).
- **Cost of user-triggered "compare all"** — An explicit action only, bounded per attempt by the budget, and logged with its counts.
- **Full-repository scan per request** (listing plus parsing every ADR to find the target) — The embedding path already does this for the whole-repo scope. It is acceptable at the current repository sizes, and an id index is out of scope.
- **ADR content is sent to a third party** — Only under the explicitly opted-in `jev` strategy. The data is documented in the design's Security section. Logs never contain content or the key.
- **Alpha endpoint (TokenRouter `/api/alpha/decisions`)** — Pin the model, validate answers strictly, keep the embedding strategy as a one-restart fallback.
- **Egress policy** — Environments with an allow-list must permit `api.tokenrouter.com`. Otherwise every request fails with 503, which is loud, not silent.

## References
- [Jev Documentation – TypeSafe Decision Model on OpenRouter](https://openrouter.ai/docs/guides/community/jev) — `/api/alpha/decisions` contract, `typesafe/jev-1.13`
- [Effect-TS issue #8379](https://github.com/Effect-TS/effect/issues/8379) — rounded probability distributions
- [Introducing System One Models & Jev (TypeSafe)](https://typesafe.ai/blog/introducing-system-one-models-and-jev) — primary announcement (not reachable from the design environment)
- [Jev API reference – /v1/systemone (Jagent)](https://jev-agent.com/api-reference) — request shape, question types
- [Jev API Examples: Choice, Score, and Noul](https://jevmodel.org/api/) — JSON examples
- [TypeSafe AI Releases Jev (MarkTechPost)](https://www.marktechpost.com/2026/09/19/typesafe-ai-releases-jev/) — overview, SDK names
- [Jev can't be calibrated (Alex Molas)](https://www.alexmolas.com/2026/09/23/jev-cant-be-calibrated.html) — calibration caveat
- `.kiro/specs/adr-manager/requirements.md` Requirement 10 — the existing similarity contract that must be preserved
