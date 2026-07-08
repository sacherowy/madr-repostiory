import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as apps/web/src/features/folder-tree/FolderTree.test.tsx
// (task 5.2): @adr/api has no exports field, so it's reached via a relative
// path into its src/ rather than a bare specifier. RelationsPanel.test.tsx is
// a sibling of FolderTree.test.tsx and AdrEditor.test.tsx, so the `../` depth
// matches exactly.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { RelationsPanel } from "./RelationsPanel.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "relations-panel-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("RelationsPanel", () => {
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

  it("shows relations-panel-loading then the empty state for an ADR with no relations", async () => {
    const created = await client.createAdr({ title: "Lonely ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    render(<RelationsPanel apiClient={client} adrId={created.adr.id} />);

    expect(screen.getByTestId("relations-panel-loading")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("relations-panel-empty")).toBeInTheDocument());
    expect(screen.queryByTestId("relations-panel")).not.toBeInTheDocument();
  });

  it("shows the error state for a nonexistent ADR id", async () => {
    render(<RelationsPanel apiClient={client} adrId="adr-9999" />);

    expect(screen.getByTestId("relations-panel-loading")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("relations-panel-error")).toBeInTheDocument());
  });

  it("shows an outbound relation declared on the ADR itself, labeled with type and direction", async () => {
    const source = await client.createAdr({ title: "Source ADR", folder: "decisions", author: AUTHOR });
    if (!source.ok) throw new Error("fixture setup: createAdr source unexpectedly failed");
    const target = await client.createAdr({ title: "Target ADR", folder: "decisions", author: AUTHOR });
    if (!target.ok) throw new Error("fixture setup: createAdr target unexpectedly failed");

    const saved = await client.updateAdr(source.adr.id, {
      title: source.adr.title,
      status: source.adr.status,
      date: source.adr.date,
      decisionMakers: source.adr.decisionMakers,
      tags: source.adr.tags,
      contextAndProblemStatement: "Body.",
      decisionOutcome: "Proceed.",
      decisionDrivers: "",
      consideredOptions: "",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      relations: [{ type: "relates-to", target: target.adr.id }],
      author: AUTHOR,
      baseBlobSha: source.adr.blobSha,
    });
    if (!saved.ok) throw new Error("fixture setup: updateAdr source unexpectedly failed");

    render(<RelationsPanel apiClient={client} adrId={source.adr.id} />);

    await waitFor(() => expect(screen.getByTestId("relations-panel")).toBeInTheDocument());
    const item = screen.getByTestId(`relation-item-outbound-relates-to-${target.adr.id}`);
    expect(item).toBeInTheDocument();
    // Requirement 1.2: the chip renders the plain-language relation label.
    expect(item.textContent).toContain("Related to");
    expect(item.textContent?.toLowerCase()).toContain("outbound");
    expect(item.textContent).toContain(target.adr.id);
  });

  it("shows the derived inbound superseded-by entry on the target of another ADR's supersedes declaration", async () => {
    const oldAdr = await client.createAdr({ title: "Old decision", folder: "decisions", author: AUTHOR });
    if (!oldAdr.ok) throw new Error("fixture setup: createAdr oldAdr unexpectedly failed");
    const newAdr = await client.createAdr({ title: "New decision", folder: "decisions", author: AUTHOR });
    if (!newAdr.ok) throw new Error("fixture setup: createAdr newAdr unexpectedly failed");

    const saved = await client.updateAdr(newAdr.adr.id, {
      title: newAdr.adr.title,
      status: newAdr.adr.status,
      date: newAdr.adr.date,
      decisionMakers: newAdr.adr.decisionMakers,
      tags: newAdr.adr.tags,
      contextAndProblemStatement: "Replaces the old decision.",
      decisionOutcome: "Proceed.",
      decisionDrivers: "",
      consideredOptions: "",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      relations: [{ type: "supersedes", target: oldAdr.adr.id }],
      author: AUTHOR,
      baseBlobSha: newAdr.adr.blobSha,
    });
    if (!saved.ok) throw new Error("fixture setup: updateAdr newAdr unexpectedly failed");

    // Render the panel for the OLD adr (the target) — it never declared
    // anything itself, but should show the derived inbound superseded-by entry.
    render(<RelationsPanel apiClient={client} adrId={oldAdr.adr.id} />);

    await waitFor(() => expect(screen.getByTestId("relations-panel")).toBeInTheDocument());
    const item = screen.getByTestId(`relation-item-inbound-superseded-by-${newAdr.adr.id}`);
    expect(item).toBeInTheDocument();
    // Requirement 1.2 (direction-aware): the inbound superseded-by view is
    // already reciprocal-resolved by core, so the chip reads "Replaced by".
    expect(item.textContent).toContain("Replaced by");
    expect(item.textContent?.toLowerCase()).toContain("inbound");
  });

  it("shows both an outbound relation it declares and an inbound relation pointing to it, together", async () => {
    const a = await client.createAdr({ title: "ADR A", folder: "decisions", author: AUTHOR });
    if (!a.ok) throw new Error("fixture setup: createAdr a unexpectedly failed");
    const b = await client.createAdr({ title: "ADR B", folder: "decisions", author: AUTHOR });
    if (!b.ok) throw new Error("fixture setup: createAdr b unexpectedly failed");
    const c = await client.createAdr({ title: "ADR C", folder: "decisions", author: AUTHOR });
    if (!c.ok) throw new Error("fixture setup: createAdr c unexpectedly failed");

    // B declares an outbound relation to C.
    const savedB = await client.updateAdr(b.adr.id, {
      title: b.adr.title,
      status: b.adr.status,
      date: b.adr.date,
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
      relations: [{ type: "depends-on", target: c.adr.id }],
      author: AUTHOR,
      baseBlobSha: b.adr.blobSha,
    });
    if (!savedB.ok) throw new Error("fixture setup: updateAdr b unexpectedly failed");

    // A declares supersedes pointing at B, so B should ALSO get an inbound
    // superseded-by entry, alongside its own outbound depends-on declaration.
    const savedA = await client.updateAdr(a.adr.id, {
      title: a.adr.title,
      status: a.adr.status,
      date: a.adr.date,
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
      relations: [{ type: "supersedes", target: b.adr.id }],
      author: AUTHOR,
      baseBlobSha: a.adr.blobSha,
    });
    if (!savedA.ok) throw new Error("fixture setup: updateAdr a unexpectedly failed");

    render(<RelationsPanel apiClient={client} adrId={b.adr.id} />);

    await waitFor(() => expect(screen.getByTestId("relations-panel")).toBeInTheDocument());
    expect(screen.getByTestId(`relation-item-outbound-depends-on-${c.adr.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`relation-item-inbound-superseded-by-${a.adr.id}`)).toBeInTheDocument();
  });

  it("shows a symmetric relation type (depends-on) as the same type on both the declaring and target sides", async () => {
    const source = await client.createAdr({ title: "Depends source", folder: "decisions", author: AUTHOR });
    if (!source.ok) throw new Error("fixture setup: createAdr source unexpectedly failed");
    const target = await client.createAdr({ title: "Depends target", folder: "decisions", author: AUTHOR });
    if (!target.ok) throw new Error("fixture setup: createAdr target unexpectedly failed");

    const saved = await client.updateAdr(source.adr.id, {
      title: source.adr.title,
      status: source.adr.status,
      date: source.adr.date,
      decisionMakers: source.adr.decisionMakers,
      tags: source.adr.tags,
      contextAndProblemStatement: "Body.",
      decisionOutcome: "Proceed.",
      decisionDrivers: "",
      consideredOptions: "",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      relations: [{ type: "depends-on", target: target.adr.id }],
      author: AUTHOR,
      baseBlobSha: source.adr.blobSha,
    });
    if (!saved.ok) throw new Error("fixture setup: updateAdr source unexpectedly failed");

    // Declaring side: outbound depends-on.
    render(<RelationsPanel apiClient={client} adrId={source.adr.id} />);
    await waitFor(() =>
      expect(
        screen.getByTestId(`relation-item-outbound-depends-on-${target.adr.id}`)
      ).toBeInTheDocument()
    );
    cleanup();

    // Target side: inbound depends-on (same type, different direction).
    render(<RelationsPanel apiClient={client} adrId={target.adr.id} />);
    await waitFor(() =>
      expect(
        screen.getByTestId(`relation-item-inbound-depends-on-${source.adr.id}`)
      ).toBeInTheDocument()
    );
  });
});
