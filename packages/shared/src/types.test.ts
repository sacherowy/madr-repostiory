import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  AdrId,
  AdrStatus,
  RelationType,
  AdrRelation,
  Adr,
  AdrFrontmatter,
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
      contextAndProblemStatement: "Context A",
      decisionDrivers: "",
      consideredOptions: "",
      decisionOutcome: "Outcome A",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      path: "decisions/0001.md",
      blobSha: "sha-a",
    };
    const b: Adr = {
      id: "0002",
      title: "Use SQLite",
      status: "proposed",
      date: "2026-02-01",
      contextAndProblemStatement: "Context B",
      decisionDrivers: "",
      consideredOptions: "",
      decisionOutcome: "Outcome B",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
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
  it("constructs a CreateAdrRequest literal with optional fields, including consulted/informed", () => {
    const req: CreateAdrRequest = {
      title: "Use Postgres",
      decisionMakers: ["Alice"],
      consulted: ["Carol"],
      informed: ["Dave"],
      tags: ["database"],
      folder: "decisions/db",
    };
    expect(req.folder).toBe("decisions/db");
    expect(req.decisionMakers).toEqual(["Alice"]);
    expect(req.consulted).toEqual(["Carol"]);
    expect(req.informed).toEqual(["Dave"]);
  });

  it("constructs an UpdateAdrRequest literal including the concurrency token, author, and consulted/informed", () => {
    const relations: AdrRelation[] = [{ type: "relates-to", target: "0002" as AdrId }];
    const status: AdrStatus = "accepted";
    const relationType: RelationType = relations[0].type;
    const req: UpdateAdrRequest = {
      title: "Use Postgres",
      status,
      date: "2026-01-01",
      decisionMakers: ["Alice"],
      consulted: ["Carol"],
      informed: ["Dave"],
      tags: ["database"],
      relations,
      contextAndProblemStatement: "## Context\n...",
      decisionDrivers: "",
      consideredOptions: "",
      decisionOutcome: "",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      author: "Alice",
      baseBlobSha: "sha-base",
    };
    expect(req.baseBlobSha).toBe("sha-base");
    expect(req.author).toBe("Alice");
    expect(relationType).toBe("relates-to");
    expect(req.consulted).toEqual(["Carol"]);
    expect(req.informed).toEqual(["Dave"]);
    expect(req.contextAndProblemStatement).toBe("## Context\n...");
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

describe("AdrFrontmatter decision-participant fields", () => {
  it("constructs an AdrFrontmatter literal with decisionMakers, consulted, and informed (no title field)", () => {
    const frontmatter: AdrFrontmatter = {
      id: "0001-use-postgres",
      status: "accepted",
      date: "2026-01-01",
      decisionMakers: ["Alice"],
      consulted: ["Carol"],
      informed: ["Dave"],
      tags: ["database"],
    };
    expect(frontmatter.decisionMakers).toEqual(["Alice"]);
    expect(frontmatter.consulted).toEqual(["Carol"]);
    expect(frontmatter.informed).toEqual(["Dave"]);
  });

  it("never references the legacy 'deciders' field name anywhere in types.ts", () => {
    const typesPath = fileURLToPath(new URL("./types.ts", import.meta.url));
    const source = readFileSync(typesPath, "utf-8");
    expect(source).not.toMatch(/\bdeciders\b/);
  });
});

describe("AdrStatus rejected value and title relocation onto Adr", () => {
  it("accepts 'rejected' as a valid AdrStatus", () => {
    const status: AdrStatus = "rejected";
    expect(status).toBe("rejected");
  });

  it("constructs an Adr literal with a title field even though AdrFrontmatter has none", () => {
    const adr: Adr = {
      id: "0001-use-postgres",
      status: "rejected",
      date: "2026-01-01",
      title: "Use Postgres",
      contextAndProblemStatement: "Context",
      decisionDrivers: "",
      consideredOptions: "",
      decisionOutcome: "Outcome",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "Leftover body content",
      path: "decisions/0001.md",
      blobSha: "sha-a",
    };
    expect(adr.title).toBe("Use Postgres");
    expect(adr.status).toBe("rejected");
  });
});

describe("Adr and UpdateAdrRequest section fields replace the single body field", () => {
  it("constructs an Adr literal with all 8 AdrSections fields plus additionalContent, and no body field", () => {
    const adr: Adr = {
      id: "0001-use-postgres",
      status: "accepted",
      date: "2026-01-01",
      title: "Use Postgres",
      contextAndProblemStatement: "We need a database.",
      decisionDrivers: "Cost, reliability",
      consideredOptions: "Postgres, MySQL",
      decisionOutcome: "Chosen option: Postgres",
      consequences: "Easier scaling",
      confirmation: "Verified via load test",
      prosAndConsOfTheOptions: "Postgres: + mature, - heavier",
      moreInformation: "See RFC-123",
      additionalContent: "Some unstructured leftover content",
      path: "decisions/0001.md",
      blobSha: "sha-a",
    };
    expect(adr.contextAndProblemStatement).toBe("We need a database.");
    expect(adr.decisionDrivers).toBe("Cost, reliability");
    expect(adr.consideredOptions).toBe("Postgres, MySQL");
    expect(adr.decisionOutcome).toBe("Chosen option: Postgres");
    expect(adr.consequences).toBe("Easier scaling");
    expect(adr.confirmation).toBe("Verified via load test");
    expect(adr.prosAndConsOfTheOptions).toBe("Postgres: + mature, - heavier");
    expect(adr.moreInformation).toBe("See RFC-123");
    expect(adr.additionalContent).toBe("Some unstructured leftover content");
    expect("body" in adr).toBe(false);
  });

  it("constructs an UpdateAdrRequest literal with all 8 AdrSections fields plus additionalContent, and no body field", () => {
    const req: UpdateAdrRequest = {
      title: "Use Postgres",
      status: "accepted",
      date: "2026-01-01",
      contextAndProblemStatement: "We need a database.",
      decisionDrivers: "Cost, reliability",
      consideredOptions: "Postgres, MySQL",
      decisionOutcome: "Chosen option: Postgres",
      consequences: "Easier scaling",
      confirmation: "Verified via load test",
      prosAndConsOfTheOptions: "Postgres: + mature, - heavier",
      moreInformation: "See RFC-123",
      additionalContent: "Some unstructured leftover content",
      author: "Alice",
      baseBlobSha: "sha-base",
    };
    expect(req.contextAndProblemStatement).toBe("We need a database.");
    expect(req.decisionDrivers).toBe("Cost, reliability");
    expect(req.consideredOptions).toBe("Postgres, MySQL");
    expect(req.decisionOutcome).toBe("Chosen option: Postgres");
    expect(req.consequences).toBe("Easier scaling");
    expect(req.confirmation).toBe("Verified via load test");
    expect(req.prosAndConsOfTheOptions).toBe("Postgres: + mature, - heavier");
    expect(req.moreInformation).toBe("See RFC-123");
    expect(req.additionalContent).toBe("Some unstructured leftover content");
    expect("body" in req).toBe(false);
  });

  it("never declares a 'body: string' field anywhere in types.ts", () => {
    const typesPath = fileURLToPath(new URL("./types.ts", import.meta.url));
    const source = readFileSync(typesPath, "utf-8");
    expect(source).not.toMatch(/\bbody\s*:\s*string\b/);
  });
});
