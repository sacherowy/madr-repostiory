# Research & Design Decisions

## Summary
- **Feature**: `adr-manager-contextual-shell`
- **Discovery Scope**: Extension (light discovery) — re-architects the `apps/web`
  presentation/navigation layer; reuses every feature panel, primitive, palette
  token, and backend contract unchanged.
- **Key Findings**:
  - `App.tsx` already owns all view-state (`selectedFolder`, `selectedAdrId`,
    `activePanel`, `authorName`) and mounts one feature panel at a time behind a
    `PANEL_TABS`/`PANEL_LABELS` bar. The contextual shell is a restructure of this
    single file plus new sibling components; the panels themselves are untouched.
  - Every feature panel is a pure, prop-driven consumer of `ApiClient`
    (`AdrEditor`, `RelationsPanel{apiClient,adrId}`, `HistoryTimeline{apiClient,adrId}`,
    `SimilarityPanel{apiClient,adrId,folder}`, `CompareLauncher{apiClient}`,
    `FolderTree{apiClient,authorName,onSelectFolder,onSelectAdr}`,
    `SearchPanel{apiClient,onSelectAdr}`). They can be re-parented and re-composed
    without behavior change.
  - The design system is CSS-token driven (`tokens.css` → `base.css` →
    `app-shell.css`, imported in that order in `main.tsx`). Depth can be added as an
    additive token block + a last-imported `soft-ui.css` that refines existing
    component classes via the cascade, without re-valuing any existing token.
  - The offline E2E design oracle (`design-system.spec.ts`) asserts the design
    contract via computed styles against the literal `tokens.css` values, with no
    pixel-baseline snapshot. The same technique extends to the new navigation and
    depth assertions and stays offline.
  - Per explicit user direction, the no-new-dependency rule is relaxed for state
    management only: **Zustand** (UI/view state) + **TanStack Query** (server state) are
    adopted; Req 10.3 and the brief are amended accordingly. No other dependency is added.

## Research Log

### Existing navigation & state machine
- **Context**: How much of `App.tsx` must change to make navigation contextual?
- **Sources Consulted**: `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`,
  `apps/web/src/styles/app-shell.css`.
- **Findings**: The tab bar is rendered unconditionally from `PANEL_TABS`; four of
  five panels gate on `selectedAdrId` and fall back to `panel-empty`. `comparison`
  is deliberately reachable with no selection (it owns its own id entry). Tab
  controls carry `data-testid="panel-tab-<key>"`, `role="tab"`, `aria-selected`,
  `aria-current`.
- **Implications**: `activePanel` becomes `activeAspect` over the four ADR-scoped
  views; `comparison` leaves the aspect set and becomes an action surfaced in the
  command bar/header. The empty fallback is replaced by a center browse/create
  state shown when nothing is selected; the aspect switcher is hidden entirely with
  no selection.

### Reusing search inside the command palette
- **Context**: The brief folds keyword search into the Cmd-K palette.
- **Sources Consulted**: `SearchPanel.tsx`, `apps/e2e/tests/search.spec.ts`.
- **Findings**: `SearchPanel` is already a self-contained `{apiClient, onSelectAdr}`
  component preserving `search-query-input`, `search-submit-button`,
  `search-results`, `search-result-<id>`. The E2E search journey targets those
  hooks.
- **Implications**: The palette **mounts `SearchPanel` verbatim** rather than
  re-implementing search. This satisfies "folds in the existing keyword search"
  with zero behavior change and preserves the search hooks; the E2E search journey
  only needs to open the palette first (an affected-query update under Req 11.3).

### Tree View 2.0 over FolderTree
- **Context**: Add filter, breadcrumb, status dots, raised selection, hover-revealed
  move affordances while "reusing FolderTree behavior."
- **Sources Consulted**: `FolderTree.tsx`, `apps/e2e/tests/tree.spec.ts`.
- **Findings**: `FolderTree` owns tree fetch, folder create, ADR move, and the
  `folder-node-*`/`adr-node-*`/`folder-select-*`/`adr-select-*`/`move-*` hooks. Move
  controls are always in the DOM. Status is already available per ADR node.
