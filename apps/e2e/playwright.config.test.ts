// Assertion test for `playwright.config.ts` (Task 2.4).
//
// A real E2E run cannot launch a browser in this environment (Chromium is not
// installed, by design). Instead this vitest spec validates the CONFIG VALUE is
// correct WITHOUT running specs: `defineConfig` is pure, so the default export
// of `playwright.config.ts` is a plain config object we can import and assert on
// directly. It checks the design "playwright.config.ts" section and the
// Requirements Traceability rows 1.1, 1.3, 1.4, 1.5, 5.2, 5.3, 5.4, 6.2.

import path from "node:path";

import { describe, it, expect } from "vitest";
import type { PlaywrightTestConfig } from "@playwright/test";

import config from "./playwright.config.js";
import { paths } from "./harness/paths.js";

// `webServer` may be a single object or an array; normalize to an array of the
// loosely-typed shape we assert against (env/url/timeout/command).
type WebServerEntry = {
  command?: string;
  url?: string;
  timeout?: number;
  env?: Record<string, string | number | boolean | undefined>;
  reuseExistingServer?: boolean;
};

const cfg = config as PlaywrightTestConfig;

function webServers(): WebServerEntry[] {
  const ws = cfg.webServer as WebServerEntry | WebServerEntry[] | undefined;
  if (Array.isArray(ws)) return ws;
  return ws ? [ws] : [];
}

describe("playwright.config", () => {
  it("declares two webServer entries (Req 1.1)", () => {
    expect(Array.isArray(cfg.webServer)).toBe(true);
    expect(webServers()).toHaveLength(2);
  });

  it("launches the API on PORT 3000 with run-scoped env and a bounded readiness probe (Req 1.1, 1.3, 1.5)", () => {
    const servers = webServers();
    const api = servers.find((s) => s.url?.includes(":3000"));
    expect(api).toBeDefined();

    expect(api?.command).toBe("pnpm --filter @adr/api dev");

    // PORT 3000 matches the Vite proxy target (Req 1.3).
    expect(api?.env?.PORT).toBe("3000");
    // Run-scoped paths + key passthrough forwarded verbatim (sole mode channel).
    expect(api?.env?.ADR_REPO_PATH).toBe(paths.repoPath);
    expect(api?.env?.SQLITE_PATH).toBe(paths.sqlitePath);
    expect(api?.env?.GEMINI_API_KEY).toBe(paths.geminiApiKey);

    // Bounded readiness/abort (Req 1.5): a readiness url + a positive timeout.
    expect(api?.url).toBeDefined();
    expect(api?.url).toContain(":3000");
    expect(typeof api?.timeout).toBe("number");
    expect(api?.timeout as number).toBeGreaterThan(0);
  });

  it("launches the web dev server with a bounded readiness probe (Req 1.1, 1.5)", () => {
    const servers = webServers();
    const web = servers.find((s) => s.url?.includes(":5173"));
    expect(web).toBeDefined();

    expect(web?.command).toBe("pnpm --filter @adr/web dev");
    expect(web?.url).toContain(":5173");
    expect(typeof web?.timeout).toBe("number");
    expect(web?.timeout as number).toBeGreaterThan(0);
  });

  it("routes the browser at the web dev server, headless, with on-failure capture (Req 1.3, 5.2, 6.2)", () => {
    expect(cfg.use?.baseURL).toBe("http://localhost:5173");
    expect(cfg.use?.headless).toBe(true);
    expect(cfg.use?.screenshot).toBe("only-on-failure");
    expect(cfg.use?.trace).toBe("retain-on-failure");
  });

  it("writes all artifacts under the dedicated artifacts dir (Req 5.3)", () => {
    // outputDir must live under the dedicated artifacts dir (a subdir, so it
    // does not clash with the HTML reporter folder Playwright clears per run).
    expect(typeof cfg.outputDir).toBe("string");
    expect(
      (cfg.outputDir as string).startsWith(paths.artifactsDir + path.sep),
    ).toBe(true);

    // The html reporter output folder must also live under the artifacts dir.
    const reporters = cfg.reporter as
      | [string, Record<string, unknown>?][]
      | undefined;
    expect(Array.isArray(reporters)).toBe(true);
    const html = reporters?.find((r) => r[0] === "html");
    expect(html).toBeDefined();
    const outputFolder = (html?.[1] as { outputFolder?: string } | undefined)
      ?.outputFolder;
    expect(typeof outputFolder).toBe("string");
    expect(outputFolder?.startsWith(paths.artifactsDir)).toBe(true);
  });

  it("wires globalSetup and globalTeardown to the harness modules (Req 1.4)", () => {
    expect(typeof cfg.globalSetup).toBe("string");
    expect(typeof cfg.globalTeardown).toBe("string");
    expect((cfg.globalSetup as string).endsWith("globalSetup.ts")).toBe(true);
    expect((cfg.globalTeardown as string).endsWith("globalTeardown.ts")).toBe(
      true,
    );
  });

  it("configures no pixel-baseline pass/fail oracle (Req 5.4)", () => {
    expect(cfg.expect?.toHaveScreenshot).toBeUndefined();
    expect(cfg.expect?.toMatchSnapshot).toBeUndefined();
  });

  it("declares a single Chromium project", () => {
    expect(cfg.projects).toHaveLength(1);
    expect(cfg.projects?.[0]?.name).toBe("chromium");
  });

  it("points testDir at ./tests", () => {
    expect(cfg.testDir).toBe("./tests");
  });
});
