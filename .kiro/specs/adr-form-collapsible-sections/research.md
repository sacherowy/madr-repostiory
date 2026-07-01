# Research Log — adr-form-collapsible-sections

## Discovery Scope

**Type**: Light (extension of existing React component)  
**Codebase analysed**: `apps/web/src/features/adr-editor/AdrEditor.tsx`, `packages/shared/src/adrSections.ts`, `apps/e2e/tests/adr-lifecycle.spec.ts`

## Key Findings

### Codebase

- `MADR_SECTIONS` already carries a `required: boolean` flag on each entry — no new metadata needed in shared types.
- `AdrEditor.tsx` is a single-file module (~600 lines) with three co-located components. All form state is `useState` within `EditAdrForm`. No existing collapse state.
- Eight section textareas rendered via `.map()` over `MADR_SECTIONS`. A ninth textarea for `additionalContent` is hardcoded separately after the loop.
- Tags (`tags-input`) and People fields (`decision-makers-input`, `consulted-input`, `informed-input`) are flat siblings in `EditAdrForm`; no grouping exists today.

### E2E Impact

- `adr-lifecycle.spec.ts` asserts `label[for="adr-editor-{testId}"]` contains `"required"` / `"optional"` — both assertions break with the new heading model.
- `adr-lifecycle.spec.ts` calls `.fill()` on `decision-drivers-textarea` (optional section, will be collapsed by default) — requires expand-before-fill.
- `toHaveValue()` assertions on collapsed textareas continue to work because the textarea stays in the DOM (hidden via `hidden` attribute, which Playwright ignores when reading `.value`).
- Other E2E specs (`design-system`, `search`, `similarity`, `tree`, `migrated-fixture-*`) do not assert on MADR section labels or fill optional textareas — no changes needed there.

## Design Decisions

### Build vs. Adopt — Accordion Component

**Decision**: Build a thin `CollapsibleSection` React component using native `useState`.  
**Rationale**: The accordion behavior is simple (one boolean per section). External libraries (Radix Accordion, Headless UI) would add a dependency for behavior achievable in ~40 lines of React. The project has no existing headless-UI dependency.

### State Shape — Set vs Record

**Decision**: `ReadonlySet<string>` for open-section tracking.  
**Rationale**: Membership test (`has`) and toggle (`add`/`delete`) map naturally to a Set. A `Record<string, boolean>` would need explicit `false` entries for all closed sections. The Set approach only stores open keys, which keeps the initial state declaration minimal (just the two required section keys + `"people"`).

### DOM Visibility — `hidden` attribute vs. conditional render

**Decision**: Use the HTML `hidden` attribute (rendered as `display: none` by browsers) on the section body div, keeping the textarea in the DOM.  
**Rationale**: Playwright's `toHaveValue()` reads the DOM `.value` property and is not affected by `display: none` or `hidden`. This preserves existing E2E assertions that check empty values on optional sections without expansion. Conditional rendering (`{isOpen && <textarea>}`) would unmount the textarea, breaking `toHaveValue` and causing loss of unsaved section content if the user collapses and re-expands a filled-in optional section.

### Accessibility — `aria-labelledby` vs `<label htmlFor>`

**Decision**: The section header `<button>` element gets a stable `id="section-title-{sectionKey}"`. Textareas inside the body use `aria-labelledby` pointing to that id.  
**Rationale**: The section heading is the visual label for the textarea. Duplicating it as a hidden `<label>` inside the body would be redundant and confusing for screen readers. `aria-labelledby` connects the textarea to its visible heading correctly.

## Synthesis Outcomes

- **Generalization**: `CollapsibleSection` is a single component that covers MADR sections, Additional Content, and the People group. The parent derives the `preview` string and owns `isOpen`/`onToggle` — no state in the component.
- **Simplification**: `firstLine()` is a 4-line pure function co-located in `AdrEditor.tsx`. It does not need its own file or an abstraction layer.
- No new packages, build configuration changes, or API changes required.
