# Requirements Document

## Introduction

This feature adds a browser-based end-to-end (E2E) test capability for the ADR
Manager application. Today the application is verified only at the unit and
component level; nothing drives the real, fully-assembled app in a browser
against a live API and a real git-backed ADR repository. This feature
introduces a dedicated E2E test capability that launches the application,
exercises the core user journeys through the real UI, and captures screenshots
of key states. It runs in two modes — a default offline mode that requires no
external embedding service, and an optional mode that exercises the real
embedding service when an API key is available — so that the suite is runnable
in restricted environments while still able to validate the real provider when
credentials exist.

The application under test is owned by the `adr-manager` spec; this feature
observes that application's behavior and does not change it, with one declared
exception: the application's composition root is extended so that similarity
features operate offline when no embedding API key is configured (Requirement 3).

## Boundary Context

- **In scope**:
  - A dedicated E2E test capability that launches the real web app + API + a
    temporary git ADR repository, runs browser tests, and tears everything down.
  - Two execution modes selected by presence of the embedding API key
    (`GEMINI_API_KEY`): an offline default mode and an optional real-provider mode.
  - E2E coverage of the core user journeys: ADR create→edit→save with
    save-conflict recovery, tree browsing including an empty folder, keyword
    search including the no-match state, and folder-scoped similarity including
    the empty-scope state.
  - Screenshot capture at meaningful UI states plus automatic capture of a
    screenshot and trace on test failure.
  - An offline fallback so similarity features work without an embedding API key.
  - A single runnable command and self-contained, repeatable test runs.
- **Out of scope**:
  - Pixel-level visual-regression baseline comparison.
  - Exhaustive E2E coverage of every panel (history, diff, ADR-to-ADR compare,
    relations, folder move) — only the core journeys above are covered.
  - Authoring a CI pipeline/workflow (the suite must be CI-runnable, but the
    workflow definition is not owned here).
  - Changing the ADR feature behavior, the embedding/similarity algorithms, or
    the embedding provider implementations themselves.
  - Authentication or multi-user concerns.
- **Adjacent expectations**:
  - From `adr-manager`: the web app, API routes, composition root, and the
    existing fake embedding provider are reused as-is (apart from the offline
    fallback selection in Requirement 3).
  - The "skip when no `GEMINI_API_KEY`" convention established by the existing
    Gemini integration test is followed for the optional real-provider mode.
  - Existing unit/component/integration tests remain the owners of their levels;
    the E2E suite complements them and does not relocate or duplicate them.

## Requirements

### Requirement 1: Application orchestration for E2E runs

**Objective:** As a developer running the E2E suite, I want the application and its
backing data to be launched and torn down automatically, so that I can run the
tests with a single command without manual setup.

#### Acceptance Criteria

1. When the E2E suite starts, the E2E Test Harness shall launch the API service and the web application before any test executes.
2. When the E2E suite starts, the E2E Test Harness shall provision a temporary git-initialized ADR repository and a scratch database location dedicated to the run.
3. While tests are executing, the E2E Test Harness shall route web-application requests to the launched API service so that the browser exercises the real API.
4. When the E2E suite finishes, whether it passes or fails, the E2E Test Harness shall stop the launched services and remove the temporary repository and scratch database location.
5. If a launched service does not become ready within a bounded startup period, then the E2E Test Harness shall abort the run and report the startup failure rather than executing tests against an unready service.
6. The E2E Test Harness shall not depend on or modify any pre-existing developer ADR repository or database outside the temporary location it provisions.

### Requirement 2: Dual-mode execution gated by embedding API key

**Objective:** As a developer, I want the suite to run fully offline by default and
to optionally exercise the real embedding provider when credentials are present,
so that the suite is runnable in restricted environments yet able to validate the
real provider when possible.

#### Acceptance Criteria

