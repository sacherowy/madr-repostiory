# Implementation Plan

- [x] 1. Foundation: E2E workspace and offline embedding fallback

- [x] 1.1 Scaffold the `apps/e2e` Playwright workspace and runtime
  - Add a new `@adr/e2e` workspace package (ESM, Node ≥20) with `@playwright/test` and `simple-git` as dev dependencies, extending the shared base TypeScript config.
  - Install the Chromium browser runtime so the suite can launch a headless browser.
  - Add a root-level command that runs the E2E suite via the new package, kept separate from `pnpm -r test` so the ordinary test run never launches browsers/servers.
  - Ignore the E2E artifact output directory from version control.
  - Observable: `pnpm --filter @adr/e2e exec playwright --version` succeeds and the root E2E command resolves to the new package (even before any spec exists).
  - _Requirements: 5.3, 6.1, 6.2_

- [x] 1.2 (P) Make the API select the offline embedding provider when no key is set
  - In the API composition root, construct the deterministic fake embedding provider when the embedding API key is empty, and the real provider otherwise, with no change to container/service wiring.
  - Extend the composition-root unit test to assert provider selection for both the empty-key and non-empty-key cases.
  - Observable: with no embedding key configured, similarity requests resolve through the fake provider with no outbound network call; the unit test proves the selection both ways.
  - _Requirements: 2.1, 2.4, 3.1, 3.2, 3.3, 3.4_
  - _Boundary: container.ts_

- [x] 2. Harness orchestration

- [x] 2.1 Provide run-scoped temporary paths
  - Compute, once per run, an absolute temporary ADR-repository path, a scratch index path inside that same directory, and an artifact output directory, plus the embedding-key passthrough read from the environment.
  - Keep this a pure value module that performs no filesystem mutation, so setup and teardown act on identical locations and never touch a developer's working data.
  - Observable: importing the module yields stable absolute paths under the OS temp directory for the duration of a run.
  - _Requirements: 1.2, 1.6, 5.3, 6.4_
  - _Boundary: harness paths_

- [x] 2.2 Seed the temporary repository and verify prerequisites at global setup
  - Before any server or spec runs, create the run directory, initialize a git repository with a committer identity, and commit an initial decisions placeholder so the API serves a valid repository.
  - Pre-check that the browser runtime is installed and fail with a clear, actionable error when it is not, rather than skipping silently or reporting a false pass.
  - Log the active mode (offline vs real-provider) derived from the embedding-key passthrough.
  - Observable: after global setup the temporary repository has an initial commit, and a missing browser runtime aborts the run with an explicit message.
  - _Requirements: 1.2, 2.5, 6.3_
  - _Boundary: harness globalSetup_
  - _Depends: 2.1_

- [x] 2.3 (P) Remove the temporary run directory at global teardown
  - After all specs finish, recursively remove the run-scoped directory (repository plus scratch index), tolerating an already-absent directory.
  - Observable: after a run completes, no temporary repository or scratch index remains on disk.
  - _Requirements: 1.4, 6.4_
  - _Boundary: harness globalTeardown_
  - _Depends: 2.1_

- [x] 2.4 Configure process launch, routing, artifacts, and lifecycle wiring
  - Launch the API and web dev servers automatically, passing the run-scoped repository path, scratch index path, embedding-key passthrough, and the fixed API port that matches the web proxy target; wait for both to become ready within a bounded timeout and abort the run if they do not.
  - Point the browser at the web server so its relative API calls are proxied to the API, run headless, capture a screenshot and trace automatically on failure, and write all artifacts to the dedicated output directory; do not configure pixel-baseline snapshot comparison as a pass/fail oracle.
  - Wire the global setup and teardown into the run lifecycle.
  - Observable: invoking the suite starts both servers, runs against the browser base URL, and on a forced failure produces a screenshot and trace under the artifact directory; the run aborts cleanly if a server never becomes ready.
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 5.2, 5.3, 5.4, 6.2_
  - _Boundary: playwright.config_
  - _Depends: 2.1, 2.2, 2.3_

- [x] 3. Scenario support helpers
  - Provide a screenshot helper that saves a named image of a key state into the artifact directory, a mode gate that skips (never fails) real-provider tests when no embedding key is present, and a uniqueness helper that yields per-test title/folder-safe names for isolation.
  - Keep helpers minimal and free of any import from spec files or shared mutable state.
  - Observable: a spec can call the gate to skip an enabled-only test when no key is set, capture a named screenshot, and generate collision-free names within a run.
  - _Requirements: 2.2, 2.3, 5.1, 6.5_
  - _Boundary: harness helpers_
  - _Depends: 2.1_

- [x] 4. Core user-journey specs

