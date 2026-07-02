# Research & Design Decisions — adr-form-structured-input

## Summary
- **Feature**: `adr-form-structured-input`
- **Discovery Scope**: Extension (light discovery — modifies existing `EditAdrForm` in `AdrEditor.tsx`, no new external dependencies)
- **Key Findings**:
  - `joinSections`/`splitSections` (`packages/core/src/adr/sections.ts`) treat `consideredOptions` and `prosAndConsOfTheOptions` as opaque strings; no existing parser understands per-option structure inside them. The structured-option markdown grammar is new and must be built entirely within `apps/web` — it cannot reuse or extend `packages/core`.
  - `MADR_SECTIONS` (`packages/shared/src/adrSections.ts`) is read-only for this feature; canonical serialization order is fixed at 8 headings and is independent of on-screen order.
  - The People fields (`decisionMakers`/`consulted`/`informed`) already have a blank-filtering precedent (`splitCsv` trims and drops empty entries) that this feature's row-based save mapping should stay consistent with.
  - `CreateAdrForm` duplicates the three People inputs but has no MADR section textareas; it is unaffected by this feature per the explicit project-description boundary, producing an accepted Create/Edit UI inconsistency (documented in `requirements.md` Boundary Context).

## Research Log

### Existing EditAdrForm structure (`apps/web/src/features/adr-editor/AdrEditor.tsx`)
- **Context**: Need the exact current state shape and JSX layout to plan minimal, targeted changes.
- **Sources Consulted**: `AdrEditor.tsx:196-647`, `CollapsibleSection.tsx`, prior spec `adr-form-collapsible-sections/design.md`.
- **Findings**:
  - `EditAdrForm` owns `decisionMakers`/`consulted`/`informed` as three separate CSV-joined `string` states, each rendered as a plain text `<input>` inside a `CollapsibleSection sectionKey="people"`.
  - The 8 `MADR_SECTIONS` entries are rendered generically via `.map()`, each as its own top-level `CollapsibleSection` with a single textarea — including `consequences`/`confirmation` (level 3) as flat top-level sections rather than nested under `decisionOutcome`.
  - `openSections` is a `Set<string>` of expanded section keys, seeded with required section keys plus `"people"`.
  - `CollapsibleSection` is a generic, stateless presentational component (`sectionKey`, `title`, `required`, `isOpen`, `onToggle`, `preview`, `children`) with no coupling to MADR-specific logic — reusable unchanged for the reordered/merged groups.
- **Implications**: This feature's changes are additive/rearranging within `EditAdrForm` plus two new pure-function modules and two new presentational components; `CollapsibleSection` needs no changes.

### Canonical MADR options/pros-cons markdown shape
- **Context**: The project description asks for a "canonical MADR" per-option shape (`### title` + description + Good/Bad bullets) but requirements.md defines the row as exactly 3 fields (description, pros, cons) — no separate title field.
- **Sources Consulted**: `.kiro/specs/madr-template-alignment/design.md` (confirms `consideredOptions`/`prosAndConsOfTheOptions` are currently free-form opaque strings with no established inner grammar in this codebase).
- **Findings**: No pre-existing parser or convention to reuse; this feature must define its own grammar from scratch.
- **Implications**: See Design Decision "Structured option markdown grammar" below.

## Design Decisions

### Decision: Structured option markdown grammar
- **Context**: Requirement 3 needs a deterministic, round-trippable (for well-formed content) mapping between `OptionRow[]` and the two existing `AdrSections` string fields, without introducing a fourth "title" field the requirements don't define.
- **Alternatives Considered**:
  1. Full canonical MADR (`### title` heading + separate description paragraph + `* Good, because …` / `* Bad, because …` bullets) — requires a title field not present in the approved row shape.
  2. Collapse title and description into one `description` field, reused verbatim as both the Considered Options bullet text and the Pros and Cons heading text.
