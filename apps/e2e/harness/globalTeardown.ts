// Playwright globalTeardown for the E2E harness.
//
// Runs ONCE per run, after all specs (design "harness/globalTeardown.ts" +
// "Batch / Job Contract"). Its sole responsibility is to remove the run-scoped
// temporary directory so the run leaves no residual repo or scratch SQLite
// behind (Req 1.4, 6.4).
//
// The launched API and web processes are stopped by Playwright's own
// `webServer` lifecycle (Req 1.4) — teardown does NOT kill processes; it only
// removes the temp dir.
//
// Direction: this module CONSUMES `paths` (the leaf value module) and never the
// reverse (design "Dependency Direction"). The removal is factored into an
// exported pure function so the unit test can exercise it without Playwright
// invoking the default export.

import { rm } from "node:fs/promises";

import { paths } from "./paths.js";

/**
 * Recursively remove a run-scoped directory (the temp git ADR repo together
 * with the scratch SQLite index nested inside it).
 *
 * Uses `{ recursive: true, force: true }`: `recursive` clears the whole tree in
 * one call (so the nested `index.sqlite` and any committed ADRs go with it), and
 * `force: true` makes the call a no-op when the directory is already absent —
 * giving the teardown idempotency/recovery (design "Idempotency & recovery";
 * Req 6.4).
 */
export async function removeRunDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/**
 * Playwright globalTeardown entry point. Removes the run-scoped run directory
 * (`paths.repoPath`); because `paths.sqlitePath` lives inside it, a single
 * recursive remove clears both the repo and the scratch index (Req 1.4, 6.4).
 */
export default async function globalTeardown(): Promise<void> {
  await removeRunDir(paths.repoPath);
}
