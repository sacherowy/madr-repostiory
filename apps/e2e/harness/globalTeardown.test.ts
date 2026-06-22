import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { removeRunDir } from "./globalTeardown.js";

describe("harness/globalTeardown", () => {
  describe("removeRunDir", () => {
    let dir: string | undefined;

    afterEach(async () => {
      if (dir) {
        await rm(dir, { recursive: true, force: true });
        dir = undefined;
      }
    });

    it("removes the run dir entirely, including a nested file (repo + sqlite)", async () => {
      dir = await mkdtemp(path.join(os.tmpdir(), "gt-rm-test-"));
      // Simulate the scratch SQLite index nested inside the run dir.
      await writeFile(path.join(dir, "index.sqlite"), "");
      expect(existsSync(dir)).toBe(true);

      await removeRunDir(dir);

      expect(existsSync(dir)).toBe(false);
      // afterEach must not double-fail on an already-removed dir.
      dir = undefined;
    });

    it("recursively removes nested subdirectories and files", async () => {
      dir = await mkdtemp(path.join(os.tmpdir(), "gt-rm-nested-"));
      const nested = path.join(dir, "decisions", "deep");
      await mkdir(nested, { recursive: true });
      await writeFile(path.join(nested, "adr.md"), "content");
      await writeFile(path.join(dir, "index.sqlite"), "");
      expect(existsSync(path.join(nested, "adr.md"))).toBe(true);

      await removeRunDir(dir);

      expect(existsSync(dir)).toBe(false);
      dir = undefined;
    });

    it("does not throw when the path is already absent (idempotent — Req 6.4)", async () => {
      const base = await mkdtemp(path.join(os.tmpdir(), "gt-rm-gone-"));
      const absent = path.join(base, "already-gone");
      expect(existsSync(absent)).toBe(false);

      // force: true → no error if the directory is already gone.
      await expect(removeRunDir(absent)).resolves.toBeUndefined();

      await rm(base, { recursive: true, force: true });
    });
  });
});
