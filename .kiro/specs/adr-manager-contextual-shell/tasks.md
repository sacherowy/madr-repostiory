# Implementation Plan

## 1. Foundation: dependencies, state infrastructure, and surface layers

- [x] 1.1 Add the state-management dependencies to the web app
  - Add the server-state library (TanStack Query) and the UI-state store (Zustand) to the web app's dependencies and install them under the workspace package manager
  - Confirm both packages resolve and appear in the lockfile, and that the existing web build still succeeds
  - _Requirements: 10.3_

- [x] 1.2 (P) Establish the server-state client, provider, and test wrapper
  - Create a shared server-state client instance and wrap the application root with its provider
  - Provide a reusable test wrapper so components and hooks that consume server-state can be rendered in isolation
  - Observable: the app mounts inside the provider, a trivial query hook resolves through the test wrapper, and the existing web test suite passes
  - _Requirements: 10.4_
  - _Depends: 1.1_
  - _Boundary: queryClient, app entry point_

- [ ] 1.3 (P) Build the workspace view-state store
  - Implement the UI-state store holding selection, active aspect, and the palette/comparison/inspector visibility flags with intent-named actions
  - Enforce legal transitions inside actions (selecting an ADR forces the Edit aspect and closes the palette; dismissing the palette or comparison never clears the selection) and provide a reset action for tests
  - Observable: store unit tests pass covering select/clear, dismiss-preserves-selection, and reset
  - _Requirements: 1.2, 1.3, 1.4, 2.2, 2.5, 10.4_
  - _Depends: 1.1_
  - _Boundary: workspaceStore_

- [ ] 1.4 Add the Soft UI depth layer
  - Append additive depth, elevation, gradient, and glass tokens to the token sheet without re-valuing any existing token, and author a depth stylesheet refining inputs (recessed), primary buttons (raised + pressed), cards (layered), and the command bar / aspect switcher (frosted glass)
  - Import the depth stylesheet after the existing component styles so refinements win via the cascade; preserve text contrast and the visible focus indicator, and honor reduced-motion for new transitions
  - Observable: rendered primary buttons carry a non-empty box-shadow, inputs read as recessed, and the focus outline remains visible — all without lowering text contrast
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 9.1, 9.4_
  - _Depends: 1.2_
  - _Boundary: design tokens, soft-ui stylesheet, app entry point_

- [ ] 1.5 (P) Lay out the responsive four-zone shell grid
  - Define the shell layout for a top command-bar region, a left explorer rail, a center object region, and a right inspector rail, with the rails collapsing on narrow viewports and a way to reveal each on demand
  - Observable: at desktop width all four zones are visible; at mobile width the rails collapse and content remains reachable without horizontal page scroll
  - _Requirements: 1.1, 8.1, 8.2, 8.3, 10.2_
  - _Boundary: app-shell stylesheet_

## 2. Core: center object region components

- [ ] 2.1 (P) Build the ADR context header
  - Present the selected ADR as an object: identifier chip, status badge, title, and supporting metadata using the existing primitives, plus inline Edit and Compare actions exposed as callbacks
  - Label the header controls for assistive technology
  - Observable: given an ADR summary the header renders id/status/title/meta and firing the Edit and Compare controls invokes their callbacks (verified by component test)
  - _Requirements: 3.1, 3.2, 3.3, 9.3_
  - _Boundary: ContextHeader_

- [ ] 2.2 (P) Build the contextual aspect switcher
  - Render Edit / Relations / History / Similar controls only when an ADR is selected, marking the active aspect and displaying a count beside Relations/History/Similar only when a count is supplied; render nothing with no selection and include no Comparison control
  - Migrate the existing aspect tab hooks onto these controls (editor, relations, history, similarity) and keep their tab roles/active-state semantics; make the controls keyboard operable and labeled
  - Observable: with no selection the switcher renders nothing; with a selection it renders four controls carrying the migrated hooks, shows counts only for provided keys, and marks the active aspect
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 9.2, 9.3, 11.1_
  - _Boundary: AspectSwitcher_

## 3. Core: server-state hooks

- [ ] 3.1 (P) Implement the aspect-counts hook
  - Provide relations/history/similar counts for the selected ADR via the server-state client, disabled when no ADR is selected, resolving similarity scope from the selected folder or the ADR's own folder
  - Populate a count only when its query resolves; omit it on failure or offline-empty similarity, never throwing to the UI
  - Observable: hook test shows empty result for no selection, populated counts on resolution, and omitted keys on error/offline-empty
  - _Requirements: 2.4, 10.4_
  - _Depends: 1.2_
  - _Boundary: useAspectCounts_

- [ ] 3.2 (P) Implement the inspector-previews hook
  - Provide a top-Similar preview and a recent-history preview for the selected ADR via the server-state client, enabled only while the inspector is open and an ADR is selected, sharing query keys with the full Similar/History aspects so the cache is reused
  - Expose loading/empty/error status for each preview so the rail can degrade gracefully offline
  - Observable: hook test shows no fetch when disabled or unselected, populated previews when enabled, and clean empty/error status without throwing
  - _Requirements: 6.1, 6.3, 10.4_
  - _Depends: 1.2_
  - _Boundary: useInspectorPreviews_

## 4. Core: Tree View 2.0 explorer

- [ ] 4.1 (P) Extend the folder/ADR tree with presentation affordances
  - Add optional filtering that narrows visible nodes, a status indicator per ADR node, a raised treatment for the selected row, and move affordances revealed on hover/focus while keeping the move controls in the DOM
  - Keep all new inputs optional so default behavior, existing tree/folder/move flows, and existing hooks are preserved
  - Observable: with a filter set only matching nodes show, the selected row carries the raised treatment, status dots render per ADR, and existing tree hooks/tests remain green
  - _Requirements: 5.2, 5.4, 5.5, 5.6, 10.5_
  - _Boundary: FolderTree_