- **Selected Approach (superseded — see amendment below)**: Option 2. `consideredOptions` becomes one `* {description}` bullet per row, in row order. `prosAndConsOfTheOptions` becomes one `### {description}` block per row, in row order, followed by `* Good, because {line}` for each non-blank line of `pros` and `* Bad, because {line}` for each non-blank line of `cons`.
- **Rationale**: Matches the requirements-approved 3-field row shape exactly; stays visually consistent with the real MADR template's bullet conventions; fully deterministic to parse back.
- **Trade-offs**: A user's freeform pros/cons text is mechanically prefixed with "Good, because"/"Bad, because" on save, which slightly changes their literal wording — accepted, matching the project description's explicit request for that canonical phrasing.
- **Follow-up**: `parseOptions` pairs `consideredOptions` bullets with `prosAndConsOfTheOptions` headings positionally (index-based), since `serializeOptions`'s own output always keeps them in the same order and with matching text. Mismatched/hand-edited input degrades per Requirement 3.7 (best-effort, no crash) rather than guaranteeing an exact pairing.

#### Amendment: `### {description}` heading replaced with `**{description}**` bold text
- **Context**: Discovered during task 4.2 integration testing against the real git-backed backend. `packages/core`'s `splitSections` (out of this spec's boundary, from the unrelated `madr-template-alignment` spec) scans the **entire** ADR body for any ATX heading line (`^#{1,6}\s+...$`), not just headings belonging to the section being read. It only recognizes 8 canonical headings (plus the reserved `## Additional Content`) as legitimate; any other heading — including a `### {description}` line emitted by this feature's own grammar for a second, third, etc. option — is treated as an unmatched heading, and `splitSections` diverts that heading and everything after it (until the next heading) into `additionalContent` instead of leaving it in `prosAndConsOfTheOptions`. This is the same limitation `madr-template-alignment/design.md` already documented as an accepted characteristic of `splitSections` for arbitrary author-added sub-headings — but this feature's grammar turned that rare hypothetical into the guaranteed, everyday shape of `prosAndConsOfTheOptions` content, making it a real, reproducible data-loss bug on save → reload for any ADR with 2+ considered options.
- **Root cause ownership**: The defect is in the *interaction* between this feature's grammar (in-boundary) and `splitSections`'s global (non-nesting-aware) heading scan (out-of-boundary, belongs to `madr-template-alignment`). Per this spec's Boundary Commitments, `packages/core` is read-only — the fix must not touch `splitSections`/`joinSections`; it must avoid producing ATX heading syntax at all.
- **Selected Approach**: Replace the per-option `### {description}` heading line with a bold-text line, `**{description}**`, on its own line. `**...**` does not match `HEADING_PATTERN` (`^#{1,6}\s+...$`) at all, so `splitSections` treats it as ordinary content within `## Pros and Cons of the Options`, exactly like any other line in that section. `consideredOptions`'s `* {description}` bullets were never at risk (`*` is not an ATX heading marker) and are unchanged.
- **Rationale**: Smallest possible change that eliminates the collision entirely, without touching `packages/core`; keeps the row shape, the `* Good, because {line}` / `* Bad, because {line}` bullet conventions, and the blank-line block separator all unchanged.
- **Trade-offs**: Slightly less "canonical MADR-looking" than a heading, but MADR itself does not mandate ATX headings for per-option demarcation — bold text is a common, valid rendering for a sub-item title in Markdown.
- **Impact**: `options.ts`'s `parseOptions`/`serializeOptions` (task 2.1) and `options.test.ts` were revised to match; `design.md`'s Data Contracts & Integration section and the `options.ts` component block were updated to match. `OptionsEditor`'s props/contract (task 2.2) and `OptionRow`'s shape are unaffected — this is purely an internal serialization-format change.

### Decision: People group becomes an always-visible block
- **Context**: requirements.md Requirement 2.1 was ambiguous between "collapsible, just repositioned" and "always-visible like Tags." Clarified directly with the user during the requirements phase.
- **Selected Approach**: Always-visible, positioned immediately after the Tags field; no `CollapsibleSection` wrapper, no chevron, no collapsed-state preview string.
- **Rationale**: User-confirmed; consistent with how Tags was already promoted to always-visible in the predecessor `adr-form-collapsible-sections` feature.
- **Trade-offs**: Removes the `peoplePreview` derivation and the `"people"` key from `openSections` entirely (dead code after this change) — accounted for in the File Structure Plan as a deletion, not a new feature.

