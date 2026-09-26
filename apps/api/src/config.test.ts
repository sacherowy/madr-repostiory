import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function loadConfig() {
  vi.resetModules();
  const mod = await import("./config.js");
  return mod.config;
}

describe("config.gemini.summaryModel", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to gemini-2.0-flash when GEMINI_SUMMARY_MODEL is unset", async () => {
    vi.stubEnv("GEMINI_SUMMARY_MODEL", "");
    delete process.env.GEMINI_SUMMARY_MODEL;

    const config = await loadConfig();

    expect(config.gemini.summaryModel).toBe("gemini-2.0-flash");
  });

  it("reads GEMINI_SUMMARY_MODEL from the environment when set", async () => {
    vi.stubEnv("GEMINI_SUMMARY_MODEL", "gemini-custom-model");

    const config = await loadConfig();

    expect(config.gemini.summaryModel).toBe("gemini-custom-model");
  });

  it("leaves the existing gemini embedding settings untouched", async () => {
    vi.stubEnv("GEMINI_SUMMARY_MODEL", "gemini-custom-model");

    const config = await loadConfig();

    expect(config.gemini).toHaveProperty("apiKey");
    expect(config.gemini).toHaveProperty("model");
  });
});

describe("similarityConfigResult", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a separate export parsed from process.env, not a property of config", async () => {
    vi.stubEnv("SIMILARITY_STRATEGY", "jev");
    vi.stubEnv("JEV_ENDPOINT", "http://127.0.0.1:4010");
    vi.stubEnv("JEV_API_KEY", "k");

    vi.resetModules();
    const mod = await import("./config.js");

    expect(mod.config).not.toHaveProperty("similarity");
    expect(mod.similarityConfigResult.ok).toBe(true);
    if (mod.similarityConfigResult.ok) expect(mod.similarityConfigResult.config.strategy).toBe("jev");
  });

  it("does not throw on an invalid configuration; it carries the issues", async () => {
    vi.stubEnv("SIMILARITY_STRATEGY", "foo");

    vi.resetModules();
    const mod = await import("./config.js");

    expect(mod.similarityConfigResult.ok).toBe(false);
  });
});
