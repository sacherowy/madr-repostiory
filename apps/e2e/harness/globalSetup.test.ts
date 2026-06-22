import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simpleGit } from "simple-git";
import { chromium } from "@playwright/test";

import { seedRepo, assertBrowserInstalled, logMode } from "./globalSetup.js";

describe("harness/globalSetup", () => {
  describe("seedRepo", () => {
    let dir: string | undefined;

    afterEach(async () => {
      if (dir) {
        await rm(dir, { recursive: true, force: true });
        dir = undefined;
      }
    });

    it("turns a fresh dir into a git repo with a committed decisions/.gitkeep", async () => {
      dir = await mkdtemp(path.join(os.tmpdir(), "gs-seed-test-"));

      await seedRepo(dir);

      const git = simpleGit(dir);
      // The dir is a git repo.
      expect(await git.checkIsRepo()).toBe(true);
      // The decisions/.gitkeep file exists on disk.
      expect(existsSync(path.join(dir, "decisions", ".gitkeep"))).toBe(true);
      // At least one commit (the initial commit) exists.
      const log = await git.log();
      expect(log.total).toBeGreaterThanOrEqual(1);
    });

    it("creates the run dir recursively when it does not yet exist", async () => {
      const base = await mkdtemp(path.join(os.tmpdir(), "gs-seed-nested-"));
      dir = base;
      const nested = path.join(base, "a", "b", "run");

      await seedRepo(nested);

      expect(existsSync(path.join(nested, "decisions", ".gitkeep"))).toBe(true);
      const log = await simpleGit(nested).log();
      expect(log.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe("assertBrowserInstalled", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("throws an actionable error when the chromium runtime is absent", () => {
      // Force the "missing browser" case deterministically (env-independent) by
      // pointing executablePath() at a path that does not exist, so the precheck
      // must throw (Req 6.3) rather than silently passing.
      vi.spyOn(chromium, "executablePath").mockReturnValue(
        path.join(os.tmpdir(), "definitely-not-a-real-chromium", "chrome"),
      );

      let thrown: unknown;
      try {
        assertBrowserInstalled();
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      // Actionable: names the fix and points at the missing path.
      expect(message).toMatch(/playwright install/);
      expect(message).toMatch(/chromium/i);
    });

    it("does not throw when the chromium runtime is present", () => {
      // Point executablePath() at a path that exists (this test file itself) so
      // the precheck's existsSync passes and it returns without throwing.
      const presentPath = fileURLToPath(import.meta.url);
      vi.spyOn(chromium, "executablePath").mockReturnValue(presentPath);

      expect(() => assertBrowserInstalled()).not.toThrow();
    });
  });

  describe("logMode", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("logs offline mode when no GEMINI_API_KEY is set", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      logMode("");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toMatch(/offline/);
    });

    it("logs real-provider mode when a GEMINI_API_KEY is set", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      logMode("a-real-key");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toMatch(/real-provider/);
    });
  });
});
