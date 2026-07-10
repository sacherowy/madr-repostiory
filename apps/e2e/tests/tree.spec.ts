// Journey: browse the Topics destination — the portal migration of the old
// folder/ADR explorer tree (Req 3.1, 3.2; behavior preserved through the portal,
// Req 15.2 / 16.4). The portal presents folders as Topics: TopNav → Topics lists
// every folder that holds a decision (including nested folders as sub-topics),
// and selecting a topic shows that topic's feed — its own decisions plus those
// of its sub-topics. Decisions are seeded into a unique topic (and a nested
// sub-topic) via the proxied API (Playwright request context) so they land in
// the git-backed feed the Topics projection reads from; the Topics browsing
// states are then observed through the real UI. Runs offline (no GEMINI_API_KEY).

import { test, expect, type APIRequestContext } from "@playwright/test";

import { shot, unique } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/**
 * Create + save a full decision in `folder` via the proxied API so it appears in
 * the git-backed feed the Topics/People/Home projections are all derived from.
 * A create-only ADR persists no Decision Outcome, so we follow the create with a
 * full save (which requires an outcome) to produce a complete feed card.
 */
async function seedDecision(
  request: APIRequestContext,
  folder: string,
  title: string,
): Promise<void> {
  const created = await request.post("/api/adrs", { data: { title, folder, author: AUTHOR } });
  expect(created.ok(), `createAdr in ${folder} should succeed`).toBeTruthy();
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
      contextAndProblemStatement: `Context for ${title}.`,
      decisionDrivers: "",
      consideredOptions: "",
      decisionOutcome: "We proceed.",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      author: AUTHOR,
      baseBlobSha: adr.blobSha,
    },
  });
  expect(saved.ok(), `saveAdr ${adr.id} should succeed`).toBeTruthy();
}

test("browses folders as Topics and opens a topic's feed including its sub-topics", async ({
  page,
  request,
}) => {
  // A unique topic holding one decision, plus a nested sub-topic holding another,
  // so the parent topic aggregates both (Req 3.2) while the sub-topic scopes to
  // just its own.
  const seg = unique("topic");
  const parentFolder = `decisions/${seg}`;
  const nestedFolder = `${parentFolder}/nested`;
  const parentTitle = `Topic Parent ${seg}`;
  const nestedTitle = `Topic Nested ${seg}`;
  await seedDecision(request, parentFolder, parentTitle);
  await seedDecision(request, nestedFolder, nestedTitle);

  await page.goto("/");

  // Navigate to the Topics destination via the top nav (store-driven, no router).
  await page.getByTestId("top-nav-topics").click();
  await expect(page.getByTestId("topics-page")).toBeVisible();
  await expect(page.getByTestId("top-nav-topics")).toHaveAttribute("aria-current", "page");

  // Folders surface as browsable topics: the unique parent and its nested
  // sub-topic are both listed (folders shown as Topics — Req 1.3, 3.1).
  await expect(page.getByTestId("topics-list")).toBeVisible();
  await expect(page.getByTestId(`topic-item-${parentFolder}`)).toBeVisible();
  await expect(page.getByTestId(`topic-item-${nestedFolder}`)).toBeVisible();
  await shot(page, `topics-list-${seg}`);

  // Selecting the parent topic shows its feed, aggregating its own decision AND
  // the nested sub-topic's decision (Req 3.2).
  await page.getByTestId(`topic-item-${parentFolder}`).click();
  await expect(page.getByTestId("topic-heading")).toHaveText(parentFolder);
  await expect(page.getByTestId("topic-feed")).toBeVisible();
  await expect(page.getByTestId("topic-feed")).toContainText(parentTitle);
  await expect(page.getByTestId("topic-feed")).toContainText(nestedTitle);
  await shot(page, `topics-parent-feed-${seg}`);

  // Drilling into the nested sub-topic scopes the feed to just its own decision.
  await page.getByTestId("top-nav-topics").click();
  await page.getByTestId(`topic-item-${nestedFolder}`).click();
  await expect(page.getByTestId("topic-heading")).toHaveText(nestedFolder);
  await expect(page.getByTestId("topic-feed")).toContainText(nestedTitle);
  await expect(page.getByTestId("topic-feed")).not.toContainText(parentTitle);
  await shot(page, `topics-nested-feed-${seg}`);
});
