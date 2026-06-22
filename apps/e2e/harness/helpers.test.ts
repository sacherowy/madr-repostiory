import { describe, it, expect, vi, afterEach } from "vitest";
import path from "node:path";
import type { Page } from "@playwright/test";

import { paths } from "./paths.js";
import { shot, unique, geminiKeyMissing } from "./helpers.js";

describe("harness/helpers", () => {
  describe("unique", () => {
    it("returns a string starting with the prefix", () => {
      const value = unique("scope");
      expect(value.startsWith("scope")).toBe(true);
    });

    it("returns different values on successive calls", () => {
      const a = unique("scope");
      const b = unique("scope");
      expect(a).not.toBe(b);
    });

    it("produces only title/folder-safe characters", () => {
      const value = unique("scope");
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("sanitizes unsafe characters in the prefix (spaces, slashes, dots)", () => {
      const value = unique("a b/c.d\\e");
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
      // no spaces, slashes, or dots survive
      expect(value).not.toMatch(/[ /\\.]/);
    });

    it("never repeats across many calls in a run", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) seen.add(unique("p"));
      expect(seen.size).toBe(1000);
    });
  });

  describe("shot", () => {
    it("writes one screenshot under artifactsDir with a sanitized .png filename", async () => {
      const screenshot = vi.fn().mockResolvedValue(Buffer.from(""));
      const fakePage = { screenshot } as unknown as Page;

      await shot(fakePage, "some state name");

      expect(screenshot).toHaveBeenCalledTimes(1);
      const arg = screenshot.mock.calls[0][0] as { path: string; fullPage?: boolean };
      expect(path.dirname(arg.path)).toBe(paths.artifactsDir);
      expect(arg.path.endsWith(".png")).toBe(true);
      // filename (without extension) is sanitized to safe chars
      const base = path.basename(arg.path, ".png");
      expect(base).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(arg.fullPage).toBe(true);
    });
  });

  describe("geminiKeyMissing", () => {
    const original = process.env.GEMINI_API_KEY;

    afterEach(() => {
      if (original === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = original;
    });

    it("is true when GEMINI_API_KEY is unset", () => {
      delete process.env.GEMINI_API_KEY;
      expect(geminiKeyMissing()).toBe(true);
    });

    it("is true when GEMINI_API_KEY is empty / whitespace", () => {
      process.env.GEMINI_API_KEY = "   ";
      expect(geminiKeyMissing()).toBe(true);
    });

    it("is false when GEMINI_API_KEY is set", () => {
      process.env.GEMINI_API_KEY = "real-key";
      expect(geminiKeyMissing()).toBe(false);
    });
  });
});
