import { describe, it, expect } from "vitest";
import {
  formatConfigIssues,
  parseSimilarityConfig,
  type ConfigIssue,
  type SimilarityConfig,
  type SimilarityConfigResult,
  type ValidatedJevConfig,
} from "./similarityConfig.js";

const KEY = "tr-secret-key-value-123";

function jevEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    SIMILARITY_STRATEGY: "jev",
    JEV_ENDPOINT: "https://api.tokenrouter.com/api/alpha/decisions",
    JEV_API_KEY: KEY,
    ...overrides,
  };
}

function issuesOf(result: SimilarityConfigResult): ConfigIssue[] {
  if (result.ok) throw new Error(`expected issues, got ok: ${JSON.stringify(result.config)}`);
  return result.issues;
}

function jevOf(result: SimilarityConfigResult): ValidatedJevConfig {
  if (!result.ok) throw new Error(`expected ok, got issues: ${formatConfigIssues(result.issues)}`);
  if (result.config.strategy !== "jev") throw new Error("expected jev strategy");
  return result.config.jev;
}

function variables(issues: ConfigIssue[]): string[] {
  return issues.map((i) => i.variable);
}

describe("parseSimilarityConfig — strategy selection", () => {
  it("defaults to embedding when SIMILARITY_STRATEGY is absent (1.2)", () => {
    expect(parseSimilarityConfig({})).toEqual({ ok: true, config: { strategy: "embedding" } });
  });

  it.each(["", "   "])("defaults to embedding when SIMILARITY_STRATEGY is blank %j (1.2)", (value) => {
    expect(parseSimilarityConfig({ SIMILARITY_STRATEGY: value })).toEqual({
      ok: true,
      config: { strategy: "embedding" },
    });
  });

  it("accepts an explicit embedding value case-insensitively (1.1)", () => {
    expect(parseSimilarityConfig({ SIMILARITY_STRATEGY: " Embedding " })).toEqual({
      ok: true,
      config: { strategy: "embedding" },
    });
  });

  it.each(["JEV", " jev ", "Jev"])("accepts %j as the jev strategy (2.1)", (value) => {
    const result = parseSimilarityConfig(jevEnv({ SIMILARITY_STRATEGY: value }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.strategy).toBe("jev");
  });

  it("rejects an unknown strategy with an issue listing the value and the allowed values (2.1)", () => {
    const issues = issuesOf(parseSimilarityConfig({ SIMILARITY_STRATEGY: "foo" }));
    expect(issues).toHaveLength(1);
    expect(issues[0].variable).toBe("SIMILARITY_STRATEGY");
    expect(issues[0].message).toContain("foo");
    expect(issues[0].message).toContain("embedding");
    expect(issues[0].message).toContain("jev");
  });

  it("does not report Jev problems for an unknown strategy (2.8)", () => {
    const issues = issuesOf(parseSimilarityConfig({ SIMILARITY_STRATEGY: "foo", JEV_TIMEOUT_MS: "abc" }));
    expect(variables(issues)).toEqual(["SIMILARITY_STRATEGY"]);
  });
});

describe("parseSimilarityConfig — embedding ignores Jev settings (2.8)", () => {
  it("is ok with garbage JEV_* values present", () => {
    const result = parseSimilarityConfig({
      SIMILARITY_STRATEGY: "embedding",
      JEV_ENDPOINT: "not a url",
      JEV_API_KEY: "",
      JEV_MODEL: "   ",
      JEV_TIMEOUT_MS: "abc",
      JEV_MAX_CANDIDATES: "-1",
      JEV_CONCURRENCY: "999",
      JEV_REQUEST_BUDGET_MS: "1",
    });
    expect(result).toEqual({ ok: true, config: { strategy: "embedding" } });
  });
});

describe("parseSimilarityConfig — required Jev settings", () => {
  it.each([undefined, "", "  "])("reports JEV_ENDPOINT as required when %j (2.2)", (value) => {
    const issues = issuesOf(parseSimilarityConfig(jevEnv({ JEV_ENDPOINT: value })));
    expect(variables(issues)).toEqual(["JEV_ENDPOINT"]);
    expect(issues[0].message).toMatch(/required/i);
  });

  it.each([undefined, "", "  "])("reports JEV_API_KEY as required when %j (2.3)", (value) => {
    const issues = issuesOf(parseSimilarityConfig(jevEnv({ JEV_API_KEY: value })));
    expect(variables(issues)).toEqual(["JEV_API_KEY"]);
    expect(issues[0].message).toMatch(/required/i);
  });
});

describe("parseSimilarityConfig — endpoint scheme and host (2.4)", () => {
  it.each([
    "http://api.example.com",
    "http://api.example.com/api/alpha/decisions",
    "ftp://127.0.0.1/x",
    "not a url",
    "/api/alpha/decisions",
    "http://10.0.0.1:4010",
  ])("rejects %j", (endpoint) => {
    const issues = issuesOf(parseSimilarityConfig(jevEnv({ JEV_ENDPOINT: endpoint })));
    expect(variables(issues)).toEqual(["JEV_ENDPOINT"]);
    expect(issues[0].message).toMatch(/https/);
  });

  it.each([
    "http://127.0.0.1:4010",
    "http://localhost:4010/decisions",
    "http://[::1]:4010",
    "https://api.tokenrouter.com/api/alpha/decisions",
  ])("accepts %j", (endpoint) => {
    const jev = jevOf(parseSimilarityConfig(jevEnv({ JEV_ENDPOINT: endpoint })));
    expect(jev.endpoint).toBeInstanceOf(URL);
    expect(jev.endpoint.href).toBe(new URL(endpoint).href);
  });

  it("trims the endpoint before parsing", () => {
    const jev = jevOf(parseSimilarityConfig(jevEnv({ JEV_ENDPOINT: "  http://127.0.0.1:4010/x  " })));
    expect(jev.endpoint.href).toBe("http://127.0.0.1:4010/x");
  });
});

describe("parseSimilarityConfig — defaults", () => {
  it("fills every optional Jev setting with its documented default", () => {
    const jev = jevOf(parseSimilarityConfig(jevEnv()));
    expect(jev.apiKey).toBe(KEY);
    expect(jev.model).toBe("typesafe/jev-1.13");
    expect(jev.timeoutMs).toBe(10000);
    expect(jev.maxCandidates).toBe(100);
    expect(jev.concurrency).toBe(4);
    expect(jev.requestBudgetMs).toBe(120000);
  });

  it("reads explicit values within bounds", () => {
    const jev = jevOf(
      parseSimilarityConfig(
        jevEnv({
          JEV_MODEL: " typesafe/jev-1.14 ",
          JEV_TIMEOUT_MS: "100",
          JEV_MAX_CANDIDATES: "1000",
          JEV_CONCURRENCY: "16",
          JEV_REQUEST_BUDGET_MS: "1000",
        }),
      ),
    );
    expect(jev.model).toBe("typesafe/jev-1.14");
    expect(jev.timeoutMs).toBe(100);
    expect(jev.maxCandidates).toBe(1000);
    expect(jev.concurrency).toBe(16);
    expect(jev.requestBudgetMs).toBe(1000);
  });

  it("treats blank optional settings as absent", () => {
    const jev = jevOf(parseSimilarityConfig(jevEnv({ JEV_MODEL: "", JEV_TIMEOUT_MS: "", JEV_CONCURRENCY: " " })));
    expect(jev.model).toBe("typesafe/jev-1.13");
    expect(jev.timeoutMs).toBe(10000);
    expect(jev.concurrency).toBe(4);
  });
});

describe("parseSimilarityConfig — numeric bounds (2.5)", () => {
  it.each([
    ["JEV_TIMEOUT_MS", "0"],
    ["JEV_TIMEOUT_MS", "abc"],
    ["JEV_TIMEOUT_MS", "60001"],
    ["JEV_TIMEOUT_MS", "99"],
    ["JEV_TIMEOUT_MS", "1500.5"],
    ["JEV_TIMEOUT_MS", "1e3"],
    ["JEV_MAX_CANDIDATES", "0"],
    ["JEV_MAX_CANDIDATES", "1001"],
    ["JEV_MAX_CANDIDATES", "-5"],
    ["JEV_CONCURRENCY", "0"],
    ["JEV_CONCURRENCY", "17"],
    ["JEV_REQUEST_BUDGET_MS", "999"],
    ["JEV_REQUEST_BUDGET_MS", "600001"],
  ])("rejects %s=%j and names the setting and its bounds", (variable, value) => {
    const issues = issuesOf(parseSimilarityConfig(jevEnv({ [variable]: value })));
    expect(variables(issues)).toEqual([variable]);
    expect(issues[0].message).toMatch(/integer/i);
    expect(issues[0].message).toMatch(/\d+.*\d+/);
  });
});

describe("parseSimilarityConfig — budget not shorter than timeout (2.10)", () => {
  it("reports an issue naming both settings when the budget is shorter than the timeout", () => {
    const issues = issuesOf(
      parseSimilarityConfig(jevEnv({ JEV_REQUEST_BUDGET_MS: "5000", JEV_TIMEOUT_MS: "10000" })),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].variable).toContain("JEV_REQUEST_BUDGET_MS");
    expect(issues[0].message).toContain("JEV_REQUEST_BUDGET_MS");
    expect(issues[0].message).toContain("JEV_TIMEOUT_MS");
  });

  it("accepts a budget equal to the timeout", () => {
    const jev = jevOf(parseSimilarityConfig(jevEnv({ JEV_REQUEST_BUDGET_MS: "10000", JEV_TIMEOUT_MS: "10000" })));
    expect(jev.requestBudgetMs).toBe(10000);
  });

  it("skips the cross-field check when either value is individually invalid", () => {
    const issues = issuesOf(parseSimilarityConfig(jevEnv({ JEV_REQUEST_BUDGET_MS: "999", JEV_TIMEOUT_MS: "10000" })));
    expect(variables(issues)).toEqual(["JEV_REQUEST_BUDGET_MS"]);
    expect(issues[0].message).not.toContain("JEV_TIMEOUT_MS");
  });
});

