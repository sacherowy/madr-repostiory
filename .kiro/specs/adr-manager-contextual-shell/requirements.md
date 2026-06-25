# Requirements Document

## Introduction

The ADR Manager web app (`apps/web`) is visually complete after the
`adr-manager-frontend-redesign` spec — the morski/teal design system, the five
shared primitives (`StatusBadge`, `RelationChip`, `MonoChip`, `SimilarityMeter`,
`AdrCard`), and restyled feature panels are all in place — but its information
architecture and surfaces remain flat. Engineers navigate through a static shell:
a fixed sidebar plus a global five-tab workspace bar (Editor · Relations · History
· Comparison · Similarity) that is always shown even when no ADR is selected, so
four of five tabs dead-end on a "select an ADR first" placeholder. Navigation is
decision-blind — it never reflects *what* the user is looking at — and the form
surfaces, while on-palette, read as flat and dated, so the interface works but does
not feel modern or guide the user toward the next action.

This feature re-architects the presentation and navigation layer of `apps/web` into
an object-centric, contextual workspace that reshapes around the selected ADR and
adds tactile surface depth. It introduces a top command bar with a Cmd-K palette
(search, jump, and actions), a left "Tree View 2.0" explorer, a center
"ADR-as-object" region (a context header plus a contextual aspect switcher that
replaces the global tab bar and appears only once an ADR is selected), a right
contextual inspector rail with live previews, and an additive "Soft UI" depth layer.
The change is **arrangement, navigation, and surface depth only** — every existing
feature panel, primitive, palette token, typography choice, and backend contract is
reused unchanged.

The "system" subject for all acceptance criteria below is the **ADR Manager web
app**, except Requirement 12, whose subject is the **ADR Manager end-to-end test
suite**.

## Boundary Context

- **In scope**: A three-zone application shell (top command bar, left explorer rail,
  center ADR-as-object region, right inspector rail); a Cmd-K command palette that
  searches ADRs, jumps to a decision, and runs actions (new ADR, compare, focus
  search), folding in the existing keyword search; a "Tree View 2.0" presentation
  over the existing folder/ADR tree (live filter, path breadcrumb, status-dot ADR
  nodes, raised selected row, hover-revealed move affordances); an ADR context header
  (identifier chip, status badge, title, metadata, inline Edit/Compare actions); a
  contextual aspect switcher (Edit / Relations / History / Similar with live counts)
  that replaces the global tab bar; a welcoming browse/create state when nothing is
  selected; a contextual inspector rail with top-Similar and recent-history previews
  that link into the full aspects; an additive Soft UI surface-depth layer (recessed
  inputs, raised tactile buttons with press states, layered material cards, frosted-
  glass shell/tab bar) introduced as additive depth tokens over the existing token
  files; responsive collapse of the rails on small viewports; and design/navigation
  verification added to the existing offline end-to-end design spec.
- **Out of scope**: Any change to backend behavior, validation, domain logic,
  persistence, embeddings, git access, or `apps/api` routes/contracts; changes to
  `packages/*` (`core`, `shared`); editing the existing design-token *values* in
  `docs/design.md` (the palette, typography, and the five primitives stay — only
  additive depth tokens are introduced); new product capabilities or navigation
  destinations beyond rearranging existing ones; a client-side router, CSS framework,
  or component library; changes to the `apps/e2e` harness/config design (reused
  unchanged; only spec files are added); and pixel-baseline snapshot regression. State
  management is the one deliberate exception to the no-new-dependency rule: this feature
  adopts a server-state library (TanStack Query) and a UI-state store (Zustand); no
  other new runtime or dev dependency is permitted.
- **Adjacent expectations**: This feature conceptually continues
  `adr-manager-frontend-redesign` by realizing the next IA/navigation and surface-
  depth layer on top of its primitives and restyled panels, which it reuses unchanged;
  it must not contradict the `adr-manager` spec's behavior or API contracts; and it
  extends the `playwright-e2e` suite by adding design/navigation assertions to the
  existing design spec, preserving that suite's run lifecycle and offline-by-default
  behavior. Feature panels (`AdrEditor`, `RelationsPanel`, `HistoryTimeline`,
  `SimilarityPanel`, `CompareLauncher`) and the `ApiClient` are consumed as-is; this
  feature does not own their internal behavior or data fetching.

## Requirements

### Requirement 1: Object-Centric Contextual Workspace Layout
**Objective:** As an engineer using the ADR Manager, I want a workspace organized around the ADR I am working on, so that the interface guides me to the next action instead of presenting a static, decision-blind shell.

#### Acceptance Criteria
1. The ADR Manager web app shall present a workspace composed of a top command-bar region, a left explorer rail, a center ADR-as-object region, and a right contextual inspector rail.
2. While an ADR is selected, the ADR Manager web app shall reshape the center region around that ADR by presenting its context header and the contextual aspect switcher.
3. While no ADR is selected, the ADR Manager web app shall present a welcoming browse/create state in the center region rather than an aspect that dead-ends on a "select an ADR first" placeholder.
4. When the user selects a different ADR, the ADR Manager web app shall update the center region, context header, and inspector previews to reflect the newly selected ADR.

