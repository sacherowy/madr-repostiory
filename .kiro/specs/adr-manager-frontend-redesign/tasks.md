# Implementation Plan

- [ ] 1. Foundation: design-system stylesheets and startup wiring

- [x] 1.1 Build the reusable design-system base stylesheet
  - Add a global stylesheet layered on the existing design tokens that applies the body/display/mono typefaces, token-derived colors, spacing, radii, and shadows, with no surface left on the browser default sans-serif
  - Provide reusable classes for the recurring components named in the design system: buttons, fields, cards, badges, chips, similarity meter, and diff rows
  - Provide loading, empty, and error state classes, with the destructive red reserved strictly for error/conflict states and never for branding or navigation
  - Provide a visible keyboard focus treatment and a reduced-motion rule that suppresses non-essential motion
  - Observable: loading the app shows text in the design typefaces and token colors; the documented component/state/focus classes exist and render per `docs/design.md`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.1, 9.2, 9.3, 11.1, 11.2, 11.3_
  - _Boundary: base.css_

- [x] 1.2 (P) Build the application-shell layout stylesheet
  - Add a stylesheet that lays out a persistent sidebar region and a workspace region, plus a labeled tab bar
  - Collapse the layout responsively so navigation and workspace stay usable from mobile to desktop without horizontal page scrolling
  - Observable: at a mobile viewport width the sidebar and workspace remain reachable with no horizontal page scroll; at desktop width they sit side by side
  - _Requirements: 2.1, 10.1, 10.2_
  - _Boundary: app-shell.css_

- [x] 1.3 Load the new stylesheets at app startup
  - Import the base and application-shell stylesheets once at startup, after the existing tokens
  - Observable: the rendered app shows the applied typography and token colors with no unstyled fallback remaining
  - _Requirements: 1.1, 1.2_
  - _Depends: 1.1, 1.2_
  - _Boundary: main.tsx_

- [ ] 2. Shared presentational primitives

- [x] 2.1 (P) Build the status badge primitive
  - Render an ADR status as a colored dot plus a human-readable label using the four-status color/background pairs from the design system
  - Render an unrecognized status value in the neutral badge treatment rather than an undefined color
  - Include a unit test asserting each known status maps to its status class and an unknown value maps to the neutral class
  - Observable: the primitive and its unit test exist and the test passes
  - _Requirements: 4.1, 4.2, 4.3_
  - _Depends: 1.1_
  - _Boundary: StatusBadge_

- [x] 2.2 (P) Build the relation chip primitive
  - Render a relation as a monospace chip with the colored marker for its type per the Relations table (solid teal, solid indigo, dashed slate, solid danger)
  - Accept an optional relation direction and preserve the existing relation-direction, relation-type, and relation-target test hooks and their text so the relations panel contract is unbroken
  - Observable: rendering a relation shows the correct marker and still exposes the three relation test hooks with their values
  - _Requirements: 5.1, 5.2, 12.2_
  - _Depends: 1.1_
  - _Boundary: RelationChip_

- [x] 2.3 (P) Build the machine-identifier chip primitive
  - Render machine identifiers as monospace chips in three variants: ADR id (teal treatment), blob SHA (neutral), and raw status key (neutral)
  - Include a unit test asserting each variant renders its intended treatment
  - Observable: the primitive and its unit test exist and the test passes
  - _Requirements: 6.1, 6.2, 6.3_
  - _Depends: 1.1_
  - _Boundary: MonoChip_

- [x] 2.4 (P) Build the similarity meter primitive
  - Render a similarity score as a teal-gradient bar with fill proportional to the value, alongside a monospace numeric value, clamping out-of-range scores
  - Include a unit test asserting clamping and proportional fill
  - Observable: the primitive and its unit test exist and the test passes
  - _Requirements: 8.1, 8.2_
  - _Depends: 1.1_
  - _Boundary: SimilarityMeter_

- [ ] 2.5 Build the ADR card primitive
  - Compose an ADR summary card with a top accent, an id chip, a status badge, the title, optional relation chips, and an optional metadata footer
  - Render the accent as a directly computable style on a real element (not a pseudo-element) so it can be asserted later
  - Observable: rendering a sample ADR shows accent, id chip, status badge, title, and any relation chips together as one card
  - _Requirements: 3.1, 3.2, 3.3_
  - _Depends: 2.1, 2.2, 2.3_
  - _Boundary: AdrCard_

- [ ] 3. (P) Restructure the application shell
  - Lay out the sidebar (folder/ADR tree plus the session author-name field) and the workspace that displays the active panel using the shell stylesheet
  - Present the panel switcher as human-readable labeled controls that show the active panel, while preserving the existing panel-tab test hooks and active-state signaling
  - Keep the existing guidance shown when a panel needs a selected ADR but none is selected, restyled as an empty state, and label tab controls and the author field for assistive technology
  - Update the shell's existing test to reflect labeled tabs while keeping its behavior assertions
  - Observable: the app renders as sidebar plus workspace, tabs show readable labels with the active one marked, and the shell test passes
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 9.2, 11.4, 12.2_
  - _Depends: 1.2, 1.3_
  - _Boundary: App shell_

- [ ] 4. Restyle feature panels

