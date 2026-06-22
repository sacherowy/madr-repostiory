// Journey: folder-scoped similarity — ranked results and the empty-scope state
// (Req 4.6, 4.7, 5.1), plus a real-provider variant gated by the embedding key
// (Req 2.2, 2.3). ADRs are seeded into unique folders via the proxied API
// (Playwright request context); the similarity states are then observed through
// the real UI. Offline, ranking is served by the deterministic fake embedding
// provider selected in the API composition root when no GEMINI_API_KEY is set.

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

import { shot, unique, requiresGemini } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/** Create an ADR in `folder` via the proxied API; returns its id. */
async function createAdr(
  request: APIRequestContext,
  folder: string,
  title: string,
): Promise<string> {
  const res = await request.post("/api/adrs", { data: { title, folder, author: AUTHOR } });
  expect(res.ok(), `createAdr in ${folder} should succeed`).toBeTruthy();
  const adr = (await res.json()) as { id: string };
  return adr.id;
}

/** Drive the UI to select a folder, open one of its ADRs, and switch to the
 *  similarity tab so the panel resolves folder-scoped similarity. */
async function openSimilarityFor(page: Page, folderPath: string, adrId: string): Promise<void> {
  await expect(page.getByTestId("folder-tree")).toBeVisible();
  // Selecting the folder sets the similarity scope and re-roots the tree to it.
  await page.getByTestId(`folder-select-${folderPath}`).click();
  await page.getByTestId(`adr-select-${adrId}`).click();
  await page.getByTestId("panel-tab-similarity").click();
}

test("shows ranked folder-scoped similarity and an empty-scope state (offline)", async ({
  page,
  request,
}) => {
  // Two ADRs sharing one unique folder → a populated scope (ranked).
  const rankedFolder = `decisions/${unique("sim-ranked")}`;
  const a1 = await createAdr(request, rankedFolder, "Similarity Alpha One");
  await createAdr(request, rankedFolder, "Similarity Alpha Two");

  // A single ADR alone in another unique folder → an empty scope.
  const emptyFolder = `decisions/${unique("sim-empty")}`;
  const b1 = await createAdr(request, emptyFolder, "Similarity Lonely One");

  await page.goto("/");

  // Populated scope → ranked similarity, served offline by the fake provider.
  await openSimilarityFor(page, rankedFolder, a1);
  await expect(page.getByTestId("similarity-results")).toBeVisible();
  await expect(page.locator('[data-testid^="similarity-result-"]').first()).toBeVisible();
  await shot(page, "similarity-ranked-offline");

  // Empty scope → the empty-scope state (single ADR alone in its folder).
  await page.reload();
  await openSimilarityFor(page, emptyFolder, b1);
  await expect(page.getByTestId("similarity-empty")).toBeVisible();
  await shot(page, "similarity-empty-scope");
});

test("ranks folder-scoped similarity with the real embedding provider", async ({
  page,
  request,
}) => {
  // Enabled-mode variant: runs only when GEMINI_API_KEY is configured; otherwise
  // it is reported as skipped (never failed) — Req 2.2, 2.3.
  requiresGemini();

  const realFolder = `decisions/${unique("sim-real")}`;
  const c1 = await createAdr(request, realFolder, "Real Similarity One");
  await createAdr(request, realFolder, "Real Similarity Two");

  await page.goto("/");
  await openSimilarityFor(page, realFolder, c1);
  await expect(page.getByTestId("similarity-results")).toBeVisible();
  await shot(page, "similarity-ranked-real");
});
