# Requirements Document

## Project Description (Input)

Introduce Playwright browser-based E2E tests that verify the ADR Manager
application end-to-end and capture results as screenshots.

**Who has the problem**: The team maintaining the ADR Manager (`adr-manager`
spec) has no test that drives the real, fully-assembled application in a browser
against a live API. Coverage today is unit + component-level only (vitest +
Testing Library, API via `app.inject()`), so regressions in the real web↔API
wiring and rendered UI can slip through, and there is no captured visual record
of the app's key states.

**Current situation**: The web app (Vite + React) proxies `/api` to the Fastify
API (`tsx src/server.ts`). The composition root (`apps/api/src/container.ts`)
always constructs `GeminiEmbeddingProvider`, even with an empty `GEMINI_API_KEY`,
so similarity flows fail offline — although a `FakeEmbeddingProvider` already
exists and implements the same port. The existing `gemini.integration.test.ts`
establishes a "skip when no `GEMINI_API_KEY`" convention. No Playwright (or any
browser-driving harness) is installed.

**What should change**: Add a dedicated `apps/e2e` Playwright workspace whose
`webServer` config auto-launches the API + web dev server against a temporary
git ADR repository and scratch SQLite path, then tears them down. The suite runs
in two modes selected by `GEMINI_API_KEY`: a default **Gemini-disabled** mode
that runs fully offline via the fake embedding provider, and a **Gemini-enabled**
mode (when a key is present) that exercises the same flows against the real
provider and skips when no key is set. To make disabled-mode a genuine runtime
behavior, `container.ts` is extended to select `FakeEmbeddingProvider` when
`GEMINI_API_KEY` is empty. Coverage targets the core user journeys
(create→edit→save with 409 conflict recovery, tree browsing with an empty
folder, keyword search including the no-match state, and folder-scoped
similarity including the empty-scope state), capturing screenshots at meaningful
positive states plus Playwright's automatic screenshot/trace on failure. Pixel
baseline (`toHaveScreenshot`) comparison and CI workflow authoring are out of
scope.

## Requirements
<!-- Will be generated in /kiro-spec-requirements phase -->
