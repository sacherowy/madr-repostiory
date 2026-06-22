// Journey: keyword search match + no-match (Req 4.4, 4.5, 5.1). Creates, edits
// and saves an ADR carrying a unique token (the search index is populated only
// on save), searches for it and confirms the ranked match, then searches a
// guaranteed-absent token and confirms the no-results state.

import { test, expect } from "@playwright/test";

import { shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/** A unique, hyphen-free word safe to embed in a title/body and search verbatim. */
function token(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

test("keyword search shows a ranked match and a no-results state", async ({ page }) => {
  const tag = token("zzmatch");

  await page.goto("/");
  await page.getByTestId("author-name-input").fill(AUTHOR);

  // Create → edit → save an ADR carrying the unique token so it becomes searchable.
  await expect(page.getByTestId("adr-editor-create")).toBeVisible();
  await page.getByTestId("title-input").fill(`Search ${tag} topic`);
  await page.getByTestId("create-button").click();
  await expect(page.getByTestId("adr-editor-edit")).toBeVisible();
  await page.getByTestId("body-textarea").fill(`Body mentioning ${tag} for indexing.`);
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-success-message")).toBeVisible();

  // Search the unique token → a matching ranked result appears.
  await page.getByTestId("search-query-input").fill(tag);
  await page.getByTestId("search-submit-button").click();
  await expect(page.getByTestId("search-results")).toBeVisible();
  await expect(page.locator('[data-testid^="search-result-"]').first()).toBeVisible();
  await shot(page, `search-match-${tag}`);

  // Search a guaranteed-absent token → the no-results empty state.
  const absent = token("zznomatch");
  await page.getByTestId("search-query-input").fill(absent);
  await page.getByTestId("search-submit-button").click();
  await expect(page.getByTestId("search-no-results")).toBeVisible();
  await shot(page, `search-no-results-${absent}`);
});
