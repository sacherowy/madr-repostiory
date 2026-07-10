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
