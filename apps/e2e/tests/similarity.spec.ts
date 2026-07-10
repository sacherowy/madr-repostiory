// Journey: related reading on the decision article — ranked results and the
// empty-scope state (portal migration of the old folder-scoped SimilarityPanel;
// Req 6.5, and Req 15.2 preserves the existing similarity behavior through the
// portal). The article's ContextRail renders "Related reading" for the decisions
// similar to the open one — the similarity scope is the decision's own folder
// (resolved by useDecision) — each with the reused SimilarityMeter. Offline,
// ranking is served by the deterministic fake embedding provider selected in the
// API composition root when no GEMINI_API_KEY is set. A real-provider variant is
// gated by the embedding key (Req 2.2, 2.3). ADRs are seeded into unique folders
// via the proxied API; related reading is then observed through the real UI.

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

/** From Home, open a decision's article by clicking its feed card. */
async function openArticle(page: Page, adrId: string): Promise<void> {
  await expect(page.getByTestId(`home-card-${adrId}`)).toBeVisible();
  await page.getByTestId(`home-card-${adrId}`).click();
  await expect(page.getByTestId("article-page")).toBeVisible();
}

test("shows ranked related reading and an empty related-reading state (offline)", async ({
  page,
  request,
}) => {
  // Two ADRs sharing one unique folder → a populated own-folder scope (ranked).
  const rankedFolder = `decisions/${unique("sim-ranked")}`;
  const a1 = await createAdr(request, rankedFolder, "Similarity Alpha One");
  await createAdr(request, rankedFolder, "Similarity Alpha Two");

  // A single ADR alone in another unique folder → an empty own-folder scope.
  const emptyFolder = `decisions/${unique("sim-empty")}`;
  const b1 = await createAdr(request, emptyFolder, "Similarity Lonely One");

  await page.goto("/");

  // Populated scope → the article's ContextRail shows Related reading with a
  // ranked entry and a reused SimilarityMeter, served offline by the fake
  // provider (Req 6.5, 15.2).
  await openArticle(page, a1);
  await expect(page.getByTestId("context-rail-related-reading")).toBeVisible();
  await expect(page.locator('[data-testid="context-rail-related"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="context-rail-similarity-meter"]').first()).toBeVisible();
  await shot(page, "similarity-related-reading-offline");

  // Empty scope → no Related reading section renders for a decision alone in its
  // folder (the section collapses when there is nothing similar).
  await page.getByTestId("top-nav-home").click();
  await openArticle(page, b1);
  await expect(page.getByTestId("context-rail")).toBeVisible();
  await expect(page.getByTestId("context-rail-related-reading")).toHaveCount(0);
  await shot(page, "similarity-empty-scope");
});

test("ranks related reading with the real embedding provider", async ({ page, request }) => {
  // Enabled-mode variant: runs only when GEMINI_API_KEY is configured; otherwise
  // it is reported as skipped (never failed) — Req 2.2, 2.3.
  requiresGemini();

  const realFolder = `decisions/${unique("sim-real")}`;
  const c1 = await createAdr(request, realFolder, "Real Similarity One");
  await createAdr(request, realFolder, "Real Similarity Two");

  await page.goto("/");
  await openArticle(page, c1);
  await expect(page.getByTestId("context-rail-related-reading")).toBeVisible();
  await expect(page.locator('[data-testid="context-rail-related"]').first()).toBeVisible();
  await shot(page, "similarity-related-reading-real");
});
