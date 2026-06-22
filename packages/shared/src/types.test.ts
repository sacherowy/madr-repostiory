import { describe, it, expect } from "vitest";
import type {
  AdrId,
  AdrStatus,
  RelationType,
  AdrRelation,
  Adr,
  AdrSummary,
  FolderNode,
  RelationView,
  DiffHunk,
  CommitMeta,
  VersionDiffView,
  FieldComparison,
  AdrCompareView,
  SimilarityResult,
  CreateAdrRequest,
  UpdateAdrRequest,
  CreateFolderRequest,
  MoveAdrRequest,
} from "./types.js";

describe("view types", () => {
  it("constructs an AdrSummary literal with the expected shape", () => {
    const summary: AdrSummary = {
      id: "0001-use-postgres",
      title: "Use Postgres",
      status: "accepted",
      path: "decisions/0001-use-postgres.md",
    };
    expect(summary.status).toBe("accepted");
    expect(summary.path).toContain("0001-use-postgres");
  });

  it("constructs a FolderNode literal that nests folders and adrs", () => {
    const child: AdrSummary = {
      id: "0002-use-sqlite",
      title: "Use SQLite",
      status: "proposed",
      path: "decisions/db/0002-use-sqlite.md",
    };
    const tree: FolderNode = {
      path: "decisions/db",
      name: "db",
      folders: [],
      adrs: [child],
    };
    const root: FolderNode = {
      path: "decisions",
      name: "decisions",
      folders: [tree],
      adrs: [],
    };
    expect(root.folders[0].adrs[0].id).toBe("0002-use-sqlite");
  });

  it("constructs a RelationView literal with a direction", () => {
    const relation: RelationView = {
      type: "supersedes",
      target: "0001-use-postgres",
      direction: "outbound",
    };
    expect(relation.direction).toBe("outbound");
  });

  it("constructs a VersionDiffView literal using the shared-local CommitMeta shape", () => {
    const from: CommitMeta = {
      sha: "aaa111",
      author: "Alice",
      date: "2026-01-01T00:00:00.000Z",
      message: "initial",
    };
    const to: CommitMeta = {
      sha: "bbb222",
      author: "Bob",
      date: "2026-02-01T00:00:00.000Z",
      message: "update",
    };
    const hunks: DiffHunk[] = [
      { kind: "unchanged", text: "# Title\n" },
      { kind: "removed", text: "old line\n" },
      { kind: "added", text: "new line\n" },
    ];
    const diff: VersionDiffView = { from, to, hunks };
    expect(diff.hunks).toHaveLength(3);
    expect(diff.hunks.map((h: DiffHunk) => h.kind)).toEqual(["unchanged", "removed", "added"]);
  });

  it("constructs an AdrCompareView literal comparing two full Adrs field by field", () => {
    const a: Adr = {
      id: "0001",
      title: "Use Postgres",
      status: "accepted",
      date: "2026-01-01",
      body: "Body A",
      path: "decisions/0001.md",
      blobSha: "sha-a",
    };
    const b: Adr = {
      id: "0002",
      title: "Use SQLite",
      status: "proposed",
      date: "2026-02-01",
      body: "Body B",
      path: "decisions/0002.md",
      blobSha: "sha-b",
    };
    const fields: FieldComparison[] = [
      { field: "title", a: a.title, b: b.title, differs: true },
      { field: "status", a: a.status, b: b.status, differs: true },
    ];
    const compare: AdrCompareView = { a, b, fields };
    expect(compare.fields.every((f: FieldComparison) => f.differs)).toBe(true);
  });

  it("constructs a SimilarityResult literal pairing an AdrSummary with a score", () => {
    const result: SimilarityResult = {
      adr: {
        id: "0003-use-redis",
        title: "Use Redis",
        status: "proposed",
        path: "decisions/0003-use-redis.md",
      },
      score: 0.87,
    };
    expect(result.score).toBeGreaterThan(0);
  });
});

describe("request types", () => {
  it("constructs a CreateAdrRequest literal with optional fields", () => {
    const req: CreateAdrRequest = {
      title: "Use Postgres",
      deciders: ["Alice"],
      tags: ["database"],
      folder: "decisions/db",
    };
    expect(req.folder).toBe("decisions/db");
  });

  it("constructs an UpdateAdrRequest literal including the concurrency token and author", () => {
    const relations: AdrRelation[] = [{ type: "relates-to", target: "0002" as AdrId }];
    const status: AdrStatus = "accepted";
    const relationType: RelationType = relations[0].type;
    const req: UpdateAdrRequest = {
      title: "Use Postgres",
      status,
      date: "2026-01-01",
      deciders: ["Alice"],
      tags: ["database"],
      relations,
      body: "## Context\n...",
      author: "Alice",
      baseBlobSha: "sha-base",
    };
    expect(req.baseBlobSha).toBe("sha-base");
    expect(req.author).toBe("Alice");
    expect(relationType).toBe("relates-to");
  });

  it("constructs a CreateFolderRequest literal including author", () => {
    const req: CreateFolderRequest = { path: "decisions/db", author: "Alice" };
    expect(req.author).toBe("Alice");
  });

  it("constructs a MoveAdrRequest literal including author", () => {
    const req: MoveAdrRequest = { targetFolder: "decisions/db", author: "Bob" };
    expect(req.author).toBe("Bob");
  });
});
