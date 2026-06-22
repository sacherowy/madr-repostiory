# Brief: adr-manager-frontend-redesign

## Problem
The ADR Manager web app (`apps/web`) is functionally complete but visually a bare
skeleton. `App.tsx` renders a single 720px column with one inline `system-ui`
style; the eleven feature components (`adr-editor`, `folder-tree`,
`relations-graph`, `history-timeline`, `diff-viewer` ×3, `search`,
`similarity-panel`) contain **zero** styling and consume **none** of the design
tokens. Panel tabs show raw state keys ("editor", "relations", …), there are no
status badges, relation chips, ADR cards, diff coloring, or empty/loading
states. The result is hard to scan and does not communicate the product's intent.
Users (engineers authoring/browsing ADRs) cannot tell decisions, statuses, and
relationships apart at a glance.

## Current State
- `docs/design.md` defines the canonical "morski" / teal visual design system
  (color tokens, typography, spacing, shape, component specs, UI voice, a11y bar).
- `apps/web/src/styles/tokens.css` already exposes the design tokens as CSS custom
  properties, and `apps/web/index.html` already loads the three Google Fonts
  (Bricolage Grotesque, Hanken Grotesk, JetBrains Mono).
- **Gap**: nothing actually consumes those tokens. `grep var(--` across
  `apps/web/src/features` and `App.tsx` returns no matches. The design system was
  wired (adr-manager task 1.5) but never applied to any component.
- The `adr-manager` spec marks its frontend tasks 5.1–5.8 "complete" and its
  design.md `## UI Design System` section already maps `docs/design.md` to
  specific components — i.e. this redesign delivers work that spec claimed but
  did not realize.

## Desired Outcome
A clear, user-friendly ADR Manager UI that faithfully applies `docs/design.md`:
- A real app shell — sidebar (folder/ADR tree + author identity) plus a workspace
  with labeled, accessible tabs — instead of a flat single column.
- Domain-meaningful visuals: ADR cards with accent bar + ID chip + status badge,
  status badges in the four-status colors, monospace relation chips with colored
  markers, diff add/del coloring, teal-gradient similarity meter, monospace
  ID/SHA chips.
- Considered states: empty, loading, and error states using the design system's
  voice and the reserved `--danger` tokens for errors/conflicts only.
- Responsive layout (down to mobile) and the design's accessibility bar: visible
  keyboard focus, `prefers-reduced-motion` respected, WCAG AA text contrast.

## Approach
**Plain CSS layer, zero new dependencies** (recommended). Build on the existing
`tokens.css` with a small global stylesheet (app shell, layout primitives,
shared component classes — buttons, fields, badges, chips, cards) plus
co-located component styles (CSS or Vite-native CSS Modules) consumed via
`className`. Restructure `App.tsx` into a responsive sidebar+workspace shell with
labeled tabs. This honors the adr-manager design's explicit "no CSS framework /
no new dependency" commitment and reuses the already-delivered token layer.

Alternatives considered: (a) Tailwind or a component library — fastest to polish
but violates the no-new-dependency boundary and duplicates the token system;
(b) inline styles only — no scoping, poor reuse, hard to maintain a11y/responsive
rules. Final CSS-organization detail (single global sheet vs. CSS Modules per
feature) is settled in the design phase. No unfamiliar technology is introduced,
so no separate viability check is required.

## Scope
- **In**: Visual + UX/layout overhaul of `apps/web` — app-shell restructure,
  responsive layout, labeled accessible tabs, ADR cards, status badges, relation
  chips, monospace ID/SHA chips, diff coloring, similarity meter, empty/loading/
  error states, and the accessibility bar — all driven by `docs/design.md` tokens
  and component specs. Updating component tests to remain green under the new
  markup (preserving existing `data-testid` and roles/contracts).
- **Out**: Any backend/API/domain change (`apps/api`, `packages/*`); new product
  features or routes; changing API contracts or `data-testid` hooks relied on by
  tests/E2E; editing `docs/design.md` itself; introducing a CSS framework,
  component library, or client-side router.

## Boundary Candidates
- Global/foundation layer: base stylesheet + shared component classes (buttons,
  fields, badges, chips, cards) built on `tokens.css`.
- App shell & navigation: responsive sidebar + workspace + labeled tab control in
  `App.tsx`.
- Per-feature presentation: restyling each `features/*` component to the design
  system (editor, tree, relations, history, diff/compare ×3, search, similarity).
- States & accessibility: empty/loading/error patterns, focus visibility,
  reduced-motion, WCAG AA contrast — applied across the above.

## Out of Boundary
- ADR domain logic, persistence, embeddings, git access, and all backend routes.
- The contents/authority of `docs/design.md` (consumed, not modified).
- The `playwright-e2e` spec's harness/test design (this work must keep its
  selectors and screenshots meaningful, but does not redefine that spec).

## Upstream / Downstream
- **Upstream**: `docs/design.md` (canonical design), `apps/web/src/styles/tokens.css`
  (token delivery), the existing `apps/web` feature components and `ApiClient`,
  and the `adr-manager` spec which owns the underlying frontend.
- **Downstream**: `playwright-e2e` (key-state screenshots and `data-testid`-based
  flows must continue to pass); future ADR Manager UI features build on the new
  shell and component classes.

## Existing Spec Touchpoints
- **Extends**: `adr-manager` — realizes the visual design its `## UI Design System`
  section specified but left unapplied. This spec must not contradict adr-manager's
  requirements/contracts; it only changes presentation.
- **Adjacent**: `playwright-e2e` — keep its selectors/roles and screenshot-worthy
  states intact; do not absorb or redefine its scope.

## Constraints
- No new runtime dependency; no CSS framework, component library, or router
  (consistent with adr-manager design + research.md "no frontend router").
- Preserve existing `data-testid` attributes, ARIA roles, and API contracts so
  component tests and Playwright E2E keep passing.
- UI copy follows `docs/design.md` voice (declarative, user-perspective, no
  apology in errors); Polish-language UI strings already present are preserved.
- `--danger` red reserved strictly for errors/irreversible actions.
- Accessibility bar is a quality gate, not optional: visible focus, reduced-motion,
  WCAG AA contrast, mobile responsiveness.
