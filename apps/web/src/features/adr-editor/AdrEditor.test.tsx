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
import { AdrEditor, firstLine } from "./AdrEditor.js";

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

    it("lets the user enter decisionMakers/consulted/informed and reflects them on the created Adr", async () => {
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

      fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Participants Create ADR" } });
      fireEvent.change(screen.getByTestId("decision-makers-input"), { target: { value: "Alice, Bob" } });
      fireEvent.change(screen.getByTestId("consulted-input"), { target: { value: "Carol" } });
      fireEvent.change(screen.getByTestId("informed-input"), { target: { value: "Dave, Erin" } });
      fireEvent.click(screen.getByTestId("create-button"));

      await waitFor(() => expect(onAdrSaved).toHaveBeenCalledTimes(1));
      const savedAdr = onAdrSaved.mock.calls[0][0];
      expect(savedAdr.title).toBe("Participants Create ADR");
      expect(savedAdr.decisionMakers).toEqual(["Alice", "Bob"]);
      expect(savedAdr.consulted).toEqual(["Carol"]);
      expect(savedAdr.informed).toEqual(["Dave", "Erin"]);
    });
  });

  describe("edit mode (adrId is a string)", () => {
    function sectionsPayload(contextAndProblemStatement: string, decisionOutcome: string) {
      return {
        contextAndProblemStatement,
        decisionDrivers: "",
        consideredOptions: "",
        decisionOutcome,
        consequences: "",
        confirmation: "",
        prosAndConsOfTheOptions: "",
        moreInformation: "",
        additionalContent: "",
      };
    }

    async function seedAdr(title: string, body: string): Promise<{ id: string; blobSha: string }> {
      const created = await client.createAdr({ title, folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
      const saved = await client.updateAdr(created.adr.id, {
        title,
        status: "accepted",
        date: "2026-01-01",
        ...sectionsPayload(body, "Seed decision outcome."),
        author: AUTHOR,
        baseBlobSha: created.adr.blobSha,
      });
      if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");
      return { id: saved.adr.id, blobSha: saved.adr.blobSha };
    }

    it("loads and displays the real saved title/status/date/sections", async () => {
      const { id } = await seedAdr("Loadable ADR", "Original context content.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );

      expect(screen.getByTestId("adr-editor-loading")).toBeInTheDocument();

      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());
      expect(screen.getByTestId("title-input")).toHaveValue("Loadable ADR");
      expect(screen.getByTestId("status-select")).toHaveValue("accepted");
      expect(screen.getByTestId("date-input")).toHaveValue("2026-01-01");
      expect(screen.getByTestId("context-and-problem-statement-textarea")).toHaveValue(
        "Original context content."
      );
    });

    it("renders all eight MADR section textareas in canonical order plus the additional-content textarea, with required ones marked", async () => {
      const { id } = await seedAdr("Sectioned ADR", "Context content.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      const expectedOrder = [
        "context-and-problem-statement-textarea",
        "decision-drivers-textarea",
        "considered-options-textarea",
        "decision-outcome-textarea",
        "consequences-textarea",
        "confirmation-textarea",
        "pros-and-cons-of-the-options-textarea",
        "more-information-textarea",
      ];
      for (const testId of expectedOrder) {
        expect(screen.getByTestId(testId)).toBeInTheDocument();
      }
      expect(screen.getByTestId("additional-content-textarea")).toBeInTheDocument();

      // canonical order: each subsequent testid appears later in the DOM than the previous one
      const positions = expectedOrder.map(
        (testId) => document.body.innerHTML.indexOf(`data-testid="${testId}"`)
      );
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      }
      const additionalContentPosition = document.body.innerHTML.indexOf(
        'data-testid="additional-content-textarea"'
      );
      expect(additionalContentPosition).toBeGreaterThan(positions[positions.length - 1]);

      // Required sections (contextAndProblemStatement, decisionOutcome) are marked with "*".
      const requiredToggle = screen.getByTestId("section-toggle-contextAndProblemStatement");
      expect(requiredToggle.textContent).toContain("*");
      const optionalToggle = screen.getByTestId("section-toggle-decisionDrivers");
      expect(optionalToggle.textContent).not.toContain("*");
    });

    it("saves a change to one section independently of the others, persisting all nine fields", async () => {
      const { id } = await seedAdr("Independent Save ADR", "Original context.");
      const onAdrSaved = vi.fn();

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={onAdrSaved} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      fireEvent.change(screen.getByTestId("decision-outcome-textarea"), {
        target: { value: "We decided X." },
      });
      fireEvent.change(screen.getByTestId("additional-content-textarea"), {
        target: { value: "Leftover legacy text." },
      });
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(onAdrSaved).toHaveBeenCalledTimes(1));
      const savedAdr = onAdrSaved.mock.calls[0][0];
      expect(savedAdr.contextAndProblemStatement).toBe("Original context.");
      expect(savedAdr.decisionOutcome).toBe("We decided X.");
      expect(savedAdr.additionalContent).toBe("Leftover legacy text.");
      expect(screen.getByTestId("decision-outcome-textarea")).toHaveValue("We decided X.");
      expect(screen.getByTestId("context-and-problem-statement-textarea")).toHaveValue(
        "Original context."
      );
    });

    it("renders adr-editor-not-found when the load fails", async () => {
      render(
        <AdrEditor adrId="adr-9999" folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );

      await waitFor(() => expect(screen.getByTestId("adr-editor-not-found")).toBeInTheDocument());
    });

    it("loads and displays the real saved decisionMakers/consulted/informed values as person rows", async () => {
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
        ...sectionsPayload("Body content.", "Seed decision outcome."),
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

      await waitFor(() =>
        expect(
          document.querySelectorAll('[data-testid^="person-name-input-"]')
        ).toHaveLength(5)
      );

      const nameInputs = Array.from(
        document.querySelectorAll('[data-testid^="person-name-input-"]')
      ) as HTMLInputElement[];
      const roleSelects = Array.from(
        document.querySelectorAll('[data-testid^="person-role-select-"]')
      ) as HTMLSelectElement[];

      expect(nameInputs.map((input) => input.value)).toEqual([
        "Alice",
        "Bob",
        "Carol",
        "Dave",
        "Erin",
      ]);
      expect(roleSelects.map((select) => select.value)).toEqual([
        "Decision Maker",
        "Decision Maker",
        "Consulted",
        "Informed",
        "Informed",
      ]);
    });

    it("saves edited decisionMakers/consulted/informed rows and persists all three categories", async () => {
      const { id } = await seedAdr("Editable Participants ADR", "Body before edit.");
      const onAdrSaved = vi.fn();

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={onAdrSaved} />
      );
      await waitFor(() => expect(screen.getByTestId("add-person-button")).toBeInTheDocument());

      const peopleToAdd = [
        { name: "Alice", role: "Decision Maker" },
        { name: "Bob", role: "Decision Maker" },
        { name: "Carol", role: "Consulted" },
        { name: "Dave", role: "Informed" },
        { name: "Erin", role: "Informed" },
      ];

      for (let i = 0; i < peopleToAdd.length; i++) {
        fireEvent.click(screen.getByTestId("add-person-button"));
      }

      const nameInputs = Array.from(
        document.querySelectorAll('[data-testid^="person-name-input-"]')
      ) as HTMLInputElement[];
      const roleSelects = Array.from(
        document.querySelectorAll('[data-testid^="person-role-select-"]')
      ) as HTMLSelectElement[];
      expect(nameInputs).toHaveLength(5);

      peopleToAdd.forEach((person, index) => {
        fireEvent.change(nameInputs[index], { target: { value: person.name } });
        fireEvent.change(roleSelects[index], { target: { value: person.role } });
      });

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

    it("excludes a blank-name person row from the saved stakeholder categories", async () => {
      const { id } = await seedAdr("Blank Row ADR", "Body before edit.");
      const onAdrSaved = vi.fn();

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={onAdrSaved} />
      );
      await waitFor(() => expect(screen.getByTestId("add-person-button")).toBeInTheDocument());

      // Add one row with a name, and one blank row that should be excluded on save.
      fireEvent.click(screen.getByTestId("add-person-button"));
      fireEvent.click(screen.getByTestId("add-person-button"));

      const nameInputs = Array.from(
        document.querySelectorAll('[data-testid^="person-name-input-"]')
      ) as HTMLInputElement[];
      expect(nameInputs).toHaveLength(2);
      fireEvent.change(nameInputs[0], { target: { value: "Alice" } });
      // nameInputs[1] is left blank on purpose.

      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(onAdrSaved).toHaveBeenCalledTimes(1));
      const savedAdr = onAdrSaved.mock.calls[0][0];
      expect(savedAdr.decisionMakers).toEqual(["Alice"]);
      expect(savedAdr.consulted).toEqual([]);
      expect(savedAdr.informed).toEqual([]);
    });

    it("removes a person row by id when its remove button is clicked", async () => {
      const created = await client.createAdr({
        title: "Removable Participants ADR",
        folder: "decisions",
        author: AUTHOR,
      });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
      const saved = await client.updateAdr(created.adr.id, {
        title: "Removable Participants ADR",
        status: "accepted",
        date: "2026-01-01",
        decisionMakers: ["Alice", "Bob"],
        consulted: [],
        informed: [],
        ...sectionsPayload("Body content.", "Seed decision outcome."),
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

      await waitFor(() =>
        expect(
          document.querySelectorAll('[data-testid^="person-name-input-"]')
        ).toHaveLength(2)
      );

      const removeButtons = Array.from(
        document.querySelectorAll('[data-testid^="remove-person-button-"]')
      ) as HTMLButtonElement[];
      expect(removeButtons).toHaveLength(2);
      fireEvent.click(removeButtons[0]);

      await waitFor(() =>
        expect(
          document.querySelectorAll('[data-testid^="person-name-input-"]')
        ).toHaveLength(1)
      );
      const remainingNameInputs = Array.from(
        document.querySelectorAll('[data-testid^="person-name-input-"]')
      ) as HTMLInputElement[];
      expect(remainingNameInputs[0]).toHaveValue("Bob");
    });

    it("shows missing-fields-message when a required section is cleared, without discarding the draft", async () => {
      const { id } = await seedAdr("Invalid Save ADR", "Has a context.");
      const onAdrSaved = vi.fn();

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={onAdrSaved} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      fireEvent.change(screen.getByTestId("context-and-problem-statement-textarea"), {
        target: { value: "" },
      });
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
        ...sectionsPayload("Someone else's content.", "Seed decision outcome."),
        author: "Other Author <other@example.com>",
        baseBlobSha: blobSha,
      });
      if (!otherWriterSave.ok) throw new Error("fixture setup: concurrent save unexpectedly failed");

      fireEvent.change(screen.getByTestId("context-and-problem-statement-textarea"), {
        target: { value: "My local edit." },
      });
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("conflict-message")).toBeInTheDocument());
      expect(screen.getByTestId("conflict-message").textContent).toContain(
        "Plik zmienił się od ostatniego odczytu. Odśwież i zapisz ponownie."
      );

      fireEvent.click(screen.getByTestId("reload-latest-button"));

      await waitFor(() =>
        expect(screen.getByTestId("context-and-problem-statement-textarea")).toHaveValue(
          "Someone else's content."
        )
      );
      expect(screen.getByTestId("status-select")).toHaveValue("deprecated");
    });

    it("status select offers exactly the five AdrStatus values", async () => {
      const { id } = await seedAdr("Status Options ADR", "Body.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );
      await waitFor(() => expect(screen.getByTestId("status-select")).toBeInTheDocument());

      const options = within(screen.getByTestId("status-select")).getAllByRole("option");
      const values = options.map((option) => option.textContent);
      expect(values).toEqual(
        expect.arrayContaining(["proposed", "accepted", "deprecated", "superseded", "rejected"])
      );
      expect(options).toHaveLength(5);
    });

    it("saves successfully when status is changed to rejected, with no relation required", async () => {
      const { id } = await seedAdr("Rejectable ADR", "Body before edit.");
      const onAdrSaved = vi.fn();

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={onAdrSaved} />
      );
      await waitFor(() => expect(screen.getByTestId("status-select")).toBeInTheDocument());

      fireEvent.change(screen.getByTestId("status-select"), { target: { value: "rejected" } });
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(onAdrSaved).toHaveBeenCalledTimes(1));
      expect(onAdrSaved.mock.calls[0][0].status).toBe("rejected");
      expect(screen.getByTestId("status-select")).toHaveValue("rejected");
      expect(screen.getByTestId("save-success-message")).toBeInTheDocument();
    });

    it("optional sections start collapsed and required sections start expanded", async () => {
      const { id } = await seedAdr("Initial State ADR", "Some context.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      // Required sections are expanded (aria-expanded="true")
      expect(screen.getByTestId("section-toggle-contextAndProblemStatement")).toHaveAttribute(
        "aria-expanded",
        "true"
      );
      expect(screen.getByTestId("section-toggle-decisionOutcome")).toHaveAttribute(
        "aria-expanded",
        "true"
      );
      // People is always visible, with no collapse/expand toggle at all.
      expect(screen.queryByTestId("section-toggle-people")).not.toBeInTheDocument();
      expect(screen.getByTestId("add-person-button")).toBeInTheDocument();
      // Optional sections start collapsed
      expect(screen.getByTestId("section-toggle-decisionDrivers")).toHaveAttribute(
        "aria-expanded",
        "false"
      );
      expect(screen.getByTestId("section-toggle-consideredOptions")).toHaveAttribute(
        "aria-expanded",
        "false"
      );
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

describe("firstLine", () => {
  it("returns empty string for empty input", () => {
    expect(firstLine("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(firstLine("   \n  \n")).toBe("");
  });

  it("returns the first non-blank line of multi-line input", () => {
    expect(firstLine("\n\nSecond non-blank line\nAnother line")).toBe("Second non-blank line");
  });

  it("returns the first line when it is non-blank", () => {
    expect(firstLine("First line\nSecond line")).toBe("First line");
  });

  it("returns the full line when it is exactly 80 characters", () => {
    const exactly80 = "a".repeat(80);
    expect(firstLine(exactly80)).toBe(exactly80);
  });

  it("truncates with … when the line exceeds 80 characters", () => {
    const long = "a".repeat(100);
    const result = firstLine(long);
    expect(result).toBe("a".repeat(77) + "…");
    expect(result.length).toBe(78);
  });

  it("skips leading blank lines to find the first non-blank line", () => {
    expect(firstLine("\n\n  \nActual content")).toBe("Actual content");
  });
});
