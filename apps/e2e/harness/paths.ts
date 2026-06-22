// Run-scoped temporary paths for the E2E harness.
//
// This is the leaf, pure-value module of the harness (design "harness/paths.ts"
// + "State Management"). It computes a frozen `{ repoPath, sqlitePath,
// artifactsDir, geminiApiKey }` object ONCE at module load and is imported by
// the Playwright config and the global setup/teardown so they all act on the
// same locations.
//
// It performs NO filesystem mutation: it only *computes* strings and reads
// `process.env.GEMINI_API_KEY`. Creating/removing the run directory belongs to
// globalSetup/globalTeardown (later tasks).

import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Directory of THIS module (`apps/e2e/harness`) — ESM-safe. */
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dedicated artifact output directory: `apps/e2e/artifacts` (gitignored).
 *
 * Resolved relative to this module's location (not cwd) so it is stable
 * regardless of where the runner is invoked from. It lives OUTSIDE the OS temp
 * run dir on purpose: artifacts must SURVIVE teardown so they can be collected
 * after the run (Req 5.3).
 */
const ARTIFACTS_DIR = path.resolve(here, "..", "artifacts");

/** Prefix that makes the run directory obviously this suite's. */
const RUN_DIR_PREFIX = "adr-e2e-";

/** Frozen shape exported by this module. */
export type Paths = Readonly<{
  /**
   * Absolute path to the run's temporary git ADR repository. This IS the
   * run-scoped directory under the OS temp dir; teardown removes it with a
   * single recursive remove, which also clears `sqlitePath` (below).
   */
  repoPath: string;
  /**
   * Absolute path to the scratch SQLite index, placed INSIDE `repoPath` so that
   * removing `repoPath` removes the index too (Req 6.4).
   */
  sqlitePath: string;
  /**
   * Absolute path to the dedicated artifact output dir (`apps/e2e/artifacts`).
   * NOT under the run dir, so it survives teardown (Req 5.3).
   */
  artifactsDir: string;
  /** `process.env.GEMINI_API_KEY ?? ""` — the offline/real-provider mode passthrough. */
  geminiApiKey: string;
}>;

/**
 * Compute a fresh, frozen `Paths` value.
 *
 * Pure: no filesystem mutation. Each call yields a unique `repoPath` under
 * `os.tmpdir()` (Req 1.6 — concurrent runs never collide and never touch a
 * developer's `./data` repo). Uniqueness is built from `process.pid`,
 * `Date.now()`, and a `randomUUID` token. Exported for unit testing of the
 * env passthrough and uniqueness without re-importing the module.
 */
export function computePaths(): Paths {
  const token = `${process.pid}-${Date.now()}-${randomUUID()}`;
  // `repoPath` is the run dir: the temp git repo. A single `rm -rf` of it in
  // teardown removes both the repo and the SQLite index nested inside it.
  const repoPath = path.join(os.tmpdir(), `${RUN_DIR_PREFIX}${token}`);
  const sqlitePath = path.join(repoPath, "index.sqlite");

  return Object.freeze({
    repoPath,
    sqlitePath,
    artifactsDir: ARTIFACTS_DIR,
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  });
}

/**
 * The single, run-scoped paths value. Computed ONCE at module load so every
 * importer in the same process sees identical, stable locations.
 *
 * Teardown removes `paths.repoPath` (the run dir) — that clears the temp git
 * repo AND `paths.sqlitePath`, which lives inside it.
 */
export const paths: Paths = computePaths();
