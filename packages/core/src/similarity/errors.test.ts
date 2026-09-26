import { describe, it, expect } from "vitest";
import { SimilarityProviderError } from "./errors.js";
import * as core from "../index.js";

describe("SimilarityProviderError", () => {
  it("carries the failure category and the HTTP status, and is recognizable as an Error", () => {
    const err = new SimilarityProviderError("http-status", 429, "Jev responded with HTTP 429");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SimilarityProviderError);
    expect(err.name).toBe("SimilarityProviderError");
    expect(err.category).toBe("http-status");
    expect(err.httpStatus).toBe(429);
    expect(err.message).toBe("Jev responded with HTTP 429");
  });

  it("uses a null HTTP status for failures without a response", () => {
    for (const category of ["network", "timeout", "invalid-response", "budget", "aborted"] as const) {
      const err = new SimilarityProviderError(category, null, `similarity provider failure: ${category}`);
      expect(err.category).toBe(category);
      expect(err.httpStatus).toBeNull();
    }
  });

  it("is re-exported from the core package entry point", () => {
    expect(core.SimilarityProviderError).toBe(SimilarityProviderError);
  });
});
