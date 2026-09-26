// Similarity strategy configuration: parses SIMILARITY_STRATEGY and, only under
// `jev`, the JEV_* settings. Every problem is collected into one result so the
// operator sees all of them in a single startup failure (2.6). Messages name the
// variable and the rule, never the JEV_API_KEY value (2.7).

// Module-private runtime symbol (not exported), so only this module can mint the brand (2.9).
const validatedJev: unique symbol = Symbol("ValidatedJevConfig");

export interface ValidatedJevConfig {
  readonly [validatedJev]: true;
  readonly endpoint: URL;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxCandidates: number;
  readonly concurrency: number;
  readonly requestBudgetMs: number;
}

export type SimilarityConfig =
  | { readonly strategy: "embedding" }
  | { readonly strategy: "jev"; readonly jev: ValidatedJevConfig };

export type SimilarityStrategyName = SimilarityConfig["strategy"];

export interface ConfigIssue {
  variable: string; // e.g. "JEV_ENDPOINT"
  message: string; // never contains the JEV_API_KEY value
}

export type SimilarityConfigResult =
  | { ok: true; config: SimilarityConfig }
  | { ok: false; issues: ConfigIssue[] };

type Env = Readonly<Record<string, string | undefined>>;

const STRATEGIES: readonly SimilarityStrategyName[] = ["embedding", "jev"];
const DEFAULT_MODEL = "typesafe/jev-1.13";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

interface IntSetting {
  variable: string;
  fallback: number;
  min: number;
  max: number;
}

const TIMEOUT: IntSetting = { variable: "JEV_TIMEOUT_MS", fallback: 10000, min: 100, max: 60000 };
const MAX_CANDIDATES: IntSetting = { variable: "JEV_MAX_CANDIDATES", fallback: 100, min: 1, max: 1000 };
const CONCURRENCY: IntSetting = { variable: "JEV_CONCURRENCY", fallback: 4, min: 1, max: 16 };
const BUDGET: IntSetting = { variable: "JEV_REQUEST_BUDGET_MS", fallback: 120000, min: 1000, max: 600000 };

/** Absent or whitespace-only values are treated as not set. */
function read(env: Env, variable: string): string | undefined {
  const value = env[variable]?.trim();
  return value ? value : undefined;
}

export function parseSimilarityConfig(env: Env): SimilarityConfigResult {
  const rawStrategy = read(env, "SIMILARITY_STRATEGY")?.toLowerCase() ?? "embedding";
  if (rawStrategy === "embedding") return { ok: true, config: { strategy: "embedding" } };
  if (rawStrategy !== "jev") {
    return {
      ok: false,
      issues: [
        {
          variable: "SIMILARITY_STRATEGY",
          message: `invalid value "${rawStrategy}"; allowed values: ${STRATEGIES.join(", ")}`,
        },
      ],
    };
  }
  return parseJev(env);
}

function parseJev(env: Env): SimilarityConfigResult {
  const issues: ConfigIssue[] = [];

  const endpoint = parseEndpoint(read(env, "JEV_ENDPOINT"), issues);

  const apiKey = read(env, "JEV_API_KEY");
  if (apiKey === undefined) {
    issues.push({ variable: "JEV_API_KEY", message: "is required when SIMILARITY_STRATEGY=jev" });
  }

  const model = read(env, "JEV_MODEL") ?? DEFAULT_MODEL;
  const timeoutMs = parseIntSetting(env, TIMEOUT, issues);
  const maxCandidates = parseIntSetting(env, MAX_CANDIDATES, issues);
  const concurrency = parseIntSetting(env, CONCURRENCY, issues);
  const requestBudgetMs = parseIntSetting(env, BUDGET, issues);

  // Cross-field rule only when both values are individually valid (2.10).
  if (timeoutMs !== undefined && requestBudgetMs !== undefined && requestBudgetMs < timeoutMs) {
    issues.push({
      variable: `${BUDGET.variable}, ${TIMEOUT.variable}`,
      message: `${BUDGET.variable} (${requestBudgetMs}) must not be shorter than ${TIMEOUT.variable} (${timeoutMs})`,
    });
  }

  if (
    issues.length > 0 ||
    endpoint === undefined ||
    apiKey === undefined ||
    timeoutMs === undefined ||
    maxCandidates === undefined ||
    concurrency === undefined ||
    requestBudgetMs === undefined
  ) {
    return { ok: false, issues: apiKey === undefined ? issues : redact(issues, apiKey) };
  }

  const jev: ValidatedJevConfig = {
    [validatedJev]: true,
    endpoint,
    apiKey,
    model,
    timeoutMs,
    maxCandidates,
    concurrency,
    requestBudgetMs,
  };
  return { ok: true, config: { strategy: "jev", jev } };
}

function parseEndpoint(raw: string | undefined, issues: ConfigIssue[]): URL | undefined {
  if (raw === undefined) {
    issues.push({ variable: "JEV_ENDPOINT", message: "is required when SIMILARITY_STRATEGY=jev" });
    return undefined;
  }
  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {
    url = undefined;
  }
  const allowed =
    url !== undefined &&
    (url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)));
  if (!allowed) {
    issues.push({
      variable: "JEV_ENDPOINT",
      message: `invalid endpoint "${raw}"; must be an absolute https URL, or http with host localhost, 127.0.0.1 or [::1]`,
    });
    return undefined;
  }
  return url;
}

function parseIntSetting(env: Env, setting: IntSetting, issues: ConfigIssue[]): number | undefined {
  const raw = read(env, setting.variable);
  if (raw === undefined) return setting.fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < setting.min || value > setting.max) {
    issues.push({
      variable: setting.variable,
      message: `invalid value "${raw}"; must be an integer between ${setting.min} and ${setting.max}`,
    });
    return undefined;
  }
  return value;
}

/** Defensive: the key value must never surface, even if an operator pasted it into another setting (2.7). */
function redact(issues: ConfigIssue[], apiKey: string): ConfigIssue[] {
  return issues.map((issue) => ({ ...issue, message: issue.message.split(apiKey).join("***") }));
}

export function formatConfigIssues(issues: readonly ConfigIssue[]): string {
  return [
    `Invalid similarity configuration (${issues.length} ${issues.length === 1 ? "problem" : "problems"}):`,
    ...issues.map((issue) => `  - ${issue.variable}: ${issue.message}`),
    "See .env.example for the SIMILARITY_STRATEGY and JEV_* settings.",
  ].join("\n");
}
