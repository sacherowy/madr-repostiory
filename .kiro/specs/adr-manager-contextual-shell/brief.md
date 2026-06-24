# Brief: adr-manager-contextual-shell

## Problem
Engineers using the ADR Manager web app navigate through a static, modal shell: a
fixed sidebar plus a global five-tab workspace bar (Editor · Relations · History ·
Comparison · Similarity). The tabs are always shown even when no ADR is selected, so
four of five dead-end on a "select an ADR first" placeholder. Navigation is
decision-blind — it never reflects *what* the user is looking at — and the form
surfaces, while now on-palette, still read as flat and dated (hairline borders, flat
fills, no depth or tactility). The result is an interface that works but does not feel
modern or guide the user toward the next action.

## Current State
The `adr-manager-frontend-redesign` spec is complete: the morski/teal design system,
five shared primitives (`StatusBadge`, `RelationChip`, `MonoChip`, `SimilarityMeter`,
`AdrCard`), and restyled feature panels are all in place, with a DOM-level E2E design
spec passing in the pre-provisioned Chromium. `App.tsx` owns view-state
(`selectedFolder`, `selectedAdrId`, `activePanel`, `authorName`) and mounts one feature
panel at a time behind a `PANEL_LABELS` tab bar; `FolderTree` + `SearchPanel` live in
the sidebar. The gap is the information architecture and surface depth, not the visual
tokens: the shell is layout-flat and navigation is a global tab strip rather than being
contextual to the selected decision.

## Desired Outcome
The web app presents an object-centric, contextual workspace where the UI reshapes
around the selected ADR, and surfaces carry tactile depth — all on the unchanged teal
palette, typography, primitives, and backend behavior. Specifically:
- A top **command bar (Cmd-K palette)** is the global navigation entry point: search
  ADRs, jump to a decision, and run actions (new / compare / search). It folds in the
  existing keyword search.
- A left **"Tree View 2.0" explorer**: live tree filtering, a path breadcrumb,
  status-dot ADR nodes, a raised selected row, and hover-revealed move affordances —
  reusing `FolderTree` behavior.
- A center **"ADR as object"** region: a context header (id chip + status badge +
  title + meta + inline Edit/Compare actions) plus a **contextual aspect switcher**
  (Edit / Relations / History / Similar, with live counts) that replaces the global tab
  bar and appears only once an ADR is selected; with nothing selected the center shows a
  welcoming browse/create state.
- A right **contextual inspector rail**: live previews (top Similar with meters, Recent
  history) that link into the full aspects, so related context comes to the user.
- A **"Skeuomorphism 2.0 / Soft UI"** surface treatment: additive depth tokens for
  recessed inputs, raised tactile buttons with press states, layered material cards, and
  a frosted-glass shell/tab bar — preserving WCAG AA contrast and visible keyboard focus.

## Approach
Re-architect the presentation/navigation layer of `apps/web` while reusing every
existing feature panel and primitive as-is. The change is **arrangement + navigation +
surface depth**, concentrated in `App.tsx` and the shell stylesheets, plus two genuinely
new components (the Cmd-K command palette and the inspector rail) and an additive depth-
token layer over `tokens.css`/`base.css`/`app-shell.css`. No feature panel's behavior,
data fetching, or API contract changes. The `activePanel` state machine survives; the
tab bar becomes the contextual aspect switcher, and the existing `panel-tab-*` test
hooks migrate onto the aspect controls. This mirrors how `adr-manager-frontend-redesign`
was delivered (additive, contract-preserving, offline-E2E-verified) to keep risk low.

## Scope
- **In**:
  - New shell layout in `App.tsx`: top command bar region, left explorer rail, center
    object region (context header + contextual aspect switcher), right inspector rail.
  - **Tree View 2.0** presentation over `FolderTree` (live filter, breadcrumb, status-dot
    nodes, raised selection, hover move affordances).
  - **Cmd-K command palette** component (search / jump / actions), folding in `SearchPanel`.
  - **Contextual inspector rail** component with Similar + Recent-history previews that
    reuse existing `ApiClient` calls and link into the full aspects.
  - **Soft UI depth layer**: additive depth/elevation/gradient/glass tokens and refined
    `.field`, `.btn--*`, `.card`, `.tab`, sidebar rules in `base.css`/`app-shell.css`.
  - Responsive behavior for the new three-zone layout (rails collapse on small viewports).
  - Extending the DOM-level design E2E spec with assertions for the new navigation
    (context header, aspect switcher, command palette, inspector) and soft-UI depth.