describe("parseSimilarityConfig — aggregation and secrecy", () => {
  it("reports endpoint, key and timeout problems together in one result (2.6)", () => {
    const issues = issuesOf(
      parseSimilarityConfig(
        jevEnv({ JEV_ENDPOINT: "http://api.example.com", JEV_API_KEY: " ", JEV_TIMEOUT_MS: "abc" }),
      ),
    );
    expect(issues).toHaveLength(3);
    expect(variables(issues).sort()).toEqual(["JEV_API_KEY", "JEV_ENDPOINT", "JEV_TIMEOUT_MS"]);
  });

  it("formats all issues into one multi-line message naming each variable (2.6)", () => {
    const issues = issuesOf(
      parseSimilarityConfig(jevEnv({ JEV_ENDPOINT: undefined, JEV_API_KEY: undefined, JEV_CONCURRENCY: "0" })),
    );
    const message = formatConfigIssues(issues);
    const lines = message.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(issues.length + 2);
    for (const issue of issues) {
      expect(message).toContain(issue.variable);
      expect(message).toContain(issue.message);
    }
    expect(message).toContain(".env.example");
  });

  it("never includes the JEV_API_KEY value in issues or the formatted message (2.7)", () => {
    const result = parseSimilarityConfig(
      jevEnv({
        JEV_ENDPOINT: `http://api.example.com/?key=${KEY}`,
        JEV_TIMEOUT_MS: "abc",
        JEV_MODEL: "   ",
        JEV_REQUEST_BUDGET_MS: "5000",
      }),
    );
    const issues = issuesOf(result);
    expect(JSON.stringify(issues)).not.toContain(KEY);
    expect(formatConfigIssues(issues)).not.toContain(KEY);
  });
});