- **Implications**: Wrap `FolderTree` in an `ExplorerRail` that owns the filter input
  and breadcrumb (presentation-only state), and extend `FolderTree` with **optional**
  props (`filter`, `selectedAdrId`) plus a status dot and CSS hooks. Hover-reveal is
  pure CSS (controls stay in the DOM, so move hooks remain reachable for tests).
  Defaults preserve current behavior, so `FolderTree.test.tsx` and `tree.spec.ts`
  remain green.

### Aspect counts
- **Context**: Req 2.4 wants live counts on aspect controls "where available."
- **Findings**: Counts derive from `getRelations(id).relations.length`,
  `getHistory(id).history.length`, and `getSimilar(id, scope).results.length`. Edit
  has no count.
- **Implications**: A read-only `useAspectCounts(apiClient, adrId, folder)` hook
  fetches counts when an ADR is selected. It is additive and never blocks panel
  rendering; counts render only when resolved (the "where available" wording makes
  absence acceptable, e.g. offline similarity returning empty).

### Offline similarity in the inspector
- **Context**: The inspector's top-Similar preview calls `getSimilar`.
- **Sources Consulted**: `SimilarityPanel.tsx`, `CLAUDE.md` (offline E2E notes).
- **Findings**: The E2E suite runs offline; only the *real-embedding* similarity
  variant skips without a live key. `getSimilar` resolves offline (possibly to
  `emptyScope`).
- **Implications**: The inspector Similar preview must render an empty/loading state
  gracefully offline. E2E assertions target the preview **containers** and behavior
  (collapse/expand, links into aspects), not specific similarity results.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Zustand store + TanStack Query (chosen) | UI/view state in a Zustand store; server-derived state (counts, previews) via TanStack Query | Removes the multi-flag `useState` smell; decouples deep zones from prop-drilling; caching/dedupe retires the counts-vs-panel double-fetch | Adds two dependencies (deliberately permitted via amended Req 10.3); small learning surface | Chosen after explicit user direction to adopt a state library |
| Container-owned view-state (initial) | `App.tsx` keeps all view-state in `useState`; prop-driven children | No new dependency; mirrors the existing tested pattern | Multi-flag state smell; prop-drilling to palette/inspector; manual fetch/cache | Superseded by the decision below |
| Redux Toolkit / XState | Global store + middleware / explicit FSM | Powerful for large or highly stateful apps | Boilerplate (Redux) or concept cost (XState) disproportionate to a 3-state, ~7-field machine | Rejected (over-engineering) |
| Client-side router | Encode aspect/selection in the URL | Deep-linkable | Rewrites navigation; explicitly out of scope | Rejected (no router) |

## Design Decisions

### Decision: Adopt Zustand (UI state) + TanStack Query (server state)
- **Context**: The initial design kept all state in `App.tsx` `useState` under a strict
  no-new-dependency rule (original Req 10.3). On review, the user directed the design to
  adopt a state-management library; after a full comparison (Zustand, TanStack Query,
  XState, Redux Toolkit, Jotai), the recommended pairing was selected.
- **Alternatives Considered**:
  1. Keep zero-dependency `useState`/`useReducer` — defensible at this size but leaves the
     multi-flag smell, prop-drilling, and manual server-state handling.
  2. Single UI store only (Zustand) — addresses view-state but not the dominant problem
     (the `ApiClient` fetches).
  3. XState / Redux Toolkit — over-engineering for a 3-state, ~7-field machine.
- **Selected Approach**: **Zustand** holds cross-zone view-state (`workspaceStore`);
  **TanStack Query** owns the server-derived state this feature introduces (aspect counts
  via `useAspectCounts`, inspector previews via `useInspectorPreviews`) behind a root
  `QueryClientProvider`. Keyword search stays on the reused, out-of-boundary `SearchPanel`.
- **Rationale**: Most of the feature's "state" is fetched data; TanStack Query is the
  high-value half (caching/dedupe retires the counts-vs-panel double-fetch risk). Zustand
  is a ~1kb, provider-free store that removes prop-drilling into the palette/inspector.
- **Trade-offs**: Two new dependencies (requires amending Req 10.3 + the brief, done);
  query-consuming tests need a `QueryClientProvider` wrapper and the store needs a `reset`
  test hook.
- **Follow-up**: Confirm `@tanstack/react-query`/`zustand` v5 install cleanly under pnpm 9
  with React 18.3 during the foundation task; verify offline E2E remains green.

### Decision: Comparison as a command-bar/header action, not an aspect
- **Context**: Req 2.5, 3.4, 11.2 — Comparison must leave the per-ADR aspect set but
  stay reachable, including without a selection.
