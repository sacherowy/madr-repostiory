// Thin, reusable scenario utilities shared by the journey specs (design
// "harness/helpers.ts", Service Interface). Three responsibilities only:
//   - shot(page,name): capture a key-state screenshot into the artifacts dir (Req 5.1).
//   - requiresGemini(): skip (never fail) enabled-mode specs without a key (Req 2.2, 2.3).
//   - unique(prefix): a per-call, title/folder-safe id for isolation (Req 6.5).
//
// Constraints (design): helpers MUST NOT import any spec file, and hold no
// cross-test shared mutable state beyond a private module-local counter used for
// uniqueness. Per-journey flows live in the specs, not here.

import fs from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { paths } from "./paths.js";

/**
 * Reduce an arbitrary label to filesystem- AND title-safe characters: only
 * `[A-Za-z0-9-_]`. Spaces, slashes, dots, and any other character collapse to a
 * single `-`, with leading/trailing separators trimmed. Used for both screenshot
 * filenames and `unique()` prefixes so both are safe as folder segments.
 */
function sanitize(label: string): string {
  return label
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Monotonic, run-scoped counter guaranteeing distinct `unique()` values. */
let counter = 0;

/**
 * Save a screenshot of a key state into the configured artifacts dir (Req 5.1).
 *
 * Builds a filesystem-safe filename from `name` and writes a single full-page
 * PNG under `paths.artifactsDir`. The artifacts dir is created lazily here — this
 * is the one place that does so — so specs can call `shot()` without setup.
 */
export async function shot(page: Page, name: string): Promise<void> {
  const safeName = sanitize(name) || "screenshot";
  await fs.mkdir(paths.artifactsDir, { recursive: true });
  const target = path.join(paths.artifactsDir, `${safeName}.png`);
  await page.screenshot({ path: target, fullPage: true });
}

/**
 * True when no usable embedding API key is configured (unset, empty, or
 * whitespace-only). Extracted as a pure predicate so it can be unit-tested
 * without a Playwright test context; `requiresGemini` is a one-liner over it.
 */
export function geminiKeyMissing(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return !key || key.trim() === "";
}

/**
 * Gate an enabled-mode (real-provider) test: SKIPS (does not fail) when
 * `GEMINI_API_KEY` is absent (Req 2.3). Call at the top of an enabled-only
 * test/`describe`. Reads the same env channel the API received via
 * `webServer.env`, keeping API mode and spec gating in sync (Req 2.2).
 */
export function requiresGemini(): void {
  test.skip(geminiKeyMissing(), "requires GEMINI_API_KEY (real-provider mode)");
}

/**
 * Produce a per-call unique, filesystem- AND title-safe suffix for isolation in
 * the shared run repo (Req 6.5). Combines the sanitized prefix with a base36
 * timestamp, a monotonic counter, and a short random token so values never
 * repeat within a run and are safe as both ADR titles and folder path segments
 * (only `[A-Za-z0-9-_]`).
 */
export function unique(prefix: string): string {
  const safePrefix = sanitize(prefix) || "x";
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${safePrefix}-${time}-${(counter++).toString(36)}-${rand}`;
}
