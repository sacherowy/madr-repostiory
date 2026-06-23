# Research & Design Decisions

## Summary
- **Feature**: `adr-manager-frontend-redesign`
- **Discovery Scope**: Extension (restyle an existing, functionally-complete frontend)
- **Key Findings**:
  - The design system is delivered as CSS custom properties in `apps/web/src/styles/tokens.css` (imported once in `main.tsx`) and three Google Fonts in `index.html`, but **no component consumes any token** (`grep var(--` over `features/` and `App.tsx` = 0 hits). Foundation exists; application is missing.
  - Components are plain React/JSX with a rich, test-relied-upon `data-testid` + ARIA contract and `<label htmlFor>` associations, and **zero** `className` usage today. Restyling can be additive (apply classes, keep testids/markup hooks).
  - `apps/e2e` already runs real-browser journeys with Playwright `1.56.1` (a devDependency) and explicitly configures **no** `toHaveScreenshot` oracle. DOM/computed-style assertions (`toHaveCSS`) add to the existing lifecycle with no new dependency.

## Research Log

### Styling delivery mechanism
- **Context**: Choose how to apply `docs/design.md` without violating the "no CSS framework / no new dependency" boundary inherited from `adr-manager`.
- **Sources Consulted**: `apps/web/src/styles/tokens.css`, `apps/web/src/main.tsx`, `apps/web/index.html`, `apps/web/package.json`, `apps/web/vite.config.ts`.
- **Findings**: Vite supports plain CSS `import` and native CSS Modules with zero added config. `tokens.css` already exposes all design tokens. No component library is present.
- **Implications**: Use plain global CSS stylesheets imported in `main.tsx` plus reusable semantic class names, layered on `tokens.css`. No framework, no Modules indirection needed for a token set this small.

### Test/contract preservation
- **Context**: Requirement 12 forbids changing `data-testid`/ARIA/API contracts.
- **Sources Consulted**: All `apps/web/src/features/*`, `apps/e2e/tests/*.spec.ts`, `App.tsx`.
- **Findings**: E2E and component tests select by `data-testid` and labels; the lifecycle spec never asserts on the raw tab text (`{panel}`), so changing visible labels to human-readable strings is safe. Diff/compare/similarity loading/error/empty states already carry stable testids.
- **Implications**: Restyle is additive. Map `activePanel` keys to display labels while keeping `data-testid="panel-tab-<key>"`. Update component tests only where new wrapper markup breaks an existing query.

### E2E design verification approach
- **Context**: Requirement 13 — verify the rendered UI honors the design contract via the DOM, not pixels.
- **Sources Consulted**: `apps/e2e/playwright.config.ts`, `apps/e2e/tests/adr-lifecycle.spec.ts`, `apps/e2e/harness/helpers.ts`.
- **Findings**: Playwright `expect(locator).toHaveCSS(prop, value)` and `getComputedStyle` evaluate real computed styles in the launched browser. The config already declares pixel-baseline diffing out of scope; a new spec file is auto-discovered from `testDir: ./tests` with no config change.
- **Implications**: Add `tests/design-system.spec.ts` asserting computed colors/fonts/focus on representative elements. No `toHaveScreenshot`, no new dependency, same run lifecycle.

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Plain global CSS + shared class names (selected) | One foundation stylesheet of design-system classes on top of `tokens.css`; components apply `className` | Zero config/deps; classes map 1:1 to `docs/design.md` components; honors boundary | Global class namespace (mitigated by `adr-` prefixed, component-scoped names) | Smallest design that satisfies all reqs |
| CSS Modules per component | Scoped `*.module.css` imported per feature | Scope isolation | More files/indirection for a small token set; more churn | Rejected as over-engineered here |
| Tailwind / component library | Utility framework or UI kit | Fast polish | New dependency + config; duplicates token system; violates boundary | Rejected (boundary) |

## Design Decisions

### Decision: Plain CSS layer with reusable design-system classes
- **Context**: Apply `docs/design.md` across the frontend within the no-framework/no-dependency boundary.
- **Alternatives Considered**: 1) CSS Modules per component; 2) Tailwind/UI library; 3) inline styles.
- **Selected Approach**: Two global stylesheets — `styles/base.css` (reset, typography application, reusable component classes: buttons, fields, cards, badges, chips, similarity meter, diff, empty/loading/error, focus, reduced-motion) and `styles/app-shell.css` (sidebar + workspace + tabs responsive layout) — imported in `main.tsx` after `tokens.css`. Components apply semantic class names.
- **Rationale**: Reuses the already-delivered token layer; classes map directly to named `docs/design.md` components, easing review and traceability; introduces no dependency.
- **Trade-offs**: Global class namespace vs. module scoping — mitigated by component-scoped class names and a single owning stylesheet pair.
- **Follow-up**: Verify no unstyled fallback remains (every panel uses the body font + token colors).

### Decision: Extract shared presentational primitives for recurring domain visuals
- **Context**: Status badges, relation chips, ID/SHA chips, and similarity meters recur across multiple features (generalization lens).
- **Alternatives Considered**: Re-implement the markup in each feature vs. shared primitives.
- **Selected Approach**: Add small presentational React components in `apps/web/src/components/` — `StatusBadge`, `RelationChip`, `MonoChip` (variants `id`/`sha`/`status`), `SimilarityMeter`, `AdrCard` — each consuming `base.css` classes. Generic controls (buttons, fields) stay as CSS classes, not components, to minimize churn.
- **Rationale**: Removes duplication, guarantees consistent rendering of the design contract, and gives the E2E design checks stable elements to assert against.
- **Trade-offs**: A few new files vs. duplicated inline markup; chosen for consistency and testability.
- **Follow-up**: Keep primitives free of data-fetching; they receive typed `@adr/shared` values as props.

### Decision: DOM/computed-style E2E verification, no pixel baseline
- **Context**: Requirement 13 + playwright-e2e's stated Non-Goal.
- **Selected Approach**: New `apps/e2e/tests/design-system.spec.ts` asserts computed styles (status-badge color per status, monospace relation chips, card accent treatment, visible focus outline, human-readable tab labels) via `toHaveCSS`/`getComputedStyle`. No `toHaveScreenshot`.
- **Rationale**: Robust across fonts/OS/CI; respects the adjacent spec's boundary; reuses the existing harness and dependency set.
- **Trade-offs**: Does not catch every pixel-level drift; acceptable per the requirements decision.

## Risks & Mitigations
- New wrapper markup breaks existing component-test queries — Mitigation: keep all `data-testid`/roles/labels; update tests only for structural wrappers, never behavior.
- Tab label change breaks a selector — Mitigation: preserve `data-testid="panel-tab-<key>"`; only the visible text changes.
- Color-contrast regressions from token misuse — Mitigation: use status text/background pairs from `docs/design.md`; WCAG AA checked in the manual accessibility gate.
- Scope creep into ADR behavior/API — Mitigation: Requirement 12 + Out of Boundary; presentation-only changes.

## References
- `docs/design.md` — canonical "morski"/teal design system (consumed, not modified).
- `.kiro/specs/adr-manager/design.md` `## UI Design System` — the upstream mapping this spec realizes.
- `.kiro/specs/playwright-e2e/design.md` — adjacent E2E spec whose lifecycle/selectors must be preserved.
