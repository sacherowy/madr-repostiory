# Requirements Document

## Introduction

The ADR Manager web app (`apps/web`) is functionally complete but visually a bare
skeleton: a single narrow column of unstyled HTML where none of the canonical
"morski"/teal design system (`docs/design.md`) is applied. Engineers who author
and browse Architecture Decision Records cannot distinguish decisions, statuses,
and relationships at a glance, and the interface does not communicate the
product's intent.

This feature is a visual and UX/layout overhaul that applies `docs/design.md`
across the entire frontend so the interface is clear and user-friendly: a proper
application shell, domain-meaningful visuals (cards, status badges, relation
chips, machine-identifier chips, diff coloring, similarity meter), considered
empty/loading/error states, responsive layout, and the design system's
accessibility bar. It changes presentation only — no ADR behavior, API contract,
or domain logic changes — and it adds automated checks that the rendered UI honors
the design contract.

The "system" subject for all acceptance criteria below is the **ADR Manager web
app**, except Requirement 13, whose subject is the **ADR Manager end-to-end test
suite**.

## Boundary Context

- **In scope**: Applying `docs/design.md` (color tokens, typography, spacing,
  shape, component specs, UI voice) to every `apps/web` surface — the application
  shell and panel navigation, the ADR editor, folder/ADR tree, relations panel,
  history timeline, version diff and ADR-to-ADR comparison views, keyword search,
  and similarity panel; ADR cards, status badges, relation chips, machine-identifier
  chips, diff visualization, the similarity meter; empty/loading/error states;
  responsive layout; the accessibility bar; and automated DOM-level design
  verification added to the existing end-to-end journeys.
- **Out of scope**: Any change to ADR behavior, validation rules, domain logic,
  persistence, embeddings, git access, or backend API routes/contracts; new
  product features or navigation destinations; changing the existing `data-testid`
  attributes or ARIA roles that tests rely on; editing `docs/design.md` itself;
  pixel-baseline visual-regression snapshot diffing; and an automated accessibility
  audit tool. Accessibility is verified as a manual quality gate.
- **Adjacent expectations**: This feature extends the `adr-manager` spec by
  realizing the visual design that spec specified but never applied; it must not
  contradict that spec's behavior or contracts. It extends the `playwright-e2e`
  spec by adding design-verification assertions to its journey specs; it must
  preserve that suite's existing selectors, run lifecycle, and offline-by-default
  behavior, and must not introduce pixel-baseline snapshot regression.

## Requirements

### Requirement 1: Consistent Visual Foundation
**Objective:** As an engineer using the ADR Manager, I want every screen rendered in the design system's typefaces, colors, spacing, and shapes, so that the interface looks intentional and consistent rather than like raw unstyled HTML.

#### Acceptance Criteria
1. The ADR Manager web app shall render all interface text in the design system's typefaces (display, body, and monospace) defined in `docs/design.md`, with no surface falling back to the browser default sans-serif.
2. The ADR Manager web app shall derive all colors, spacing, corner radii, and shadows of its interface from the design tokens defined in `docs/design.md`.
3. Where an interface element has an equivalent component specification in `docs/design.md` (buttons, fields, badges, chips, cards, diff, similarity meter), the ADR Manager web app shall present that element according to that specification.
4. The ADR Manager web app shall reserve the destructive red color strictly for error states and irreversible actions, and shall not use it for branding, navigation, or non-error emphasis.

### Requirement 2: Application Shell and Panel Navigation
**Objective:** As an engineer, I want a clear application layout with the tree, author identity, and a labeled set of panels, so that I can orient myself and move between editing, relations, history, comparison, and similarity without confusion.

#### Acceptance Criteria
1. The ADR Manager web app shall present a persistent navigation region containing the folder/ADR tree and the session author-name field, alongside a workspace region that displays the active panel.
2. The ADR Manager web app shall present the panel switcher as a set of human-readable, labeled controls rather than raw internal state keys.
3. When a user selects a panel control, the ADR Manager web app shall display the corresponding panel in the workspace and indicate which panel is currently active.
4. While no ADR is selected and the active panel requires one, the ADR Manager web app shall display guidance prompting the user to select an ADR first.

### Requirement 3: ADR Card Presentation
**Objective:** As an engineer scanning ADRs, I want each ADR summarized as a recognizable card, so that I can identify a decision and its status at a glance.

#### Acceptance Criteria
1. Where an ADR is presented as a summary, the ADR Manager web app shall render it as a card showing the ADR identifier, status, and title per the "Karta ADR" component specification in `docs/design.md`.
2. When an ADR card includes typed relations, the ADR Manager web app shall display them as relation chips on the card.
3. Where an ADR card has supporting metadata (such as date, deciders, blob SHA, or a similarity measure), the ADR Manager web app shall present that metadata using the corresponding design-system treatment.

### Requirement 4: ADR Status Badges
**Objective:** As an engineer, I want statuses shown as color-coded badges, so that I can distinguish proposed, accepted, deprecated, and superseded decisions immediately.

#### Acceptance Criteria
1. Where an ADR status is displayed, the ADR Manager web app shall render it as a status badge using the color and background defined for that status (`proposed`, `accepted`, `deprecated`, `superseded`) in `docs/design.md`.
2. The ADR Manager web app shall present each status badge as a colored dot plus a human-readable label.
3. If a status value outside the four defined statuses is encountered, the ADR Manager web app shall present it in a neutral badge treatment rather than an undefined color.