- [ ] 4.2 Wrap the tree in the explorer rail
  - Compose a filter input and a path breadcrumb reflecting the current folder/selected ADR around the tree, passing the filter and selection down without re-implementing tree fetch, folder creation, or move
  - Label the filter and breadcrumb for assistive technology
  - Observable: typing in the filter narrows the tree and the breadcrumb updates to the current location
  - _Requirements: 5.1, 5.3, 9.3_
  - _Depends: 4.1_
  - _Boundary: ExplorerRail_

## 5. Core: command palette

- [ ] 5.1 (P) Build the Cmd-K command palette
  - Implement a focus-managed dialog that opens via the command shortcut/trigger, reuses the existing keyword-search panel for search and jump, and offers New ADR, Compare, and Focus search actions; selecting a result or an action closes the palette while dismissing it preserves the current selection
  - Move focus to the query field on open, support Escape/overlay dismissal, and label the palette and its controls for assistive technology
  - Observable: opening the palette focuses the query field, selecting a search hit invokes selection and closes it, each action fires its callback, and Escape closes it without changing selection
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.2, 9.3_
  - _Boundary: CommandPalette_

## 6. Core: contextual inspector rail

- [ ] 6.1 Build the collapsed-by-default inspector rail
  - Render the rail collapsed by default with a toggle; when open and an ADR is selected, show the top-Similar preview (with similarity meters) and the recent-history preview, with graceful loading/empty/error states; each preview item links into the corresponding full aspect; show no ADR previews when nothing is selected
  - Make the toggle and preview links keyboard operable
  - Observable: the rail starts collapsed, opening it with a selection shows the two previews, activating a preview item requests the matching aspect, and with no selection no ADR previews appear
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 9.2_
  - _Depends: 3.2_
  - _Boundary: InspectorRail_

## 7. Integration: assemble the contextual shell

- [ ] 7.1 Restructure the application shell around the store
  - Replace the global tab bar with the four-zone shell, driving selection/aspect/visibility from the workspace store; render the context header, aspect switcher, and active aspect panel only when an ADR is selected, otherwise render a welcoming browse/create state with no dead-end placeholder
  - Mount the search panel only inside the command palette (remove it from the sidebar), bind the command-palette keyboard shortcut, and wire the explorer, aspect counts, and inspector into their zones; preserve all existing user-facing flows
  - Observable: with no selection the center shows the browse/create state and no aspect switcher; selecting an ADR reveals the header, switcher, and active aspect and refreshes the inspector/counts for that ADR; the shortcut opens the palette
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.2, 4.1, 8.1, 8.2, 10.1, 10.4_
  - _Depends: 1.3, 1.4, 1.5, 2.1, 2.2, 3.1, 4.2, 5.1, 6.1_
  - _Boundary: App_

- [ ] 7.2 Wire comparison as an action and the context-header actions
  - Surface a Compare action in the command bar that is reachable with no selection and opens a comparison overlay rendering the existing comparison launcher unchanged; relocate the legacy comparison tab hook onto this Compare action and keep the overlay container's hook; wire the context header's Edit action to the Edit aspect and its Compare action to the comparison flow scoped to the selected ADR
  - Observable: the command-bar Compare action opens the overlay with no ADR selected, the context-header Edit opens the Edit aspect, and the context-header Compare opens comparison for the selected ADR
  - _Requirements: 2.5, 3.3, 3.4, 11.2_
  - _Depends: 7.1_
  - _Boundary: App, ContextHeader wiring_

- [ ] 7.3 Update affected tests for the migrated hooks and providers
  - Update the component and end-to-end queries affected by the tab→aspect/action migration (aspect controls now appear after selection; comparison via the command bar; search via the palette), wrap query-consuming renders in the server-state test wrapper, and reset the store between tests; leave all non-migrated hooks unchanged
  - Observable: the previously affected component and journey tests pass against the new navigation with only the migrated queries changed
  - _Requirements: 10.5, 11.1, 11.2, 11.3_
  - _Depends: 7.2_
  - _Boundary: App tests, affected journey specs_

## 8. Validation: design verification and full regression

- [ ] 8.1 Extend the offline design spec with contextual-navigation and depth assertions
  - Add DOM-level assertions, through computed styles, that the aspect switcher is absent before selection and present after creating an ADR (migrated labels asserted after creation), the command palette opens and selects an ADR, the context header renders for the selected ADR, the inspector previews appear when opened, the Soft UI depth treatment is present, and a keyboard-focused control still shows a visible focus outline
  - Keep the suite offline and snapshot-free with no new test/runtime dependency
  - Observable: the extended design spec passes in the pre-provisioned browser without network or an embedding key and introduces no pixel-baseline snapshot
  - _Requirements: 2.2, 7.1, 7.4, 9.1, 11.1, 12.1, 12.2, 12.3, 12.4_
  - _Depends: 7.2_
  - _Boundary: design-system journey spec_

- [ ] 8.2 Run the full offline regression and confirm constraints
  - Run the web unit/component suite and the end-to-end suite offline; verify responsive collapse and reduced-motion behavior, that all existing flows and contracts are preserved, and that no dependency was added beyond the two state libraries
  - Observable: both suites pass offline, responsive/reduced-motion checks hold, and the dependency manifest shows only the two new packages added
  - _Requirements: 7.4, 8.2, 8.3, 9.1, 9.4, 10.1, 10.2, 10.5, 12.4_
  - _Depends: 7.3, 8.1_
