// Journey: migrated example fixture content displays consistently as
// catch-all content across the app (Req 3.7, 5.5). Seeds the REAL example
// fixture's body (examples/0001-uzycie-gita-jako-zrodla-prawdy.md, migrated
// in task 8.1) directly into the shared e2e repo via a real git commit --
// same direct-git-commit technique as migrated-fixture-title.spec.ts's
// commitMigratedFixture, bypassing the API (whose serializeAdr can only ever
// emit canonical new-style frontmatter). The fixture's three Polish headings
// (## Kontekst, ## Decyzja, ## Konsekwencje) match none of the 8 canonical
// MADR headings, so per splitSections's contract its entire post-H1 body
// lands verbatim in additionalContent on read, leaving all 8 section fields
// empty. Confirms that holds identically on two independent surfaces, each
// backed by a distinct production code path through parseAdr: the editor
// (GET /api/adrs/:id -> AdrEditingService) and the history viewer (GET
// history + GET version-at -> HistoryTimeline).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { simpleGit } from "simple-git";
import { test, expect } from "@playwright/test";

import { paths } from "../harness/paths.js";
import { unique, shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/** Kebab-case testid segments for the 8 MADR section fields, canonical order. */
const SECTION_TESTID_KEYS = [
  "context-and-problem-statement",
  "decision-drivers",
  "considered-options",
  "decision-outcome",
  "consequences",
  "confirmation",
  "pros-and-cons-of-the-options",
  "more-information",
];

/**
 * Commit a raw, migrated-style ADR file directly into the shared e2e repo,
 * bypassing the API, whose body is the given raw Markdown content verbatim.
 * Mirrors migrated-fixture-title.spec.ts's commitMigratedFixture but accepts
 * an arbitrary body so callers can seed real fixture content (here: the
 * actual example fixture's non-MADR Polish heading structure) instead of a
 * synthetic placeholder.
 */
async function commitRawAdr(relPath: string, id: string, raw: string): Promise<void> {
  const absPath = join(paths.repoPath, relPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, raw, "utf8");

  const git = simpleGit(paths.repoPath);
  await git.add(relPath);
  await git.commit(`seed migrated fixture content ${id}`, undefined, { "--author": AUTHOR });
}

test("displays the migrated example fixture's non-MADR content consistently as catch-all content in the editor and the history viewer", async ({
  page,
}) => {
  const tag = unique("migrated-content");
  const folder = `decisions/${tag}`;
  const migratedId = `adr-${tag}`;
  const relPath = `${folder}/${migratedId}.md`;

  // Load the real example fixture and reuse its body (H1 title + three
  // non-matching Polish ## headings) verbatim, swapping only the frontmatter
  // id/date for test isolation -- this run's repo is fresh, so collision
  // isn't a real concern, but distinct values keep the seeded ADR
  // unambiguous against any other fixture data in the same run.
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
  await expect(page.getByTestId("folder-tree")).toBeVisible();

  // 1. Editor: open the migrated fixture (selecting any ADR auto-switches the
  // active aspect to "editor"). All 8 section fields must be empty, and
  // additional-content must hold the full original Polish body verbatim.
  await page.getByTestId(`adr-select-${migratedId}`).click();
  await expect(page.getByTestId("adr-editor-edit")).toBeVisible();

  for (const key of SECTION_TESTID_KEYS) {
    await expect(page.getByTestId(`${key}-textarea`)).toHaveValue("");
  }

  const editorAdditionalContent = await page
    .getByTestId("additional-content-textarea")
    .inputValue();

  expect(editorAdditionalContent).toContain("Kontekst");
  expect(editorAdditionalContent).toContain("Decyzja");
  expect(editorAdditionalContent).toContain("Konsekwencje");
  expect(editorAdditionalContent).toContain(
    "Aplikacja zarządza ADR-ami i potrzebuje wersjonowania, historii oraz porównań.",
  );
  expect(editorAdditionalContent).toContain(
    "Trzymamy ADR-y jako pliki Markdown z frontmatterem YAML w repozytorium git.",
  );
  expect(editorAdditionalContent).toContain(
    "Pełna historia i diff za darmo z gita.",
  );
  // No duplication: each heading must appear exactly once.
  expect(editorAdditionalContent.split("Kontekst")).toHaveLength(2);
  expect(editorAdditionalContent.split("Decyzja")).toHaveLength(2);
  expect(editorAdditionalContent.split("Konsekwencje")).toHaveLength(2);

  await shot(page, `migrated-fixture-content-editor-${tag}`);

  // 2. History viewer: switch to the history aspect, select the single
  // seeded commit, and confirm the same emptiness/content split holds there.
  await page.getByTestId("panel-tab-history").click();
  await expect(page.getByTestId("history-timeline")).toBeVisible();

  const entryEls = await page.locator('[data-testid^="history-entry-"]').all();
  const shas = new Set<string>();
  for (const el of entryEls) {
    const sha = await el.getAttribute("data-sha");
    if (sha) shas.add(sha);
  }
  expect(shas.size).toBe(1);
  const [sha] = [...shas];

  await page.getByTestId(`history-select-${sha}`).click();
  await expect(page.getByTestId("history-version-content")).toBeVisible();

  for (const key of SECTION_TESTID_KEYS) {
    // Each block always renders a non-empty label
    // (e.g. "Context and Problem Statement (required)"); only the section
    // content paragraph itself must be empty.
    await expect(page.getByTestId(`${key}-block`).locator(".history__section-content")).toHaveText("");
  }

  await expect(page.getByTestId("additional-content-block")).toBeVisible();
  // The block also renders a label ("Additional Content") ahead of the
  // content paragraph, so scope to the paragraph itself for an exact
  // cross-surface comparison against the editor's raw textarea value.
  const historyAdditionalContent = await page
    .getByTestId("additional-content-block")
    .locator(".history__section-content")
    .innerText();

  expect(historyAdditionalContent).toContain("Kontekst");
  expect(historyAdditionalContent).toContain("Decyzja");
  expect(historyAdditionalContent).toContain("Konsekwencje");
  expect(historyAdditionalContent).toContain(
    "Aplikacja zarządza ADR-ami i potrzebuje wersjonowania, historii oraz porównań.",
  );

  // No content lost or duplicated between the two surfaces: the history
  // viewer's additionalContent text matches the editor's exactly, modulo
  // whitespace -- the history block renders the content inside a single
  // <p>, which collapses newlines to spaces in the browser's accessibility
  // tree (innerText), unlike the editor's <textarea> value, which preserves
  // them verbatim.
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  expect(normalize(historyAdditionalContent)).toBe(normalize(editorAdditionalContent));

  await shot(page, `migrated-fixture-content-history-${tag}`);
});
