# Research & Design Decisions

## Summary
- **Feature**: `adr-manager`
- **Discovery Scope**: Extension (existing hexagonal scaffold; no new architecture introduced)
- **Key Findings**:
  - The repository already has a working hexagonal skeleton (`GitPort`, `EmbeddingProvider`, `EmbeddingStore`, `SearchIndex` in `packages/core`, with `SimpleGitAdapter`, `SqliteEmbeddingStore`, Gemini/Fake providers already implemented in `apps/api/src/infrastructure`). The design only needs to add use-case services on top of these ports and two new port methods (`listTreeEntries`, `move`) — no new architectural layer or pattern is required.
  - `better-sqlite3`'s bundled SQLite already compiles FTS5, so full-text search (Requirement 9) can be implemented with a new `SqliteSearchIndex` adapter against the existing `SearchIndex` port instead of adding a search library.
  - The existing `EmbeddingStore` cache is keyed by git blob SHA. Because a content edit always produces a new blob SHA, similarity results automatically miss the stale cache entry and recompute — Requirement 10.4 ("similarity results must reflect updated content") is satisfied by the existing cache key design with no new invalidation logic.

## Research Log

### Existing scaffold inventory
- **Context**: Before designing new components, confirm what already exists so the design extends rather than duplicates.
- **Sources Consulted**: `packages/core/src/**`, `apps/api/src/**`, `apps/web/src/App.tsx`, `README.md`, `package.json` files across the workspace.
- **Findings**:
  - Ports (`GitPort`, `EmbeddingProvider`, `EmbeddingStore`, `SearchIndex`) are defined but `SearchIndex` has no adapter yet.
  - `GitPort` lacks tree listing and move/rename operations needed for folder browsing (Req 4) and moving ADRs between folders (Req 3.2).
  - `apps/web/src/App.tsx` already names the intended feature folders in a comment: `adr-editor`, `folder-tree`, `relations-graph`, `history-timeline`, `diff-viewer`, `similarity-panel`, `search`. The design's File Structure Plan follows this naming exactly.
  - `apps/api/src/server.ts` has a TODO listing planned route modules (`adr, relations, folders, history, compare, similarity, search`), confirming the route boundaries anticipated by the original scaffold author.
- **Implications**: Treat this as a light-discovery extension. Reuse all existing ports/adapters; add only the services, one new adapter (`SqliteSearchIndex`), two `GitPort` method additions, and route/UI modules matching the scaffold's own naming.

### Full-text search implementation choice
- **Context**: Requirement 9 needs ranked keyword search across title, tags, and body.
- **Sources Consulted**: `better-sqlite3` dependency already in `apps/api/package.json` (`^11.3.0`), which vendors a modern SQLite build with FTS5 compiled in by default.
- **Findings**: An FTS5 virtual table provides ranked matching (`bm25()`) without any new dependency.
- **Implications**: Add `SqliteSearchIndex implements SearchIndex` using an `adr_fts` virtual table, mirroring the existing `SqliteEmbeddingStore` adapter pattern.

### Relations and folder tree: persisted projection vs. live computation
- **Context**: Requirement 4 (tree) and Requirement 5.3 (reverse relations) both need data assembled from across the whole ADR set, not just a single file.
- **Findings**: Folder structure and relations are already fully present in git (paths and frontmatter). Persisting them into SQLite would create a second authoritative-feeling copy that risks drifting from git, which conflicts with Requirement 11.1 (git is the sole authoritative source for relations/structure).
- **Implications**: `FolderService.buildTree` and `RelationGraphService.relationsFor` recompute from `GitPort.listTreeEntries` / `listAdrFiles` on every request. This is simpler, always consistent, and matches the project's stated scaling path (see Risks).

### Move semantics in simple-git
- **Findings**: `simple-git` exposes `.mv(from, to)`, and `git log --follow <path>` preserves history across renames/moves. Neither capability is wired into `GitPort` yet.
- **Implications**: Add `GitPort.move(fromPath, toPath, message, author): Promise<CommitMeta>` backed by `.mv()` + commit, and change `SimpleGitAdapter.log()` to pass `--follow` so Requirement 3.2 ("preserving ... history") holds after a move.

