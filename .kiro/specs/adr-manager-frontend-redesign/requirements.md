# Requirements Document

## Project Description (Input)
ADR Manager Frontend Redesign: a visual + UX/layout overhaul of the ADR Manager
web app (`apps/web`).

**Who has the problem**: Engineers who author and browse Architecture Decision
Records through the ADR Manager UI. They cannot tell decisions, statuses, and
relationships apart at a glance.

**Current situation**: The web app is functionally complete but visually a bare
skeleton. `App.tsx` is a single 720px column with one inline `system-ui` style;
the eleven feature components (`adr-editor`, `folder-tree`, `relations-graph`,
`history-timeline`, `diff-viewer` ×3, `search`, `similarity-panel`) carry zero
styling and consume none of the design tokens. The canonical "morski"/teal design
system (`docs/design.md`) and its token layer (`apps/web/src/styles/tokens.css`,
plus the three Google Fonts in `index.html`) are already delivered but unused —
no component references `var(--*)`. The `adr-manager` spec marked its frontend
tasks 5.1–5.8 "complete" and its design.md `## UI Design System` section mapped
`docs/design.md` to specific components, yet that visual work was never applied.

**What should change**: Apply `docs/design.md` across the whole frontend as a
clear, user-friendly redesign — a real app shell (sidebar with folder/ADR tree +
author identity, and a workspace with labeled accessible tabs instead of raw
state-key buttons); domain-meaningful visuals (ADR cards with accent bar + ID
chip + status badge, four-status status badges, monospace relation chips with
colored markers, diff add/del coloring, teal-gradient similarity meter, monospace
ID/SHA chips); considered empty/loading/error states using the design's voice and
the reserved `--danger` tokens for errors/conflicts only; responsive layout to
mobile; and the design's accessibility bar (visible keyboard focus,
`prefers-reduced-motion`, WCAG AA contrast). Add semantic/DOM-level
design-verification assertions to the existing Playwright journeys in `apps/e2e`.

This spec **extends** `adr-manager` (realizing its unapplied UI design) and
`playwright-e2e` (adding DOM-level design checks). Constraints: no new runtime
dependency, no CSS framework / component library / router; preserve existing
`data-testid` attributes, ARIA roles, and API contracts; no pixel-baseline
`toHaveScreenshot` visual regression and no automated `axe-core` suite
(accessibility stays a manual quality gate); `docs/design.md` is consumed, not
modified. See `brief.md` in this spec directory for full discovery context.

## Requirements
<!-- Will be generated in /kiro-spec-requirements phase -->
