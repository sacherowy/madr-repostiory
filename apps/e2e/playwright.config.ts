// Playwright configuration for the E2E harness (design "playwright.config.ts").
//
// This is the orchestration root of the suite: it declares the two black-box
// processes to launch (API + web), wires the run lifecycle (globalSetup /
// globalTeardown), routes the browser at the web dev server, and sends every
// artifact to the dedicated artifacts dir. It CONSUMES `paths` (the leaf value
// module) and never the reverse (design "Dependency Direction").
//
// Validation note: `defineConfig` is pure, so `playwright.config.test.ts` can
// import this default export and assert the config WITHOUT launching a browser
// (Chromium is intentionally absent in this environment).

import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { paths } from "./harness/paths.js";
import { assertBrowserInstalled, logMode, seedRepo } from "./harness/globalSetup.js";

// Provision the run BEFORE the webServer launches. Playwright sets up the
// `webServer` plugin BEFORE it runs `globalSetup` (see
// playwright/lib/runner/tasks.js: `createPluginSetupTasks` precedes
// `globalSetups`), and the launched API opens the temp repo at boot — so seeding
// in globalSetup would be too late and the API would crash on a missing
// directory. The config module is evaluated before any task (Playwright must
// load it to discover the webServer), making config load the earliest reliable
// hook. We fail fast on a missing browser (Req 6.3), log the active mode (Req
// 2.5), then seed the temp git repo (Req 1.2). Guarded by `!VITEST` so the
// config-assertion unit test can import this module without side effects.
if (!process.env.VITEST) {
  assertBrowserInstalled();
  logMode(paths.geminiApiKey);
  await seedRepo(paths.repoPath);
}

/** Bounded readiness window for each launched dev server (Req 1.5). */
const SERVER_TIMEOUT_MS = 120_000;

/**
 * The Vite dev server URL. The browser drives this origin; relative `/api`
 * calls are proxied by Vite to the API on port 3000 (Req 1.3), so the API MUST
 * listen on 3000 — pinned via `PORT` in the API `webServer.env` below.
 */
const WEB_URL = "http://localhost:5173";

// Both outputs live UNDER the dedicated artifacts dir (Req 5.3), but in
// SEPARATE subdirs: Playwright clears the HTML reporter folder before each run,
// so it must not be the same as (or contain) the test-results `outputDir`, or
// it would wipe sibling artifacts. Keeping them as siblings avoids that clash.
/** Per-test artifact dir (screenshots/traces). */
const TEST_RESULTS_DIR = path.join(paths.artifactsDir, "test-results");
/** HTML report dir. */
const HTML_REPORT_DIR = path.join(paths.artifactsDir, "html-report");

export default defineConfig({
  // Spec files land here in later tasks; an empty dir is fine — the config still
  // parses and `--list` reports "no tests found" without error.
  testDir: "./tests",

  // Run lifecycle wiring (Req 1.4): seed/teardown the temp git repo around the
  // run. Paths are resolved by Playwright relative to this config file.
  globalSetup: "./harness/globalSetup.ts",
  globalTeardown: "./harness/globalTeardown.ts",

  // A bounded per-test timeout keeps a hung journey from stalling the run.
  timeout: 60_000,

  // The whole run shares ONE API + web + temp git repo. Run serially (a single
  // worker, no intra-file parallelism) so concurrent specs never race on the
  // shared git repository, keeping results deterministic and repeatable (Req 6.5).
  fullyParallel: false,
  workers: 1,

  // Launch BOTH the API and the web app before any spec runs (Req 1.1). Each
  // entry declares a readiness `url` + bounded `timeout` so Playwright waits for
  // readiness and aborts the run on timeout (Req 1.5).
  webServer: [
    {
      // API (Fastify). `webServer.env` is the SOLE mode channel to the API
      // (design "Implementation Notes"): the embedding key is forwarded
      // verbatim from `paths` — never hard-coded here.
      command: "pnpm --filter @adr/api dev",
      env: {
        ADR_REPO_PATH: paths.repoPath,
        SQLITE_PATH: paths.sqlitePath,
        GEMINI_API_KEY: paths.geminiApiKey,
        // PORT 3000 matches the Vite `/api` proxy target (Req 1.3).
        PORT: "3000",
      },
      // Readiness probe against the API's GET /health route (Req 1.5).
      url: "http://localhost:3000/health",
      timeout: SERVER_TIMEOUT_MS,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Web (Vite dev server, default port 5173).
      command: "pnpm --filter @adr/web dev",
      url: WEB_URL,
      timeout: SERVER_TIMEOUT_MS,
      reuseExistingServer: !process.env.CI,
    },
  ],

  use: {
    // Route the browser at the web dev server so relative `/api` calls proxy to
    // the API on 3000 (Req 1.3).
    baseURL: WEB_URL,
    // CI/headless-runnable (Req 6.2).
    headless: true,
    // Diagnostic capture on failure only (Req 5.2).
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  // All artifacts to the dedicated dir so they can be collected after the run
  // (Req 5.3). NOTE: no `expect.toHaveScreenshot` / snapshot oracle is
  // configured — pixel-baseline diffing is explicitly NOT a pass/fail criterion
  // (Req 5.4).
  outputDir: TEST_RESULTS_DIR,
  reporter: [["list"], ["html", { outputFolder: HTML_REPORT_DIR, open: "never" }]],

  // A single Chromium project (scope decision; cross-browser is not required).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