### Frontend navigation approach
- **Findings**: No requirement calls for deep-linking or browser back/forward semantics; `apps/web/package.json` has no router dependency today.
- **Implications**: Use a local view-state object in `App.tsx` (selected folder / selected ADR / active panel) instead of adding `react-router`, keeping the dependency set unchanged.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|----------------------|-------|
| Hexagonal (continue existing) | Core use-case services depend only on port interfaces; adapters in `apps/api/src/infrastructure` | Already in place, testable core via fakes, matches README's stated architecture | None material — this is an extension, not a new build | Selected; no alternative seriously evaluated since the codebase already mandates this pattern |
| Layered MVC inside `apps/api` only | Put use-case logic directly in route handlers | Less indirection for a small feature | Would scatter business rules (reciprocity, concurrency check) into HTTP-layer code, harder to unit test without a server, contradicts existing `packages/core` zero-I/O boundary | Rejected |

## Design Decisions

### Decision: Reuse SQLite FTS5 for full-text search instead of a new library
- **Context**: Requirement 9 needs ranked keyword search.
- **Alternatives Considered**:
  1. Add a dedicated search library (e.g., MiniSearch/Lunr) in `packages/core`.
  2. Use SQLite's built-in FTS5 virtual table via the already-present `better-sqlite3`.
- **Selected Approach**: Option 2 — `SqliteSearchIndex implements SearchIndex` using an FTS5 `adr_fts` virtual table with `bm25()` ranking.
- **Rationale**: No new dependency; consistent with the existing `SqliteEmbeddingStore` adapter pattern; FTS5 is already compiled into the bundled SQLite binary.
- **Trade-offs**: FTS5 ranking is simpler than a dedicated library's tokenizer/stemming options, but sufficient for the stated requirement (rank by closeness of match).
- **Follow-up**: Confirm the prebuilt `better-sqlite3` binary used in CI/deploy includes FTS5 (standard for the published binaries; verify during implementation if a custom build is ever introduced).

### Decision: Compute folder tree and reverse relations live from git, not as a persisted projection
- **Context**: Requirements 4 and 5.3 need cross-ADR data assembled at read time.
- **Alternatives Considered**:
  1. Persist a tree/relations table in SQLite, updated on every save.
  2. Recompute from `GitPort` on every request.
- **Selected Approach**: Option 2.
- **Rationale**: Keeps git as the single authoritative source (Requirement 11.1) with zero risk of the projection drifting; avoids a second write path that would need its own consistency handling alongside the write queue.
- **Trade-offs**: A request-time `git ls-tree` + parse of every ADR file scales linearly with repository size; acceptable at the scale implied by this spec (folder-subtree browsing tool), revisited if the corpus grows per the README's stated PostgreSQL+pgvector scaling path.
- **Follow-up**: If profiling later shows this is too slow, introduce a persisted, git-derived projection — that would be a revalidation trigger for this design.

### Decision: Represent empty folders with a `.gitkeep` placeholder file
- **Context**: Requirement 3.1 requires creating a folder; git does not track empty directories.
- **Alternatives Considered**:
  1. Track folders in a separate SQLite/metadata table.
  2. Write a `.gitkeep` file into the new directory and commit it via the existing `GitPort.writeAndCommit`.
- **Selected Approach**: Option 2.
- **Rationale**: Standard git convention; reuses an existing port method with no new contract; keeps folder existence as a git-visible, authoritative fact.
- **Trade-offs**: `.gitkeep` files must be filtered out of ADR listings (already true — `listAdrFiles` filters to `.md`) and out of folder content counts.

### Decision: Eagerly upsert the FTS5 index on save; keep the embedding cache lazy
- **Context**: Requirement 9 should reflect edits promptly; Requirement 10.4 already self-resolves via blob-SHA cache keys (see Key Findings).
- **Alternatives Considered**:
  1. Only refresh both projections via the `pnpm reindex` script.
  2. Synchronously upsert the FTS5 document inside `AdrEditingService.save`, leave embeddings to lazy cache-miss recomputation on next similarity request.
- **Selected Approach**: Option 2.
- **Rationale**: FTS5 upsert is cheap (no external API call) and keeps search results fresh immediately after a save, while the more expensive embedding call is deferred to whenever similarity is actually requested for that subtree — avoiding unnecessary Gemini calls on every keystroke-to-save cycle.
- **Trade-offs**: None material; both projections remain fully rebuildable via `pnpm reindex` per Requirement 11.

