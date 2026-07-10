// Journey: migrated example fixture content displays consistently as verbatim
// catch-all content across the portal (Req 3.7, 5.5; behavior preserved through
// the portal, Req 15.2 / 16.4). Seeds the REAL example fixture's body
// (examples/0001-uzycie-gita-jako-zrodla-prawdy.md, migrated in task 8.1)
// directly into the shared e2e repo via a real git commit — the same direct-git
// technique as migrated-fixture-title.spec.ts — bypassing the API (whose
// serializeAdr can only ever emit canonical new-style frontmatter). The fixture's
// three Polish headings (## Kontekst, ## Decyzja, ## Konsekwencje) match none of
// the 8 canonical MADR headings, so per splitSections's contract its entire
// post-H1 body lands verbatim in additionalContent on read, leaving all 8 MADR
// section fields empty.
//
// In the portal that split surfaces on two read paths: the friendly ARTICLE
// renders only the (empty) canonical MADR sections — so none of the Polish
// content is mis-rendered as a friendly section — while the TECHNICAL view shows
// the raw record verbatim, where the full Polish body appears exactly as stored.
// Confirms both, each backed by a distinct production code path through parseAdr:
// GET /api/adrs/:id (AdrEditingService, the article) and GET /api/adrs/:id/raw
// (the Technical view's raw pane).

import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { simpleGit } from "simple-git";
import { test, expect } from "@playwright/test";

import { paths } from "../harness/paths.js";
import { unique, shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/**
 * Commit a raw, migrated-style ADR file directly into the shared e2e repo,
 * bypassing the API, whose body is the given raw Markdown verbatim. Mirrors
 * migrated-fixture-title.spec.ts's commit helper but accepts an arbitrary body so
 * it can seed the real example fixture's non-MADR Polish heading structure.
 */
async function commitRawAdr(relPath: string, id: string, raw: string): Promise<void> {
  const absPath = join(paths.repoPath, relPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, raw, "utf8");

  const git = simpleGit(paths.repoPath);
  await git.add(relPath);
  await git.commit(`seed migrated fixture content ${id}`, undefined, { "--author": AUTHOR });
}

test("displays the migrated fixture's non-MADR content as verbatim catch-all content: absent from the friendly article, verbatim in the Technical view", async ({
  page,
}) => {
  const tag = unique("migrated-content");
  const folder = `decisions/${tag}`;
  const migratedId = `adr-${tag}`;
  const relPath = `${folder}/${migratedId}.md`;

  // Load the real example fixture and reuse its body (H1 title + three
  // non-matching Polish ## headings) verbatim, swapping only the frontmatter
  // id/date for test isolation.
  const exampleFixturePath = join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "examples",
    "0001-uzycie-gita-jako-zrodla-prawdy.md",
  );
  const exampleRaw = await readFile(exampleFixturePath, "utf8");
  const bodyStart = exampleRaw.indexOf("\n---", 4) + "\n---".length;
  const body = exampleRaw.slice(bodyStart).replace(/^\s*\n/, "");

  const raw = [
    "---",
    `id: ${migratedId}`,
    "status: accepted",
    "date: 2026-01-01",
    "decision-makers: [pawel]",
    "tags: [architecture, storage]",
    "---",
    "",
    body,
  ].join("\n");

  await commitRawAdr(relPath, migratedId, raw);

  await page.goto("/");
  await expect(page.getByTestId("home-page")).toBeVisible();

  // Open the migrated fixture's article from its Home feed card.
  await expect(page.getByTestId(`home-card-${migratedId}`)).toBeVisible();
  await page.getByTestId(`home-card-${migratedId}`).click();
  await expect(page.getByTestId("article-page")).toBeVisible();

  // 1. Article: the non-MADR Polish body is NOT mis-rendered as a friendly MADR
  // section. The canonical sections are empty (their headings didn't match), so
  // none of the Polish content appears in the friendly sections region.
  await expect(page.getByTestId("article-section-contextAndProblemStatement")).toHaveCount(0);
  const sections = page.getByTestId("article-sections");
  await expect(sections).not.toContainText("Kontekst");
  await expect(sections).not.toContainText("Decyzja");
  await expect(sections).not.toContainText("Konsekwencje");
  await shot(page, `migrated-fixture-content-article-${tag}`);

  // 2. Technical view: the raw record shows the full Polish body verbatim — the
  // catch-all content surfaces here exactly as stored (Req 3.7, 1.6).
  await page.getByTestId("article-technical-enter").click();
  await expect(page.getByTestId("technical-view")).toBeVisible();
  await expect(page.getByTestId("technical-view-path")).toContainText(migratedId);

  const rawPane = page.getByTestId("technical-view-raw");
  await expect(rawPane).toContainText("Kontekst");
  await expect(rawPane).toContainText("Decyzja");
  await expect(rawPane).toContainText("Konsekwencje");
  await expect(rawPane).toContainText(
    "Aplikacja zarządza ADR-ami i potrzebuje wersjonowania, historii oraz porównań.",
  );
  await expect(rawPane).toContainText(
    "Trzymamy ADR-y jako pliki Markdown z frontmatterem YAML w repozytorium git.",
  );
  await expect(rawPane).toContainText("Pełna historia i diff za darmo z gita.");
  await shot(page, `migrated-fixture-content-technical-${tag}`);
});
