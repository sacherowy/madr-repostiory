# Research & Design Decisions — adr-manager-decision-feed

## Summary
- **Feature**: `adr-manager-decision-feed`
- **Discovery Scope**: Extension (integration-focused light discovery; escalated detail on the one new external integration — Gemini text generation)
- **Key Findings**:
  - `packages/core/src/adr/parse.ts` already round-trips unknown frontmatter keys: `parseAdr` spreads unrecognized keys onto the `Adr`, and `serializeAdr` spreads them back into the emitted frontmatter. The new `summary` field therefore needs only typing (`AdrFrontmatter.summary?: string`) and explicit passthrough in `editingService` payload handling — no parser/serializer rework.
  - No list-shaped API response carries any description text today: `AdrSummary` is `{id, title, status, path}` and `SearchHit` is `{id, score}`. The feed's card data (date, people, short description) requires either N+1 client fetches of full ADRs or a new additive read endpoint.
  - The blobSha-keyed SQLite cache pattern the proposal calls for already exists verbatim for embeddings: `SqliteEmbeddingStore` over `embedding_cache(blob_sha TEXT PRIMARY KEY, vector TEXT)` with `get/has/set`, plus offline provider selection in `container.ts` (`FakeEmbeddingProvider` when `GEMINI_API_KEY` is blank). The summary suggestion cache and degradation mirror this exactly.
  - The existing Gemini adapter (`GeminiEmbeddingProvider`) already establishes the REST integration pattern (base URL `https://generativelanguage.googleapis.com/v1beta/models`, `?key=` auth, JSON POST, throw on non-OK). Text generation uses the sibling `:generateContent` method of the same API family — no new library, no new auth mechanism.
  - Several existing E2E journey specs drive the contextual-shell navigation being removed (`design-system.spec.ts` asserts aspect switcher/palette/inspector; `search.spec.ts` drives the palette; lifecycle/tree specs navigate via the explorer). Removing the shell without migrating these specs breaks the suite, so spec migration is in-boundary work, not incidental.

## Research Log

### Existing frontend shell and reuse surface
- **Context**: Requirement 15.1 removes the contextual-shell navigation; the design must know exactly which files die, which are reused, and which are reworked.
- **Sources Consulted**: `apps/web/src` full inventory (subagent), `App.tsx`, `state/workspaceStore.ts`, `hooks/useAspectCounts.ts`, `hooks/useInspectorPreviews.ts`.
- **Findings**:
  - Shell-owned files: `App.tsx` (four-zone assembly), `components/AspectSwitcher.tsx`, `components/ContextHeader.tsx`, `features/command-palette/`, `features/explorer/`, `features/inspector/`, `features/folder-tree/`, `state/workspaceStore.ts`, `hooks/useAspectCounts.ts`, `hooks/useInspectorPreviews.ts`, and shell CSS (`app-shell.css`, `inspector.css`, `command-palette.css`, `folder-tree.css`).
  - Reusable as-is: primitives (`StatusBadge`, `RelationChip`, `MonoChip`, `SimilarityMeter`, `AdrCard`), diff/compare components (`VersionDiffView`, `AdrCompareView`, `CompareLauncher`), `HistoryTimeline`, `ApiClient`, `state/queryClient.ts`, TanStack Query + Zustand deps, `tokens.css`/`base.css`/`soft-ui.css`.
  - Reworked (logic reused, surface replaced): `features/adr-editor/` — `options.ts`/`people.ts` are pure helpers that survive; the form UI is replaced by the compose page. `features/search/SearchPanel.tsx` and `features/relations-graph/RelationsPanel.tsx` are absorbed into the Home hero search and article context rail respectively.
- **Implications**: The web change is a navigation-layer replacement with a well-defined kill list; the store must be rebuilt around a `view` discriminated union (no client-side router is permitted by 15.5).

### Feed data source: what the API can and cannot provide
- **Context**: Requirement 2.3 needs cards with title, status, one-line description, topic, people, timestamp; Requirements 4/5 need people fields for grouping/matching.
- **Sources Consulted**: `apps/api/src/routes/*.ts`, `packages/core/src/folders/folderService.ts:117-151`, `packages/shared/src/types.ts`.
- **Findings**: `GET /api/tree` returns only `{id,title,status,path}` per ADR; `GET /api/search` returns `{id,score}[]`; full data requires `GET /api/adrs/:id` per ADR. `FolderService.buildTree` already reads and parses every ADR file per request — a feed endpoint doing the same scan has the identical cost profile.
- **Implications**: A new additive `GET /api/feed` endpoint returning enriched card DTOs is the cheapest correct option (see Design Decision below). Search results, Topics, People, and the digest can all be client-side projections over one feed payload.

