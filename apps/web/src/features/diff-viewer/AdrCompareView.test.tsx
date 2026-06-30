import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as apps/web/src/features/history-timeline/HistoryTimeline.test.tsx
// (task 5.4): @adr/api has no exports field, so it's reached via a relative
// path into its src/ rather than a bare specifier. AdrCompareView.test.tsx
// lives at the same nesting depth as HistoryTimeline.test.tsx/
// RelationsPanel.test.tsx/FolderTree.test.tsx, so the `../` depth matches.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { AdrCompareView } from "./AdrCompareView.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-compare-view-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("AdrCompareView", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await initRepo();
    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "fake-key" },
    });

    await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);

    app = await buildServer(container);
    baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    client = createApiClient(baseUrl);
  });

  afterEach(async () => {
    cleanup();
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it("renders all 16 fields in fixed order with accurate differs flags for two distinct real ADRs", async () => {
    const a = await client.createAdr({ title: "ADR A title", folder: "decisions", author: AUTHOR });
    if (!a.ok) throw new Error("fixture setup: createAdr A unexpectedly failed");
    const b = await client.createAdr({ title: "ADR B title", folder: "decisions", author: AUTHOR });
    if (!b.ok) throw new Error("fixture setup: createAdr B unexpectedly failed");

    // Give both ADRs the SAME status/date but DIFFERENT title/contextAndProblemStatement,
    // so we can assert both differs:true and differs:false outcomes against reality.
    const savedA = await client.updateAdr(a.adr.id, {
      title: "ADR A title",
      status: "accepted",
      date: "2026-01-01",
      decisionMakers: a.adr.decisionMakers,
      tags: a.adr.tags,
      contextAndProblemStatement: "Body A.",
      decisionOutcome: "Proceed.",
      decisionDrivers: "",
      consideredOptions: "",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      author: AUTHOR,
      baseBlobSha: a.adr.blobSha,
    });
    if (!savedA.ok) throw new Error("fixture setup: updateAdr A unexpectedly failed");

    const savedB = await client.updateAdr(b.adr.id, {
      title: "ADR B title",
      status: "accepted",
      date: "2026-01-01",
      decisionMakers: b.adr.decisionMakers,
      tags: b.adr.tags,
      contextAndProblemStatement: "Body B.",
      decisionOutcome: "Proceed.",
      decisionDrivers: "",
      consideredOptions: "",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      author: AUTHOR,
      baseBlobSha: b.adr.blobSha,
    });
    if (!savedB.ok) throw new Error("fixture setup: updateAdr B unexpectedly failed");

    render(<AdrCompareView apiClient={client} idA={a.adr.id} idB={b.adr.id} />);

    expect(screen.getByTestId("adr-compare-loading")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("adr-compare")).toBeInTheDocument());

    const fieldOrder = [
      "title",
      "status",
      "date",
      "decisionMakers",
      "consulted",
      "informed",
      "tags",
      "contextAndProblemStatement",
      "decisionDrivers",
      "consideredOptions",
      "decisionOutcome",
      "consequences",
      "confirmation",
      "prosAndConsOfTheOptions",
      "moreInformation",
      "additionalContent",
    ];
    const renderedFields = screen.getAllByTestId(/^adr-compare-field-[a-zA-Z]+$/);
    expect(renderedFields).toHaveLength(16);
    expect(renderedFields.map((el) => el.getAttribute("data-field"))).toEqual(fieldOrder);

    // title and contextAndProblemStatement actually differ between the two fixtures.
    expect(screen.getByTestId("adr-compare-field-title").getAttribute("data-differs")).toBe("true");
    expect(
      screen.getByTestId("adr-compare-field-contextAndProblemStatement").getAttribute("data-differs")
    ).toBe("true");
    // status and date were set identically on both ADRs.
    expect(screen.getByTestId("adr-compare-field-status").getAttribute("data-differs")).toBe("false");
    expect(screen.getByTestId("adr-compare-field-date").getAttribute("data-differs")).toBe("false");

    expect(screen.getByTestId("adr-compare-field-title").textContent).toContain("ADR A title");
    expect(screen.getByTestId("adr-compare-field-title").textContent).toContain("ADR B title");
  });

  it("shows the rejection message with no comparison content when idA === idB", async () => {
    const a = await client.createAdr({ title: "Self compare ADR", folder: "decisions", author: AUTHOR });
    if (!a.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    render(<AdrCompareView apiClient={client} idA={a.adr.id} idB={a.adr.id} />);

    await waitFor(() => expect(screen.getByTestId("adr-compare-rejection")).toBeInTheDocument());
    expect(screen.queryByTestId("adr-compare")).not.toBeInTheDocument();
    expect(screen.getByTestId("adr-compare-rejection").textContent).toContain(
      "two distinct ADRs are required for comparison"
    );
  });
});