### Decision: Blank-row exclusion on save
- **Context**: Requirements 2.7 and 3.6 require blank rows to be dropped on save.
- **Selected Approach**: A person row is blank (excluded) when `name.trim() === ""`. An option row is blank (excluded) when `description`, `pros`, and `cons` are all empty after trimming.
- **Rationale**: Consistent with the existing `splitCsv` blank-filtering precedent for People; option rows use an all-fields-empty rule since a row with only pros/cons but no description is still meaningful content worth keeping.

### Decision: Explicit label elements for nested Consequences/Confirmation
- **Context**: `/kiro-validate-design` review found that the initial design left `consequences-textarea`/`confirmation-textarea`'s `aria-labelledby="section-title-{key}"` pointed at a header span that only exists today because each field renders inside its own `CollapsibleSection`. Nesting them inside Decision Outcome's `CollapsibleSection` removes that per-field header entirely.
- **Selected Approach**: Render an explicit label span with the matching `id` (`section-title-consequences` / `section-title-confirmation`) directly above each nested field, so the field keeps a visible heading and the existing `aria-labelledby` attribute keeps resolving.
- **Rationale**: Fixes a dangling-reference accessibility regression at zero cost — this is the same visible-heading role the removed `CollapsibleSection` used to provide, just without the collapse control.

### Decision: `optionRows` as sole source of truth for option content
- **Context**: Review found that keeping `consideredOptions`/`prosAndConsOfTheOptions` inside the `sections` state *and* deriving the save payload from `optionRows` created two competing sources of truth, risking a stale save if the merge order in `handleSave` weren't exactly right.
- **Selected Approach**: Retype `sections` to `Omit<AdrSections, "consideredOptions" | "prosAndConsOfTheOptions">`; those two fields exist only as `optionRows`, computed into the save payload via `serializeOptions`.
- **Rationale**: Removes the ordering hazard by removing the duplicate state entirely, rather than documenting a merge-order rule an implementer could still get wrong.

### Decision: `description` is single-line by construction
- **Context**: `parseOptions` counts `* {description}` bullets per line; an embedded newline in `description` would break that count and contradict the round-trip invariant `options.ts` claims for UI-produced rows.
- **Selected Approach**: `OptionsEditor` renders `description` as `<input type="text">` (not a textarea), so the UI cannot produce a multi-line value. `serializeOptions` additionally collapses any newline to a space defensively.
- **Rationale**: Makes the invariant actually hold by construction instead of by convention.

## Risks & Mitigations
- **Risk**: Hand-edited or legacy `consideredOptions`/`prosAndConsOfTheOptions` content that doesn't follow the new grammar fails to parse into rows. **Mitigation**: `parseOptions` never throws; unrecognized lines are simply not represented as rows (Requirement 3.7); the raw fields are never discarded from the ADR, only from the structured-editor's view of them until the user re-saves.
- **Risk**: Removing `consequences-textarea`/`confirmation-textarea`/`considered-options-textarea`/`pros-and-cons-of-the-options-textarea` as standalone `CollapsibleSection`s breaks existing E2E assertions that toggle and fill them individually. **Mitigation**: `apps/e2e/tests/adr-lifecycle.spec.ts` is in this feature's boundary and must be rewritten for the new nesting/merge (tracked in File Structure Plan).
- **Risk**: `AdrEditor.tsx` growing further in size/complexity. **Mitigation**: extract `PeopleEditor`/`OptionsEditor` and their pure `people.ts`/`options.ts` helpers into separate files rather than inlining more logic into the existing monolith.

## References
- `.kiro/specs/adr-form-collapsible-sections/design.md` — `CollapsibleSection` contract and open-section state model this feature reuses unchanged.
- `.kiro/specs/madr-template-alignment/design.md` — confirms canonical 8-heading file shape and that section content is opaque to `packages/core`.
