import { afterEach, describe, it, expect, vi } from "vitest";
import type { GitPort, AdrFile, CommitMeta, DiffResult, TreeEntry } from "../ports/git.js";
import type {
  JudgePair,
  JudgmentKey,
  JudgmentStore,
  PairJudgment,
  SimilarityJudge,
} from "../ports/similarityJudge.js";
import { SimilarityProviderError } from "./errors.js";
import { JevSimilarityService, type JevSimilarityOptions } from "./jevSimilarityService.js";
import type { SimilarityFinder } from "./similarityService.js";

/**
 * In-memory GitPort: files keyed by path. listAdrFiles ignores its argument and
 * returns every file (the whole repository), recording the argument it was given.
 */
class FakeGitPort implements GitPort {
  public listAdrFilesCalls: string[] = [];

  constructor(private files: Map<string, { content: string; blobSha: string }>) {}

  async read(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`not found: ${path}`);
    return entry.content;
  }

  async currentBlobSha(): Promise<string | null> {
    throw new Error("not used in this test");
  }

  async writeAndCommit(): Promise<CommitMeta> {
    throw new Error("not used in this test");
  }

  async log(): Promise<CommitMeta[]> {
    throw new Error("not used in this test");
  }

  async diff(): Promise<DiffResult> {
    throw new Error("not used in this test");
  }

  async listAdrFiles(branchPath: string): Promise<AdrFile[]> {
    this.listAdrFilesCalls.push(branchPath);
    return Array.from(this.files.entries()).map(([path, { blobSha }]) => ({ path, blobSha }));
  }

  async listTreeEntries(): Promise<TreeEntry[]> {
    throw new Error("not used in this test");
  }

  async move(): Promise<CommitMeta> {
    throw new Error("not used in this test");
  }
}

/** Substitute judge: answers by candidate title, records every pair it was asked about. */
class FakeJudge implements SimilarityJudge {
  readonly judgmentVersion: string;
  public calls: JudgePair[] = [];

  constructor(
    private answer: (pair: JudgePair) => PairJudgment = () => ({ probability: 0.5, relation: "related" }),
    judgmentVersion = "v1"
  ) {
    this.judgmentVersion = judgmentVersion;
  }

  async judge(pair: JudgePair, _signal: AbortSignal): Promise<PairJudgment> {
    this.calls.push(pair);
    return this.answer(pair);
  }
}

function keyString(key: JudgmentKey): string {
  return `${key.targetBlobSha}|${key.candidateBlobSha}|${key.judgmentVersion}`;
}

/** Map-backed JudgmentStore. */
class MapJudgmentStore implements JudgmentStore {
  public entries = new Map<string, PairJudgment>();
  public setCalls: Array<{ key: JudgmentKey; judgment: PairJudgment }> = [];

  get(key: JudgmentKey): PairJudgment | null {
    return this.entries.get(keyString(key)) ?? null;
  }

  set(key: JudgmentKey, judgment: PairJudgment): void {
    this.setCalls.push({ key, judgment });
    this.entries.set(keyString(key), judgment);
  }
}

function adrRaw(id: string, title: string, body = `Body for ${id}.`): string {
  return `---
id: ${id}
title: ${title}
status: proposed
date: "2024-01-01"
---
${body}
`;
}

type FileSpec = { path: string; id: string; title: string; body?: string; blobSha?: string };

function gitOf(specs: FileSpec[]): FakeGitPort {
  return new FakeGitPort(
    new Map(
      specs.map((s) => [
        s.path,
        { content: adrRaw(s.id, s.title, s.body), blobSha: s.blobSha ?? `sha-${s.id}` },
      ])
    )
  );
}

const OPTIONS: JevSimilarityOptions = { maxCandidates: 100, concurrency: 4, requestBudgetMs: 120_000 };

// Tree anchored at org/platform/payments/ (target), with a sibling branch and an unrelated folder.
const TREE: FileSpec[] = [
  { path: "root.md", id: "root", title: "Root" },
  { path: "org/org.md", id: "org", title: "Org" },
  { path: "org/platform/platform.md", id: "platform", title: "Platform" },
  { path: "org/platform/payments/target.md", id: "target", title: "Target", body: "Target body." },
  { path: "org/platform/payments/sibling.md", id: "same-folder", title: "Same folder" },
  { path: "org/platform/payments/refunds/refunds.md", id: "refunds", title: "Refunds" },
  { path: "org/platform/identity/identity.md", id: "identity", title: "Identity" },
  { path: "other/other.md", id: "other", title: "Other" },
];

