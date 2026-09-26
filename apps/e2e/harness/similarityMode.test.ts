import { describe, it, expect } from "vitest";

import { apiSimilarityEnv, jevFlagSet, resolveSimilarityMode } from "./similarityMode.js";

const ENDPOINT = "https://api.tokenrouter.com/api/alpha/decisions";
const KEY = "sk-e2e-SECRET-key-value";

describe("resolveSimilarityMode", () => {
  it("defaults to the embedding strategy when SIMILARITY_STRATEGY is unset or blank", () => {
    expect(resolveSimilarityMode({})).toEqual({ strategy: "embedding" });
    expect(resolveSimilarityMode({ SIMILARITY_STRATEGY: "  " })).toEqual({ strategy: "embedding" });
  });

  it("stays on embedding when only JEV_* variables are set without the flag", () => {
    expect(resolveSimilarityMode({ JEV_ENDPOINT: ENDPOINT, JEV_API_KEY: KEY })).toEqual({ strategy: "embedding" });
    expect(resolveSimilarityMode({ SIMILARITY_STRATEGY: "embedding", JEV_API_KEY: KEY })).toEqual({
      strategy: "embedding",
    });
  });

  it("selects jev when the flag, endpoint and key are all set, forwarding the Jev variables", () => {
    const mode = resolveSimilarityMode({
      SIMILARITY_STRATEGY: " JEV ",
      JEV_ENDPOINT: ENDPOINT,
      JEV_API_KEY: KEY,
      JEV_MAX_CANDIDATES: "20",
      JEV_MODEL: "",
      UNRELATED: "x",
    });
    expect(mode).toEqual({
      strategy: "jev",
      env: { SIMILARITY_STRATEGY: "jev", JEV_ENDPOINT: ENDPOINT, JEV_API_KEY: KEY, JEV_MAX_CANDIDATES: "20" },
    });
  });

  it("fails loudly, naming the missing variables, when the flag is set without endpoint or key", () => {
    expect(() => resolveSimilarityMode({ SIMILARITY_STRATEGY: "jev" })).toThrow(/JEV_ENDPOINT and JEV_API_KEY/);
    expect(() => resolveSimilarityMode({ SIMILARITY_STRATEGY: "jev", JEV_API_KEY: KEY })).toThrow(/JEV_ENDPOINT/);
  });

  it("never includes the key value in the error message", () => {
    let message = "";
    try {
      resolveSimilarityMode({ SIMILARITY_STRATEGY: "jev", JEV_API_KEY: KEY });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(KEY);
  });
});

describe("jevFlagSet", () => {
  it("is trimmed and case-insensitive like the API parser", () => {
    expect(jevFlagSet({ SIMILARITY_STRATEGY: "Jev" })).toBe(true);
    expect(jevFlagSet({ SIMILARITY_STRATEGY: "embedding" })).toBe(false);
    expect(jevFlagSet({})).toBe(false);
  });
});

describe("apiSimilarityEnv", () => {
  it("pins the embedding strategy for the API in embedding mode", () => {
    expect(apiSimilarityEnv({ strategy: "embedding" })).toEqual({ SIMILARITY_STRATEGY: "embedding" });
  });

  it("forwards the resolved Jev variables in jev mode", () => {
    const mode = resolveSimilarityMode({ SIMILARITY_STRATEGY: "jev", JEV_ENDPOINT: ENDPOINT, JEV_API_KEY: KEY });
    expect(apiSimilarityEnv(mode)).toEqual({ SIMILARITY_STRATEGY: "jev", JEV_ENDPOINT: ENDPOINT, JEV_API_KEY: KEY });
  });
});
