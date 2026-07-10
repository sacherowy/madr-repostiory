// Journey: keyword search on the Home hero — the portal migration of the old
// Cmd-K command-palette / SearchPanel search (Req 14.2, 2.7; behavior preserved
// through the portal, Req 15.2 / 16.4). The hero search now renders results as
// feed cards in place: HomePage joins the ranked hits to the feed cards by id and
// shows them in the identical feed-card presentation, and a no-match search shows
// the inviting "No matching decisions" empty state. A decision carrying a unique
// token is seeded via the proxied API (create + save — the search index is
// populated on save), then found through the real UI. Runs offline.

import { test, expect, type APIRequestContext } from "@playwright/test";

import { shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/** A unique, hyphen-free word safe to embed in a title/body and search verbatim. */
function token(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Create + save a decision carrying `tag` in both its title and its context body
 * so it becomes searchable (the index is populated on save). Returns its id so
 * the exact feed card can be targeted.
 */
async function seedSearchable(
  request: APIRequestContext,
  title: string,
  tag: string,
): Promise<string> {
  const created = await request.post("/api/adrs", {
    data: { title, folder: "decisions", author: AUTHOR },
  });
  expect(created.ok(), "createAdr should succeed").toBeTruthy();
  const adr = (await created.json()) as { id: string; blobSha: string; date: string };

  const saved = await request.put(`/api/adrs/${encodeURIComponent(adr.id)}`, {
    data: {
      title,
      status: "accepted",
      date: adr.date,
      decisionMakers: [],
      consulted: [],
      informed: [],
      tags: [],
      relations: [],
      contextAndProblemStatement: `Body mentioning ${tag} for indexing.`,
      decisionDrivers: "",
      consideredOptions: "",
      decisionOutcome: "Proceed.",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      author: AUTHOR,
      baseBlobSha: adr.blobSha,
    },
  });
  expect(saved.ok(), "saveAdr should succeed").toBeTruthy();
  return adr.id;
}

test("hero search shows a ranked feed-card match and an inviting no-results state", async ({
  page,
  request,
}) => {
  const tag = token("zzmatch");
  const title = `Search ${tag} topic`;
  const id = await seedSearchable(request, title, tag);

  await page.goto("/");
  await expect(page.getByTestId("home-page")).toBeVisible();
  // The seeded decision is present in the browsing feed (the feed has loaded).
  await expect(page.getByTestId(`home-card-${id}`)).toBeVisible();

  // Search the unique token → the matching decision renders in place as a feed
  // card (results reuse the identical FeedCard presentation — Req 14.2).
  await page.getByTestId("home-search-input").fill(tag);
  await page.getByTestId("home-search-submit").click();
  await expect(page.getByTestId("home-feed")).toBeVisible();
  await expect(page.getByTestId(`home-card-${id}`)).toBeVisible();
  await expect(page.getByTestId(`home-card-${id}`)).toContainText(title);
  await shot(page, `search-match-${tag}`);

  // Search a guaranteed-absent token → the inviting no-matching-decisions state
  // replaces the feed (Req 2.7), and the previously matching card is gone.
  const absent = token("zznomatch");
  await page.getByTestId("home-search-input").fill(absent);
  await page.getByTestId("home-search-submit").click();
  await expect(page.getByTestId("home-empty")).toBeVisible();
  await expect(page.getByTestId("home-empty")).toContainText("No matching decisions");
  await expect(page.getByTestId(`home-card-${id}`)).toHaveCount(0);
  await shot(page, `search-no-results-${absent}`);
});
