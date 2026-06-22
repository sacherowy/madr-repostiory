# Brief: playwright-e2e

## Problem
The ADR Manager (`adr-manager` spec) is verified today only by unit and
component-level tests (vitest + Testing Library, with the API exercised via
`app.inject()`). No test drives the real, fully-assembled application in a
browser against a live API process. Regressions in the actual web↔API wiring
(Vite proxy, real `fetch`, real Fastify routes, real git repo) and in the
rendered UI can therefore slip through, and there is no captured visual record
of the app's key states for review or debugging.

## Current State
- Web app: Vite + React, dev server proxies `/api` → `http://localhost:3000`.
- API: Fastify, started via `tsx src/server.ts`, reads `ADR_REPO_PATH`,
  `SQLITE_PATH`, `PORT`, and `GEMINI_API_KEY` from env (`apps/api/src/config.ts`).
- Embeddings: `apps/api/src/container.ts` **always** constructs
  `GeminiEmbeddingProvider`, even when `GEMINI_API_KEY` is empty — so similarity
  calls fail without a key. A `FakeEmbeddingProvider`
  (`apps/api/src/infrastructure/embeddings/fake.ts`) already exists and
  implements the same `EmbeddingProvider` port, but the composition root never
  selects it.
- The only network-gated integration test is `gemini.integration.test.ts`
  (`describe.skipIf(!GEMINI_API_KEY)`), which establishes the existing
  "skip when no key" convention.
- No Playwright (or any browser-driving harness) is installed in the repo.

## Desired Outcome
- A Playwright E2E suite drives the real web app against a live API and a real
  (temporary) git ADR repository.
- The suite runs in **two modes**:
  - **Gemini-disabled** (default, no key): runs fully offline using the fake
    embedding provider; similarity-dependent flows still complete via the
    deterministic fake.
  - **Gemini-enabled** (when `GEMINI_API_KEY` is set): the same flows run
    against the real embedding provider; these specs **skip** when no key is
    present, never fail.
- Key UI states are **captured as screenshots** to an output directory, and
  Playwright captures a screenshot + trace automatically on failure.

## Approach
Add a dedicated `apps/e2e` pnpm workspace using `@playwright/test`. Playwright's
`webServer` config auto-launches both the API and the web dev server (and seeds
a temporary git ADR repo + scratch SQLite path via env) before the suite runs,
then tears them down after. Mode selection is driven by `GEMINI_API_KEY`
presence: tests tagged for enabled-mode are skipped when the key is absent;
disabled-mode is the default offline path.

To make disabled-mode a real runtime behavior (not just a test trick),
`apps/api/src/container.ts` is extended to select `FakeEmbeddingProvider` when
`GEMINI_API_KEY` is empty and `GeminiEmbeddingProvider` otherwise — a small,
declared touchpoint into the `adr-manager` composition root.

Coverage targets the **core user journeys**: create→edit→save with 409 conflict
recovery, tree browsing including an empty folder, keyword search including the
no-match empty state, and folder-scoped similarity including the empty-scope
state. Screenshots are taken at meaningful positive states (e.g. saved ADR,
conflict banner, no-results message, empty-scope message); no pixel-baseline
(`toHaveScreenshot`) comparison is in scope.

## Scope
- **In**:
  - New `apps/e2e` Playwright workspace + config (browsers, `webServer`, output dir).
  - Auto-launch of api + web + temp git ADR repo / scratch SQLite for the run.
  - Dual-mode execution keyed on `GEMINI_API_KEY` (disabled default, enabled when set, enabled specs skip without key).
  - E2E specs for the core journeys listed above.
  - Screenshot capture at key states + automatic on-failure screenshot/trace.
  - Composition-root fallback to `FakeEmbeddingProvider` when no key (touchpoint).
  - A runnable command (e.g. `pnpm --filter @adr/e2e test:e2e`) and root wiring.
- **Out**:
  - Pixel-perfect visual-regression baselines (`toHaveScreenshot` diffing).
  - Full-coverage E2E of every panel (history, diff, ADR-to-ADR compare,
    relations, folder move) — deferred; core journeys only.
  - CI pipeline / GitHub Actions authoring (the suite must be CI-runnable, but
    wiring a workflow is not owned here).
  - Changing the embedding provider implementations themselves or the
    similarity algorithm.
  - Authentication / multi-user concerns (out of scope for the whole project).

## Boundary Candidates
- **E2E harness & app orchestration**: workspace, Playwright config, `webServer`
  launch, temp-repo/SQLite seeding, mode gating, screenshot/artifact handling.
- **E2E scenario specs**: the per-journey test files asserting behavior in both modes.
- **Embedding provider selection (touchpoint)**: container fallback to the fake
  provider when `GEMINI_API_KEY` is empty.

## Out of Boundary
- The ADR feature logic and UI themselves (owned by `adr-manager`); this spec
  observes them, it does not change their behavior.
- Embedding/similarity provider internals (`GeminiEmbeddingProvider`,
  `FakeEmbeddingProvider`) — reused as-is.
- Visual-regression baseline management and CI workflow definition.

## Upstream / Downstream
- **Upstream**: `adr-manager` (the application under test: web app, API routes,
  composition root, `FakeEmbeddingProvider`); the existing `GEMINI_API_KEY`
  skip-convention from `gemini.integration.test.ts`.
- **Downstream**: a future CI workflow that runs the disabled-mode suite on every
  change; possible future full-coverage E2E and visual-regression specs.

## Existing Spec Touchpoints
- **Extends**: `adr-manager` — minimal change to `apps/api/src/container.ts` to
  select `FakeEmbeddingProvider` when `GEMINI_API_KEY` is empty. This is a
  declared cross-spec touchpoint; if `adr-manager`'s requirements should own the
  fallback semantics, revisit it with `/kiro-spec-requirements adr-manager`.
- **Adjacent**: `apps/web` component tests and `apps/api` route/integration
  tests — the E2E suite complements them at the browser level and must not
  duplicate or relocate them.

## Constraints
- Node ≥ 20, pnpm workspace monorepo; new package must follow existing workspace
  conventions (`@adr/*` naming, `type: module`).
- `@playwright/test` requires a headless browser runtime; the environment must be
  able to install/run Playwright browsers. If browser binaries cannot be
  installed in a given environment, the suite must fail clearly (not silently),
  and this is a runtime prerequisite to confirm during implementation.
- Enabled-mode requires outbound access to `generativeai`/`*.googleapis.com`
  (covered by the "Trusted" network level) plus a valid `GEMINI_API_KEY`;
  absent either, enabled-mode specs skip rather than fail.
- The suite must be self-contained: it provisions and cleans up its own temp git
  repo and SQLite file, leaving no shared state between runs.
