// Journey: ADR create → edit → save, then save-conflict surfacing and recovery
// (Req 4.1, 4.2, 5.1), extended to cover the MADR-realigned, nine-discrete-field
// model end to end (Req 3.2, 3.3, 3.4, 3.7, plus 1.3, 2.2, 2.4): a freshly
// created ADR renders all eight MADR section fields empty, with the two
// required sections (Context and Problem Statement, Decision Outcome) visibly
// distinguished from the six optional ones; multiple sections are filled in
// and saved independently of each other and each round-trips through a fresh
// reload; the catch-all `additionalContent` field round-trips content that
// doesn't map to any of the eight sections; decision-makers/consulted/informed
// entered on create round-trip into edit mode, editing and saving new
// decision-makers/consulted/informed values together with status "rejected"
// (no relation required) round-trips through save and a fresh reload. Drives
// the real UI in a real browser against the launched app; the concurrent write
// that forces the 409 is made directly against the proxied API via
// Playwright's request context (the same /api origin), mirroring the
// in-process flow proven by apps/web/src/App.test.tsx.

import { test, expect } from "@playwright/test";

import { shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/** A unique, hyphen-free word safe to embed in a title and search for verbatim. */
function token(): string {
  return `zz${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** The eight MADR section textarea testids, in canonical order. */
const SECTION_TEXTAREAS = [
  "context-and-problem-statement-textarea",
  "decision-drivers-textarea",
  "considered-options-textarea",
  "decision-outcome-textarea",
  "consequences-textarea",
  "confirmation-textarea",
  "pros-and-cons-of-the-options-textarea",
  "more-information-textarea",
];

/** The two sections the MADR template marks as required. */
const REQUIRED_SECTION_TEXTAREAS = ["context-and-problem-statement-textarea", "decision-outcome-textarea"];

/** A full nine-field-plus-frontmatter payload for the raw API PUT used to force a conflict. */
function sectionsPayload(contextAndProblemStatement: string) {
  return {
    contextAndProblemStatement,
    decisionDrivers: "",
    consideredOptions: "",
    decisionOutcome: "Seed decision outcome.",
    consequences: "",
    confirmation: "",
    prosAndConsOfTheOptions: "",
    moreInformation: "",
    additionalContent: "",
  };
}

test("creates, edits and saves an ADR, then recovers from a save conflict", async ({
  page,
  request,
}) => {
  const tag = token();
  const title = `Lifecycle ${tag}`;

  await page.goto("/");
  await page.getByTestId("author-name-input").fill(AUTHOR);

  // 1. Create a brand-new ADR through the default create-mode editor, entering
  // decision-makers/consulted/informed alongside the title (Req 1.3).
  await expect(page.getByTestId("adr-editor-create")).toBeVisible();
  await page.getByTestId("title-input").fill(title);
  await page.getByTestId("decision-makers-input").fill("Alice, Bob");
  await page.getByTestId("consulted-input").fill("Carol");
  await page.getByTestId("informed-input").fill("Dave");
  await page.getByTestId("create-button").click();

  // The shell flips into edit mode for the newly created ADR.
  await expect(page.getByTestId("adr-editor-edit")).toBeVisible();
  await expect(page.getByTestId("title-input")).toHaveValue(title);

  // All eight section fields render empty on a freshly created ADR (Req 3.4),
  // with the two required sections visibly distinguished from the six optional
  // ones via their label text (Req 3.3).
  for (const testId of SECTION_TEXTAREAS) {
    await expect(page.getByTestId(testId)).toHaveValue("");
  }
  for (const testId of REQUIRED_SECTION_TEXTAREAS) {
    const label = page.locator(`label[for="adr-editor-${testId}"]`);
    await expect(label).toContainText(/required/i);
  }
  for (const testId of SECTION_TEXTAREAS.filter((id) => !REQUIRED_SECTION_TEXTAREAS.includes(id))) {
    const label = page.locator(`label[for="adr-editor-${testId}"]`);
    await expect(label).toContainText(/optional/i);
  }
  // The catch-all additional-content field also renders empty.
  await expect(page.getByTestId("additional-content-textarea")).toHaveValue("");

  // The decision-makers/consulted/informed entered on create round-trip
  // through to the edit form.
  await expect(page.getByTestId("decision-makers-input")).toHaveValue("Alice, Bob");
  await expect(page.getByTestId("consulted-input")).toHaveValue("Carol");
  await expect(page.getByTestId("informed-input")).toHaveValue("Dave");
  await shot(page, `lifecycle-created-empty-${tag}`);

  // 2. Ordinary (non-conflicting) save: fill in and save multiple sections
  // independently of each other (Req 3.2), plus the catch-all
  // additional-content field (Req 3.7), change decision-makers/consulted/
  // informed, and select status "rejected" — saveable with no relation added
  // (Req 2.2, 2.4).
  await page.getByTestId("context-and-problem-statement-textarea").fill("First real edit from the UI.");
  await page.getByTestId("decision-drivers-textarea").fill("Driver: must ship by Friday.");
  await page.getByTestId("decision-outcome-textarea").fill("We will go with option A.");
  await page.getByTestId("additional-content-textarea").fill("Leftover content outside the eight sections.");
  await page.getByTestId("decision-makers-input").fill("Alice, Erin");
  await page.getByTestId("consulted-input").fill("Frank");
  await page.getByTestId("informed-input").fill("Grace");
  await page.getByTestId("status-select").selectOption("rejected");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-success-message")).toBeVisible();
  await shot(page, `lifecycle-saved-${tag}`);

  // 3. Reload the edit form (switch aspects away and back, forcing the editor
  // to remount and re-fetch from the API) and confirm the saved
  // decision-makers/consulted/informed/status round-trip through save and
  // reload (Req 1.3, 2.2), each independently-edited section round-trips
  // (Req 3.2), and the catch-all additional-content field round-trips content
  // that doesn't map to any of the eight sections (Req 3.7).
  await page.getByTestId("panel-tab-history").click();
  await page.getByTestId("panel-tab-editor").click();
  await expect(page.getByTestId("decision-makers-input")).toHaveValue("Alice, Erin");
  await expect(page.getByTestId("consulted-input")).toHaveValue("Frank");
  await expect(page.getByTestId("informed-input")).toHaveValue("Grace");
  await expect(page.getByTestId("status-select")).toHaveValue("rejected");
  await expect(page.getByTestId("context-and-problem-statement-textarea")).toHaveValue(
    "First real edit from the UI."
  );
  await expect(page.getByTestId("decision-drivers-textarea")).toHaveValue("Driver: must ship by Friday.");
  await expect(page.getByTestId("decision-outcome-textarea")).toHaveValue("We will go with option A.");
  await expect(page.getByTestId("additional-content-textarea")).toHaveValue(
    "Leftover content outside the eight sections."
  );
  // Untouched sections remain empty, proving each section is independently
  // editable rather than sharing storage with the ones that were filled in.
  await expect(page.getByTestId("considered-options-textarea")).toHaveValue("");
  await expect(page.getByTestId("consequences-textarea")).toHaveValue("");

  // The created id is not rendered as text; recover it from the real backend via
  // a search on the unique title token (the index is populated only on save()).
  const searchRes = await request.get(`/api/search?q=${encodeURIComponent(tag)}`);
  expect(searchRes.ok()).toBeTruthy();
  const hits = (await searchRes.json()) as Array<{ id: string }>;
  expect(hits.length).toBeGreaterThanOrEqual(1);
  const adrId = hits[0].id;

  // Capture the exact baseBlobSha the editor now holds.
  const getRes = await request.get(`/api/adrs/${encodeURIComponent(adrId)}`);
  expect(getRes.ok()).toBeTruthy();
  const adr = (await getRes.json()) as {
    title: string;
    status: string;
    date: string;
    decisionMakers: string[];
    tags: string[];
    relations: unknown[];
    blobSha: string;
  };

  // 4. Force a conflict: a concurrent writer saves using that SAME baseBlobSha,
  //    advancing HEAD so the editor's next save (still holding the old sha) is
  //    stale.
  const concurrent = await request.put(`/api/adrs/${encodeURIComponent(adrId)}`, {
    data: {
      title: adr.title,
      status: adr.status,
      date: adr.date,
      decisionMakers: adr.decisionMakers,
      tags: adr.tags,
      relations: adr.relations,
      ...sectionsPayload("Concurrent writer's content."),
      author: "Other Author <other@example.com>",
      baseBlobSha: adr.blobSha,
    },
  });
  expect(concurrent.ok()).toBeTruthy();

  // 5. Edit again in the UI and save — now stale, so the conflict must surface
  //    (not a silent overwrite).
  await page.getByTestId("context-and-problem-statement-textarea").fill("Second local edit, now stale.");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("conflict-message")).toBeVisible();
  await expect(page.getByTestId("save-success-message")).toHaveCount(0);
  await shot(page, `lifecycle-conflict-${tag}`);

  // 6. Reload the latest version — the form now shows the concurrent content.
  await page.getByTestId("reload-latest-button").click();
  await expect(page.getByTestId("context-and-problem-statement-textarea")).toHaveValue(
    "Concurrent writer's content."
  );

  // 7. Save once more on the fresh baseBlobSha — recovery to a saved state.
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-success-message")).toBeVisible();
  await expect(page.getByTestId("conflict-message")).toHaveCount(0);
  await shot(page, `lifecycle-recovered-${tag}`);
});