- **Alternatives Considered**:
  1. Keep Comparison as a fifth aspect tab — contradicts the contextual model and the
     "appears only when an ADR is selected" rule.
  2. Comparison as a routed destination — out of scope (no router).
- **Selected Approach**: A persistent **command bar** exposes a "Compare" action
  (always reachable) that opens a comparison overlay rendering `CompareLauncher`
  unchanged; the **context header** adds an ADR-scoped Compare action when an ADR is
  selected. The legacy `panel-tab-comparison` hook is **relocated onto the command-bar
  Compare action**, and the overlay container keeps `data-testid="panel-comparison"`.
- **Rationale**: Preserves "comparison reachable with no selection," reuses
  `CompareLauncher` and all its hooks verbatim, and keeps the App component test's
  `panel-tab-comparison → panel-comparison → compare-version-adr-id-input` flow with
  minimal query change.
- **Trade-offs**: An overlay introduces focus-management responsibility (handled by
  the dialog pattern in Req 9.2).

### Decision: Command palette reuses SearchPanel; sidebar search folds in
- **Context**: Req 4.1–4.6 — one keyboard-driven palette for search, jump, actions.
- **Selected Approach**: `CommandPalette` is a dialog opened by Cmd/Ctrl-K that mounts
  the existing `SearchPanel` (for search + jump) plus action buttons (New ADR, Compare,
  Focus search). `SearchPanel` is **removed from the sidebar** and rendered only inside
  the palette ("folds in the existing keyword search").
- **Rationale**: Zero search-behavior change; preserves all `search-*` hooks; satisfies
  the fold-in requirement literally.
- **Trade-offs**: The E2E search journey must open the palette before searching
  (affected-query update, Req 11.3).

### Decision: Additive depth via new tokens + last-imported soft-ui.css
- **Context**: Req 7.1–7.4 — Soft UI depth without altering palette/typography/primitive
  values, preserving WCAG AA and visible focus.
- **Selected Approach**: Append an **additive** depth/glass token block to `tokens.css`
  (new custom properties only; no existing token re-valued) and add
  `apps/web/src/styles/soft-ui.css`, imported **after** `base.css`/`app-shell.css` in
  `main.tsx`, to refine `.field` (recessed), `.btn--primary`/`:active` (raised +
  pressed), `.card` (layered), and `.command-bar`/`.aspect-switcher` (frosted glass).
- **Rationale**: The cascade lets refinements win without editing base rules; the layer
  is isolated and removable. Depth uses shadow/gradient/glass only — never lowered text
  contrast (avoids the neumorphism accessibility trap). `prefers-reduced-motion` already
  has a hook in `base.css` and is extended for new transitions.
- **Trade-offs**: Refinement rules must be specific enough to win the cascade without
  `!important`.

## Risks & Mitigations
- **New-dependency footprint** — Limit additions to exactly `@tanstack/react-query` and
  `zustand` in `apps/web`; verify install under pnpm 9 / React 18.3 and that the offline
  E2E + web vitest suites stay green in the foundation task.
- **Test churn from hook migration** — Confine changes to the deliberately relocated
  hooks (`panel-tab-*` → aspect controls; `panel-tab-comparison` → Compare action) and
  update only the affected queries; leave all other hooks intact (Req 11.3).
- **Neumorphism contrast trap** — Add depth only via shadow/gradient/glass; keep text
  and focus tokens unchanged; the E2E oracle asserts a visible focus indicator persists
  (Req 7.4, 9.1, 12.2).
- **Offline similarity flakiness in the inspector** — Render graceful empty/loading
  states; E2E asserts containers/behavior, not result counts.
- **`App.tsx` growth** — Extract `ContextHeader`, `AspectSwitcher`, `ExplorerRail`,
  `CommandPalette`, `InspectorRail` into their own files with prop-only contracts to
  keep seams parallel-safe.

## References
- `apps/web/src/App.tsx`, `apps/web/src/styles/{tokens,base,app-shell}.css`
- `apps/e2e/tests/design-system.spec.ts` — offline computed-style design oracle
- `.kiro/specs/adr-manager-frontend-redesign/{requirements,design}.md` — upstream
  design system and primitives this spec builds on
- `CLAUDE.md` — offline E2E and pre-provisioned Chromium constraints