### Requirement 2: Contextual Aspect Switcher
**Objective:** As an engineer, I want the per-ADR views presented as aspects of the selected decision rather than a global tab strip, so that navigation reflects what I am looking at and never offers a view that cannot apply.

#### Acceptance Criteria
1. While an ADR is selected, the ADR Manager web app shall present a contextual aspect switcher offering the Edit, Relations, History, and Similar aspects of that ADR.
2. While no ADR is selected, the ADR Manager web app shall not present the contextual aspect switcher.
3. When the user activates an aspect control, the ADR Manager web app shall display the corresponding feature panel for the selected ADR in the center region and indicate which aspect is currently active.
4. Where an aspect has a meaningful count available (such as the number of relations, history entries, or similar results), the ADR Manager web app shall display that count on the aspect control.
5. The ADR Manager web app shall not present Comparison as a global aspect tab; instead it shall expose comparison as an action (per Requirement 3 and Requirement 4) and, when an ADR is selected, as an ADR-scoped comparison entry point.

### Requirement 3: ADR Context Header (ADR as Object)
**Objective:** As an engineer, I want the selected ADR represented as a clear object header, so that I always know which decision I am acting on and can act on it directly.

#### Acceptance Criteria
1. While an ADR is selected, the ADR Manager web app shall display a context header presenting the ADR identifier as a monospace chip, its status as a status badge, its title, and its supporting metadata using the existing design-system treatments.
2. The ADR Manager web app shall present inline Edit and Compare actions in the context header for the selected ADR.
3. When the user activates the inline Edit action, the ADR Manager web app shall open the Edit aspect of the selected ADR.
4. When the user activates the inline Compare action, the ADR Manager web app shall open the comparison flow scoped to the selected ADR.

### Requirement 4: Command Palette (Cmd-K)
**Objective:** As an engineer, I want a single keyboard-driven command palette to find decisions and run common actions, so that navigation and actions are always one shortcut away from anywhere in the app.

#### Acceptance Criteria
1. When the user invokes the command-palette shortcut, the ADR Manager web app shall open the command palette as the global entry point for search, jump, and actions.
2. When the user enters a query in the command palette, the ADR Manager web app shall present matching ADRs using the existing keyword-search behavior.
3. When the user selects an ADR result in the command palette, the ADR Manager web app shall select that ADR, update the workspace to that ADR, and close the palette.
4. The ADR Manager web app shall offer, within the command palette, the actions to create a new ADR, start a comparison, and focus search.
5. When the user activates a command-palette action, the ADR Manager web app shall start that action and close the palette.
6. When the palette is open and the user dismisses it (for example, via the escape key or activating outside it), the ADR Manager web app shall close the palette without changing the current selection.

### Requirement 5: Tree View 2.0 Explorer
**Objective:** As an engineer browsing decisions, I want a richer tree explorer with filtering, orientation, and at-a-glance status, so that I can locate and organize ADRs quickly within nested folders.

#### Acceptance Criteria
1. The ADR Manager web app shall present the folder/ADR tree in the left explorer rail, preserving the existing tree browsing, folder creation, and ADR move behavior.
2. When the user enters text in the explorer filter, the ADR Manager web app shall narrow the visible tree to nodes matching the filter.
3. The ADR Manager web app shall display a path breadcrumb reflecting the current folder or selected ADR location.
4. Where an ADR node is displayed in the tree, the ADR Manager web app shall present a status indicator (status dot) reflecting that ADR's status.
5. While an ADR is selected, the ADR Manager web app shall present its tree row in a raised selected treatment distinct from unselected rows.
6. When the user hovers (or keyboard-focuses) a tree node that supports moving, the ADR Manager web app shall reveal the move affordance for that node.

### Requirement 6: Contextual Inspector Rail
**Objective:** As an engineer, I want related context for the selected ADR brought to me in a side rail, so that I can see similar decisions and recent changes without leaving my current aspect.

#### Acceptance Criteria
1. While an ADR is selected, the ADR Manager web app shall make available, in the right inspector rail, a top-Similar preview (with similarity meters) and a recent-history preview for that ADR.
2. The ADR Manager web app shall present the inspector rail collapsed by default, and shall expand it only when the user opens it.
3. When the user opens the inspector rail with an ADR selected, the ADR Manager web app shall populate the previews from the same data sources the corresponding full aspects use.
4. When the user activates a preview item, the ADR Manager web app shall navigate into the corresponding full aspect (Similar or History) for the selected ADR.
5. While no ADR is selected, the ADR Manager web app shall not present ADR-scoped previews in the inspector rail.

### Requirement 7: Soft UI Surface Depth
**Objective:** As an engineer, I want the interface surfaces to feel tactile and layered, so that controls read as modern and interactive while remaining legible.