- [ ] 4.1 (P) Restyle the ADR editor panel
  - Apply field, button, and card styling to the create and edit forms, render the status with the status badge, the ADR id and blob SHA as machine-identifier chips, and the relation add/remove controls with relation chips
  - Style the loading, not-found, missing-fields, invalid-relations, save-success, and stale-write conflict states with the design system, keeping the destructive treatment for errors and preserving the existing conflict message text verbatim
  - Preserve every existing test hook and label; update the panel's test only where wrapper markup changes a structural query
  - Observable: the editor renders in the design system, the conflict recovery flow still surfaces its message, and the panel test passes
  - _Requirements: 1.1, 1.3, 4.1, 5.1, 5.2, 6.1, 9.1, 9.3, 9.4, 11.1, 12.1, 12.2_
  - _Depends: 2.1, 2.2, 2.3_
  - _Boundary: AdrEditor_

- [ ] 4.2 (P) Restyle the folder and ADR tree panel
  - Present ADR nodes as ADR cards (id chip, status badge, title) and style the folder rows, the create-folder field/button, and the move controls
  - Style the loading and error states and preserve the folder/ADR/move test hooks and labels
  - Observable: the tree renders ADR nodes as cards with status badges and id chips, and the panel test passes
  - _Requirements: 1.3, 3.1, 3.2, 4.1, 6.1, 9.1, 9.3, 12.1, 12.2_
  - _Depends: 2.5_
  - _Boundary: FolderTree_

- [ ] 4.3 (P) Restyle the relations panel
  - Render each relation as a relation chip while preserving the relation-direction, relation-type, and relation-target test hooks
  - Style the loading, empty, and error states with the design system
  - Observable: relations render as chips with correct markers, the empty/loading/error states are styled, and the panel test passes
  - _Requirements: 1.3, 5.1, 5.2, 9.1, 9.2, 9.3, 12.2_
  - _Depends: 2.2_
  - _Boundary: RelationsPanel_

- [ ] 4.4 (P) Restyle the history timeline panel
  - Style version entries and render blob SHAs as machine-identifier chips, with styled loading and error states for the timeline and version content
  - Preserve the existing history test hooks and labels
  - Observable: history entries render with mono SHA chips and styled states, and the panel test passes
  - _Requirements: 1.3, 6.2, 9.1, 9.3, 12.1, 12.2_
  - _Depends: 2.3_
  - _Boundary: HistoryTimeline_

- [ ] 4.5 (P) Restyle the version diff and ADR comparison views
  - Apply the diff add/remove treatment with subdued line numbers to the version diff, and visually distinguish differing from identical fields in the ADR-to-ADR comparison
  - Style the loading, error, and rejection states and preserve the diff/compare test hooks
  - Observable: added/removed/unchanged content is visually distinct in a diff, differing fields stand out in a comparison, and the views' tests pass
  - _Requirements: 1.3, 7.1, 7.2, 7.3, 9.1, 9.3, 12.2_
  - _Depends: 1.1_
  - _Boundary: VersionDiffView, AdrCompareView_

- [ ] 4.6 (P) Restyle the comparison selection flows
  - Apply field and button styling to the version-compare and ADR-compare selection forms, with styled loading and error states
  - Preserve the compare-launcher test hooks and labels
  - Observable: the comparison launcher forms render in the design system and its test passes
  - _Requirements: 1.3, 9.1, 9.3, 12.2_
  - _Depends: 1.1_
  - _Boundary: CompareLauncher_

- [ ] 4.7 (P) Restyle the keyword search panel
  - Style the search form and present results as ADR cards, with an inviting no-results empty state and styled loading and error states
  - Preserve the search test hooks and labels
  - Observable: search results render as cards, the no-results empty state is styled, and the panel test passes
  - _Requirements: 1.3, 3.1, 9.1, 9.2, 9.3, 12.2_
  - _Depends: 2.5_
  - _Boundary: SearchPanel_

- [ ] 4.8 (P) Restyle the similarity panel
  - Present each result with the similarity meter and an ADR card, with an inviting empty-scope state and styled loading and error states
  - Preserve the similarity test hooks and labels
  - Observable: similarity results render with proportional meters and cards, the empty-scope state is styled, and the panel test passes
  - _Requirements: 1.3, 8.1, 8.2, 9.1, 9.2, 9.3, 12.1, 12.2_
  - _Depends: 2.4, 2.5_
  - _Boundary: SimilarityPanel_

- [ ] 5. Validation: design verification and regression

- [ ] 5.1 Add DOM-level design-verification end-to-end checks
  - Add an end-to-end spec that drives the real UI and asserts, through computed styles, that a status badge color matches its status token, a relation chip uses the monospace family, the ADR card accent is present on a real element, a keyboard-focused control shows a visible focus outline, and panel tabs render human-readable labels
  - Add these assertions within the existing run lifecycle and selectors, introducing no pixel-baseline snapshot oracle and no new dependency
  - Observable: the new end-to-end design spec passes in the offline run alongside the existing journey specs
  - _Requirements: 11.1, 13.1, 13.2, 13.3_
  - _Depends: 3, 4.1, 4.3, 2.5_
  - _Boundary: design-system.spec_

- [ ] 5.2 Run the full web and end-to-end suites and confirm no regressions
  - Run the web component tests and the offline end-to-end suite across the workspace and confirm all existing behavior, test hooks, and API contracts still pass with no new dependency added
  - Observable: the web test command and the offline end-to-end run both pass with no regressions
  - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - _Depends: 3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1_

- [ ]* 5.3 Verify the accessibility and responsive quality gate manually
  - Manually confirm WCAG AA text contrast, reduced-motion suppression, and a usable layout from mobile to desktop across the restyled surfaces
  - Observable: a checklist records AA contrast, reduced-motion, and mobile/desktop usability as verified
  - _Requirements: 10.1, 10.2, 11.2, 11.3_
  - _Depends: 5.2_
