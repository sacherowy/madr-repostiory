// Journey: tree browsing + empty-folder state (Req 4.3, 5.1). Confirms the tree
// renders the seeded structure, then creates a uniquely-named folder through the
// UI and confirms it appears as a folder containing no ADRs.

import { test, expect } from "@playwright/test";

import { shot, unique } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

test("renders the tree and shows a newly created empty folder", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("author-name-input").fill(AUTHOR);

  // The tree renders the seeded structure (loaded, not the error/loading state).
  await expect(page.getByTestId("folder-tree")).toBeVisible();
  await expect(page.getByTestId("folder-node-decisions")).toBeVisible();
  await shot(page, "tree-seeded");

  // Create a uniquely-named folder through the UI.
  const folderPath = `decisions/${unique("empty-folder")}`;
  await page.getByTestId("new-folder-path-input").fill(folderPath);
  await page.getByTestId("create-folder-button").click();

  // It appears as a folder node...
  const folderNode = page.getByTestId(`folder-node-${folderPath}`);
  await expect(folderNode).toBeVisible();
  // ...containing no ADRs (the empty-folder state).
  await expect(folderNode.locator('[data-testid^="adr-node-"]')).toHaveCount(0);
  await shot(page, "tree-empty-folder");
});
