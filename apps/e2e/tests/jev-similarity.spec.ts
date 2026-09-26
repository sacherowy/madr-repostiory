// Journey: related reading ranked by the live Jev API (jev-similarity).
//
// Runs only when the run opted in with SIMILARITY_STRATEGY=jev plus
// JEV_ENDPOINT and JEV_API_KEY (see harness/similarityMode.ts); otherwise every
// test here is reported as skipped. It seeds the sample set from
// examples/jev-similarity (ten ADRs with planted similarities: adr-1 ~ adr-7,
// adr-10 ~ adr-2 + adr-3) into a unique top-level folder, so each ADR's lineage
// is the other nine plus any ADRs other specs created at the repo root, then
// checks the rankings Jev produces through the API and the real UI. Each
// uncached similar request costs one live Jev judgment per lineage candidate.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

import { requiresJev, shot, unique } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";
const API_HEALTH_URL = "http://localhost:3000/health";
const EXAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../examples/jev-similarity");

/** MADR headings the example files use, mapped to the update-request fields. */
const SECTION_KEYS: Record<string, string> = {
  "Context and Problem Statement": "contextAndProblemStatement",
  "Decision Drivers": "decisionDrivers",
  "Considered Options": "consideredOptions",
  "Decision Outcome": "decisionOutcome",
  Consequences: "consequences",
  Confirmation: "confirmation",
  "Pros and Cons of the Options": "prosAndConsOfTheOptions",
  "More Information": "moreInformation",
};

interface ExampleAdr {
  exampleId: string;
  title: string;
  status: string;
  date: string;
  sections: Record<string, string>;
}

/** Minimal reader for the example files: frontmatter id/status/date, the H1 title and the MADR sections. */
function parseExample(markdown: string): ExampleAdr {
  const [, frontmatter, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(markdown) ?? [];
  const field = (name: string) => new RegExp(`^${name}:\\s*"?([^"\\n]+)"?`, "m").exec(frontmatter ?? "")?.[1] ?? "";
  const sections: Record<string, string> = Object.fromEntries(Object.values(SECTION_KEYS).map((key) => [key, ""]));
  let title = "";
  let current: string | null = null;
  const lines: Record<string, string[]> = {};
  for (const line of (body ?? "").split("\n")) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading && heading[1] === "#") {
      title = heading[2].trim();
      current = null;
    } else if (heading && SECTION_KEYS[heading[2].trim()]) {
      current = SECTION_KEYS[heading[2].trim()];
      lines[current] = [];
    } else if (current) {
      lines[current].push(line);
    }
  }
  for (const [key, value] of Object.entries(lines)) sections[key] = value.join("\n").trim();
  return { exampleId: field("id"), title, status: field("status"), date: field("date"), sections };
}

async function loadExamples(): Promise<ExampleAdr[]> {
  const files = (await fs.readdir(EXAMPLES_DIR)).filter((f) => /^adr-\d+\.md$/.test(f));
  return Promise.all(files.map(async (f) => parseExample(await fs.readFile(path.join(EXAMPLES_DIR, f), "utf8"))));
}

/** Create each example ADR via the proxied API and fill its sections; returns example id → created id. */
async function seedExamples(request: APIRequestContext, folder: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const example of await loadExamples()) {
    const created = await request.post("/api/adrs", { data: { title: example.title, folder, author: AUTHOR } });
    expect(created.ok(), `create ${example.exampleId}`).toBeTruthy();
    const adr = (await created.json()) as { id: string; blobSha: string };
    const saved = await request.put(`/api/adrs/${adr.id}`, {
      data: {
        ...example.sections,
        title: example.title,
        status: example.status,
        date: example.date,
        additionalContent: "",
        author: AUTHOR,
        baseBlobSha: adr.blobSha,
      },
    });
    expect(saved.ok(), `save sections of ${example.exampleId}`).toBeTruthy();
    ids.set(example.exampleId, adr.id);
  }
  return ids;
}

interface SimilarEntry {
  adr: { id: string; title: string };
  score: number;
  relation?: string;
}

async function openArticle(page: Page, adrId: string): Promise<void> {
  await expect(page.getByTestId(`home-card-${adrId}`)).toBeVisible();
  await page.getByTestId(`home-card-${adrId}`).click();
  await expect(page.getByTestId("article-page")).toBeVisible();
}

test.describe("related reading ranked by the live Jev API", () => {
  requiresJev();

  // Live judgments: allow for provider latency on top of the default budget.
  test.describe.configure({ timeout: 180_000 });

  let ids: Map<string, string>;
  const titleOf = new Map<string, string>();

  test.beforeAll(async ({ request }) => {
    ids = await seedExamples(request, unique("jevsim"));
    for (const example of await loadExamples()) titleOf.set(example.exampleId, example.title);
  });

  test("the API reports the jev strategy", async ({ request }) => {
    const health = await request.get(API_HEALTH_URL);
    expect(health.ok()).toBeTruthy();
    expect(((await health.json()) as { similarity?: { strategy?: string } }).similarity).toEqual({ strategy: "jev" });
  });

  test("adr-1 is most similar to adr-7, in the API and in Related reading", async ({ page, request }) => {
    const res = await request.get(`/api/adrs/${ids.get("adr-1")}/similar`);
    expect(res.status()).toBe(200);
    // Every lineage candidate is judged (the lineage is far below the cap): the
    // other nine examples plus any ADRs other specs created at the repo root.
    const judged = res.headers()["x-similarity-judged"];
    expect(Number(judged)).toBeGreaterThanOrEqual(9);
    expect(res.headers()["x-similarity-candidates"]).toBe(judged);
    const results = (await res.json()) as SimilarEntry[];
    console.log(`[jev] adr-1 ranking: ${results.map((r) => `${r.adr.title} ${r.score}`).join(" | ")}`);
    expect(results).toHaveLength(Number(judged));
    expect(results[0].adr.id).toBe(ids.get("adr-7"));
    expect(results[0].score).toBeGreaterThan(results[1].score);

    await page.goto("/");
    await openArticle(page, ids.get("adr-1") as string);
    const related = page.getByTestId("context-rail-related");
    await expect(related.first()).toContainText(titleOf.get("adr-7") as string);
    await shot(page, "jev-related-reading-adr-1");
  });

  test("adr-10 is most similar to adr-2 and adr-3", async ({ page, request }) => {
    const res = await request.get(`/api/adrs/${ids.get("adr-10")}/similar`);
    expect(res.status()).toBe(200);
    const results = (await res.json()) as SimilarEntry[];
    console.log(`[jev] adr-10 ranking: ${results.map((r) => `${r.adr.title} ${r.score}`).join(" | ")}`);
    const topTwo = results.slice(0, 2).map((r) => r.adr.id);
    expect(new Set(topTwo)).toEqual(new Set([ids.get("adr-2"), ids.get("adr-3")]));
    expect(results[1].score).toBeGreaterThan(results[2].score);

    await page.goto("/");
    await openArticle(page, ids.get("adr-10") as string);
    const related = page.getByTestId("context-rail-related");
    const expectedTitles = [titleOf.get("adr-2"), titleOf.get("adr-3")];
    for (const index of [0, 1]) {
      const text = await related.nth(index).innerText();
      expect(expectedTitles.some((title) => text.includes(title as string))).toBeTruthy();
    }
    await shot(page, "jev-related-reading-adr-10");
  });
});