- **Out**:
  - Any change to backend behavior, validation, domain logic, persistence, embeddings,
    git access, or `apps/api` routes/contracts.
  - `packages/*` (`core`, `shared`) changes.
  - Editing `docs/design.md` token *values* (the palette/type stay; only additive depth
    tokens are introduced).
  - New product capabilities or navigation destinations beyond rearranging existing ones.
  - The `apps/e2e` harness/config design (reused unchanged; only spec files added).
  - A client-side router, CSS framework, or component library (plain CSS + existing React).

## Boundary Candidates
- **Soft UI depth-token layer** — additive tokens + refined component rules in
  `base.css`/`app-shell.css` (independent, build-first foundation).
- **Application shell + three-zone layout** — `App.tsx` restructure into command bar +
  explorer + object region + inspector, with the contextual aspect switcher replacing the
  global tab bar.
- **Tree View 2.0** — the explorer presentation over `FolderTree` (filter, breadcrumb,
  status-dot nodes, raised selection).
- **Command palette (Cmd-K)** — new component composing search + jump + actions.
- **Contextual inspector rail** — new component with Similar/History previews.
- **Design-verification E2E** — extend the existing offline design spec for the new nav.

## Out of Boundary
- Backend/API, `packages/*`, `docs/design.md` token values, the `apps/e2e` harness/config.
- Behavior, validation rules, and the existing `data-testid`/ARIA contracts that tests
  depend on (preserve where possible; where the tab→aspect migration moves a hook, migrate
  it deliberately and update only the affected test query).

## Upstream / Downstream
- **Upstream**: `adr-manager` (behavior/contracts), `adr-manager-frontend-redesign`
  (design system, primitives, restyled panels — this spec realizes the next IA layer on
  top of it), `apps/web` `tokens.css`, the existing `ApiClient` and `@adr/shared` types,
  and the `apps/e2e` Playwright harness (pre-provisioned Chromium, offline run).
- **Downstream**: future per-aspect deep-dives (e.g. a richer relations graph view, a
  diff-focused comparison workspace) would consume this shell's contextual slots.

## Existing Spec Touchpoints
- **Extends**: conceptually continues `adr-manager-frontend-redesign` (its primitives and
  restyled panels are reused unchanged), but introduces a new IA/navigation + surface-depth
  boundary, so it is a **new spec** rather than an edit to the completed one.
- **Adjacent**: `playwright-e2e` (adds design/nav assertions to its journey suite without
  changing its lifecycle/selectors/offline-by-default behavior); `adr-manager` (must not
  contradict its behavior or API contracts).

## Constraints
- Plain CSS + existing React 18 / Vite / TypeScript; **no new runtime or dev dependency**,
  no CSS framework, component library, or client-side router.
- Preserve the morski/teal palette, typography, and the five primitives; depth is added via
  shadow/gradient/glass, never by lowering text contrast (avoid the classic neumorphism
  accessibility trap). Maintain WCAG AA contrast and a visible keyboard-focus indicator.
- Preserve existing user-facing behavior, flows, and (where feasible) `data-testid`/ARIA
  hooks; deliberately migrate `panel-tab-*` hooks onto the aspect switcher.
- Validation stays offline: web vitest suite + the Playwright E2E run in the pre-provisioned
  Chromium (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); no new dependency, no pixel-baseline
  snapshot oracle.

## Open Questions (for next-session elaboration)
- **Comparison placement**: should ADR-to-ADR / version comparison become an *action* +
  contextual aspect (as proposed), or remain a permanent top-level destination? (Affects the
  aspect switcher set and the `panel-tab-comparison` hook migration.)
- **Inspector defaults**: which previews appear by default and how many items (Similar top-N,
  history depth), and whether the rail is collapsed by default on first load.
- **Command palette scope**: minimum action set for v1 (jump + search only, vs also new/compare),
  and keyboard-shortcut conventions.
- **Tree vs Miller-columns**: confirm Tree View 2.0 over a Finder-style Miller-columns explorer
  (tree recommended for nested + cross-linked ADRs).