describe("JevSimilarityService", () => {
  it("implements the SimilarityFinder seam", () => {
    const svc: SimilarityFinder = new JevSimilarityService(gitOf(TREE), new FakeJudge(), new MapJudgmentStore(), OPTIONS);
    expect(typeof svc.findSimilar).toBe("function");
  });

  it("rejects an unknown id with a plain not-found Error, not a provider error (5.4)", async () => {
    const judge = new FakeJudge();
    const svc = new JevSimilarityService(gitOf(TREE), judge, new MapJudgmentStore(), OPTIONS);

    const promise = svc.findSimilar("missing", ".");

    await expect(promise).rejects.toThrow(Error);
    await expect(promise).rejects.not.toBeInstanceOf(SimilarityProviderError);
    expect(judge.calls).toHaveLength(0);
  });

  it("returns emptyScope when the target has no lineage candidates (4.7)", async () => {
    const git = gitOf([
      { path: "a/target.md", id: "target", title: "Target" },
      { path: "b/sibling-branch.md", id: "b", title: "B" },
    ]);
    const judge = new FakeJudge();
    const svc = new JevSimilarityService(git, judge, new MapJudgmentStore(), OPTIONS);

    const result = await svc.findSimilar("target", "a");

    expect(result).toEqual({ kind: "emptyScope" });
    expect(judge.calls).toHaveLength(0);
  });

  it("lists all repository ADRs and ignores the requested scope (4.6)", async () => {
    const git = gitOf(TREE);
    const judge = new FakeJudge();
    const svc = new JevSimilarityService(git, judge, new MapJudgmentStore(), OPTIONS);

    const narrow = await svc.findSimilar("target", "other");
    const wide = await svc.findSimilar("target", "org/platform/payments/refunds");

    expect(git.listAdrFilesCalls.every((p) => p === ".")).toBe(true);
    if (narrow.kind !== "ranked" || wide.kind !== "ranked") throw new Error("expected ranked");
    const ids = (r: typeof narrow) => r.results.map((x) => x.adr.id).sort();
    expect(ids(narrow)).toEqual(["org", "platform", "refunds", "root", "same-folder"]);
    expect(ids(wide)).toEqual(ids(narrow));
  });

  it("sends title, combined section text and lineage position of both ADRs to the judge (3.1, 3.2)", async () => {
    const git = gitOf([
      { path: "org/target.md", id: "target", title: "Target", body: "Target body." },
      { path: "org/child/cand.md", id: "cand", title: "Candidate", body: "Candidate body." },
    ]);
    const judge = new FakeJudge();
    const svc = new JevSimilarityService(git, judge, new MapJudgmentStore(), OPTIONS);

    await svc.findSimilar("target", ".");

    expect(judge.calls).toEqual([
      {
        target: { title: "Target", text: "Target body." },
        candidate: { title: "Candidate", text: "Candidate body." },
        position: { direction: "down", level: 1 },
      },
    ]);
  });

  it("ranks by score descending, then level ascending, then path ascending (3.3, 3.4)", async () => {
    const probabilities: Record<string, number> = {
      Root: 0.4, // up 3
      Org: 0.9, // up 2
      Platform: 0.4, // up 1
      "Same folder": 0.4, // down 0
      Refunds: 0.9, // down 1
    };
    const judge = new FakeJudge((pair) => ({
      probability: probabilities[pair.candidate.title],
      relation: "related",
    }));
    const svc = new JevSimilarityService(gitOf(TREE), judge, new MapJudgmentStore(), OPTIONS);

    const result = await svc.findSimilar("target", ".");

    if (result.kind !== "ranked") throw new Error("expected ranked");
    expect(result.results.map((r) => [r.adr.id, r.score])).toEqual([
      ["refunds", 0.9], // level 1
      ["org", 0.9], // level 2
      ["same-folder", 0.4], // level 0
      ["platform", 0.4], // level 1
      ["root", 0.4], // level 3
    ]);
  });

  it("breaks score and level ties by ascending path", async () => {
    const git = gitOf([
      { path: "x/target.md", id: "target", title: "Target" },
      { path: "x/c.md", id: "c", title: "C" },
      { path: "x/a.md", id: "a", title: "A" },
      { path: "x/b.md", id: "b", title: "B" },
    ]);
    const svc = new JevSimilarityService(git, new FakeJudge(), new MapJudgmentStore(), OPTIONS);

    const result = await svc.findSimilar("target", ".");

    if (result.kind !== "ranked") throw new Error("expected ranked");
    expect(result.results.map((r) => r.adr.path)).toEqual(["x/a.md", "x/b.md", "x/c.md"]);
  });

  it("returns the additive lineage and relation fields with the probability as score (3.5, 5.2)", async () => {
    const git = gitOf([
      { path: "org/team/target.md", id: "target", title: "Target" },
      { path: "org/parent.md", id: "parent", title: "Parent" },
    ]);
    const judge = new FakeJudge(() => ({ probability: 0.73, relation: "constrains" }));
    const svc = new JevSimilarityService(git, judge, new MapJudgmentStore(), OPTIONS);

    const result = await svc.findSimilar("target", ".");

    expect(result).toEqual({
      kind: "ranked",
      results: [
        {
          adr: { id: "parent", title: "Parent", status: "proposed", path: "org/parent.md" },
          score: 0.73,
          lineage: { direction: "up", level: 1 },
          relation: "constrains",
        },
      ],
      coverage: { judged: 1, total: 1 },
    });
  });

  it("stores each fresh judgment under both blob SHAs and the judgment version (6.1)", async () => {
    const git = gitOf([
      { path: "t.md", id: "target", title: "Target", blobSha: "sha-t" },
      { path: "c.md", id: "cand", title: "Cand", blobSha: "sha-c" },
    ]);
    const store = new MapJudgmentStore();
    const judge = new FakeJudge(() => ({ probability: 0.6, relation: "duplicate" }), "jv-7");
    const svc = new JevSimilarityService(git, judge, store, OPTIONS);

    await svc.findSimilar("target", ".");

    expect(store.setCalls).toEqual([
      {
        key: { targetBlobSha: "sha-t", candidateBlobSha: "sha-c", judgmentVersion: "jv-7" },
        judgment: { probability: 0.6, relation: "duplicate" },
      },
    ]);
  });

  it("uses a cached judgment and skips the judge on a cache hit (6.2)", async () => {
    const git = gitOf([
      { path: "t.md", id: "target", title: "Target", blobSha: "sha-t" },
      { path: "c.md", id: "cand", title: "Cand", blobSha: "sha-c" },
    ]);
    const store = new MapJudgmentStore();
    store.entries.set(keyString({ targetBlobSha: "sha-t", candidateBlobSha: "sha-c", judgmentVersion: "v1" }), {
      probability: 0.81,
      relation: "supersedes",
    });
    const judge = new FakeJudge(() => {
      throw new Error("judge must not be called on a cache hit");
    });
    const svc = new JevSimilarityService(git, judge, store, OPTIONS);

    const result = await svc.findSimilar("target", ".");

    expect(judge.calls).toHaveLength(0);
    expect(store.setCalls).toHaveLength(0);
    if (result.kind !== "ranked") throw new Error("expected ranked");
    expect(result.results[0]).toMatchObject({ score: 0.81, relation: "supersedes" });
  });

  it("does not reuse a judgment cached under a different judgment version", async () => {
    const git = gitOf([
      { path: "t.md", id: "target", title: "Target", blobSha: "sha-t" },
      { path: "c.md", id: "cand", title: "Cand", blobSha: "sha-c" },
    ]);
    const store = new MapJudgmentStore();
    store.entries.set(keyString({ targetBlobSha: "sha-t", candidateBlobSha: "sha-c", judgmentVersion: "old" }), {
      probability: 0.1,
      relation: "unrelated",
    });
    const judge = new FakeJudge(() => ({ probability: 0.9, relation: "duplicate" }), "new");
    const svc = new JevSimilarityService(git, judge, store, OPTIONS);

    const result = await svc.findSimilar("target", ".");

    expect(judge.calls).toHaveLength(1);
    if (result.kind !== "ranked") throw new Error("expected ranked");
    expect(result.results[0].score).toBe(0.9);
  });

  it("re-judges a candidate whose blob changed after an edit (6.3)", async () => {
    const store = new MapJudgmentStore();
    const judge = new FakeJudge(() => ({ probability: 0.2, relation: "related" }));
    const before = gitOf([
      { path: "t.md", id: "target", title: "Target", blobSha: "sha-t" },
      { path: "c.md", id: "cand", title: "Cand", blobSha: "sha-c1" },
    ]);
    await new JevSimilarityService(before, judge, store, OPTIONS).findSimilar("target", ".");
    // Second request with unchanged blobs is served from the cache.
    await new JevSimilarityService(before, judge, store, OPTIONS).findSimilar("target", ".");
    expect(judge.calls).toHaveLength(1);

    const after = gitOf([
      { path: "t.md", id: "target", title: "Target", blobSha: "sha-t" },
      { path: "c.md", id: "cand", title: "Cand edited", blobSha: "sha-c2" },
    ]);
    await new JevSimilarityService(after, judge, store, OPTIONS).findSimilar("target", ".");

    expect(judge.calls).toHaveLength(2);
    expect(judge.calls[1].candidate.title).toBe("Cand edited");
    expect(store.setCalls.map((c) => c.key.candidateBlobSha)).toEqual(["sha-c1", "sha-c2"]);
  });

  describe("cap and exhaustive comparison (4.8, 4.9, 5.6)", () => {
    // Target at the root with 150 candidates: 60 in the root folder (level 0) and
    // 90 in a subfolder (level 1). Lineage order is level 0 by path, then level 1 by path.
    const specs: FileSpec[] = [{ path: "target.md", id: "target", title: "Target" }];
    for (let i = 0; i < 60; i++) {
      const n = String(i).padStart(3, "0");
      specs.push({ path: `r${n}.md`, id: `r${n}`, title: `R${n}` });
    }
    for (let i = 0; i < 90; i++) {
      const n = String(i).padStart(3, "0");
      specs.push({ path: `sub/s${n}.md`, id: `s${n}`, title: `S${n}` });
    }

    it("judges only the first maxCandidates of the lineage order and reports coverage 100 of 150", async () => {
      const judge = new FakeJudge();
      const svc = new JevSimilarityService(gitOf(specs), judge, new MapJudgmentStore(), OPTIONS);

      const result = await svc.findSimilar("target", ".");

      expect(judge.calls).toHaveLength(100);
      if (result.kind !== "ranked") throw new Error("expected ranked");
      expect(result.coverage).toEqual({ judged: 100, total: 150 });
      expect(result.results).toHaveLength(100);
      const judgedIds = new Set(result.results.map((r) => r.adr.id));
      // All 60 level-0 candidates, then the first 40 level-1 candidates by path.
      for (let i = 0; i < 60; i++) expect(judgedIds.has(`r${String(i).padStart(3, "0")}`)).toBe(true);
      for (let i = 0; i < 40; i++) expect(judgedIds.has(`s${String(i).padStart(3, "0")}`)).toBe(true);
      for (let i = 40; i < 90; i++) expect(judgedIds.has(`s${String(i).padStart(3, "0")}`)).toBe(false);
    });

    it("judges all 150 when exhaustive is requested and reports coverage 150 of 150", async () => {
      const judge = new FakeJudge();
      const svc = new JevSimilarityService(gitOf(specs), judge, new MapJudgmentStore(), OPTIONS);

      const result = await svc.findSimilar("target", ".", { exhaustive: true });

      expect(judge.calls).toHaveLength(150);
      if (result.kind !== "ranked") throw new Error("expected ranked");
      expect(result.coverage).toEqual({ judged: 150, total: 150 });
      expect(result.results).toHaveLength(150);
    });

    it("reports coverage equal to the lineage size when it is below the cap", async () => {
      const svc = new JevSimilarityService(gitOf(TREE), new FakeJudge(), new MapJudgmentStore(), OPTIONS);

      const result = await svc.findSimilar("target", ".");

      if (result.kind !== "ranked") throw new Error("expected ranked");
      expect(result.coverage).toEqual({ judged: 5, total: 5 });
    });
  });

  describe("bounded concurrency, fail-fast cancellation and request budget (6.5, 7.1, 7.4, 7.6, 7.7, 8.1)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** Target plus `n` same-folder candidates c00..; lineage order is c00, c01, ... */
    function flatSpecs(n: number): FileSpec[] {
      const specs: FileSpec[] = [{ path: "x/target.md", id: "target", title: "Target", blobSha: "sha-target" }];
      for (let i = 0; i < n; i++) {
        const k = String(i).padStart(2, "0");
        specs.push({ path: `x/c${k}.md`, id: `c${k}`, title: `C${k}`, blobSha: `sha-c${k}` });
      }
      return specs;
    }

    function keyFor(k: string): JudgmentKey {
      return { targetBlobSha: "sha-target", candidateBlobSha: `sha-c${k}`, judgmentVersion: "v1" };
    }

    /** Lets pending promise chains (git reads, awaits, settle handlers) run. */
    function flush(): Promise<void> {
      return new Promise((resolve) => setImmediate(resolve));
    }

    interface ControlledCall {
      pair: JudgePair;
      signal: AbortSignal;
      resolve: (judgment: PairJudgment) => void;
      reject: (error: unknown) => void;
      /** Set once the test (or the abort) settled this call. */
      done: boolean;
    }

    /**
     * Instrumented judge whose calls stay pending until the test settles them.
     * Tracks the number in flight; with `rejectOnAbort` it rejects with an
     * "aborted" provider error as soon as its signal aborts, like the real adapter.
     */
    class ControlledJudge implements SimilarityJudge {
      readonly judgmentVersion = "v1";
      public calls: ControlledCall[] = [];
      public inFlight = 0;
      public maxInFlight = 0;

      constructor(private readonly rejectOnAbort: boolean) {}

      judge(pair: JudgePair, signal: AbortSignal): Promise<PairJudgment> {
        this.inFlight++;
        this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
        return new Promise<PairJudgment>((resolve, reject) => {
          const call: ControlledCall = {
            pair,
            signal,
            done: false,
            resolve: (judgment) => {
              call.done = true;
              resolve(judgment);
            },
            reject: (error) => {
              call.done = true;
              reject(error);
            },
          };
          this.calls.push(call);
          if (this.rejectOnAbort) {
            signal.addEventListener("abort", () => call.reject(new SimilarityProviderError("aborted", null, "aborted")), {
              once: true,
            });
          }
        }).finally(() => {
          this.inFlight--;
        });
      }
    }

    /** Tracks whether a request promise has settled, without leaving a rejection unhandled. */
    function track<T>(promise: Promise<T>) {
      const state: { settled: boolean; value?: T; error?: unknown } = { settled: false };
      promise.then(
        (value) => {
          state.settled = true;
          state.value = value;
        },
        (error: unknown) => {
          state.settled = true;
          state.error = error;
        }
      );
      return state;
    }

    it("never has more judgments in flight than the configured concurrency, and uses all of it (7.4)", async () => {
      const judge = new ControlledJudge(false);
      const svc = new JevSimilarityService(gitOf(flatSpecs(12)), judge, new MapJudgmentStore(), {
        ...OPTIONS,
        concurrency: 3,
      });
      const state = track(svc.findSimilar("target", "."));

      // Settle calls one by one (out of order) until the request completes.
      for (let step = 0; step < 50 && !state.settled; step++) {
        await flush();
        expect(judge.inFlight).toBeLessThanOrEqual(3);
        const pending = judge.calls.filter((c) => !c.done);
        pending[pending.length - 1]?.resolve({ probability: 0.5, relation: "related" });
      }

      expect(state.error).toBeUndefined();
      expect(state.settled).toBe(true);
      expect(judge.calls).toHaveLength(12);
      expect(judge.maxInFlight).toBe(3);
    });

    it("does not count cache hits against the concurrency ceiling (6.2, 7.4)", async () => {
      const store = new MapJudgmentStore();
      for (const k of ["00", "01", "02", "03"]) store.entries.set(keyString(keyFor(k)), { probability: 0.9, relation: "duplicate" });
      const judge = new ControlledJudge(false);
      const svc = new JevSimilarityService(gitOf(flatSpecs(8)), judge, store, { ...OPTIONS, concurrency: 2 });
      const state = track(svc.findSimilar("target", "."));

      await flush();
      // The four cached candidates are served without the judge; two misses are in flight.
      expect(judge.calls.map((c) => c.pair.candidate.title)).toEqual(["C04", "C05"]);
      for (let step = 0; step < 20 && !state.settled; step++) {
        for (const call of judge.calls) call.resolve({ probability: 0.1, relation: "unrelated" });
        await flush();
        expect(judge.inFlight).toBeLessThanOrEqual(2);
      }

      expect(state.settled).toBe(true);
      expect(judge.calls).toHaveLength(4);
      expect(judge.maxInFlight).toBe(2);
    });

    it("on a mid-batch failure starts no further judgments, aborts in-flight ones, waits for them and rejects with the first error (6.5, 7.1, 7.7)", async () => {
      const judge = new ControlledJudge(false);
      const store = new MapJudgmentStore();
      const svc = new JevSimilarityService(gitOf(flatSpecs(5)), judge, store, { ...OPTIONS, concurrency: 2 });
      const state = track(svc.findSimilar("target", "."));

      await flush();
      expect(judge.calls).toHaveLength(2);
      // One shared signal per request.
      expect(judge.calls[1].signal).toBe(judge.calls[0].signal);

      judge.calls[0].resolve({ probability: 0.7, relation: "related" });
      await flush();
      expect(judge.calls).toHaveLength(3);

      const firstError = new SimilarityProviderError("http-status", 500, "Jev responded with HTTP 500");
      judge.calls[1].reject(firstError);
      await flush();

      expect(judge.calls[2].signal.aborted).toBe(true);
      expect(judge.calls).toHaveLength(3); // no judgment started after the failure
      expect(state.settled).toBe(false); // still waiting for the in-flight one to settle

      judge.calls[2].reject(new SimilarityProviderError("aborted", null, "aborted"));
      await flush();

      expect(state.settled).toBe(true);
      expect(state.error).toBe(firstError); // never the secondary "aborted"
      expect(judge.calls).toHaveLength(3);
      expect(store.setCalls).toEqual([{ key: keyFor("00"), judgment: { probability: 0.7, relation: "related" } }]);
    });

    it("still caches an in-flight judgment that completes validly after another one failed (6.5, 7.1)", async () => {
      const judge = new ControlledJudge(false);
      const store = new MapJudgmentStore();
      const svc = new JevSimilarityService(gitOf(flatSpecs(4)), judge, store, { ...OPTIONS, concurrency: 2 });
      const state = track(svc.findSimilar("target", "."));

      await flush();
      const firstError = new SimilarityProviderError("invalid-response", null, "bad answer");
      judge.calls[0].reject(firstError);
      await flush();
      expect(judge.calls[1].signal.aborted).toBe(true);

      judge.calls[1].resolve({ probability: 0.4, relation: "constrains" });
      await flush();

      expect(state.error).toBe(firstError);
      expect(state.value).toBeUndefined(); // no partial ranking
      expect(judge.calls).toHaveLength(2);
      expect(store.setCalls).toEqual([{ key: keyFor("01"), judgment: { probability: 0.4, relation: "constrains" } }]);
    });

    it("rejects with the budget category when the request budget elapses, keeping completed judgments cached (6.5, 7.6)", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const judge = new ControlledJudge(true);
      const store = new MapJudgmentStore();
      const svc = new JevSimilarityService(gitOf(flatSpecs(4)), judge, store, {
        ...OPTIONS,
        concurrency: 2,
        requestBudgetMs: 5_000,
      });
      const state = track(svc.findSimilar("target", "."));

      await flush();
      judge.calls[0].resolve({ probability: 0.6, relation: "related" });
      await flush();
      expect(judge.calls).toHaveLength(3);

      vi.advanceTimersByTime(4_999);
      await flush();
      expect(state.settled).toBe(false);

      vi.advanceTimersByTime(1);
      await flush();

      expect(state.settled).toBe(true);
      expect(state.error).toBeInstanceOf(SimilarityProviderError);
      expect((state.error as SimilarityProviderError).category).toBe("budget");
      expect(judge.calls[1].signal.aborted).toBe(true);
      expect(judge.calls[2].signal.aborted).toBe(true);
      expect(judge.calls).toHaveLength(3); // the fourth candidate was never started
      expect(store.setCalls).toEqual([{ key: keyFor("00"), judgment: { probability: 0.6, relation: "related" } }]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps the first judgment failure when the budget elapses while waiting for in-flight ones (7.1, 7.6)", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const judge = new ControlledJudge(false); // in-flight judgment ignores the abort
      const svc = new JevSimilarityService(gitOf(flatSpecs(3)), judge, new MapJudgmentStore(), {
        ...OPTIONS,
        concurrency: 2,
        requestBudgetMs: 5_000,
      });
      const state = track(svc.findSimilar("target", "."));

      await flush();
      const firstError = new SimilarityProviderError("network", null, "connection refused");
      judge.calls[0].reject(firstError);
      await flush();
      expect(state.settled).toBe(false);

      vi.advanceTimersByTime(5_000);
      await flush();

      expect(state.settled).toBe(true);
      expect(state.error).toBe(firstError);
      expect(judge.calls).toHaveLength(2);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("clears the budget timer when the request completes successfully (7.6)", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const svc = new JevSimilarityService(gitOf(flatSpecs(3)), new FakeJudge(), new MapJudgmentStore(), OPTIONS);

      const result = await svc.findSimilar("target", ".");

      expect(result.kind).toBe("ranked");
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

