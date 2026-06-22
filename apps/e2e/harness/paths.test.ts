import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { paths, computePaths } from "./paths.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const expectedArtifactsDir = path.resolve(here, "..", "artifacts");

describe("harness/paths", () => {
  it("exposes absolute repoPath, sqlitePath, and artifactsDir", () => {
    expect(path.isAbsolute(paths.repoPath)).toBe(true);
    expect(path.isAbsolute(paths.sqlitePath)).toBe(true);
    expect(path.isAbsolute(paths.artifactsDir)).toBe(true);
  });

  it("places the run dir under the OS temp dir with the adr-e2e- prefix", () => {
    const tmp = os.tmpdir();
    // repoPath is the run dir (the temp git repo); it must live under os.tmpdir().
    expect(paths.repoPath.startsWith(tmp + path.sep)).toBe(true);
    expect(path.basename(paths.repoPath).startsWith("adr-e2e-")).toBe(true);
  });

  it("places sqlitePath inside the run dir so a single recursive remove clears both", () => {
    expect(paths.sqlitePath.startsWith(paths.repoPath + path.sep)).toBe(true);
    expect(path.dirname(paths.sqlitePath)).toBe(paths.repoPath);
  });

  it("resolves artifactsDir to apps/e2e/artifacts, outside the OS temp dir", () => {
    expect(paths.artifactsDir).toBe(expectedArtifactsDir);
    expect(path.basename(paths.artifactsDir)).toBe("artifacts");
    expect(paths.artifactsDir.startsWith(os.tmpdir() + path.sep)).toBe(false);
  });

  it("is stable across repeated imports in the same process", async () => {
    const again = await import("./paths.js");
    expect(again.paths).toBe(paths);
    expect(again.paths.repoPath).toBe(paths.repoPath);
    expect(again.paths.sqlitePath).toBe(paths.sqlitePath);
    expect(again.paths.artifactsDir).toBe(paths.artifactsDir);
  });

  it("freezes the exported paths object", () => {
    expect(Object.isFrozen(paths)).toBe(true);
  });

  it("performs no filesystem mutation on import (run dir is not created)", () => {
    // Importing the module must not create the temp run dir; setup/teardown own that.
    expect(existsSync(paths.repoPath)).toBe(false);
  });

  describe("geminiApiKey passthrough (computePaths)", () => {
    const original = process.env.GEMINI_API_KEY;

    afterEach(() => {
      if (original === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = original;
    });

    it("defaults to empty string when GEMINI_API_KEY is unset", () => {
      delete process.env.GEMINI_API_KEY;
      expect(computePaths().geminiApiKey).toBe("");
    });

    it("reflects a configured GEMINI_API_KEY", () => {
      process.env.GEMINI_API_KEY = "test-key-123";
      expect(computePaths().geminiApiKey).toBe("test-key-123");
    });
  });

  it("reflects the process env value in the eagerly-computed paths constant", () => {
    expect(paths.geminiApiKey).toBe(process.env.GEMINI_API_KEY ?? "");
  });

  describe("computePaths uniqueness", () => {
    it("produces a distinct run dir on each call", () => {
      const a = computePaths();
      const b = computePaths();
      expect(a.repoPath).not.toBe(b.repoPath);
    });
  });
});