### Decision: Keep "rebuild" (Requirement 11) as the existing `pnpm reindex` CLI script, extended
- **Context**: Requirement 11.2 says "When an operator triggers a rebuild ... the ADR Manager shall regenerate."
- **Alternatives Considered**:
  1. Add a new HTTP admin endpoint (`POST /api/admin/reindex`).
  2. Extend the existing `apps/api/src/scripts/reindex.ts` CLI script to also populate `SqliteSearchIndex`, and prune index entries for ADRs no longer present.
- **Selected Approach**: Option 2.
- **Rationale**: "Operator" here is an ADR Manager operator (ops role), not an end user through the GUI; the project already exposes this exact capability as `pnpm reindex` (documented in README). Extending it avoids an unauthenticated admin HTTP endpoint, which would be an odd addition given there is no auth model in this iteration.
- **Trade-offs**: Rebuild is not triggerable from the GUI; acceptable since no requirement or boundary statement asks for an in-app rebuild trigger.

### Decision: No frontend router; local view-state object in `App.tsx`
- **Context**: Navigating between tree, editor, history, compare, search, similarity panels.
- **Alternatives Considered**:
  1. Add `react-router`.
  2. Hold `{ selectedFolder, selectedAdrId, activePanel }` in component state in `App.tsx` and pass down as props.
- **Selected Approach**: Option 2.
- **Rationale**: No requirement implies deep-linking/back-button semantics; avoids a new dependency for a need that doesn't exist yet.
- **Trade-offs**: Revisit if a future spec requires shareable URLs into a specific ADR/version/comparison.

### Decision: Adopt the user-supplied visual design system verbatim as `docs/design.md`, wired in as plain CSS custom properties
- **Context**: No visual design system existed in the codebase prior to this round (confirmed: no CSS framework dependency, no token file, no shared component styling). A complete, fully-specified design system ("ADR Manager — System projektowy", teal/"morski" variant) was supplied externally, with color tokens, a three-typeface type system, spacing/shape/shadow scales, component conventions, relation/status color mappings, voice/tone rules, and an accessibility bar, including its own suggested repo location (`docs/design.md`).
- **Alternatives Considered**:
  1. Adopt a CSS/component framework (e.g. Tailwind, MUI, Chakra) and re-derive the supplied palette/type scale as theme overrides.
  2. Store the supplied design system verbatim at `docs/design.md` and wire it into `apps/web` as plain CSS custom properties (`apps/web/src/styles/tokens.css`) plus a Google Fonts `<link>`, with no new npm dependency.
- **Selected Approach**: Option 2.
- **Rationale**: The supplied document is already implementation-ready (a complete `:root{...}` token block and font `<link>` snippet are included verbatim in the source document); a framework would add an abstraction layer and a new dependency for no functional gain, and would risk drifting from the exact hex/spacing values already specified. This is consistent with this design's existing no-new-frontend-dependency stance (see "No frontend router" decision above).
- **Trade-offs**: No component library means each `apps/web/src/features/*` component implements its own markup/styling against the tokens; acceptable given the component set is small and explicitly enumerated in the File Structure Plan.
- **Follow-up**: Verify WCAG AA contrast and `prefers-reduced-motion` handling for each new component during this spec's implementation/testing tasks, per the design system's own "Dostępność (próg jakości)" bar.

## Risks & Mitigations
- Live computation of the folder tree and relation graph re-scans all ADR files on every request — mitigated by the documented PostgreSQL+pgvector scaling path (README "Ścieżka skalowania"); out of scope to pre-optimize for this spec.
- No authentication means any reachable client can write commits as any author name — accepted explicitly by the requirements' Introduction ("Authentication and authorization are not part of this iteration"); not a gap this design introduces.
- `git` must be present on `PATH` and `ADR_REPO_PATH` must already be an initialized repository — pre-existing assumption (README "Adjacent expectations"), unchanged by this design.

## References
- `README.md` — architecture, scaling path (PostgreSQL+pgvector), concurrency model, reindex behavior.
- `.kiro/specs/adr-manager/requirements.md` — approved requirements driving traceability.
