import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { SimilarityProviderError, type JudgePair } from "@adr/core";
import { SIMILARITY_RELATIONS } from "@adr/shared";
import { parseSimilarityConfig, type ValidatedJevConfig } from "../../similarityConfig.js";
import { JEV_PROMPT_VERSION, JevSimilarityJudge, parseJevAnswers } from "./jevSimilarityJudge.js";

const KEY = "sk-test-SECRET-jev-key-0123456789";

interface RecordedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: unknown;
}

interface Stub {
  url: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

type StubHandler = (req: RecordedRequest, res: ServerResponse) => void;

const stubs: Stub[] = [];

/** Local loopback Jev endpoint (8.2): a real HTTP server on 127.0.0.1, random port. */
async function startStub(handler: StubHandler): Promise<Stub> {
  const requests: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (raw += chunk));
    req.on("end", () => {
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        // keep the raw text
      }
      const recorded = { method: req.method, url: req.url, headers: req.headers, body };
      requests.push(recorded);
      handler(recorded, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const stub: Stub = {
    url: `http://127.0.0.1:${port}/api/alpha/decisions`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  stubs.push(stub);
  return stub;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function jevConfig(endpoint: string, timeoutMs = 300): ValidatedJevConfig {
  const result = parseSimilarityConfig({
    SIMILARITY_STRATEGY: "jev",
    JEV_ENDPOINT: endpoint,
    JEV_API_KEY: KEY,
    JEV_TIMEOUT_MS: String(timeoutMs),
    JEV_REQUEST_BUDGET_MS: String(Math.max(1000, timeoutMs)),
  });
  if (!result.ok || result.config.strategy !== "jev") {
    throw new Error("test setup: expected a valid jev config");
  }
  return result.config.jev;
}

/** The confirmed live TokenRouter response shape (research.md, 2026-09-26). */
function liveAnswer(similar: unknown, relation: unknown): unknown {
  return {
    model: "typesafe/jev-1.13-20260917",
    answers: { similar, relation },
    usage: { input_tokens: 548, output_tokens: 76, cost: 0.000023016 },
    id: "gen-dec-test",
    provider: "TypeSafe",
  };
}

function validBody(): unknown {
  return liveAnswer(
    { type: "noul", noul: 0.87 },
    {
      type: "choice",
      choice: "conflicts",
      probabilities: {
        duplicate: 0,
        supersedes: 0,
        conflicts: 0.7,
        constrains: 0.01,
        related: 0.28,
        unrelated: 0,
      },
      confidence: 0.62,
    }
  );
}

const pair: JudgePair = {
  target: { title: "Use PostgreSQL", text: "We use PostgreSQL as the primary database." },
  candidate: { title: "Use MySQL for billing", text: "Billing runs on MySQL." },
  position: { direction: "up", level: 2 },
};

async function failure(promise: Promise<unknown>): Promise<SimilarityProviderError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(SimilarityProviderError);
    expect((err as Error).message).not.toContain(KEY);
    return err as SimilarityProviderError;
  }
  throw new Error("expected the judgment to fail");
}

afterEach(async () => {
  await Promise.all(stubs.splice(0).map((s) => s.close()));
});

describe("JevSimilarityJudge", () => {
  it("exposes judgmentVersion as model#promptVersion, starting at prompt version 1", () => {
    expect(JEV_PROMPT_VERSION).toBe("1");
    const judge = new JevSimilarityJudge(jevConfig("http://127.0.0.1:9/x"));
    expect(judge.judgmentVersion).toBe("typesafe/jev-1.13#1");
  });

  it("sends one decisions request with the bearer key, the pinned model, the state and both questions (3.2)", async () => {
    const stub = await startStub((_req, res) => json(res, 200, validBody()));
    const judge = new JevSimilarityJudge(jevConfig(stub.url));

    await judge.judge(pair, new AbortController().signal);

    expect(stub.requests).toHaveLength(1);
    const [req] = stub.requests;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("/api/alpha/decisions");
    expect(req.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(req.headers["content-type"]).toMatch(/^application\/json/);

    const body = req.body as {
      model: string;
      state: unknown;
      questions: {
        similar: { type: string; instructions: string; criteria: Record<string, string> };
        relation: { type: string; instructions: string; criteria: Record<string, string> };
      };
    };
    expect(body.model).toBe("typesafe/jev-1.13");
    expect(body.state).toEqual({
      target: { title: pair.target.title, text: pair.target.text },
      candidate: {
        title: pair.candidate.title,
        text: pair.candidate.text,
        direction: "up",
        level: 2,
      },
    });
    expect(body.questions.similar.type).toBe("noul");
    expect(body.questions.similar.instructions).not.toBe("");
    expect(Object.keys(body.questions.similar.criteria).sort()).toEqual(["false", "true"]);
    expect(body.questions.relation.type).toBe("choice");
    expect(body.questions.relation.instructions).not.toBe("");
    expect(Object.keys(body.questions.relation.criteria).sort()).toEqual(
      [...SIMILARITY_RELATIONS].sort()
    );
    expect(Object.keys(body.questions)).toEqual(["similar", "relation"]);
  });

  it("returns the parsed judgment for a valid answer (3.1, 3.5)", async () => {
    const stub = await startStub((_req, res) => json(res, 200, validBody()));
    const judge = new JevSimilarityJudge(jevConfig(stub.url));

    await expect(judge.judge(pair, new AbortController().signal)).resolves.toEqual({
      probability: 0.87,
      relation: "conflicts",
    });
  });

  it.each([401, 500])("maps HTTP %i to http-status without leaking the key (7.1, 2.7)", async (status) => {
    const stub = await startStub((req, res) =>
      json(res, status, { error: { message: `Invalid token ${String(req.headers.authorization)}` } })
    );
    const judge = new JevSimilarityJudge(jevConfig(stub.url));

    const err = await failure(judge.judge(pair, new AbortController().signal));
    expect(err.category).toBe("http-status");
    expect(err.httpStatus).toBe(status);
  });

  it("maps a response slower than the timeout to timeout (7.3)", async () => {
    const stub = await startStub((_req, res) => {
      const timer = setTimeout(() => json(res, 200, validBody()), 2000);
      res.on("close", () => clearTimeout(timer));
    });
    const judge = new JevSimilarityJudge(jevConfig(stub.url, 150));

    const started = Date.now();
    const err = await failure(judge.judge(pair, new AbortController().signal));
    expect(err.category).toBe("timeout");
    expect(err.httpStatus).toBeNull();
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("maps a caller abort mid-request to aborted (7.7)", async () => {
    const controller = new AbortController();
    const stub = await startStub(() => controller.abort());
    const judge = new JevSimilarityJudge(jevConfig(stub.url, 5000));

    const err = await failure(judge.judge(pair, controller.signal));
    expect(err.category).toBe("aborted");
    expect(stub.requests).toHaveLength(1);
  });

  it("rejects with aborted without calling Jev when the signal is already aborted (7.7)", async () => {
    const stub = await startStub((_req, res) => json(res, 200, validBody()));
    const controller = new AbortController();
    controller.abort();
    const judge = new JevSimilarityJudge(jevConfig(stub.url));

    const err = await failure(judge.judge(pair, controller.signal));
    expect(err.category).toBe("aborted");
    expect(stub.requests).toHaveLength(0);
  });

  it("maps a fetch rejection to network", async () => {
    const stub = await startStub(() => undefined);
    const url = stub.url;
    await stub.close();
    const judge = new JevSimilarityJudge(jevConfig(url));

    const err = await failure(judge.judge(pair, new AbortController().signal));
    expect(err.category).toBe("network");
    expect(err.httpStatus).toBeNull();
  });

  it.each([
    ["an out-of-range probability", liveAnswer({ type: "noul", noul: 1.2 }, { type: "choice", choice: "related" })],
    ["an unknown relation", liveAnswer({ type: "noul", noul: 0.5 }, { type: "choice", choice: "conflicting" })],
    ["missing answers", { model: "typesafe/jev-1.13-20260917", usage: {} }],
  ])("maps %s to invalid-response (3.6)", async (_label, body) => {
    const stub = await startStub((_req, res) => json(res, 200, body));
    const judge = new JevSimilarityJudge(jevConfig(stub.url));

    const err = await failure(judge.judge(pair, new AbortController().signal));
    expect(err.category).toBe("invalid-response");
  });

  it("maps a non-JSON success body to invalid-response (3.6)", async () => {
    const stub = await startStub((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("not json");
    });
    const judge = new JevSimilarityJudge(jevConfig(stub.url));

    const err = await failure(judge.judge(pair, new AbortController().signal));
    expect(err.category).toBe("invalid-response");
  });

  it("uses a custom fetch implementation when given one", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls++;
      return new Response(JSON.stringify(validBody()), { status: 200 });
    };
    const judge = new JevSimilarityJudge(jevConfig("http://127.0.0.1:9/x"), fetchImpl);

    await expect(judge.judge(pair, new AbortController().signal)).resolves.toEqual({
      probability: 0.87,
      relation: "conflicts",
    });
    expect(calls).toBe(1);
  });
});

describe("parseJevAnswers", () => {
  const relation = (extra: Record<string, unknown>) => ({ type: "choice", ...extra });

  it("reads answers.similar.noul and answers.relation.choice", () => {
    expect(parseJevAnswers(validBody())).toEqual({ probability: 0.87, relation: "conflicts" });
  });

  it("accepts the probability bounds 0 and 1", () => {
    expect(
      parseJevAnswers(liveAnswer({ noul: 0 }, relation({ choice: "unrelated" })))
    ).toEqual({ probability: 0, relation: "unrelated" });
    expect(parseJevAnswers(liveAnswer({ noul: 1 }, relation({ choice: "duplicate" })))).toEqual({
      probability: 1,
      relation: "duplicate",
    });
  });

  it("falls back to the arg-max of the distribution when no choice is given", () => {
    const body = liveAnswer(
      { noul: 0.4 },
      relation({ probabilities: { duplicate: 0.1, supersedes: 0.6, related: 0.29 } })
    );
    expect(parseJevAnswers(body)).toEqual({ probability: 0.4, relation: "supersedes" });
  });

  it("does not require the distribution to sum to exactly 1 (rounded probabilities)", () => {
    const body = liveAnswer(
      { noul: 0.4 },
      relation({ probabilities: { constrains: 0.66, related: 0.33 } })
    );
    expect(parseJevAnswers(body)).toEqual({ probability: 0.4, relation: "constrains" });
  });

  it.each([
    ["a non-object body", "nope"],
    ["null", null],
    ["missing answers", { model: "m" }],
    ["missing similar", { answers: { relation: { choice: "related" } } }],
    ["missing relation", { answers: { similar: { noul: 0.5 } } }],
    ["a probability above 1", liveAnswer({ noul: 1.2 }, relation({ choice: "related" }))],
    ["a negative probability", liveAnswer({ noul: -0.1 }, relation({ choice: "related" }))],
    ["a non-numeric probability", liveAnswer({ noul: "0.5" }, relation({ choice: "related" }))],
    ["a NaN probability", liveAnswer({ noul: Number.NaN }, relation({ choice: "related" }))],
    ["an unknown chosen relation", liveAnswer({ noul: 0.5 }, relation({ choice: "conflicting" }))],
    [
      "an unknown arg-max relation",
      liveAnswer({ noul: 0.5 }, relation({ probabilities: { conflicting: 0.9, related: 0.1 } })),
    ],
    ["an empty distribution and no choice", liveAnswer({ noul: 0.5 }, relation({ probabilities: {} }))],
    [
      "a non-numeric distribution entry",
      liveAnswer({ noul: 0.5 }, relation({ probabilities: { related: "high" } })),
    ],
  ])("returns null for %s", (_label, body) => {
    expect(parseJevAnswers(body)).toBeNull();
  });
});