### Frontmatter `summary` passthrough
- **Context**: Requirement 11 adds an optional author-owned `summary` frontmatter field.
- **Sources Consulted**: `packages/core/src/adr/parse.ts` (`parseAdr` line 38, `serializeAdr` lines 59-83), `packages/shared/src/types.ts:19`.
- **Findings**: `parseAdr` destructures known keys and spreads the rest onto the Adr; `serializeAdr` destructures known Adr fields and spreads the remaining frontmatter (`...fm`) back out via `matter.stringify`. Unknown keys already survive a read-modify-write cycle. `editingService` create/update paths construct the Adr from request payloads, so the typed field must be accepted there explicitly.
- **Implications**: Core change is minimal and non-breaking: type the field in `@adr/shared`, accept it in `editingService` payloads, and existing ADRs without the field stay valid (11.3) with zero migration.

### Gemini text generation (`:generateContent`)
- **Context**: Requirement 13 needs a one-sentence suggestion provider, offline-degradable.
- **Sources Consulted**: `apps/api/src/infrastructure/embeddings/gemini.ts` (existing, working integration of the same API family); Google Generative Language API surface (`v1beta/models/{model}:generateContent`, request `{contents:[{parts:[{text}]}]}`, response `candidates[0].content.parts[0].text`).
- **Findings**: Same base URL, same `?key=` auth, same fetch/JSON/error pattern as the proven embeddings adapter. Model selectable via env (`GEMINI_SUMMARY_MODEL`, default `gemini-2.0-flash`), independent of the embedding model env.
- **Implications**: No new dependency; a sibling adapter file plus a null/absent provider path when the key is blank reproduces the established degradation behavior (13.5). Provider errors must degrade to "unavailable", never fail the form.

### Summary suggestion cache
- **Context**: Requirement 13.2 — cache keyed by blob SHA so unchanged content is not resubmitted.
- **Sources Consulted**: `apps/api/src/infrastructure/persistence/sqlite.ts`, `container.ts` (same-file, separate-connection comment).
- **Findings**: `embedding_cache` precedent: `CREATE TABLE IF NOT EXISTS`, `INSERT OR REPLACE`, primary key `blob_sha`, one `better-sqlite3` connection per store class, same `config.sqlitePath` file.
- **Implications**: `summary_cache(blob_sha TEXT PRIMARY KEY, summary TEXT NOT NULL)` as a sibling store class; cache is a reproducible projection (safe to delete), never authoritative — matches the embedding cache's operational contract. Lazy fill on first request; no reindex integration required by the requirements.

### Raw Markdown for Technical view
- **Context**: Requirement 7.2 displays raw Markdown + file path; no endpoint serves raw content today.
- **Sources Consulted**: `apps/api/src/routes/adrs.ts`, `packages/core/src/ports/git.ts` (GitPort has `read(path)`).
- **Findings**: `GET /api/adrs/:id` returns the structured `Adr` only. The git adapter can read the exact on-disk file.
- **Implications**: Additive `GET /api/adrs/:id/raw` returning the true file bytes (not a re-serialization) is both simpler and more honest for a "technical view" — what engineers see is what's in git.

### E2E coupling to the removed shell
- **Context**: Requirement 16.4 preserves the offline run lifecycle; Requirement 15.1 removes the navigation the current specs drive.
- **Sources Consulted**: `apps/e2e/tests/*.spec.ts` inventory, `harness/globalSetup.ts`, `playwright.config.ts`.
- **Findings**: `design-system.spec.ts` asserts aspect-switcher presence/absence, Cmd-K palette focus, context header, inspector previews; `search.spec.ts` drives the palette; `adr-lifecycle`/`tree`/`similarity`/`migrated-fixture-*` navigate via explorer/aspects. Harness (seedRepo, offline mode detection, helpers) is navigation-agnostic.
- **Implications**: All journey specs must be migrated to drive the portal navigation; the harness, config, runners, and offline-mode gating stay untouched. A new `decision-feed.spec.ts` carries the portal-specific and vocabulary assertions (16.1-16.2).

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| New additive read endpoints (`/api/feed`, `/:id/raw`, `/:id/summary-suggestion`) | Server assembles card DTOs and suggestions; existing contracts untouched | No N+1; summary resolution near the cache; existing contracts byte-identical (15.3); mirrors existing route/service/container pattern | Three new routes + one core service to maintain | **Selected** |
| Client-side assembly over existing endpoints | Web fetches tree, then `GET /api/adrs/:id` per ADR; derives descriptions locally | Zero backend change | N+1 on every Home load; suggestion cache still needs a server endpoint anyway; duplicate resolution logic paths | Rejected |
| Extend `GET /api/tree` response with card fields | Additive fields on `AdrSummary` | One endpoint | Alters an existing contract's response shape beyond the summary-related surface 15.3 permits; couples tree consumers to feed needs | Rejected |
| Suggestion service in `apps/api` only (no core service) | Route-level logic calling provider + store directly | Fewer files | Breaks the established core-service/port + api-adapter layering every other capability follows | Rejected |

## Design Decisions

### Decision: Short-description resolution as a pure shared module
- **Context**: Requirements 11.2 and 12.1-12.5 define display resolution (author `summary` wins, else deterministic derivation); Requirement 10 needs the identical result client-side for the live preview.
- **Alternatives Considered**:
  1. Server-only derivation; preview calls the API on every keystroke — chatty, needs debounce, still wrong for unsaved edits.
  2. Duplicate logic in web and api — guaranteed drift.
  3. Pure functions in `packages/shared` consumed by both — one implementation, no runtime deps.