- [x] 4.1 (P) ADR create, edit, save, and conflict-recovery journey
  - Drive the real UI to set the author, create a uniquely-titled ADR, reach edit mode, edit the body, save, and confirm the saved success state; screenshot the saved state.
  - Force a save conflict by making a concurrent write behind the editor, attempt another save, confirm the conflict is surfaced (not a silent overwrite), reload the latest version, save again, and confirm recovery to a saved state; screenshot the conflict state and the recovered state.
  - Observable: the spec passes end-to-end against the running app, showing the success state, then the conflict state, then a successful save after reload, with screenshots captured at each.
  - _Requirements: 4.1, 4.2, 5.1_
  - _Boundary: lifecycle spec_
  - _Depends: 1.2, 2.4, 3_

- [x] 4.2 (P) Tree browsing and empty-folder journey
  - Confirm the tree renders the seeded structure, then create a uniquely-named folder through the UI and confirm it appears as a folder containing no ADRs (the empty-folder state); screenshot the tree and the empty folder.
  - Observable: the spec passes showing the seeded tree and a newly created empty folder node with no ADR children, with screenshots captured.
  - _Requirements: 4.3, 5.1_
  - _Boundary: tree spec_
  - _Depends: 1.2, 2.4, 3_

- [x] 4.3 (P) Keyword search match and no-match journey
  - Create, edit, and save an ADR carrying a unique token (so it becomes searchable), search for it, and confirm the matching result appears; then search a guaranteed-absent token and confirm the no-results state; screenshot both results.
  - Observable: the spec passes showing a ranked match for the unique token and the no-results state for the absent token, with screenshots captured.
  - _Requirements: 4.4, 4.5, 5.1_
  - _Boundary: search spec_
  - _Depends: 1.2, 2.4, 3_

- [x] 4.4 (P) Folder-scoped similarity ranked and empty-scope journey
  - Place two ADRs in one unique folder and confirm folder-scoped similarity shows ranked results offline (via the fake provider); place a single ADR alone in another unique folder and confirm the empty-scope state; screenshot both.
  - Add a real-provider variant of the ranked case guarded by the mode gate so it runs only when an embedding key is present and is reported as skipped otherwise.
  - Observable: the spec passes showing ranked similarity offline and the empty-scope state, with the enabled-mode variant running when a key is set and skipping (not failing) when it is absent; screenshots captured.
  - _Requirements: 4.6, 4.7, 5.1, 2.2, 2.3_
  - _Boundary: similarity spec_
  - _Depends: 1.2, 2.4, 3_

- [x] 5. Validation

- [x] 5.1 Validate the offline run end-to-end
  - Run the full suite with no embedding key configured and confirm all core-journey specs pass, that the run makes no outbound embedding calls, that artifacts (including on-failure screenshots/traces) land in the dedicated directory, and that a repeated run from the same provisioned state is consistent.
  - Confirm that after the run no temporary repository, scratch index, or leftover server process remains.
  - Observable: a single offline command run is green across all journeys, produces artifacts, leaves no residual state, and repeats consistently.
  - _Requirements: 2.1, 2.4, 5.2, 5.3, 6.1, 6.4, 6.5_
  - _Depends: 4.1, 4.2, 4.3, 4.4_

- [x] 5.2 Validate mode gating and reporting
  - Confirm that with no embedding key the real-provider specs report as skipped rather than failed, that the active mode is reported for the run, and that supplying an embedding key activates the enabled-mode variant.
  - Observable: the run output shows the active mode and reports enabled-only specs as skipped without a key and as executed with a key.
  - _Requirements: 2.2, 2.3, 2.5_
  - _Depends: 4.4_

## Implementation Notes
- 1.1: `cdn.playwright.dev` is blocked by the network egress policy (HTTP 403), so `playwright install chromium` cannot download a browser. RESOLVED differently: the runtime image already ships a pre-provisioned Playwright browser at `/opt/pw-browsers/chromium-1194` (Chromium 141, headless shell + ffmpeg, OS deps present). `@playwright/test` is therefore pinned to **1.56.1** (the version whose chromium revision is exactly 1194), so `chromium.executablePath()` resolves to that existing binary and the suite runs headless with no download. The globalSetup browser precheck (Req 6.3) still guards the genuinely-missing case.
- 2.1: `paths.ts` caches the run dir in `process.env.__ADR_E2E_RUN_DIR`. Playwright loads `playwright.config.ts` and the string-referenced `globalSetup`/`globalTeardown` as SEPARATE module graphs, so a `Date.now()`-based run dir would differ between evaluations; the env cache keeps every importer in the process on one directory.
- 2.2 / 2.4 (ORDERING): In Playwright the `webServer` plugin is set up BEFORE `globalSetup` runs (`playwright/lib/runner/tasks.js`: `createPluginSetupTasks` precedes `globalSetups`). The launched API opens the repo at boot, so seeding in globalSetup is too late. Provisioning (browser precheck + mode log + repo seed) therefore runs at **config-load time** in `playwright.config.ts` (the earliest reliable hook), guarded by `!process.env.VITEST` so the config-assertion unit test has no side effects. `seedRepo` is idempotent and globalSetup re-asserts as defense-in-depth. A `vitest.config.ts` scopes `test:unit` to `harness/**` + `playwright.config.test.ts` so vitest never collects the Playwright specs under `tests/`.
