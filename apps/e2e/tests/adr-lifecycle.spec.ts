// Journey: ADR create → edit → save, then save-conflict surfacing and recovery
// (Req 4.1, 4.2, 5.1). Drives the real UI in a real browser against the launched
// app; the concurrent write that forces the 409 is made directly against the
// proxied API via Playwright's request context (the same /api origin), mirroring
// the in-process flow proven by apps/web/src/App.test.tsx.

import { test, expect } from "@playwright/test";

import { shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/** A unique, hyphen-free word safe to embed in a title and search for verbatim. */
function token(): string {
  return `zz${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

test("creates, edits and saves an ADR, then recovers from a save conflict", async ({
  page,
  request,
}) => {
  const tag = token();
  const title = `Lifecycle ${tag}`;

  await page.goto("/");
  await page.getByTestId("author-name-input").fill(AUTHOR);

  // 1. Create a brand-new ADR through the default create-mode editor.
  await expect(page.getByTestId("adr-editor-create")).toBeVisible();
  await page.getByTestId("title-input").fill(title);
  await page.getByTestId("create-button").click();

  // The shell flips into edit mode for the newly created ADR.
  await expect(page.getByTestId("adr-editor-edit")).toBeVisible();
  await expect(page.getByTestId("title-input")).toHaveValue(title);

  // 2. Ordinary (non-conflicting) save of an edited body.
  await page.getByTestId("body-textarea").fill("First real edit from the UI.");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-success-message")).toBeVisible();
  await shot(page, `lifecycle-saved-${tag}`);

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
    deciders: string[];
    tags: string[];
    relations: unknown[];
    blobSha: string;
  };

  // 3. Force a conflict: a concurrent writer saves using that SAME baseBlobSha,
  //    advancing HEAD so the editor's next save (still holding the old sha) is
  //    stale.
  const concurrent = await request.put(`/api/adrs/${encodeURIComponent(adrId)}`, {
    data: {
      title: adr.title,
      status: adr.status,
      date: adr.date,
      deciders: adr.deciders,
      tags: adr.tags,
      relations: adr.relations,
      body: "Concurrent writer's content.",
      author: "Other Author <other@example.com>",
      baseBlobSha: adr.blobSha,
    },
  });
  expect(concurrent.ok()).toBeTruthy();

  // 4. Edit again in the UI and save — now stale, so the conflict must surface
  //    (not a silent overwrite).
  await page.getByTestId("body-textarea").fill("Second local edit, now stale.");
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("conflict-message")).toBeVisible();
  await expect(page.getByTestId("save-success-message")).toHaveCount(0);
  await shot(page, `lifecycle-conflict-${tag}`);

  // 5. Reload the latest version — the form now shows the concurrent content.
  await page.getByTestId("reload-latest-button").click();
  await expect(page.getByTestId("body-textarea")).toHaveValue("Concurrent writer's content.");

  // 6. Save once more on the fresh baseBlobSha — recovery to a saved state.
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-success-message")).toBeVisible();
  await expect(page.getByTestId("conflict-message")).toHaveCount(0);
  await shot(page, `lifecycle-recovered-${tag}`);
});