- **Selected Approach**: `packages/shared/src/summary/derive.ts` — `resolveShortDescription(input, ctx)` implementing layer 1 > layer 2, with a caller-supplied `resolveTitle(id)` context for relation-based derivations. `packages/core`'s FeedService and the web preview/article both call it.
- **Rationale**: `@adr/shared` is the existing browser+node-safe layer; derivation is pure string/domain logic (12.5 mandates no network).
- **Trade-offs**: A minimal option-title extractor lives in shared while the editor's richer `options.ts` parser stays in web; acceptable because derivation needs only titles.
- **Follow-up**: Unit-test the four derivation branches (12.1-12.4) and the canonical-outcome pattern parse against fixture ADRs.

### Decision: Plain-language vocabulary as data in `packages/shared`
- **Context**: Requirement 1 maps statuses/relations/people roles to fixed labels used across every page, in derivation phrasing, and asserted by E2E (16.2).
- **Selected Approach**: `packages/shared/src/vocabulary.ts` exporting `STATUS_LABELS`, directional `RELATION_LABELS`, and `PEOPLE_LABELS` as `Record` constants; UI components and `derive.ts` consume the same tables. Stored values remain canonical everywhere below the presentation layer (1.6 — Technical view shows them verbatim).
- **Rationale**: Single source of truth; E2E can assert exact strings; no i18n machinery is warranted by requirements.
- **Trade-offs**: Labels are compile-time constants, not configurable — matches scope.

### Decision: AI suggestion is form-only; feed display never blocks on AI
- **Context**: Requirement 13 scopes the Gemini output to a labeled suggestion in the form, copied to `summary` frontmatter only on explicit acceptance (13.3); Requirements 11-12 define display as summary > deterministic.
- **Selected Approach**: `GET /api/adrs/:id/summary-suggestion` returns a discriminated body `{available:true, suggestion} | {available:false, reason}`; the feed/article never call it. Accepted suggestions become ordinary layer-1 frontmatter via the normal save flow.
- **Rationale**: Keeps the feed fully offline-deterministic (16.3), keeps git authoritative, and makes AI an enhancement with a single integration point.
- **Trade-offs**: Feed cards never show unaccepted AI polish — intentional per approved requirements (narrower than the proposal's optional layer-3 display).

### Decision: View state as a discriminated union in a rebuilt Zustand store
- **Context**: Portal has real page-like destinations (Home, Topics, People, article, compose) but 15.5 forbids a client-side router.
- **Selected Approach**: Replace `workspaceStore.ts` with `portalStore.ts`: `view: {kind:"home"} | {kind:"topics"} | {kind:"topic"; path} | {kind:"people"} | {kind:"person"; name} | {kind:"decision"; id; technical:boolean} | {kind:"compose"; id?}` plus `authorName`. `App.tsx` switches on `view.kind`.
- **Rationale**: Same pattern the codebase already uses (Zustand view-state, App-level switch), extended from flat fields to a union that makes illegal states unrepresentable.
- **Trade-offs**: No URL deep-linking — unchanged from today's behavior; out of requirements scope.

### Decision: True raw file content for Technical view
- **Context**: 7.2 requires raw Markdown + path.
- **Selected Approach**: `GET /api/adrs/:id/raw` reads the file via the existing git adapter and returns `{path, markdown}` — the bytes in git, not a re-serialization.
- **Rationale**: Honesty of the escape hatch; avoids exposing `serializeAdr` output as if it were the stored file.

## Risks & Mitigations
- **E2E migration breadth** — every journey spec touches removed navigation. Mitigation: migrate spec-by-spec against the stable harness; new portal `data-testid` hooks defined up front in the design.
- **Derivation quality on messy ADRs** (hand-written outcomes not matching the canonical pattern) — Mitigation: explicit fallbacks per 12.1/12.4 (first sentence of outcome, then of context); unit tests over the existing fixture corpus.
- **Gemini generateContent quota/latency in the form** — Mitigation: suggestion fetched on demand (explicit control, not per keystroke), cached by blobSha, `available:false` degradation; UI never blocks on it.
- **Vocabulary drift between UI and E2E assertions** — Mitigation: both import label constants from `@adr/shared` (web) / assert literal strings sourced from the same table (e2e).
- **Feed endpoint cost on large repos** (full scan + parse per request) — Accepted: identical cost profile to the existing `GET /api/tree`; no new regression. Revisit only if repo scale changes.

## References
- `docs/proposals/ux-navigation-redesign/README.md` — approved Concept A + form/summary follow-up (product-owner direction, 2026-07-03)
- `docs/proposals/ux-navigation-redesign/concept-a-decision-feed.html`, `concept-a-decision-form.html` — layout mockups
- `apps/api/src/infrastructure/embeddings/gemini.ts`, `.../persistence/sqlite.ts` — integration + cache precedent patterns
- `packages/core/src/adr/parse.ts` — frontmatter round-trip behavior
- `.kiro/specs/adr-manager-contextual-shell/` — predecessor spec whose navigation this feature replaces