1. While no embedding API key (`GEMINI_API_KEY`) is configured, the E2E Test Harness shall run all core-journey tests in offline mode using the deterministic fake embedding provider.
2. Where an embedding API key is configured, the E2E Test Harness shall additionally run the real-provider-mode tests against the real embedding provider.
3. If the real-provider-mode tests run without a configured embedding API key, then the E2E Test Harness shall skip those tests and report them as skipped rather than failing them.
4. While running in offline mode, the E2E Test Harness shall not make any outbound calls to the external embedding service.
5. The E2E Test Harness shall report the active mode (offline or real-provider) for the run so that results are interpretable.

### Requirement 3: Offline embedding fallback in the application

**Objective:** As an operator running the application without embedding credentials, I
want similarity features to work offline, so that the application is usable (and
testable) without an external embedding service.

#### Acceptance Criteria

1. While no embedding API key is configured, the ADR Manager API shall use the fake embedding provider for similarity operations.
2. While an embedding API key is configured, the ADR Manager API shall use the real embedding provider for similarity operations.
3. When the ADR Manager API selects the offline fallback provider, it shall serve similarity requests successfully without contacting the external embedding service.
4. The offline fallback shall preserve the existing similarity request and response behavior so that the user-facing similarity feature continues to function.

### Requirement 4: Core user-journey coverage

**Objective:** As a maintainer, I want the E2E suite to exercise the application's core
user journeys through the real UI, so that regressions in the assembled
application are caught.

#### Acceptance Criteria

1. When a user creates a new ADR, edits its content, and saves it, the E2E Suite shall verify that the saved ADR is persisted and reflected in the UI.
2. If a user saves an ADR whose underlying content has changed since it was loaded (a save conflict), then the E2E Suite shall verify that the UI surfaces the conflict and allows the user to recover rather than silently overwriting.
3. When a user browses the ADR tree, the E2E Suite shall verify that the tree structure is displayed, including the empty-state presentation for a folder that contains no ADRs.
4. When a user performs a keyword search that matches ADRs, the E2E Suite shall verify that matching results are displayed.
5. If a user performs a keyword search that matches no ADRs, then the E2E Suite shall verify that the no-results empty state is displayed.
6. When a user requests folder-scoped similarity for a populated scope, the E2E Suite shall verify that similarity results are displayed.
7. If a user requests folder-scoped similarity for a scope with no eligible ADRs (empty scope), then the E2E Suite shall verify that the empty-scope state is displayed.

### Requirement 5: Screenshot and failure-artifact capture

**Objective:** As a reviewer, I want screenshots of key application states and
diagnostic artifacts on failure, so that I have a visual record and can debug
failed runs.

#### Acceptance Criteria

1. When a covered journey reaches a meaningful state (for example a saved ADR, a save-conflict notice, a no-results state, or an empty-scope state), the E2E Suite shall capture a screenshot of that state to a designated output location.
2. If a test fails, then the E2E Suite shall automatically capture a screenshot and an execution trace for that test to the designated output location.
3. The E2E Suite shall write all captured artifacts to a dedicated output location so they can be collected after the run.
4. The E2E Suite shall not perform pixel-level visual-regression baseline comparison as a pass/fail criterion.

### Requirement 6: Self-contained and runnable suite

**Objective:** As a developer or CI environment, I want the suite to be invoked with a
single command and to leave no shared state behind, so that runs are repeatable
and CI-friendly.

#### Acceptance Criteria

1. When a developer invokes the documented E2E command, the E2E Suite shall execute the full offline-mode suite without additional manual setup.
2. The E2E Suite shall be invocable in a headless environment so that it can run in CI.
3. If the required browser runtime is unavailable, then the E2E Suite shall fail with a clear, actionable error rather than skipping silently or reporting a false pass.
4. When a run completes, the E2E Suite shall leave no residual temporary repository, scratch database, or running service from that run.
5. The E2E Suite shall be repeatable, producing consistent results across successive offline-mode runs that start from the same provisioned state.