### Requirement 5: Relation Chips
**Objective:** As an engineer reviewing decision relationships, I want each relation rendered as a typed, color-marked chip, so that I can tell supersedes, depends-on, relates-to, and conflicts-with apart.

#### Acceptance Criteria
1. Where a relation is displayed, the ADR Manager web app shall render it as a monospace chip with the colored marker defined for that relation type in the Relations table of `docs/design.md`.
2. The ADR Manager web app shall apply the relation markers consistently in both the read-only relations view and the editor's relation add/remove controls.

### Requirement 6: Machine-Identifier Chips
**Objective:** As an engineer, I want machine identifiers shown in a distinct monospace treatment, so that I can recognize git-derived data such as ADR IDs and blob SHAs.

#### Acceptance Criteria
1. Where an ADR identifier is displayed, the ADR Manager web app shall render it as a monospace chip using the ID treatment in the "Sygnatura" section of `docs/design.md`.
2. Where a blob SHA is displayed, the ADR Manager web app shall render it in the monospace SHA treatment.
3. Where a raw status key is displayed as machine data, the ADR Manager web app shall render it as a neutral monospace chip.

### Requirement 7: Diff and Comparison Visualization
**Objective:** As an engineer comparing versions or ADRs, I want added and removed content visually distinguished, so that I can read what changed without ambiguity.

#### Acceptance Criteria
1. While displaying a version diff, the ADR Manager web app shall visually distinguish added, removed, and unchanged content using the diff add/remove treatment defined in `docs/design.md`.
2. While displaying an ADR-to-ADR comparison, the ADR Manager web app shall visually distinguish fields that differ from fields that are identical.
3. The ADR Manager web app shall present diff line numbers using the design system's subdued surface treatment.

### Requirement 8: Similarity Meter
**Objective:** As an engineer reviewing similarity results, I want each result's score shown as a meter, so that I can compare relative similarity quickly.

#### Acceptance Criteria
1. Where a similarity result is displayed, the ADR Manager web app shall render its score as a teal-gradient meter plus a monospace numeric value per the "Miara podobieństwa" specification in `docs/design.md`.
2. The ADR Manager web app shall present the meter fill in proportion to the result's similarity value.

### Requirement 9: Empty, Loading, and Error States
**Objective:** As an engineer, I want clear feedback while data loads, when nothing is found, and when something goes wrong, so that I always understand the interface's state and how to proceed.

#### Acceptance Criteria
1. While a panel is fetching data, the ADR Manager web app shall display a loading indicator styled per the design system.
2. When a list or search returns no results, the ADR Manager web app shall display an empty state that invites the next action rather than showing a blank area.
3. If an operation fails or a save conflict occurs, the ADR Manager web app shall display the error using the reserved danger treatment and message copy that states what happened and how to recover, following the UI voice rules in `docs/design.md`.
4. The ADR Manager web app shall preserve the existing user-facing message content where current behavior already specifies it (for example, the stale-write conflict recovery message).

### Requirement 10: Responsive Layout
**Objective:** As an engineer on a smaller screen, I want the interface to adapt to my viewport, so that I can use the ADR Manager on mobile as well as desktop.

#### Acceptance Criteria
1. While the viewport is at mobile width, the ADR Manager web app shall present a usable layout in which the navigation and workspace regions remain accessible without horizontal scrolling of the page.
2. The ADR Manager web app shall keep all interactive controls reachable and operable across supported viewport widths from mobile to desktop.

### Requirement 11: Accessibility Bar
**Objective:** As an engineer who relies on keyboard navigation, reduced motion, or sufficient contrast, I want the interface to meet the design system's accessibility bar, so that the tool is usable for me.

#### Acceptance Criteria
1. When an interactive element receives keyboard focus, the ADR Manager web app shall display a visible focus indicator using the design system's focus treatment.
2. While the user's environment requests reduced motion, the ADR Manager web app shall suppress or reduce non-essential motion.
3. The ADR Manager web app shall present interface text at a contrast ratio meeting WCAG AA against its background.
4. The ADR Manager web app shall label panel controls and form fields so that they are identifiable by assistive technology.

### Requirement 12: Behavior and Contract Preservation
**Objective:** As a maintainer, I want the redesign to change only presentation, so that existing functionality, tests, and downstream automation keep working.

#### Acceptance Criteria
1. The ADR Manager web app shall preserve all existing user-facing functionality and flows (ADR create/edit/save with conflict recovery, tree browsing, relations, history, comparison, search, and similarity) unchanged in behavior.
2. The ADR Manager web app shall preserve the existing `data-testid` attributes and ARIA roles that the component and end-to-end tests depend on.
3. The ADR Manager web app shall not alter the API request/response contracts it exchanges with the backend.
4. The ADR Manager web app shall introduce no new runtime dependency, CSS framework, component library, or client-side router.

### Requirement 13: Automated Design Verification
**Objective:** As a maintainer, I want automated checks that the rendered UI honors the design contract, so that visual regressions are caught without manual inspection of every screen.

#### Acceptance Criteria
1. The ADR Manager end-to-end test suite shall assert, through the rendered DOM, that the design contract is honored for key elements (status-badge colors per status, monospace relation chips with the correct markers, the ADR card accent treatment, a visible keyboard focus indicator, and human-readable labeled panel controls).
2. The ADR Manager end-to-end test suite shall add these assertions to the existing journey specs without changing their existing selectors, run lifecycle, or offline-by-default behavior.
3. The ADR Manager end-to-end test suite shall not introduce pixel-baseline snapshot regression for design verification.
