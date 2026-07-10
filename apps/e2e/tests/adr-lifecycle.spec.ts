// Journey: create a decision through the portal compose flow and read it back —
// the portal migration of the old ADR create → edit → save lifecycle (Req 8, 2,
// 6; behavior preserved through the portal, Req 15.2 / 16.4).
//
// The portal's authoring surface is the single-page compose form reached from
// TopNav's "New decision" (ComposeContainer). Publishing a new decision persists
// its title / topic / people / summary and lands the author on the decision's
// outcome-first article; the decision then shows in the Home feed as a card.
//
// KNOWN LIMITATION (tasks.md 7.6 note): a brand-new "In discussion" decision
// created through compose persists only title / topic / people / summary — NOT
// its context / options / outcome — because the create endpoint takes no Decision
// Outcome and a full save requires one. So the create journey asserts against
// what actually persists (a title + summary-bearing card + article), and the
// full-content article (context, chosen option, outcome) is exercised against a
// DECIDED decision seeded through the API — the state a compose CREATE cannot
// reach for an outcome-less decision without a 400. The portal (task 8.1) wires
// only compose CREATE; compose EDIT mode (and its 409 conflict-recovery UI) is
// implemented but not reachable from any portal surface — see the spec's status
// report / CONCERNS.

import { test, expect, type APIRequestContext } from "@playwright/test";

import { shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/** A unique, hyphen-free word safe to embed in a title and match verbatim. */
function token(): string {
  return `zz${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Seed a fully DECIDED decision via the proxied API (create + save). A create
 * alone persists no Decision Outcome, so the follow-up save (which requires one)
 * produces a complete record carrying context, considered options with a
 * canonical chosen outcome, and a decision outcome. Returns its id.
 */
async function seedDecided(
  request: APIRequestContext,
  opts: {
    title: string;
    contextAndProblemStatement: string;
    consideredOptions: string;
    prosAndConsOfTheOptions: string;
    decisionOutcome: string;
  },
): Promise<string> {
  const created = await request.post("/api/adrs", {
    data: { title: opts.title, folder: "decisions", author: AUTHOR },
  });
  expect(created.ok(), "seed createAdr should succeed").toBeTruthy();
  const adr = (await created.json()) as { id: string; blobSha: string; date: string };

  const saved = await request.put(`/api/adrs/${encodeURIComponent(adr.id)}`, {
    data: {
      title: opts.title,
      status: "accepted",
      date: adr.date,
      decisionMakers: [],
      consulted: [],
      informed: [],
      tags: [],
      relations: [],
      contextAndProblemStatement: opts.contextAndProblemStatement,
      decisionDrivers: "",
      consideredOptions: opts.consideredOptions,
      decisionOutcome: opts.decisionOutcome,
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: opts.prosAndConsOfTheOptions,
      moreInformation: "",
      additionalContent: "",
      author: AUTHOR,
      baseBlobSha: adr.blobSha,
    },
  });
  expect(saved.ok(), "seed saveAdr should succeed").toBeTruthy();
  return adr.id;
}

test("creates a decision through the compose flow; it opens as an article and appears in the feed", async ({
  page,
}) => {
  const tag = token();
  const title = `Lifecycle ${tag}`;
  const summaryText = `We chose the portal path for ${tag}.`;
  const owner = `Ada ${tag}`;

  await page.goto("/");
  await page.getByTestId("top-nav-author").fill(AUTHOR);

  // New decision opens the single-page compose form (create mode).
  await page.getByTestId("top-nav-new").click();
  await expect(page.getByTestId("compose-page")).toBeVisible();

  // The publish gate needs a title + context; author a summary so the feed
  // card's description is deterministic, and add a decision owner.
  await page.getByTestId("compose-title-input").fill(title);
  await page
    .getByTestId("compose-prompt-input-contextAndProblemStatement")
    .fill(`Context for ${tag}: we need a friendlier decision surface.`);
  await page.getByTestId("compose-summary-input").fill(summaryText);

  await page.getByTestId("compose-person-add").click();
  await page.locator('[data-testid^="compose-person-name-"]').first().fill(owner);
  // The new person's role defaults to "Decision owner" (decisionMakers).

  await page.getByTestId("compose-publish").click();

  // Publishing navigates straight to the new decision's outcome-first article.
  await expect(page.getByTestId("article-page")).toBeVisible();
  await expect(page.getByTestId("article-page").locator("h1")).toHaveText(title);
  await expect(page.getByTestId("article-summary")).toContainText(summaryText);
  // A freshly created decision is "In discussion" (proposed), shown as a plain
  // label rather than the raw status key (Req 1.1).
  await expect(page.getByTestId("article-status")).toContainText("In discussion");
  // The decision owner persisted and shows under its plain-language people label.
  await expect(page.getByTestId("article-people")).toContainText(owner);
  await shot(page, `lifecycle-created-article-${tag}`);

  // Back on Home, the new decision shows in the feed as a card with the same
  // title, plain-language status, and the authored summary (Req 2.3).
  await page.getByTestId("top-nav-home").click();
  await expect(page.getByTestId("home-feed")).toBeVisible();
  const card = page.locator('[data-testid^="home-card-"]').filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText(summaryText);
  await expect(card).toContainText("In discussion");
  await shot(page, `lifecycle-feed-${tag}`);
});

test("reads a decided decision's full article — context, chosen option, outcome — and toggles Technical view", async ({
  page,
  request,
}) => {
  const tag = token();
  const title = `Decided ${tag}`;
  const id = await seedDecided(request, {
    title,
    contextAndProblemStatement: `We must pick a datastore for ${tag}.`,
    consideredOptions: "* Managed Postgres\n* Self-hosted MySQL",
    prosAndConsOfTheOptions:
      "**Managed Postgres**\n* Good, because low ops burden\n* Bad, because vendor cost\n\n" +
      "**Self-hosted MySQL**\n* Good, because full control\n* Bad, because more ops",
    decisionOutcome: "Chosen option: Managed Postgres, because it fits our reporting needs",
  });

  await page.goto("/");
  await expect(page.getByTestId(`home-card-${id}`)).toBeVisible();
  await page.getByTestId(`home-card-${id}`).click();
  await expect(page.getByTestId("article-page")).toBeVisible();

  // Outcome-first: the decided status plus the context and decision-outcome
  // sections render under their friendly names (Req 6.2, 6.3).
  await expect(page.getByTestId("article-status")).toContainText("Decided");
  await expect(page.getByTestId("article-section-contextAndProblemStatement")).toContainText(tag);
  await expect(page.getByTestId("article-section-decisionOutcome")).toContainText("Managed Postgres");

  // The considered options render as compare cards with EXACTLY the chosen one
  // highlighted, derived from the canonical outcome phrasing (Req 6.4 / 12.1).
  await expect(page.getByTestId("option-compare-cards")).toBeVisible();
  await expect(page.locator('[data-testid="option-compare-chosen-badge"]')).toHaveCount(1);
  const chosenCard = page.locator('[data-testid="option-compare-card"][data-chosen="true"]');
  await expect(chosenCard).toContainText("Managed Postgres");
  await shot(page, `lifecycle-decided-article-${tag}`);

  // The Technical-view escape hatch shows the raw record verbatim and returns to
  // the friendly article (Req 15.2 Technical view, 7.1 / 7.5).
  await page.getByTestId("article-technical-enter").click();
  await expect(page.getByTestId("technical-view")).toBeVisible();
  await expect(page.getByTestId("technical-view-raw")).toContainText("Chosen option: Managed Postgres");
  await page.getByTestId("technical-view-return").click();
  await expect(page.getByTestId("article-page")).toBeVisible();
});
