import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JevSimilarityService } from "@adr/core";
import type { SimilarityRelation, SimilarityResult } from "@adr/shared";
import { buildContainer, type Container } from "./container.js";
import { buildServer } from "./server.js";
import { parseSimilarityConfig } from "./similarityConfig.js";

/**
 * End-to-end integration of the Jev strategy (1.4, 8.2): a real container and
 * Fastify server over a temporary git repository, whose similarity finder
 * calls a loopback Jev stub (node:http on 127.0.0.1, random port) through the
 * real HTTP judge and SQLite judgment store. Runs fully offline.
 */

const AUTHOR = "Test Author <test@example.com>";
const KEY = "sk-test-SECRET-jev-integration-key";

interface RecordedRequest {
  headers: IncomingHttpHeaders;
  body: {
    model: string;
    state: {
      target: { title: string; text: string };
      candidate: { title: string; text: string; direction: "down" | "up"; level: number };
    };
    questions: Record<string, unknown>;
  };
}

interface Stub {
  url: string;
  requests: RecordedRequest[];
  /** When set, every request is answered with this non-2xx status. */
  failWith: number | null;
  close(): Promise<void>;
}

/** Stub answers per candidate title: probability and relation. */
type Answers = Record<string, { probability: number; relation: SimilarityRelation }>;

