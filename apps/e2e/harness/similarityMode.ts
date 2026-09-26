// Similarity-strategy mode for the E2E run (jev-similarity).
//
// The suite runs against the default embedding strategy unless the operator
// opts in to the live Jev API by setting SIMILARITY_STRATEGY=jev together with
// JEV_ENDPOINT and JEV_API_KEY (the same variables the API reads, see
// .env.example). The mode is resolved once at config load and forwarded to the
// API via `webServer.env`; specs gate on the same env so API mode and spec
// gating stay in sync (mirrors the GEMINI_API_KEY pattern in helpers.ts).
//
// Pure: reads only the env object it is given; no filesystem or network access.

/** The optional Jev tuning variables forwarded to the API when set. */
const JEV_OPTIONAL_KEYS = [
  "JEV_MODEL",
  "JEV_TIMEOUT_MS",
  "JEV_MAX_CANDIDATES",
  "JEV_CONCURRENCY",
  "JEV_REQUEST_BUDGET_MS",
] as const;

export type SimilarityMode =
  | Readonly<{ strategy: "embedding" }>
  | Readonly<{ strategy: "jev"; env: Readonly<Record<string, string>> }>;

type Env = Record<string, string | undefined>;

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

/** True when SIMILARITY_STRATEGY selects Jev (trimmed, case-insensitive, like the API parser). */
export function jevFlagSet(env: Env = process.env): boolean {
  return (env.SIMILARITY_STRATEGY ?? "").trim().toLowerCase() === "jev";
}

/**
 * Resolve the run's similarity mode.
 *
 * - Flag not set → embedding (offline by default).
 * - Flag set with JEV_ENDPOINT and JEV_API_KEY → jev; the Jev variables are
 *   returned for forwarding to the API.
 * - Flag set but a required variable missing → throws an actionable error, so
 *   the run fails loudly instead of silently testing the embedding strategy.
 *   The message names the missing variables and never contains the key value.
 */
export function resolveSimilarityMode(env: Env = process.env): SimilarityMode {
  if (!jevFlagSet(env)) return Object.freeze({ strategy: "embedding" });

  const missing = (["JEV_ENDPOINT", "JEV_API_KEY"] as const).filter((key) => !present(env[key]));
  if (missing.length > 0) {
    throw new Error(
      `[e2e] SIMILARITY_STRATEGY=jev requires ${missing.join(" and ")} to run against the live Jev API. ` +
        "Set the missing variable(s) (see .env.example, e.g. JEV_ENDPOINT=https://api.tokenrouter.com/api/alpha/decisions) " +
        "or unset SIMILARITY_STRATEGY to run the offline embedding suite.",
    );
  }

  const forwarded: Record<string, string> = {
    SIMILARITY_STRATEGY: "jev",
    JEV_ENDPOINT: env.JEV_ENDPOINT as string,
    JEV_API_KEY: env.JEV_API_KEY as string,
  };
  for (const key of JEV_OPTIONAL_KEYS) {
    const value = env[key];
    if (present(value)) forwarded[key] = value;
  }
  return Object.freeze({ strategy: "jev", env: Object.freeze(forwarded) });
}

/** The environment the API child process receives for the resolved mode. */
export function apiSimilarityEnv(mode: SimilarityMode): Record<string, string> {
  return mode.strategy === "jev" ? { ...mode.env } : { SIMILARITY_STRATEGY: "embedding" };
}