describe("ValidatedJevConfig brand (2.9)", () => {
  it("cannot be satisfied by a hand-written object literal", () => {
    // @ts-expect-error — the brand symbol is module-private; only parseSimilarityConfig can mint the value.
    const forged: ValidatedJevConfig = {
      endpoint: new URL("https://api.tokenrouter.com/api/alpha/decisions"),
      apiKey: "k",
      model: "typesafe/jev-1.13",
      timeoutMs: 10000,
      maxCandidates: 100,
      concurrency: 4,
      requestBudgetMs: 120000,
    };
    const plain = {
      endpoint: new URL("http://127.0.0.1:4010"),
      apiKey: "k",
      model: "typesafe/jev-1.13",
      timeoutMs: 10000,
      maxCandidates: 100,
      concurrency: 4,
      requestBudgetMs: 120000,
    };
    // @ts-expect-error — a SimilarityConfig jev member likewise requires a parser-minted config.
    const forgedConfig: SimilarityConfig = { strategy: "jev", jev: plain };
    expect(forged.apiKey).toBe("k");
    expect(forgedConfig.strategy).toBe("jev");
  });

  it("is minted by parseSimilarityConfig and assignable to SimilarityConfig", () => {
    const result = parseSimilarityConfig(jevEnv({ JEV_ENDPOINT: "http://127.0.0.1:4010" }));
    if (!result.ok) throw new Error("expected ok");
    const config: SimilarityConfig = result.config;
    expect(config.strategy).toBe("jev");
  });
});
