// Journey: the flagship decision-feed portal + vocabulary journey (Req 16.1 /
// 16.2). This is the NEW spec for the adr-manager-decision-feed feature — it
// exercises the editorial-portal surfaces end-to-end through the rendered DOM
// and, crucially, verifies the plain-language vocabulary layer: every browsing
// surface shows plain words ("In discussion", "Decided", "Replaces", "Decision
// owner", "Topics") in place of the raw MADR values ("proposed", "accepted",
// "supersedes", "decision-makers"), while Technical view shows those canonical
// values verbatim (Req 1.6, 7.2).
//
// It deliberately does NOT re-cover what the migrated lifecycle/search/tree/
// similarity specs already assert about behavior preservation; it is the
// portal-specific vocabulary + feed journey (16.1/16.2). All state is seeded
// through the proxied backend API (create + save) or the real compose UI, and
// every assertion is read back through the real UI. Runs offline in the
// pre-provisioned Chromium: no GEMINI_API_KEY, no network, no pixel snapshots —
// the deterministic short-description derivation (Req 12) is the default path.

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

import { shot, unique } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/** A unique, hyphen-free word safe to embed in a title and match verbatim. */
function token(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

interface SeededAdr {
  id: string;
  blobSha: string;
  date: string;
}

/**
 * Create an ADR via the proxied API. A create alone publishes an In-discussion
 * (stored `proposed`) decision and persists only title / folder / people /
 * summary (the 7.6 create-context limitation) — exactly the state a bare compose
 * publish reaches. Returns the created record's id / blobSha / date.
 */
async function createAdr(
  request: APIRequestContext,
  opts: {
    title: string;
    folder?: string;
    summary?: string;
    decisionMakers?: string[];
    consulted?: string[];
    informed?: string[];
  },
): Promise<SeededAdr> {
  const res = await request.post("/api/adrs", {
    data: {
      title: opts.title,
      folder: opts.folder ?? "decisions",
      author: AUTHOR,
      ...(opts.summary !== undefined ? { summary: opts.summary } : {}),
      ...(opts.decisionMakers ? { decisionMakers: opts.decisionMakers } : {}),
      ...(opts.consulted ? { consulted: opts.consulted } : {}),
      ...(opts.informed ? { informed: opts.informed } : {}),
    },
  });
  expect(res.ok(), `createAdr "${opts.title}" should succeed`).toBeTruthy();
  return (await res.json()) as SeededAdr;
}

/**
 * Save a full DECIDED (stored `accepted`) decision over an existing record. A
 * full save requires a non-empty Decision Outcome, so this is the state that
 * carries context / options / outcome / relations into the feed and article —
 * the content-rich decision a compose CREATE cannot reach for an outcome-less
 * record without a 400 (7.6 limitation).
 */
async function saveDecided(
  request: APIRequestContext,
  base: SeededAdr,
  opts: {
    title: string;
    contextAndProblemStatement: string;
    consideredOptions?: string;
    prosAndConsOfTheOptions?: string;
    decisionOutcome: string;
    decisionMakers?: string[];
    relations?: { type: string; target: string }[];
  },
): Promise<void> {
  const saved = await request.put(`/api/adrs/${encodeURIComponent(base.id)}`, {
    data: {
      title: opts.title,
      status: "accepted",
      date: base.date,
      decisionMakers: opts.decisionMakers ?? [],
      consulted: [],
      informed: [],
      tags: [],
      relations: opts.relations ?? [],
      contextAndProblemStatement: opts.contextAndProblemStatement,
      decisionDrivers: "",
      consideredOptions: opts.consideredOptions ?? "",
      decisionOutcome: opts.decisionOutcome,
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: opts.prosAndConsOfTheOptions ?? "",
      moreInformation: "",
      additionalContent: "",
      author: AUTHOR,
      baseBlobSha: base.blobSha,
    },
  });
  expect(saved.ok(), `saveDecided "${opts.title}" should succeed`).toBeTruthy();
}

/** From Home, open a decision's article by clicking its feed card. */
async function openArticleFromHome(page: Page, id: string): Promise<void> {
  await page.getByTestId("top-nav-home").click();
  await expect(page.getByTestId(`home-card-${id}`)).toBeVisible();
  await page.getByTestId(`home-card-${id}`).click();
  await expect(page.getByTestId("article-page")).toBeVisible();
}

test("Home feed shows plain-language status labels (not raw enums) and the status chips filter it", async ({
  page,
  request,
}) => {
  // One In-discussion (proposed) decision and one Decided (accepted) decision,
  // each carrying a unique token so they can be targeted in the shared feed.
  const tag = token("zzfeed");
  const proposed = await createAdr(request, {
    title: `Feed Proposed ${tag}`,
    summary: `Weighing the portal for ${tag}.`,
  });
  const decidedBase = await createAdr(request, { title: `Feed Decided ${tag}` });
  await saveDecided(request, decidedBase, {
    title: `Feed Decided ${tag}`,
    contextAndProblemStatement: `We must decide the datastore for ${tag}.`,
    decisionOutcome: "Chosen option: Managed Postgres, because it fits reporting",
  });

  await page.goto("/");
  await expect(page.getByTestId("home-page")).toBeVisible();

  const proposedCard = page.getByTestId(`home-card-${proposed.id}`);
  const decidedCard = page.getByTestId(`home-card-${decidedBase.id}`);
  await expect(proposedCard).toBeVisible();
  await expect(decidedCard).toBeVisible();

  // 16.2 — the cards render the PLAIN-LANGUAGE status labels, and the raw MADR
  // enum values never leak into the feed presentation.
  await expect(proposedCard).toContainText("In discussion");
  await expect(proposedCard).not.toContainText("proposed");
  await expect(decidedCard).toContainText("Decided");
  await expect(decidedCard).not.toContainText("accepted");
  await shot(page, `feed-plain-labels-${tag}`);

  // Req 2.4/2.5 — the "In discussion" chip narrows the feed to proposed cards:
  // the proposed decision stays, the decided one drops out.
  await page.getByTestId("home-chip-proposed").click();
  await expect(page.getByTestId("home-chip-proposed")).toHaveAttribute("aria-pressed", "true");
  await expect(proposedCard).toBeVisible();
  await expect(decidedCard).toHaveCount(0);
  await shot(page, `feed-chip-in-discussion-${tag}`);

  // Toggle to the "Decided" chip → the inverse selection.
  await page.getByTestId("home-chip-proposed").click(); // clear
  await page.getByTestId("home-chip-accepted").click();
  await expect(decidedCard).toBeVisible();
  await expect(proposedCard).toHaveCount(0);
});

test("Topics browsing and the People directory surface a decision under its folder and its owner", async ({
  page,
  request,
}) => {
  // A single decision in a unique topic, owned by a distinct person, is enough to
  // observe both destinations (folders-as-Topics, Req 3; People directory, Req 4).
  const seg = unique("df-topic");
  const folder = `decisions/${seg}`;
  const person = `Ada ${seg}`;
  const title = `Topic+People ${seg}`;
  await createAdr(request, {
    title,
    folder,
    summary: `A decision for ${seg}.`,
    decisionMakers: [person],
  });

  await page.goto("/");

  // Req 3 — folders present as Topics: the unique folder is a browsable topic and
  // selecting it shows that topic's feed containing the decision.
  await page.getByTestId("top-nav-topics").click();
  await expect(page.getByTestId("topics-page")).toBeVisible();
  await expect(page.getByTestId(`topic-item-${folder}`)).toBeVisible();
  await page.getByTestId(`topic-item-${folder}`).click();
  await expect(page.getByTestId("topic-heading")).toHaveText(folder);
  await expect(page.getByTestId("topic-feed")).toContainText(title);
  await shot(page, `topic-feed-${seg}`);

  // Req 4 — People directory: the distinct owner is listed, and selecting them
  // lists their decisions.
  await page.getByTestId("top-nav-people").click();
  await expect(page.getByTestId("people-page")).toBeVisible();
  const personItem = page.getByTestId(`person-item-${person.toLowerCase()}`);
  await expect(personItem).toBeVisible();
  await expect(personItem).toContainText(person);
  await personItem.click();
  await expect(page.getByTestId("person-heading")).toContainText(person);
  await expect(page.getByTestId("person-feed")).toContainText(title);
  await shot(page, `people-feed-${seg}`);

  // Req 4.2 — opening the decision card in the person's feed navigates to the
  // article (the person-feed cards are role="button" activators, no per-card
  // testid, so target the one bearing this decision's title).
  await page
    .getByTestId("person-feed")
    .locator('[role="button"]')
    .filter({ hasText: title })
    .first()
    .click();
  await expect(page.getByTestId("article-page")).toBeVisible();
  await expect(page.getByTestId("article-page").locator("h1")).toHaveText(title);
});

test("the Needs-your-attention digest lists an In-discussion decision naming the session author", async ({
  page,
  request,
}) => {
  // An In-discussion (proposed) decision owned by a distinct person; setting the
  // top-nav author to that person must surface it in the personalized digest
  // (Req 5.1). Matching is case-insensitive, so a differently-cased author name
  // still matches.
  const seg = unique("df-digest");
  const person = `Grace ${seg}`;
  const title = `Attention ${seg}`;
  const created = await createAdr(request, {
    title,
    summary: `Needs a call on ${seg}.`,
    decisionMakers: [person],
  });

  await page.goto("/");

  // Blank author → the digest is in its generic prompt state (Req 5.2), never a
  // personalized list.
  await expect(page.getByTestId("attention-digest")).toBeVisible();
  await expect(page.getByTestId("attention-digest-prompt")).toBeVisible();

  // Set the author (upper-cased to prove case-insensitive matching) → the digest
  // lists the decision that names them (Req 5.1), shown as a plain-label card.
  await page.getByTestId("top-nav-author").fill(person.toUpperCase());
  await expect(page.getByTestId("attention-digest-list")).toBeVisible();
  const digestCard = page.getByTestId(`attention-card-${created.id}`);
  await expect(digestCard).toBeVisible();
  await expect(digestCard).toContainText(title);
  await expect(digestCard).toContainText("In discussion");
  await shot(page, `attention-digest-${seg}`);

  // Req 5.3 — selecting a digest entry opens that decision's article.
  await digestCard.click();
  await expect(page.getByTestId("article-page")).toBeVisible();
  await expect(page.getByTestId("article-page").locator("h1")).toHaveText(title);
});

test("the article leads with an outcome-first summary in plain vocabulary; Technical view shows canonical values verbatim", async ({
  page,
  request,
}) => {
  // A Decided decision (D1) that REPLACES an older decision (D0), so both the
  // outgoing relation ("Replaces", on D1) and the inbound reciprocal ("Replaced
  // by", on D0 — the anti-double-flip guard, Impl Note 6.3) are observable.
  const tag = token("zzarticle");
  const owner = `Lin ${tag}`;
  const oldTitle = `Old Choice ${tag}`;
  const newTitle = `New Choice ${tag}`;

  const old = await createAdr(request, { title: oldTitle });
  const fresh = await createAdr(request, { title: newTitle });
  await saveDecided(request, fresh, {
    title: newTitle,
    contextAndProblemStatement: `We must replace the datastore for ${tag}.`,
    consideredOptions: "* Managed Postgres\n* Self-hosted MySQL",
    prosAndConsOfTheOptions:
      "**Managed Postgres**\n* Good, because low ops burden\n* Bad, because vendor cost\n\n" +
      "**Self-hosted MySQL**\n* Good, because full control\n* Bad, because more ops",
    decisionOutcome: "Chosen option: Managed Postgres, because it fits our reporting needs",
    decisionMakers: [owner],
    relations: [{ type: "supersedes", target: old.id }],
  });

  await page.goto("/");
  await openArticleFromHome(page, fresh.id);

  // Req 6.2 — the outcome-first summary box LEADS: it precedes the section
  // content in document order and carries the derived "We chose <option>" text.
  const summary = page.getByTestId("article-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("We chose Managed Postgres");
  const summaryThenSections = page.locator(
    '[data-testid="article-summary"] ~ [data-testid="article-sections"]',
  );
  await expect(summaryThenSections).toHaveCount(1);

  // Req 1.1 — the status shows its plain label, not the raw enum.
  await expect(page.getByTestId("article-status")).toContainText("Decided");
  await expect(page.getByTestId("article-status")).not.toContainText("accepted");

  // Req 6.3 — a friendly section name carries the canonical MADR heading as a tag.
  await expect(
    page.getByTestId("article-section-tag-contextAndProblemStatement"),
  ).toContainText("MADR: Context and Problem Statement");

  // Req 6.6 / 1.5 — people show under the plain-language role label, not the
  // stored field name.
  const people = page.getByTestId("article-people");
  await expect(people).toContainText("Decision owner");
  await expect(people).toContainText(owner);
  await expect(people).not.toContainText("decision-makers");

  // Req 6.4 — the considered options render as compare cards with exactly the
  // chosen option highlighted (derived from the canonical outcome).
  await expect(page.getByTestId("option-compare-cards")).toBeVisible();
  await expect(page.locator('[data-testid="option-compare-chosen-badge"]')).toHaveCount(1);
  await expect(
    page.locator('[data-testid="option-compare-card"][data-chosen="true"]'),
  ).toContainText("Managed Postgres");

  // Req 6.5 / 1.2 — the outgoing supersedes relation reads as the plain sentence
  // "Replaces <old title>" in the context rail, never the raw enum.
  const rail = page.getByTestId("context-rail");
  await expect(rail).toContainText(`Replaces ${oldTitle}`);
  await expect(rail).not.toContainText("supersedes");
  await shot(page, `article-plain-${tag}`);

  // Req 1.6 / 7.2 — Technical view shows the RAW record with the canonical values
  // VERBATIM, and the plain labels are ABSENT there.
  await page.getByTestId("article-technical-enter").click();
  await expect(page.getByTestId("technical-view")).toBeVisible();
  const raw = page.getByTestId("technical-view-raw");
  await expect(raw).toContainText("status: accepted");
  await expect(raw).toContainText("supersedes");
  await expect(raw).toContainText("## Context and Problem Statement");
  await expect(raw).toContainText("## Decision Outcome");
  // The plain vocabulary must NOT appear in the raw record.
  await expect(raw).not.toContainText("In discussion");
  await expect(raw).not.toContainText("Decided");
  await expect(raw).not.toContainText("Replaces");
  await shot(page, `technical-verbatim-${tag}`);

  // Req 7.5 — toggling Technical view off returns to the friendly article.
  await page.getByTestId("technical-view-return").click();
  await expect(page.getByTestId("article-page")).toBeVisible();

  // Impl Note 6.3 anti-double-flip — the OLD decision's article shows the INBOUND
  // reciprocal as "Replaced by <new title>" (not "Replaces"), proving the label
  // is resolved once, not flipped twice.
  await openArticleFromHome(page, old.id);
  const oldRail = page.getByTestId("context-rail");
  await expect(oldRail).toContainText(`Replaced by ${newTitle}`);
  await expect(oldRail).not.toContainText(`Replaces ${newTitle}`);
});

test("compose create with title + context publishes an In-discussion decision that appears in the feed", async ({
  page,
}) => {
  // The friendly single-page compose form (Req 8.3): title + context are the only
  // fields the publish gate requires. Per the 7.6 create-context limitation a
  // bare create persists title / people / summary but NOT context or an outcome,
  // so this asserts against what actually persists — a titled card shown under
  // the plain "In discussion" label — not the (unpersisted) context.
  const tag = token("zzcompose");
  const title = `Compose Create ${tag}`;

  await page.goto("/");
  await page.getByTestId("top-nav-author").fill(AUTHOR);

  await page.getByTestId("top-nav-new").click();
  await expect(page.getByTestId("compose-page")).toBeVisible();

  // Publish is gated until BOTH title and context are present (Req 8.3).
  await expect(page.getByTestId("compose-publish")).toBeDisabled();
  await page.getByTestId("compose-title-input").fill(title);
  await expect(page.getByTestId("compose-publish")).toBeDisabled();
  await page
    .getByTestId("compose-prompt-input-contextAndProblemStatement")
    .fill(`Context for ${tag}: we want a friendlier way to capture this.`);
  await expect(page.getByTestId("compose-publish")).toBeEnabled();

  await page.getByTestId("compose-publish").click();

  // Publishing lands on the new decision's article, shown as In discussion (the
  // plain label for the freshly-created `proposed` status — Req 1.1 / 8.3).
  await expect(page.getByTestId("article-page")).toBeVisible();
  await expect(page.getByTestId("article-page").locator("h1")).toHaveText(title);
  await expect(page.getByTestId("article-status")).toContainText("In discussion");
  await expect(page.getByTestId("article-status")).not.toContainText("proposed");
  await shot(page, `compose-created-${tag}`);

  // Back on Home the new decision shows in the feed as a card with the same
  // title and the plain-language status (Req 2.3 / 8.3).
  await page.getByTestId("top-nav-home").click();
  await expect(page.getByTestId("home-feed")).toBeVisible();
  const card = page.locator('[data-testid^="home-card-"]').filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText("In discussion");
  await expect(card).not.toContainText("proposed");
});

test("marking an option as chosen prefills the canonical outcome and saves a Decided card", async ({
  page,
  request,
}) => {
  // Seed a content-rich Decided decision with two distinct options (Alpha chosen)
  // — the state a compose CREATE cannot reach for an outcome-less record (7.6).
  // Then drive the reachable compose EDIT flow (article Edit button, Impl Note
  // 15.2) to mark the OTHER option chosen, proving the Mark-as-chosen prefill
  // (Req 9.2) drives the outcome and yields a Decided card highlighting the new
  // choice (Req 9 / 6.4).
  const tag = token("zzchosen");
  const title = `Chosen Flow ${tag}`;
  const alpha = `Alpha ${tag}`;
  const beta = `Beta ${tag}`;

  const base = await createAdr(request, { title });
  await saveDecided(request, base, {
    title,
    contextAndProblemStatement: `We must choose a path for ${tag}.`,
    consideredOptions: `* ${alpha}\n* ${beta}`,
    prosAndConsOfTheOptions:
      `**${alpha}**\n* Good, because it is simple\n* Bad, because it is limited\n\n` +
      `**${beta}**\n* Good, because it scales well\n* Bad, because it costs more`,
    decisionOutcome: `Chosen option: ${alpha}, because it is simple`,
  });

  await page.goto("/");
  await openArticleFromHome(page, base.id);

  // The seeded decision opens Decided with Alpha highlighted.
  await expect(page.getByTestId("article-status")).toContainText("Decided");
  await expect(
    page.locator('[data-testid="option-compare-card"][data-chosen="true"]'),
  ).toContainText(alpha);

  // Reach compose EDIT via the article's Edit action (Impl Note 15.2).
  await page.getByTestId("article-edit").click();
  await expect(page.getByTestId("compose-page")).toBeVisible();

  // The options prefill; the Decision Outcome is unlocked (status is Decided).
  // Mark the SECOND option (Beta) as chosen → the outcome field is pre-filled
  // with the canonical "Chosen option: Beta …" phrasing (Req 9.2).
  await page.getByTestId("compose-option-mark-1").click();
  await expect(page.getByTestId("compose-option-mark-1")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("compose-outcome-input")).toHaveValue(
    new RegExp(`Chosen option:\\s*${beta}`),
  );
  await shot(page, `compose-mark-chosen-${tag}`);

  // Save → navigates back to the article, still Decided, now highlighting Beta.
  await expect(page.getByTestId("compose-publish")).toBeEnabled();
  await page.getByTestId("compose-publish").click();
  await expect(page.getByTestId("article-page")).toBeVisible();

  await expect(page.getByTestId("article-status")).toContainText("Decided");
  const chosen = page.locator('[data-testid="option-compare-card"][data-chosen="true"]');
  await expect(page.locator('[data-testid="option-compare-chosen-badge"]')).toHaveCount(1);
  await expect(chosen).toContainText(beta);
  await expect(chosen).not.toContainText(alpha);
  await shot(page, `compose-decided-card-${tag}`);
});
