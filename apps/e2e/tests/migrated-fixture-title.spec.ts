// Journey: migrated example fixture title displays consistently (Req 4.4,
// 5.5). Seeds a migrated-style raw ADR directly into the shared e2e repo via
// a real git commit -- a `decision-makers` frontmatter key, no frontmatter
// `title` key, and the title as the body's first H1 heading, mirroring the
// exact shape of examples/0001-uzycie-gita-jako-zrodla-prawdy.md (migrated in
// task 8.1) -- bypassing the API, whose serializeAdr can only ever emit
// canonical new-style frontmatter. Confirms the resulting body-derived title
// renders identically across three independent surfaces, each backed by a
// distinct production code path through parseAdr: the folder tree
// (FolderService), an AdrCard rendered inside the similarity panel
// (SimilarityService -- a second AdrCard consumer alongside the folder
// tree), and the editor's title input (GET /api/adrs/:id via
// AdrEditingService).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { simpleGit } from "simple-git";
import { test, expect, type APIRequestContext } from "@playwright/test";

import { paths } from "../harness/paths.js";
import { unique, shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/**
 * Commit a raw, migrated-style ADR file directly into the shared e2e repo,
 * bypassing the API (whose serializeAdr can only ever emit canonical
 * new-style frontmatter), so the legacy/migrated shape is exact: a
 * `decision-makers` frontmatter key, no frontmatter `title` key, and the
 * title as the body's first H1 heading.
 */
async function commitMigratedFixture(relPath: string, id: string, title: string): Promise<void> {
  const raw = [
    "---",
    `id: ${id}`,
    "status: accepted",
    "date: 2026-01-01",
    "decision-makers: [pawel]",
    "tags: [architecture]",
    "---",
    "",
    `# ${title}`,
    "",
    "## Context and Problem Statement",
    "Migrated-style content seeded for title-display verification.",
    "",
  ].join("\n");

  const absPath = join(paths.repoPath, relPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, raw, "utf8");

  const git = simpleGit(paths.repoPath);
  await git.add(relPath);
  await git.commit(`seed migrated fixture ${id}`, undefined, { "--author": AUTHOR });
}

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

test("displays the migrated example fixture's body-derived title consistently in the folder tree, the ADR card, and the editor", async ({
  page,
  request,
}) => {
  const tag = unique("migrated");
  const title = `Migrated Fixture Title ${tag}`;
  const folder = `decisions/${tag}`;
  const migratedId = `adr-${tag}`;

  // Seed the migrated-style fixture directly via git, plus a second ("anchor")
  // ADR in the same folder via the real API so the similarity scope is
  // non-empty (similarity results list every OTHER ADR in scope, never the
  // opened ADR itself).
  await commitMigratedFixture(`${folder}/${migratedId}.md`, migratedId, title);
  const anchorId = await createAdr(request, folder, `Anchor for ${tag}`);

  await page.goto("/");

  // 1. Folder tree: the migrated fixture's row shows the H1-derived title
  // (FolderService -> parseAdr).
  await expect(page.getByTestId("folder-tree")).toBeVisible();
  await expect(page.getByTestId(`adr-node-${migratedId}`)).toContainText(title);
  await shot(page, `migrated-fixture-tree-${tag}`);

  // 2. ADR card via the similarity panel: open the anchor ADR (same folder)
  // and switch to Similar -- a second, independent AdrCard consumer backed by
  // a different service (SimilarityService -> parseAdr).
  await page.getByTestId(`adr-select-${anchorId}`).click();
  await page.getByTestId("panel-tab-similarity").click();
  await expect(page.getByTestId(`similarity-result-${migratedId}`)).toContainText(title);
  await shot(page, `migrated-fixture-similarity-${tag}`);

  // 3. Editor: open the migrated fixture itself (selecting any ADR always
  // switches the active aspect to "editor") and confirm the title input shows
  // the same title (GET /api/adrs/:id -> AdrEditingService -> parseAdr).
  await page.getByTestId(`adr-select-${migratedId}`).click();
  await expect(page.getByTestId("adr-editor-edit")).toBeVisible();
  await expect(page.getByTestId("title-input")).toHaveValue(title);
  await shot(page, `migrated-fixture-editor-${tag}`);
});
