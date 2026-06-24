# Requirements Document

## Project Description (Input)
Engineers using the ADR Manager web app currently navigate through a static, modal
shell: a fixed sidebar plus a global five-tab workspace bar (Editor · Relations ·
History · Comparison · Similarity) that is always shown even when no ADR is selected,
so four of five tabs dead-end on a "select an ADR first" placeholder. Navigation is
decision-blind — it never reflects what the user is looking at — and the form surfaces,
while on-palette, still read as flat and dated. The interface works but does not feel
modern or guide the user toward the next action.

The `adr-manager-frontend-redesign` spec is complete: the morski/teal design system,
five shared primitives (`StatusBadge`, `RelationChip`, `MonoChip`, `SimilarityMeter`,
`AdrCard`), and restyled feature panels are in place with a passing DOM-level E2E design
spec. `App.tsx` owns view-state (`selectedFolder`, `selectedAdrId`, `activePanel`,
`authorName`) and mounts one feature panel at a time behind a `PANEL_LABELS` tab bar.
The remaining gap is information architecture and surface depth, not the visual tokens.

This feature re-architects the presentation/navigation layer of `apps/web` into an
object-centric, contextual workspace that reshapes around the selected ADR and adds
tactile surface depth — reusing every existing feature panel, primitive, palette,
typography, and backend contract unchanged. Specifically it introduces:
- A top **command bar (Cmd-K palette)** as the global navigation entry point (search,
  jump to a decision, run actions), folding in the existing keyword search.
- A left **"Tree View 2.0" explorer** over `FolderTree`: live tree filtering, a path
  breadcrumb, status-dot ADR nodes, a raised selected row, and hover-revealed move
  affordances.
- A center **"ADR as object"** region: a context header (id chip + status badge + title
  + meta + inline Edit/Compare actions) plus a **contextual aspect switcher** (Edit /
  Relations / History / Similar with live counts) that replaces the global tab bar and
  appears only once an ADR is selected; with nothing selected, a welcoming browse/create
  state.
- A right **contextual inspector rail**: live previews (top Similar with meters, Recent
  history) that link into the full aspects.
- A **"Skeuomorphism 2.0 / Soft UI"** surface treatment: additive depth tokens for
  recessed inputs, raised tactile buttons with press states, layered material cards, and
  a frosted-glass shell/tab bar — preserving WCAG AA contrast and visible keyboard focus.

The change is arrangement + navigation + surface depth, concentrated in `App.tsx` and
the shell stylesheets, plus two new components (the Cmd-K command palette and the
inspector rail) and an additive depth-token layer over `tokens.css`/`base.css`/
`app-shell.css`. No feature panel behavior, data fetching, or API contract changes; the
`activePanel` state machine survives and the `panel-tab-*` test hooks migrate onto the
aspect controls. Constraints: plain CSS + existing React 18 / Vite / TypeScript, no new
runtime or dev dependency, offline validation via the web vitest suite and the
pre-provisioned Chromium Playwright E2E run.

## Requirements
<!-- Will be generated in /kiro-spec-requirements phase -->
