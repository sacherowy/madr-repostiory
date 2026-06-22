// Playwright globalSetup for the E2E harness.
//
// Runs ONCE per run, before any webServer child or spec (design "harness/
// globalSetup.ts" + "Batch / Job Contract"). It:
//   1. Provisions + seeds the temporary git ADR repo at `paths.repoPath`
//      (Req 1.2) so the launched API serves a valid repo.
//   2. Prechecks that the Chromium runtime is installed and fails loudly with
//      an actionable error when it is not (Req 6.3), rather than silently
//      skipping or false-passing.
//   3. Logs the active mode (offline vs real-provider) derived from
//      `paths.geminiApiKey` (Req 2.5) so results are interpretable.
//
// Direction: this module CONSUMES `paths` (the leaf value module) and never the
// reverse (design "Dependency Direction"). The logic is factored into small
// exported functions so the unit test can exercise them without Playwright
// invoking the default export.

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import { simpleGit } from "simple-git";

import { paths } from "./paths.js";

/** Git identity used for the temp repo's initial commit (mirrors App.test.tsx). */
const GIT_USER_NAME = "ADR E2E";
const GIT_USER_EMAIL = "e2e@example.com";

/**
 * Provision and seed the temporary ADR repository at `repoPath` (Req 1.2).
 *
 * Creates the run dir recursively, `git init`s it, sets a git identity (which
 * MUST be set or the initial commit fails), and commits `decisions/.gitkeep` as
 * the initial commit — mirroring the temp-repo seeding in `apps/web/src/
 * App.test.tsx`. Asserts the initial commit exists before returning so a silent
 * empty-repo state can never propagate to the launched API.
 */
export async function seedRepo(repoPath: string): Promise<void> {
  await mkdir(path.join(repoPath, "decisions"), { recursive: true });

  const git = simpleGit(repoPath);
  await git.init();
  await git.addConfig("user.name", GIT_USER_NAME);
  await git.addConfig("user.email", GIT_USER_EMAIL);

  const gitkeep = path.join(repoPath, "decisions", ".gitkeep");
  await writeFile(gitkeep, "");
  await git.add("decisions/.gitkeep");
  await git.commit("init repo", undefined, {
    "--author": `${GIT_USER_NAME} <${GIT_USER_EMAIL}>`,
  });

  // Validation (design "Implementation Notes"): the initial commit must exist.
  const log = await git.log();
  if (log.total < 1) {
    throw new Error(
      `Failed to seed temp ADR repo at ${repoPath}: no initial commit was created.`,
    );
  }
}

/**
 * Verify the Chromium runtime is actually installed on disk (Req 6.3).
 *
 * Playwright reports where it expects the browser binary via
 * `chromium.executablePath()`. If that path is missing, throw a clear,
 * actionable error naming the exact fix so the run fails loudly rather than
 * silently skipping or reporting a false pass.
 */
export function assertBrowserInstalled(): void {
  const executablePath = chromium.executablePath();
  if (!existsSync(executablePath)) {
    throw new Error(
      `Chromium runtime not found at ${executablePath}. ` +
        "Run `pnpm --filter @adr/e2e exec playwright install chromium` " +
        "(requires network access to cdn.playwright.dev) before running the E2E suite.",
    );
  }
}

/**
 * Log the active run mode derived from the embedding API key (Req 2.5).
 *
 * Empty key → offline (deterministic fake provider); non-empty → real-provider.
 */
export function logMode(geminiApiKey: string): void {
  if (geminiApiKey === "") {
    console.log("[e2e] mode: offline (no GEMINI_API_KEY)");
  } else {
    console.log("[e2e] mode: real-provider (GEMINI_API_KEY set)");
  }
}

/**
 * Playwright globalSetup entry point. Composes the steps above using the
 * run-scoped `paths`. The browser precheck runs FIRST so a missing runtime
 * aborts the run fast, before any filesystem provisioning.
 */
export default async function globalSetup(): Promise<void> {
  assertBrowserInstalled();
  await seedRepo(paths.repoPath);
  logMode(paths.geminiApiKey);
}