#### Acceptance Criteria
1. The ADR Manager web app shall apply an additive depth treatment so that input fields read as recessed, primary buttons read as raised and tactile, cards read as layered material, and the shell/aspect bar reads as frosted glass.
2. When the user presses a tactile button, the ADR Manager web app shall display a press (depressed) state for that button.
3. The ADR Manager web app shall introduce the depth treatment additively over the existing design tokens without altering the existing palette, typography, or primitive component specifications.
4. The ADR Manager web app shall maintain WCAG AA text contrast for all surfaces carrying the depth treatment, and shall not lower text contrast to achieve depth.

### Requirement 8: Responsive Three-Zone Layout
**Objective:** As an engineer on a smaller screen, I want the multi-zone workspace to adapt to my viewport, so that I can still browse and edit ADRs without horizontal scrolling.

#### Acceptance Criteria
1. While the viewport is at mobile width, the ADR Manager web app shall present a usable layout in which the explorer, center, and inspector content remain reachable without horizontal scrolling of the page.
2. While the viewport is narrow, the ADR Manager web app shall collapse the explorer and inspector rails and provide a way to reveal each on demand.
3. The ADR Manager web app shall keep all interactive controls reachable and operable across supported viewport widths from mobile to desktop.

### Requirement 9: Accessibility Preservation
**Objective:** As an engineer who relies on keyboard navigation or sufficient contrast, I want the new shell to meet the design system's accessibility bar, so that the richer interface remains usable for me.

#### Acceptance Criteria
1. When an interactive element in the new shell receives keyboard focus, the ADR Manager web app shall display a visible focus indicator using the design system's focus treatment.
2. The ADR Manager web app shall make the command palette, aspect switcher, explorer, and inspector operable by keyboard.
3. The ADR Manager web app shall label the command palette, aspect controls, explorer filter, and inspector controls so that they are identifiable by assistive technology.
4. While the user's environment requests reduced motion, the ADR Manager web app shall suppress or reduce non-essential motion introduced by the new shell and depth treatment.

### Requirement 10: Behavior and Contract Preservation
**Objective:** As a maintainer, I want the re-architecture to change only presentation and navigation, so that existing functionality, integrations, and tests keep working.

#### Acceptance Criteria
1. The ADR Manager web app shall preserve all existing user-facing functionality and flows (ADR create/edit/save with conflict recovery, tree browsing, folder creation, ADR move, relations, history, comparison, search, and similarity) unchanged in behavior.
2. The ADR Manager web app shall not alter the API request/response contracts it exchanges with the backend, nor the behavior, validation, or data fetching of the reused feature panels.
3. The ADR Manager web app shall introduce no new CSS framework, no component library, and no client-side router, and shall add no new runtime or development dependency other than the adopted state-management libraries (a server-state library, TanStack Query, and a UI-state store, Zustand).
4. The ADR Manager web app shall manage the server-derived state this feature introduces (aspect counts and inspector previews) through the adopted server-state library, and shall manage cross-zone UI/view state (selection, active aspect, and palette/comparison/inspector visibility) through the adopted UI-state store; keyword search remains owned by the reused search panel and is not re-implemented.
5. The ADR Manager web app shall preserve the existing `data-testid` attributes and ARIA roles that the component and end-to-end tests depend on, except for the panel-tab hooks, which shall be deliberately migrated onto the corresponding aspect-switcher controls.

### Requirement 11: Aspect-Hook Migration
**Objective:** As a maintainer, I want the existing panel-tab test hooks deliberately moved onto the new aspect controls, so that the navigation tests continue to target stable, intentional selectors after the tab bar is replaced.

#### Acceptance Criteria
1. When the global tab bar is replaced by the contextual aspect switcher, the ADR Manager web app shall migrate the existing `panel-tab-*` hooks onto the corresponding aspect controls (Edit, Relations, History, Similar).
2. Where the Comparison tab hook (`panel-tab-comparison`) no longer maps to an aspect control, the ADR Manager web app shall relocate it onto the comparison action entry point introduced in the context header and command palette.
3. The ADR Manager web app shall update only the test queries affected by a deliberately relocated hook, and shall leave all other existing test hooks unchanged.

### Requirement 12: Automated Design and Navigation Verification
**Objective:** As a maintainer, I want automated checks that the new contextual shell and surface depth are honored in the rendered DOM, so that navigation and design regressions are caught without manual inspection.

#### Acceptance Criteria
1. The ADR Manager end-to-end test suite shall assert, through the rendered DOM, that the new navigation is present and behaves contextually (a context header for the selected ADR, the contextual aspect switcher appearing only when an ADR is selected, the command palette opening and selecting an ADR, and the inspector rail previews).
2. The ADR Manager end-to-end test suite shall assert, through the rendered DOM, that the Soft UI depth treatment and a visible keyboard focus indicator are present.
3. The ADR Manager end-to-end test suite shall add these assertions to the existing design spec without changing the suite's run lifecycle or offline-by-default behavior, and shall not introduce pixel-baseline snapshot regression.
4. The ADR Manager end-to-end test suite shall run in the pre-provisioned Chromium browser without requiring network access or a live embedding key.
