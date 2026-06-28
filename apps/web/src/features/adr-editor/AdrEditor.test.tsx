import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as apps/web/src/api/client.test.ts (task 4.1):
// @adr/api has no exports field, so it's reached via a relative path into its
// src/ rather than a bare specifier.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { AdrEditor } from "./AdrEditor.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-editor-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("AdrEditor", () => {
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

  describe("create mode (adrId === null)", () => {
    it("calls onAdrSaved with a real created Adr when title is provided", async () => {
      const onAdrSaved = vi.fn();
      render(
        <AdrEditor
          adrId={null}
          folder="decisions"
          authorName={AUTHOR}
          apiClient={client}
          onAdrSaved={onAdrSaved}
        />
      );

      fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Brand new ADR" } });
      fireEvent.click(screen.getByTestId("create-button"));

      await waitFor(() => expect(onAdrSaved).toHaveBeenCalledTimes(1));
      const savedAdr = onAdrSaved.mock.calls[0][0];
      expect(savedAdr.title).toBe("Brand new ADR");
      expect(typeof savedAdr.id).toBe("string");
      expect(typeof savedAdr.blobSha).toBe("string");
    });

    it("shows missing-fields-message when title is empty", async () => {
      const onAdrSaved = vi.fn();
      render(
        <AdrEditor
          adrId={null}
          folder="decisions"
          authorName={AUTHOR}
          apiClient={client}
          onAdrSaved={onAdrSaved}
        />
      );

      fireEvent.click(screen.getByTestId("create-button"));

      await waitFor(() => expect(screen.getByTestId("missing-fields-message")).toBeInTheDocument());
      expect(onAdrSaved).not.toHaveBeenCalled();
    });
  });

  describe("edit mode (adrId is a string)", () => {
    async function seedAdr(title: string, body: string): Promise<{ id: string; blobSha: string }> {
      const created = await client.createAdr({ title, folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
      const saved = await client.updateAdr(created.adr.id, {
        title,
        status: "accepted",
        date: "2026-01-01",
        body,
        author: AUTHOR,
        baseBlobSha: created.adr.blobSha,
      });
      if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");
      return { id: saved.adr.id, blobSha: saved.adr.blobSha };
    }

    it("loads and displays the real saved title/status/date/body", async () => {
      const { id } = await seedAdr("Loadable ADR", "Original body content.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );

      expect(screen.getByTestId("adr-editor-loading")).toBeInTheDocument();

      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());
      expect(screen.getByTestId("title-input")).toHaveValue("Loadable ADR");
      expect(screen.getByTestId("status-select")).toHaveValue("accepted");
      expect(screen.getByTestId("date-input")).toHaveValue("2026-01-01");
      expect(screen.getByTestId("body-textarea")).toHaveValue("Original body content.");
    });

    it("renders adr-editor-not-found when the load fails", async () => {
      render(
        <AdrEditor adrId="adr-9999" folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );

      await waitFor(() => expect(screen.getByTestId("adr-editor-not-found")).toBeInTheDocument());
    });

    it("saves successfully, calls onAdrSaved, and shows the new body in the form", async () => {
      const { id } = await seedAdr("Editable ADR", "Body before edit.");
      const onAdrSaved = vi.fn();

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={onAdrSaved} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      fireEvent.change(screen.getByTestId("body-textarea"), { target: { value: "Body after edit." } });
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(onAdrSaved).toHaveBeenCalledTimes(1));
      expect(onAdrSaved.mock.calls[0][0].body).toBe("Body after edit.");
      expect(screen.getByTestId("body-textarea")).toHaveValue("Body after edit.");
    });

    it("loads and displays the real saved decisionMakers/consulted/informed values", async () => {
      const created = await client.createAdr({
        title: "Participants ADR",
        folder: "decisions",
        author: AUTHOR,
      });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
      const saved = await client.updateAdr(created.adr.id, {
        title: "Participants ADR",
        status: "accepted",
        date: "2026-01-01",
        decisionMakers: ["Alice", "Bob"],
        consulted: ["Carol"],
        informed: ["Dave", "Erin"],
        body: "Body content.",
        author: AUTHOR,
        baseBlobSha: created.adr.blobSha,
      });
      if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");

      render(
        <AdrEditor
          adrId={saved.adr.id}
          folder={null}
          authorName={AUTHOR}
          apiClient={client}
          onAdrSaved={vi.fn()}
        />
      );

      await waitFor(() => expect(screen.getByTestId("decision-makers-input")).toBeInTheDocument());
      expect(screen.getByTestId("decision-makers-input")).toHaveValue("Alice, Bob");
      expect(screen.getByTestId("consulted-input")).toHaveValue("Carol");
      expect(screen.getByTestId("informed-input")).toHaveValue("Dave, Erin");
    });

    it("saves edited decisionMakers/consulted/informed and persists all three", async () => {
      const { id } = await seedAdr("Editable Participants ADR", "Body before edit.");
      const onAdrSaved = vi.fn();

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={onAdrSaved} />
      );
      await waitFor(() => expect(screen.getByTestId("decision-makers-input")).toBeInTheDocument());

      fireEvent.change(screen.getByTestId("decision-makers-input"), {
        target: { value: "Alice, Bob" },
      });
      fireEvent.change(screen.getByTestId("consulted-input"), { target: { value: "Carol" } });
      fireEvent.change(screen.getByTestId("informed-input"), { target: { value: "Dave, Erin" } });
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(onAdrSaved).toHaveBeenCalledTimes(1));
      const savedAdr = onAdrSaved.mock.calls[0][0];
      expect(savedAdr.decisionMakers).toEqual(["Alice", "Bob"]);
      expect(savedAdr.consulted).toEqual(["Carol"]);
      expect(savedAdr.informed).toEqual(["Dave", "Erin"]);

      const refetched = await client.getAdr(id);
      if (!refetched.ok) throw new Error("expected getAdr to succeed");
      expect(refetched.adr.decisionMakers).toEqual(["Alice", "Bob"]);
      expect(refetched.adr.consulted).toEqual(["Carol"]);
      expect(refetched.adr.informed).toEqual(["Dave", "Erin"]);
    });

    it("shows missing-fields-message when body is cleared, without discarding the draft", async () => {
      const { id } = await seedAdr("Invalid Save ADR", "Has a body.");
      const onAdrSaved = vi.fn();

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={onAdrSaved} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      fireEvent.change(screen.getByTestId("body-textarea"), { target: { value: "" } });
      fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Still draft title" } });
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("missing-fields-message")).toBeInTheDocument());
      expect(onAdrSaved).not.toHaveBeenCalled();
      // Draft must survive the rejection.
      expect(screen.getByTestId("title-input")).toHaveValue("Still draft title");
    });

    it("round-trips a relation pointing to a real second ADR with no error", async () => {
      const { id } = await seedAdr("Relation Source ADR", "Source body.");
      const target = await seedAdr("Relation Target ADR", "Target body.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      fireEvent.change(screen.getByTestId("relation-type-select"), { target: { value: "relates-to" } });
      fireEvent.change(screen.getByTestId("relation-target-input"), { target: { value: target.id } });
      fireEvent.click(screen.getByTestId("add-relation-button"));

      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("save-success-message")).toBeInTheDocument());
      expect(screen.queryByTestId("invalid-relations-message")).not.toBeInTheDocument();
      expect(screen.queryByTestId("missing-fields-message")).not.toBeInTheDocument();
    });

    it("shows invalid-relations-message containing the missing target id", async () => {
      const { id } = await seedAdr("Bad Relation ADR", "Body.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      fireEvent.change(screen.getByTestId("relation-type-select"), { target: { value: "relates-to" } });
      fireEvent.change(screen.getByTestId("relation-target-input"), { target: { value: "adr-9999" } });
      fireEvent.click(screen.getByTestId("add-relation-button"));

      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("invalid-relations-message")).toBeInTheDocument());
      expect(screen.getByTestId("invalid-relations-message").textContent).toContain("adr-9999");
    });

    it("shows the conflict message and reloads the latest version on demand", async () => {
      const { id, blobSha } = await seedAdr("Conflict ADR", "Original body.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      // Behind the editor's back: a second writer saves first, using the same
      // base blob sha the editor loaded, making the editor's own upcoming
      // save stale.
      const otherWriterSave = await client.updateAdr(id, {
        title: "Conflict ADR",
        status: "deprecated",
        date: "2026-02-02",
        body: "Someone else's content.",
        author: "Other Author <other@example.com>",
        baseBlobSha: blobSha,
      });
      if (!otherWriterSave.ok) throw new Error("fixture setup: concurrent save unexpectedly failed");

      fireEvent.change(screen.getByTestId("body-textarea"), { target: { value: "My local edit." } });
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("conflict-message")).toBeInTheDocument());
      expect(screen.getByTestId("conflict-message").textContent).toContain(
        "Plik zmienił się od ostatniego odczytu. Odśwież i zapisz ponownie."
      );

      fireEvent.click(screen.getByTestId("reload-latest-button"));

      await waitFor(() => expect(screen.getByTestId("body-textarea")).toHaveValue("Someone else's content."));
      expect(screen.getByTestId("status-select")).toHaveValue("deprecated");
    });

    it("status select offers exactly the four AdrStatus values", async () => {
      const { id } = await seedAdr("Status Options ADR", "Body.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );
      await waitFor(() => expect(screen.getByTestId("status-select")).toBeInTheDocument());

      const options = within(screen.getByTestId("status-select")).getAllByRole("option");
      const values = options.map((option) => option.textContent);
      expect(values).toEqual(
        expect.arrayContaining(["proposed", "accepted", "deprecated", "superseded"])
      );
      expect(options).toHaveLength(4);
    });

    it("relation-type select offers exactly the five RelationType values", async () => {
      const { id } = await seedAdr("Relation Options ADR", "Body.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );
      await waitFor(() => expect(screen.getByTestId("relation-type-select")).toBeInTheDocument());

      const options = within(screen.getByTestId("relation-type-select")).getAllByRole("option");
      const values = options.map((option) => option.textContent);
      expect(values).toEqual(
        expect.arrayContaining([
          "supersedes",
          "superseded-by",
          "relates-to",
          "depends-on",
          "conflicts-with",
        ])
      );
      expect(options).toHaveLength(5);
    });

    it("removing a relation from the draft before saving persists only the remaining one", async () => {
      const { id } = await seedAdr("Remove Relation ADR", "Body.");
      const targetA = await seedAdr("Remove Relation Target A", "Body A.");
      const targetB = await seedAdr("Remove Relation Target B", "Body B.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      fireEvent.change(screen.getByTestId("relation-type-select"), { target: { value: "relates-to" } });
      fireEvent.change(screen.getByTestId("relation-target-input"), { target: { value: targetA.id } });
      fireEvent.click(screen.getByTestId("add-relation-button"));

      fireEvent.change(screen.getByTestId("relation-type-select"), { target: { value: "depends-on" } });
      fireEvent.change(screen.getByTestId("relation-target-input"), { target: { value: targetB.id } });
      fireEvent.click(screen.getByTestId("add-relation-button"));

      const removeButtons = screen.getAllByTestId("remove-relation-button");
      expect(removeButtons).toHaveLength(2);
      // Remove the first one added (targetA).
      fireEvent.click(removeButtons[0]);

      expect(screen.getAllByTestId("remove-relation-button")).toHaveLength(1);

      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("save-success-message")).toBeInTheDocument());

      const refetched = await client.getAdr(id);
      if (!refetched.ok) throw new Error("expected getAdr to succeed");
      expect(refetched.adr.relations ?? []).toEqual([{ type: "depends-on", target: targetB.id }]);
    });
  });
});
