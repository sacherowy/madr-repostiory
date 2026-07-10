// Journey: a migrated example fixture's body-derived title displays consistently
// across the portal (Req 4.4, 5.5; behavior preserved through the portal, Req
// 15.2 / 16.4). Seeds a migrated-style raw ADR directly into the shared e2e repo
// via a real git commit — a `decision-makers` frontmatter key, no frontmatter
// `title` key, and the title as the body's first H1 heading, mirroring the exact
// shape of examples/0001-uzycie-gita-jako-zrodla-prawdy.md (migrated in task 8.1)
// — bypassing the API, whose serializeAdr can only ever emit canonical new-style
// frontmatter. Confirms the resulting body-derived title renders identically on
// two independent portal surfaces, each backed by a distinct production code path
// through parseAdr: the Home feed card (FeedService, a live git scan) and the
// decision article's title (GET /api/adrs/:id → AdrEditingService).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { simpleGit } from "simple-git";
import { test, expect } from "@playwright/test";

import { paths } from "../harness/paths.js";
import { unique, shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

/**
 * Commit a raw, migrated-style ADR file directly into the shared e2e repo,
 * bypassing the API (whose serializeAdr can only ever emit canonical new-style
 * frontmatter), so the legacy/migrated shape is exact: a `decision-makers`
 * frontmatter key, no frontmatter `title` key, and the title as the body's first
 * H1 heading. The FeedService (git scan) and AdrEditingService (GET /api/adrs/:id)
 * both read straight from git, so a directly-committed record surfaces in both.
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

test("displays the migrated fixture's body-derived title consistently in the Home feed card and the article", async ({
  page,
}) => {
  const tag = unique("migrated");
  const title = `Migrated Fixture Title ${tag}`;
  const folder = `decisions/${tag}`;
  const migratedId = `adr-${tag}`;

  await commitMigratedFixture(`${folder}/${migratedId}.md`, migratedId, title);

  await page.goto("/");

  // 1. Home feed card: the migrated fixture surfaces as a card whose title is the
  // H1-derived title (FeedService → parseAdr, a live git scan).
  await expect(page.getByTestId("home-page")).toBeVisible();
  await expect(page.getByTestId(`home-card-${migratedId}`)).toBeVisible();
  await expect(page.getByTestId(`home-card-${migratedId}`)).toContainText(title);
  await shot(page, `migrated-fixture-feed-${tag}`);

  // 2. Decision article: opening the card reaches the article, whose title shows
  // the same H1-derived title (GET /api/adrs/:id → AdrEditingService → parseAdr).
  await page.getByTestId(`home-card-${migratedId}`).click();
  await expect(page.getByTestId("article-page")).toBeVisible();
  await expect(page.getByTestId("article-page").locator("h1")).toHaveText(title);
  await shot(page, `migrated-fixture-article-${tag}`);
});
