# Research Log: playwright-e2e

## Discovery Scope

Light (extension-focused) discovery. The feature adds a new browser-E2E test
workspace to an existing pnpm monorepo and makes one small change to the API
composition root. Discovery focused on integration points, existing test
patterns to reuse, the external dependency (Playwright), and the runtime
prerequisite (browser binaries). No greenfield architecture invented.

## Codebase Findings

### Monorepo & runtime
- pnpm workspace (`pnpm@9.7.0`), `packages: ["apps/*", "packages/*"]`, Node `>=20`
  (container runs Node 22). New workspace `apps/e2e` fits the existing pattern.
- Packages follow `@adr/*` naming, `"type": "module"`, vitest for tests.
- Scripts are per-package and aggregated with `pnpm -r`. Root `test` runs
  `pnpm -r test`; E2E must be a **separate** script so `pnpm -r test` does not
  launch browsers/servers.

### Application under test
- API: Fastify, entrypoint `apps/api/src/server.ts`, launched via
  `tsx watch src/server.ts` (`pnpm --filter @adr/api dev`). Reads env in
  `apps/api/src/config.ts`: `ADR_REPO_PATH` (default `./data/adr-repo`),
  `SQLITE_PATH` (default `./data/index.sqlite`), `GEMINI_API_KEY` (default `""`),
  `GEMINI_EMBED_MODEL`, `PORT` (default `3000`).
- Web: Vite + React, `pnpm --filter @adr/web dev` → `vite`. `vite.config.ts`
  proxies `/api` → `http://localhost:3000`, so the API **must** listen on 3000
  for the browser's relative `/api/...` calls to resolve.
- Composition root `apps/api/src/container.ts:59` **always** constructs
  `GeminiEmbeddingProvider(cfg.gemini.model, cfg.gemini.apiKey)`, even when
  `apiKey` is `""`. `FakeEmbeddingProvider`
  (`apps/api/src/infrastructure/embeddings/fake.ts`) already implements the same
  `EmbeddingProvider` port (deterministic, no network) but is never selected.

### Similarity offline-viability (key finding)
- `SimilarityService.vectorFor` (`packages/core/src/similarity/similarityService.ts:57`)
  is cache-first: on a blob-sha cache miss it calls `provider.embed(...)` and
  stores the result. With `FakeEmbeddingProvider` wired in, vectors are computed
  deterministically **with no network call**. Therefore **ranked** similarity
  (Req 4.6) is fully reproducible offline once the fallback (Req 3) is in place —
  no vector pre-seeding is required (unlike `App.test.tsx`, which seeds vectors
  only because it deliberately wires a `GeminiEmbeddingProvider` with fake creds).
- `findSimilar` short-circuits to `{kind:"emptyScope"}` when the target ADR is
  alone in scope (`similarityService.ts:40`) → drives the empty-scope state
  (Req 4.7) by placing an ADR alone in a fresh folder.

### Existing test pattern to mirror
- `apps/web/src/App.test.tsx` already performs the full create→edit→save→409
  conflict→reload→save flow, but **in-process** (jsdom + a live Fastify via
  `app.listen({port:0})` + a temp git repo via `mkdtemp`+`simpleGit`). The E2E
  suite reuses the same *scenario shape* but against **two real processes in a
  real browser**. It also confirms the exact data-driving facts below.

### UI selectors & state markers (stable `data-testid`s)
| Journey | Drive | Assert state |
|---------|-------|--------------|
| Author + create | `author-name-input`, `title-input`, `create-button` | `adr-editor-edit` |
| Edit + save | `body-textarea`, `save-button` | `save-success-message` |
| Save conflict | concurrent write, then `save-button` | `conflict-message`, then `reload-latest-button` → `save-success-message` |
| Tree browse | mount | `folder-tree`, `folder-node-<path>`, `adr-node-<id>` |
| Empty folder | `new-folder-path-input`, `create-folder-button` | `folder-node-<path>` with no `adr-node-*` children |
| Search match | `search-query-input`, `search-submit-button` | `search-results`, `search-result-<id>` |
| Search no-match | search a nonexistent token | `search-no-results` |
| Similarity ranked | `panel-tab-similarity` (ADR with a sibling) | `similarity-results`, `similarity-result-<id>` |
| Similarity empty-scope | `panel-tab-similarity` (ADR alone in folder) | `similarity-empty` |

### Data-flow facts that shape the tests
- The search index is populated only on `save()`, **not** on `create()` (create
  writes an empty body). So a created ADR is only searchable after an edit+save.
- A created ADR's id is not rendered as text; it is recovered via a search on its
  unique title (mirrors `App.test.tsx`). Tests therefore use **unique** titles
  and folders so a single shared repo per run has no cross-test collisions.
- Repo must be git-initialized with an initial commit (`App.test.tsx` seeds
  `decisions/.gitkeep`) before the API serves it.

## Technology Alignment (Build vs Adopt)

- **Adopt `@playwright/test`** (Apache-2.0, actively maintained, Node ≥20). It
  natively provides everything the requirements need: multi-process `webServer`
  auto-launch + readiness wait + teardown (Req 1.1, 1.4, 1.5), headless browser
  for CI (Req 6.2), automatic on-failure screenshot + trace (Req 5.2),
  per-state `page.screenshot()` (Req 5.1), and `test.skip()` for mode gating
  (Req 2.3). Building a custom Selenium/CDP harness was rejected — no requirement
  justifies it and it would re-implement solved problems.
- **Reuse `simple-git`** (already a workspace dependency) in global setup to
  init + seed the temporary ADR repo (Req 1.2), mirroring `App.test.tsx`.
- **Reject `toHaveScreenshot` pixel baselines** — explicitly out of scope
  (Req 5.4); the suite captures images as artifacts, not as pass/fail oracles.

## Design Decisions

- **Generalization**: All seven journey criteria reduce to "drive the real UI →
  assert a rendered `data-testid` state → screenshot it." Captured as a few thin
  helpers (a per-page action wrapper + a `shot(page, name)` screenshot helper +
  a `requiresGemini()` gate) rather than bespoke plumbing per test.
- **One shared server set + one shared temp repo per run** (not per test).
  Playwright launches the `webServer` set once for the whole run; isolation is
  achieved by unique titles/folders per test, not by per-test processes. This is
  the smallest design that satisfies Req 1 and Req 6.5 and keeps run time low.
- **Single mode switch**: `GEMINI_API_KEY` presence drives **both** the API's
  provider selection (Req 3) and the enabled-spec gating (Req 2.2, 2.3). One
  variable, no second flag — passed to the `webServer` child env so the running
  API and the test process agree on the mode.
- **Run-scoped temp paths computed once** in a `harness/paths.ts` module at
  config load, referenced by both `webServer.env` and `globalTeardown`, so setup
  and teardown act on the same location (Req 1.2, 1.4, 6.4).

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browser binaries not installed in an environment | Suite cannot run | Document/`postinstall`-style `playwright install chromium`; surface a clear failure, never a false pass (Req 6.3). |
| API port mismatch with Vite proxy | Browser `/api` calls 502 | Pin API `PORT=3000` in `webServer.env` to match `vite.config.ts` proxy target. |
| Cross-test state in the shared repo | Flaky search/tree assertions | Unique titles/folders per test; never assert on global counts. |
| Enabled mode needs network + key | Spurious failures | `requiresGemini()` skips (not fails) when key absent (Req 2.3); enabled mode needs Trusted network (`*.googleapis.com`). |
| `webServer` startup race | Tests hit unready server | Rely on Playwright `webServer.url` readiness probe + bounded timeout (Req 1.5). |
