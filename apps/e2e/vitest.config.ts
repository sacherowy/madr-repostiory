import { defineConfig } from "vitest/config";

// Unit tests for the harness/config modules only. The Playwright journey specs
// live under `tests/` and use `@playwright/test`'s runner — they must NOT be
// collected by vitest (they are run via `playwright test` / `test:e2e`).
export default defineConfig({
  test: {
    include: ["harness/**/*.test.ts", "playwright.config.test.ts"],
    exclude: ["tests/**", "node_modules/**"],
  },
});
