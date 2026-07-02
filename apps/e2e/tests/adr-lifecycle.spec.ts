// Journey: ADR create → edit → save, then save-conflict surfacing and recovery
// (Req 4.1, 4.2, 5.1), extended to cover the restructured EditAdrForm from the
// adr-form-structured-input feature end to end: a freshly created ADR (via
// CreateAdrForm's unchanged three CSV decision-makers/consulted/informed
// inputs — CreateAdrForm is explicitly out of scope for that feature) opens in
// EditAdrForm and renders the remaining six generic MADR section textareas
// empty, with the two required sections (Context and Problem Statement,
// Decision Outcome) visibly distinguished from the four optional ones; the
// decision-makers/consulted/informed entered on create round-trip into
// EditAdrForm's always-visible, row-based People editor (Req 2.1, 2.5); the
// People rows are edited via add/remove/name/role row interactions and the
// structured Options editor is expanded and filled with a description/pros/
// cons row (Req 2.2, 2.3, 2.4, 2.6, 2.7, 3.1, 3.2, 3.4, 3.5, 3.6); Decision
// Outcome's nested Consequences and Confirmation fields are filled inside its
// own expanded body, with no independent toggle of their own (Req 1.1, 1.3,
// 1.4); everything round-trips through save and a fresh reload; and the
// existing save-conflict/recover journey still passes with the updated fill
// steps. Drives the real UI in a real browser against the launched app; the
// concurrent write that forces the 409 is made directly against the proxied
// API via Playwright's request context (the same /api origin), mirroring the
// in-process flow proven by apps/web/src/App.test.tsx.

import { test, expect } from "@playwright/test";

import { shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/** A unique, hyphen-free word safe to embed in a title and search for verbatim. */
function token(): string {
  return `zz${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * The remaining generic MADR section textareas rendered by the
 * `MADR_SECTIONS.map()` loop, in canonical order. `considered-options-textarea`
 * and `pros-and-cons-of-the-options-textarea` no longer exist — they were
 * replaced by the row-based Options editor (`section-toggle-options` +
 * `option-description-input-{id}`/`option-pros-textarea-{id}`/
 * `option-cons-textarea-{id}`). `consequences-textarea`/`confirmation-textarea`
 * still exist with their original testids, but only nested inside Decision
 * Outcome's body — they no longer have an independent
 * `section-toggle-consequences`/`section-toggle-confirmation` of their own.
 */
const SECTION_TEXTAREAS = [
  "context-and-problem-statement-textarea",
  "decision-drivers-textarea",
  "decision-outcome-textarea",
  "consequences-textarea",
  "confirmation-textarea",
  "more-information-textarea",
];

/** The two sections the MADR template marks as required. */
const REQUIRED_SECTION_TEXTAREAS = ["context-and-problem-statement-textarea", "decision-outcome-textarea"];

/**
 * Maps textarea testid → camelCase sectionKey used in section-toggle-{key}
 * testids. Only sections that still have their OWN independent toggle are
 * included here — Consequences/Confirmation are deliberately absent since
 * they are nested inside Decision Outcome's toggle instead (see
 * `section-toggle-decisionOutcome` usage below).
 */
const SECTION_KEY_BY_TEXTAREA: Record<string, string> = {
  "context-and-problem-statement-textarea": "contextAndProblemStatement",
  "decision-drivers-textarea": "decisionDrivers",
  "decision-outcome-textarea": "decisionOutcome",
  "more-information-textarea": "moreInformation",
};

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
  // decision-makers/consulted/informed alongside the title via CreateAdrForm's
  // unchanged three CSV inputs (Req 1.3; CreateAdrForm itself is out of scope
  // for the People-with-roles restructuring).
  await expect(page.getByTestId("adr-editor-create")).toBeVisible();
  await page.getByTestId("title-input").fill(title);
  await page.getByTestId("decision-makers-input").fill("Alice, Bob");
  await page.getByTestId("consulted-input").fill("Carol");
  await page.getByTestId("informed-input").fill("Dave");
  await page.getByTestId("create-button").click();

  // The shell flips into edit mode for the newly created ADR.
  await expect(page.getByTestId("adr-editor-edit")).toBeVisible();
  await expect(page.getByTestId("title-input")).toHaveValue(title);

  // The six remaining generic MADR section fields render empty on a freshly
  // created ADR (Req 3.4 of the predecessor feature), with the two required
  // sections visibly distinguished from the optional ones via their label
  // text.
  for (const testId of SECTION_TEXTAREAS) {
    await expect(page.getByTestId(testId)).toHaveValue("");
  }
  for (const testId of REQUIRED_SECTION_TEXTAREAS) {
    const sectionKey = SECTION_KEY_BY_TEXTAREA[testId];
    await expect(page.getByTestId(`section-toggle-${sectionKey}`)).toContainText("*");
  }
  for (const testId of ["decision-drivers-textarea", "more-information-textarea"]) {
    const sectionKey = SECTION_KEY_BY_TEXTAREA[testId];
    await expect(page.getByTestId(`section-toggle-${sectionKey}`)).not.toContainText("*");
  }
  // The structured Options group is also optional (collapsed by default, no asterisk).
  await expect(page.getByTestId("section-toggle-options")).not.toContainText("*");
  // The catch-all additional-content field also renders empty.
  await expect(page.getByTestId("additional-content-textarea")).toHaveValue("");

  // The decision-makers/consulted/informed entered on create round-trip into
  // EditAdrForm's always-visible, row-based People editor: one row per
  // person, populated with the name and the role matching the list it came
  // from (Req 2.1, 2.5). People has no collapse/expand toggle of its own.
  await expect(page.getByTestId("section-toggle-people")).toHaveCount(0);
  await expect(page.locator('[data-testid^="person-name-input-"]')).toHaveCount(4);
  const initialNameInputs = page.locator('[data-testid^="person-name-input-"]');
  const initialRoleSelects = page.locator('[data-testid^="person-role-select-"]');
  const initialNames = await initialNameInputs.evaluateAll((inputs) =>
    (inputs as HTMLInputElement[]).map((input) => input.value)
  );
  const initialRoles = await initialRoleSelects.evaluateAll((selects) =>
    (selects as HTMLSelectElement[]).map((select) => select.value)
  );
  expect(initialNames).toEqual(["Alice", "Bob", "Carol", "Dave"]);
  expect(initialRoles).toEqual(["Decision Maker", "Decision Maker", "Consulted", "Informed"]);
  await shot(page, `lifecycle-created-empty-${tag}`);

  // 2. Ordinary (non-conflicting) save: fill in and save multiple sections
  // independently of each other, plus the catch-all additional-content
  // field, edit the People rows (add/remove/name/role), fill a structured
  // Options row, fill Decision Outcome's nested Consequences/Confirmation
  // fields, and select status "rejected" — saveable with no relation added
  // (Req 2.2, 2.4).
  await page.getByTestId("context-and-problem-statement-textarea").fill("First real edit from the UI.");
  // decision-drivers is optional (collapsed by default) — expand before filling
  await page.getByTestId("section-toggle-decisionDrivers").click();
  await page.getByTestId("decision-drivers-textarea").fill("Driver: must ship by Friday.");
  await page.getByTestId("decision-outcome-textarea").fill("We will go with option A.");

  // Decision Outcome is required and starts expanded — its nested
  // Consequences/Confirmation fields are already visible and fillable
  // without any separate toggle of their own (Req 1.1, 1.4).
  await page.getByTestId("consequences-textarea").fill("Higher upfront cost, faster delivery.");
  await page.getByTestId("confirmation-textarea").fill("Confirmed via architecture review.");

  // The structured Options group is optional (collapsed by default) — expand
  // it, add a row, and fill description/pros/cons (Req 3.1, 3.2, 3.4, 3.5).
  await page.getByTestId("section-toggle-options").click();
  await page.getByTestId("add-option-button").click();
  const optionDescriptionInput = page.locator('[data-testid^="option-description-input-"]').first();
  const optionProsTextarea = page.locator('[data-testid^="option-pros-textarea-"]').first();
  const optionConsTextarea = page.locator('[data-testid^="option-cons-textarea-"]').first();
  await optionDescriptionInput.fill("Option A: adopt the new framework");
  await optionProsTextarea.fill("Faster development");
  await optionConsTextarea.fill("Learning curve for the team");

  // additional-content is optional (collapsed by default) — expand before filling
  await page.getByTestId("section-toggle-additionalContent").click();
  await page.getByTestId("additional-content-textarea").fill("Leftover content outside the eight sections.");

  // Edit the People rows: remove Dave's "Informed" row, add a new
  // "Consulted" row for Erin, and change Bob's row from "Decision Maker" to
  // "Consulted" (Req 2.2, 2.3, 2.4, 2.6).
  const nameInputsBeforeEdit = page.locator('[data-testid^="person-name-input-"]');
  const namesBeforeEdit = await nameInputsBeforeEdit.evaluateAll((inputs) =>
    (inputs as HTMLInputElement[]).map((input) => input.value)
  );
  const daveIndex = namesBeforeEdit.indexOf("Dave");
  const daveRemoveButton = page.locator('[data-testid^="remove-person-button-"]').nth(daveIndex);
  await daveRemoveButton.click();
  await expect(page.locator('[data-testid^="person-name-input-"]')).toHaveCount(3);

  const bobIndex = (
    await page.locator('[data-testid^="person-name-input-"]').evaluateAll((inputs) =>
      (inputs as HTMLInputElement[]).map((input) => input.value)
    )
  ).indexOf("Bob");
  await page.locator('[data-testid^="person-role-select-"]').nth(bobIndex).selectOption("Consulted");

  await page.getByTestId("add-person-button").click();
  const newRowNameInputs = page.locator('[data-testid^="person-name-input-"]');
  await expect(newRowNameInputs).toHaveCount(4);
  const newRowName = newRowNameInputs.last();
  const newRowRole = page.locator('[data-testid^="person-role-select-"]').last();
  await newRowName.fill("Erin");
  await newRowRole.selectOption("Consulted");

  await page.getByTestId("status-select").selectOption("rejected");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-success-message")).toBeVisible();
  await shot(page, `lifecycle-saved-${tag}`);

  // 3. Reload the edit form (switch aspects away and back, forcing the editor
  // to remount and re-fetch from the API) and confirm everything round-trips
  // through save and a fresh reload: the People rows now reflect the edited
  // set (Req 2.1, 2.5, 2.6, 2.7), the structured Options row round-trips with
  // its description/pros/cons (Req 3.4, 3.5), each independently-edited
  // section round-trips, Decision Outcome's nested Consequences/Confirmation
  // round-trip together with it (Req 1.1, 1.3, 1.4), and the catch-all
  // additional-content field round-trips content that doesn't map to any of
  // the generic sections.
  await page.getByTestId("panel-tab-history").click();
  await page.getByTestId("panel-tab-editor").click();

  await expect(page.getByTestId("status-select")).toHaveValue("rejected");
  await expect(page.getByTestId("context-and-problem-statement-textarea")).toHaveValue(
    "First real edit from the UI."
  );
  await expect(page.getByTestId("decision-drivers-textarea")).toHaveValue("Driver: must ship by Friday.");
  await expect(page.getByTestId("decision-outcome-textarea")).toHaveValue("We will go with option A.");
  await expect(page.getByTestId("consequences-textarea")).toHaveValue(
    "Higher upfront cost, faster delivery."
  );
  await expect(page.getByTestId("confirmation-textarea")).toHaveValue("Confirmed via architecture review.");
  await expect(page.getByTestId("additional-content-textarea")).toHaveValue(
    "Leftover content outside the eight sections."
  );

  // The People rows reflect the edited set: Alice (Decision Maker), Bob
  // (Consulted, changed from Decision Maker), Carol (Consulted), Erin
  // (Consulted, newly added); Dave was removed.
  await expect(page.locator('[data-testid^="person-name-input-"]')).toHaveCount(4);
  const reloadedNames = await page
    .locator('[data-testid^="person-name-input-"]')
    .evaluateAll((inputs) => (inputs as HTMLInputElement[]).map((input) => input.value));
  const reloadedRoles = await page
    .locator('[data-testid^="person-role-select-"]')
    .evaluateAll((selects) => (selects as HTMLSelectElement[]).map((select) => select.value));
  expect(reloadedNames).toContain("Alice");
  expect(reloadedNames).toContain("Bob");
  expect(reloadedNames).toContain("Carol");
  expect(reloadedNames).toContain("Erin");
  expect(reloadedNames).not.toContain("Dave");
  const roleByName = Object.fromEntries(reloadedNames.map((name, i) => [name, reloadedRoles[i]]));
  expect(roleByName.Alice).toBe("Decision Maker");
  expect(roleByName.Bob).toBe("Consulted");
  expect(roleByName.Carol).toBe("Consulted");
  expect(roleByName.Erin).toBe("Consulted");

  // The structured Options row round-trips too — expand the group and check
  // the single row's fields.
  await expect(page.getByTestId("section-toggle-options")).toBeVisible();
  const optionsExpanded = await page.getByTestId("section-toggle-options").getAttribute("aria-expanded");
  if (optionsExpanded !== "true") {
    await page.getByTestId("section-toggle-options").click();
  }
  await expect(page.locator('[data-testid^="option-description-input-"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="option-description-input-"]').first()).toHaveValue(
    "Option A: adopt the new framework"
  );
  await expect(page.locator('[data-testid^="option-pros-textarea-"]').first()).toHaveValue(
    "Faster development"
  );
  await expect(page.locator('[data-testid^="option-cons-textarea-"]').first()).toHaveValue(
    "Learning curve for the team"
  );

  // Untouched sections remain empty, proving each section is independently
  // editable rather than sharing storage with the ones that were filled in.
  await expect(page.getByTestId("more-information-textarea")).toHaveValue("");

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
