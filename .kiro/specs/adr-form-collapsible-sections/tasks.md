# Implementation Plan

- [x] 1. Foundation: CollapsibleSection component and styles
- [x] 1.1 (P) Create the CollapsibleSection presentational component
  - Create `apps/web/src/features/adr-editor/CollapsibleSection.tsx`
  - Define `CollapsibleSectionProps` interface: `sectionKey`, `title`, `required`, `isOpen`, `onToggle`, `preview`, `children`
  - Render a `<button>` header with `data-testid="section-toggle-{sectionKey}"` and `aria-expanded={isOpen}`
  - Append `" *"` to title text when `required` is true; apply `.collapsible-section--required` class on the outer wrapper
  - Show the chevron SVG icon; add `.collapsible-section__chevron--open` class when `isOpen`
  - Show `preview` text (or `"— empty"` when `preview` is `""`) in the header only when `!isOpen`
  - Render children inside a `<div hidden={!isOpen}>` so textareas remain in the DOM when collapsed
  - Observable: Component exports without TypeScript errors and renders a visible header in both open and closed states; the hidden attribute is present on the body when `isOpen=false`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3_
  - _Boundary: CollapsibleSection component_

- [x] 1.2 (P) Add collapsible section CSS styles to soft-ui.css
  - Add `.collapsible-section` wrapper rules (margin replacing `.field` rhythm)
  - `.collapsible-section__header`: full-width button reset, flex row, cursor pointer, padding matching existing field spacing
  - `.collapsible-section--required`: 3 px solid left border using the existing teal color token
  - `.collapsible-section__title`: font-weight 600, color matching `.field__label`
  - `.collapsible-section__preview`: single-line truncation (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`), muted color
  - `.collapsible-section__chevron`: 16×16 icon, muted color; `.collapsible-section__chevron--open` applies `transform: rotate(180deg)` with a CSS `transition`
  - `.collapsible-section__body`: padding consistent with current `.field` spacing
  - Observable: A required section rendered in the browser shows a 3 px teal left border and an asterisk in its title; a collapsed optional section shows the preview text with a non-rotated chevron icon
  - _Requirements: 2.3, 2.4, 2.5, 3.1, 3.4, 4.1, 4.2_
  - _Boundary: CSS styles (soft-ui.css)_

- [x] 2. Core: EditAdrForm state and preview utility
- [x] 2.1 Add open-section state and firstLine utility to EditAdrForm
  - Add `firstLine(value: string): string` pure function: returns the first non-blank line of a string, truncated to 80 characters with `…` appended when over limit; returns `""` for empty input
  - Add `openSections` state as `ReadonlySet<string>` initialised from `MADR_SECTIONS.filter(m => m.required).map(m => m.key)` plus `"people"`
  - Add `toggleSection(key: string): void` that creates a new Set with the key added or removed, then calls `setOpenSections`
  - Observable: TypeScript compiles without errors; the initial `openSections` set contains exactly `"contextAndProblemStatement"`, `"decisionOutcome"`, and `"people"` and does NOT contain `"decisionDrivers"` or any other optional section key
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Boundary: EditAdrForm state_
  - _Depends: 1.1_

- [x] 3. Integration: wire layout changes in EditAdrForm
- [x] 3.1 Replace MADR section textareas with CollapsibleSection wrappers
  - Import `CollapsibleSection` from the new file
  - Update `MADR_SECTIONS.map()`: wrap each section in `<CollapsibleSection sectionKey={meta.key} title={meta.heading} required={meta.required} isOpen={openSections.has(meta.key)} onToggle={() => toggleSection(meta.key)} preview={firstLine(sections[meta.key])}>`
  - Wrap the Additional Content textarea in `<CollapsibleSection sectionKey="additionalContent" required={false} title="Additional Content" ...>`
  - Add `aria-labelledby="section-title-{sectionKey}"` to each textarea and a matching `id` on the section header title span (for screen-reader labelling without a duplicate `<label>`)
  - Remove the `(required)` / `(optional)` text suffix from any existing label or heading text
  - Observable: Opening the edit form shows required sections expanded with teal left border and `"*"` in the title; optional sections show collapsed with a one-line preview or `"— empty"`; clicking a section header toggles its open state
  - _Requirements: 1.1, 1.2, 1.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3_
  - _Boundary: EditAdrForm layout_
  - _Depends: 2.1_

- [x] 3.2 Relocate Tags and introduce People collapsible section
  - Move the Tags `<div className="field">` to immediately follow the Date input, above the section accordion list
  - Wrap Decision Makers, Consulted, and Informed inside `<CollapsibleSection sectionKey="people" title="People" required={false} isOpen={openSections.has("people")} onToggle={() => toggleSection("people")} preview={peoplePreview}>`
  - Derive `peoplePreview` as non-empty values from `decisionMakers`, `consulted`, `informed` joined with `" · "`, falling back to `""` (CollapsibleSection then shows `"— empty"`)
  - Observable: Tags input is visible on form load without expanding any section; Decision Makers, Consulted, and Informed are only visible when the People section is expanded; the People header shows a joined summary when any field is filled
  - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4_
  - _Boundary: EditAdrForm layout_
  - _Depends: 1.1_

- [x] 4. Validation
- [x] 4.1 (P) Add unit tests for CollapsibleSection, firstLine, and EditAdrForm initial state
  - `CollapsibleSection` `isOpen=true`: body visible (`hidden` absent), chevron open class applied, preview text not rendered
  - `CollapsibleSection` `isOpen=false` with non-empty `preview`: body hidden (`hidden` present), preview text visible in header
  - `CollapsibleSection` `isOpen=false` with `preview=""`: `"— empty"` text shown in header
  - `CollapsibleSection` `required=true`: title contains `"*"`, `--required` class on wrapper; clicking the header fires `onToggle`
  - `firstLine`: multi-line input returns first non-blank line; value exceeding 80 chars is truncated with `…`; empty string returns `""`
  - `EditAdrForm` initial open-state: after mount, `openSections` contains `"contextAndProblemStatement"` and `"decisionOutcome"` (required) and `"people"`, and does not contain any optional section key
  - Observable: `pnpm --filter @adr/web test` passes with all new cases green and no pre-existing failures
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_
  - _Boundary: Unit tests (apps/web/src)_

- [x] 4.2 (P) Update adr-lifecycle.spec.ts E2E assertions for the new layout
  - Replace `label[for="adr-editor-{testId}"]` contains `"required"` assertions with `getByTestId("section-toggle-{key}")` `toContainText("*")` for required section keys
  - Replace `label[for="adr-editor-{testId}"]` contains `"optional"` assertions with a `not.toContainText("*")` check on the corresponding toggle header
  - Add `page.getByTestId("section-toggle-decisionDrivers").click()` (and any other collapsed optional section) before the corresponding `.fill()` call
  - Confirm `toHaveValue("")` assertions on collapsed section textareas pass without requiring expansion (textarea remains in DOM)
  - Observable: `pnpm --filter @adr/e2e test:e2e` passes all 7 previously-passing tests with no regressions; the updated assertions target the new header structure
  - _Requirements: 1.2, 2.1, 3.2, 4.1, 4.2_
  - _Boundary: E2E tests (apps/e2e)_