/** The confirmed live TokenRouter response shape (research.md, 2026-09-26). */
function liveAnswer(probability: number, relation: SimilarityRelation): unknown {
  return {
    model: "typesafe/jev-1.13-20260917",
    answers: {
      similar: { type: "noul", noul: probability },
      relation: {
        type: "choice",
        choice: relation,
        probabilities: {
          duplicate: 0,
          supersedes: 0,
          conflicts: 0,
          constrains: 0,
          related: 0,
          unrelated: 0,
          [relation]: 0.9,
        },
        confidence: 0.8,
      },
    },
    usage: { input_tokens: 548, output_tokens: 76, cost: 0.000023016 },
    id: "gen-dec-integration",
    provider: "TypeSafe",
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Loopback Jev endpoint, same pattern as jevSimilarityJudge.test.ts (8.2). */
async function startStub(answers: Answers): Promise<Stub> {
  const requests: RecordedRequest[] = [];
  const stub: Stub = { url: "", requests, failWith: null, close: async () => {} };
  const server = createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw) as RecordedRequest["body"];
      requests.push({ headers: req.headers, body });
      if (stub.failWith !== null) return json(res, stub.failWith, { error: "stub failure" });
      const answer = answers[body.state.candidate.title];
      // An unexpected (non-lineage) candidate gets a 500, which would surface as a 503.
      if (!answer) return json(res, 500, { error: `unexpected candidate ${body.state.candidate.title}` });
      json(res, 200, liveAnswer(answer.probability, answer.relation));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  stub.url = `http://127.0.0.1:${port}/api/alpha/decisions`;
  stub.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return stub;
}

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-jev-integration-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

const TARGET = "Use PostgreSQL for payments";

/**
 * Nested hierarchy anchored at org/platform/payments (the target's folder).
 * Lineage order (level, down before up, path) and the stub's answers:
 *   L0 down  Payments ledger      0.40 related
 *   L1 down  Refunds storage      0.91 duplicate
 *   L1 up    Platform database    0.75 conflicts
 *   L2 up    Org data standard    0.10 unrelated
 *   L3 up    Root policy          0.40 constrains   (beyond the cap of 4)
 * Excluded: a sibling branch, a prefix-trap folder and an unrelated top-level folder (4.4).
 */
const FIXTURES: { title: string; folder: string }[] = [
  { title: TARGET, folder: "org/platform/payments" },
  { title: "Payments ledger", folder: "org/platform/payments" },
  { title: "Refunds storage", folder: "org/platform/payments/refunds" },
  { title: "Platform database", folder: "org/platform" },
  { title: "Org data standard", folder: "org" },
  { title: "Root policy", folder: "." },
  { title: "Identity store", folder: "org/platform/identity" },
  { title: "Payments v2 database", folder: "org/platform/payments-v2" },
  { title: "Other team database", folder: "other" },
];

const ANSWERS: Answers = {
  "Payments ledger": { probability: 0.4, relation: "related" },
  "Refunds storage": { probability: 0.91, relation: "duplicate" },
  "Platform database": { probability: 0.75, relation: "conflicts" },
  "Org data standard": { probability: 0.1, relation: "unrelated" },
  "Root policy": { probability: 0.4, relation: "constrains" },
};

const EXCLUDED = ["Identity store", "Payments v2 database", "Other team database"];

describe("Jev similarity strategy end to end (integration)", () => {
  let repoPath: string;
  let stub: Stub;
  let container: Container;
  let app: FastifyInstance;
  const ids = new Map<string, string>();
  const paths = new Map<string, string>();

  beforeEach(async () => {
    repoPath = await initRepo();
    stub = await startStub(ANSWERS);

    const similarity = parseSimilarityConfig({
      SIMILARITY_STRATEGY: "jev",
      JEV_ENDPOINT: stub.url,
      JEV_API_KEY: KEY,
      JEV_TIMEOUT_MS: "2000",
      JEV_REQUEST_BUDGET_MS: "10000",
      JEV_MAX_CANDIDATES: "4",
      JEV_CONCURRENCY: "2",
    });
    if (!similarity.ok) throw new Error("test setup: expected a valid jev config");

    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "" },
      similarity: similarity.config,
    });
    await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);
    app = await buildServer(container);

    ids.clear();
    paths.clear();
    for (const { title, folder } of FIXTURES) {
      const res = await app.inject({ method: "POST", url: "/api/adrs", payload: { title, folder, author: AUTHOR } });
      expect(res.statusCode).toBe(201);
      const created = res.json() as { id: string; path: string };
      ids.set(title, created.id);
      paths.set(title, created.path);
    }
  });

  afterEach(async () => {
    await app.close();
    await stub.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  function similar(query = ""): Promise<Awaited<ReturnType<FastifyInstance["inject"]>>> {
    return app.inject({ method: "GET", url: `/api/adrs/${ids.get(TARGET)}/similar${query}` });
  }

  it("wires the Jev service from a parsed jev configuration and reports the strategy in /health (1.4, 5.5)", async () => {
    expect(container.similarity).toBeInstanceOf(JevSimilarityService);

    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().similarity).toEqual({ strategy: "jev" });
    expect(res.body).not.toContain(KEY);
    expect(res.body).not.toContain(stub.url);
  });

  it("returns only lineage candidates ranked by the stub's probabilities, with lineage, relation and count headers (4.4, 5.6, 8.2)", async () => {
    const res = await similar();

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-similarity-judged"]).toBe("4");
    expect(res.headers["x-similarity-candidates"]).toBe("5");

    const body = res.json() as SimilarityResult[];
    // Ranked by descending probability; the cap takes the first four in lineage order,
    // so the root-level ADR (level 3) is not judged.
    expect(body.map((r) => [r.adr.title, r.score, r.lineage, r.relation])).toEqual([
      ["Refunds storage", 0.91, { direction: "down", level: 1 }, "duplicate"],
      ["Platform database", 0.75, { direction: "up", level: 1 }, "conflicts"],
      ["Payments ledger", 0.4, { direction: "down", level: 0 }, "related"],
      ["Org data standard", 0.1, { direction: "up", level: 2 }, "unrelated"],
    ]);
    expect(body[0].adr).toEqual({
      id: ids.get("Refunds storage"),
      title: "Refunds storage",
      status: expect.any(String),
      path: paths.get("Refunds storage"),
    });

    // One outbound call per judged candidate, never for the target or excluded folders.
    const judgedTitles = stub.requests.map((r) => r.body.state.candidate.title).sort();
    expect(judgedTitles).toEqual(["Org data standard", "Payments ledger", "Platform database", "Refunds storage"]);
    for (const request of stub.requests) {
      expect(request.headers.authorization).toBe(`Bearer ${KEY}`);
      expect(request.body.state.target.title).toBe(TARGET);
      expect(EXCLUDED).not.toContain(request.body.state.candidate.title);
    }
  });

  it("judges the whole lineage on an exhaustive request, ignoring scope, with ties broken by level (4.4, 5.6)", async () => {
    const res = await similar("?exhaustive=true&scope=other");

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-similarity-judged"]).toBe("5");
    expect(res.headers["x-similarity-candidates"]).toBe("5");
    const body = res.json() as SimilarityResult[];
    expect(body.map((r) => r.adr.title)).toEqual([
      "Refunds storage",
      "Platform database",
      "Payments ledger",
      "Root policy",
      "Org data standard",
    ]);
    expect(body.find((r) => r.adr.title === "Root policy")).toMatchObject({
      lineage: { direction: "up", level: 3 },
      relation: "constrains",
    });
    for (const excluded of EXCLUDED) {
      expect(body.map((r) => r.adr.title)).not.toContain(excluded);
    }
    expect(stub.requests).toHaveLength(5);
  });

  it("serves a repeated request from the judgment cache without new stub calls (6.2)", async () => {
    const first = await similar();
    expect(first.statusCode).toBe(200);
    const callsAfterFirst = stub.requests.length;
    expect(callsAfterFirst).toBe(4);

    const second = await similar();
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(second.headers["x-similarity-judged"]).toBe("4");
    expect(second.headers["x-similarity-candidates"]).toBe("5");
    expect(stub.requests).toHaveLength(callsAfterFirst);

    // Widening to the whole lineage only judges the one candidate not cached yet.
    const exhaustive = await similar("?exhaustive=true");
    expect(exhaustive.statusCode).toBe(200);
    expect(stub.requests.slice(callsAfterFirst).map((r) => r.body.state.candidate.title)).toEqual(["Root policy"]);
  });

  it("responds 503 with the provider-unavailable body when the stub fails (7.1)", async () => {
    stub.failWith = 500;

    const res = await similar();

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ kind: "providerUnavailable" });
    expect(res.headers["x-similarity-judged"]).toBeUndefined();
    expect(res.body).not.toContain(KEY);
    expect(stub.requests.length).toBeGreaterThan(0);

    // No failed judgment was cached: once the stub recovers, the request succeeds.
    stub.failWith = null;
    const recovered = await similar();
    expect(recovered.statusCode).toBe(200);
    expect((recovered.json() as SimilarityResult[])[0].adr.title).toBe("Refunds storage");
  });
});
