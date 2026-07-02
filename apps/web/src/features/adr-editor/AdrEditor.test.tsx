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
import type { Adr, UpdateAdrRequest } from "@adr/shared";
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { AdrEditor, firstLine } from "./AdrEditor.js";

const AUTHOR = "Test Author <test@example.com>";

function notImplemented(): never {
  throw new Error("not implemented in this fake ApiClient");
}

/**
 * Minimal in-memory `ApiClient` double, used only by the load test below.
 * `options.ts` (out of this task's boundary) serializes
 * `prosAndConsOfTheOptions` with a `**{description}**` bold-text line per
 * option rather than an ATX heading, specifically so it does not collide
 * with `packages/core`'s `splitSections` (see research.md's "`### {description}`
 * heading replaced with `**{description}**` bold text" amendment) -- an
 * earlier `### {description}` grammar used to get diverted into
 * `additionalContent` by `splitSections`'s global heading scan on a real
 * git-backed re-read. That collision is fixed now, but this fixture-based
 * double is kept here too (independent of that fix) to isolate the load-only
 * assertions below from needing a full seed-and-refetch round trip through
 * the real backend, orthogonal to `EditAdrForm`'s own load/save row-wiring
 * this task owns (Requirements 3.4, 3.5).
 */
function createFakeApiClient(initial: Adr): ApiClient {
  let current = initial;
  return {
    createAdr: notImplemented,
    async getAdr(id: string) {
      if (id !== current.id) return { ok: false, status: 404 };
      return { ok: true, adr: current };
    },
    async updateAdr(id: string, body: UpdateAdrRequest) {
      if (id !== current.id) return { ok: false, status: 404, kind: "notFound" };
      current = {
        ...current,
        title: body.title,
        status: body.status,
        date: body.date,
        decisionMakers: body.decisionMakers,
        consulted: body.consulted,
        informed: body.informed,
        tags: body.tags,
        relations: body.relations,
        contextAndProblemStatement: body.contextAndProblemStatement,
        decisionDrivers: body.decisionDrivers,
        consideredOptions: body.consideredOptions,
        decisionOutcome: body.decisionOutcome,
        consequences: body.consequences,
        confirmation: body.confirmation,
        prosAndConsOfTheOptions: body.prosAndConsOfTheOptions,
        moreInformation: body.moreInformation,
        additionalContent: body.additionalContent,
        blobSha: `${current.blobSha}-1`,
      };
      return { ok: true, adr: current };
    },
    getRelations: notImplemented,
    createFolder: notImplemented,
    moveAdr: notImplemented,
    getTree: notImplemented,
    getHistory: notImplemented,
    getVersionAt: notImplemented,
    getVersionDiff: notImplemented,
    compareAdrs: notImplemented,
    search: notImplemented,
    getSimilar: notImplemented,
  };
}

function makeFakeAdrFixture(overrides: Partial<Adr>): Adr {
  return {
    id: "adr-fake-options",
    title: "Options ADR",
    status: "accepted",
    date: "2026-01-01",
    tags: [],
    decisionMakers: [],
    consulted: [],
    informed: [],
    relations: [],
    contextAndProblemStatement: "Body content.",
    decisionDrivers: "",
    consideredOptions: "",
    decisionOutcome: "Seed decision outcome.",
    consequences: "",
    confirmation: "",
    prosAndConsOfTheOptions: "",
    moreInformation: "",
    additionalContent: "",
    path: "decisions/adr-fake-options-adr.md",
    blobSha: "fake-sha-0",
    ...overrides,
  };
}

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

    it("renders the six remaining generic MADR section textareas in canonical order plus the additional-content textarea, with required ones marked", async () => {
      const { id } = await seedAdr("Sectioned ADR", "Context content.");

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={vi.fn()} />
      );
      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());

      // consideredOptions/prosAndConsOfTheOptions are no longer rendered as generic
      // textareas — they're merged into the structured Options editor (asserted below).
      const expectedOrder = [
        "context-and-problem-statement-textarea",
        "decision-drivers-textarea",
        "decision-outcome-textarea",
        "consequences-textarea",
        "confirmation-textarea",
        "more-information-textarea",
      ];
      for (const testId of expectedOrder) {
        expect(screen.getByTestId(testId)).toBeInTheDocument();
      }
      expect(screen.queryByTestId("considered-options-textarea")).not.toBeInTheDocument();
      expect(screen.queryByTestId("pros-and-cons-of-the-options-textarea")).not.toBeInTheDocument();
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

      // The structured Options section sits between Decision Drivers and Decision Outcome.
      const optionsTogglePosition = document.body.innerHTML.indexOf(
        'data-testid="section-toggle-options"'
      );
      expect(optionsTogglePosition).toBeGreaterThan(
        document.body.innerHTML.indexOf('data-testid="decision-drivers-textarea"')
      );
      expect(optionsTogglePosition).toBeLessThan(
        document.body.innerHTML.indexOf('data-testid="decision-outcome-textarea"')
      );

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

    it("loads and displays the real saved considered-options/pros-and-cons content as option rows", async () => {
      const fixture = makeFakeAdrFixture({
        consideredOptions: "* Option A\n* Option B",
        prosAndConsOfTheOptions:
          "**Option A**\n* Good, because Fast\n* Bad, because Costly\n\n**Option B**\n* Good, because Cheap",
      });
      const fakeClient = createFakeApiClient(fixture);

      render(
        <AdrEditor
          adrId={fixture.id}
          folder={null}
          authorName={AUTHOR}
          apiClient={fakeClient}
          onAdrSaved={vi.fn()}
        />
      );

      await waitFor(() => expect(screen.getByTestId("section-toggle-options")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("section-toggle-options"));

      await waitFor(() =>
        expect(
          document.querySelectorAll('[data-testid^="option-description-input-"]')
        ).toHaveLength(2)
      );

      const descriptionInputs = Array.from(
        document.querySelectorAll('[data-testid^="option-description-input-"]')
      ) as HTMLInputElement[];
      const prosTextareas = Array.from(
        document.querySelectorAll('[data-testid^="option-pros-textarea-"]')
      ) as HTMLTextAreaElement[];
      const consTextareas = Array.from(
        document.querySelectorAll('[data-testid^="option-cons-textarea-"]')
      ) as HTMLTextAreaElement[];

      expect(descriptionInputs.map((input) => input.value)).toEqual(["Option A", "Option B"]);
      expect(prosTextareas.map((textarea) => textarea.value)).toEqual(["Fast", "Cheap"]);
      expect(consTextareas.map((textarea) => textarea.value)).toEqual(["Costly", ""]);
    });

    it("saves edited option rows and calls the API with correctly re-serialized consideredOptions/prosAndConsOfTheOptions", async () => {
      // Uses the real Fastify+git backend (like the rest of this describe block) --
      // unlike the load test above, this one only asserts on the payload the API
      // was called with (via onAdrSaved's immediate response), which does not
      // round-trip prosAndConsOfTheOptions back through a fresh git read/parse, so
      // it isn't affected by the out-of-boundary splitSections defect noted above.
      const { id } = await seedAdr("Editable Options ADR", "Body before edit.");
      const onAdrSaved = vi.fn();

      render(
        <AdrEditor adrId={id} folder={null} authorName={AUTHOR} apiClient={client} onAdrSaved={onAdrSaved} />
      );
      await waitFor(() => expect(screen.getByTestId("section-toggle-options")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("section-toggle-options"));

      fireEvent.click(screen.getByTestId("add-option-button"));
      fireEvent.click(screen.getByTestId("add-option-button"));

      const descriptionInputs = Array.from(
        document.querySelectorAll('[data-testid^="option-description-input-"]')
      ) as HTMLInputElement[];
      const prosTextareas = Array.from(
        document.querySelectorAll('[data-testid^="option-pros-textarea-"]')
      ) as HTMLTextAreaElement[];
      const consTextareas = Array.from(
        document.querySelectorAll('[data-testid^="option-cons-textarea-"]')
      ) as HTMLTextAreaElement[];
      expect(descriptionInputs).toHaveLength(2);

      fireEvent.change(descriptionInputs[0], { target: { value: "Option One" } });
      fireEvent.change(prosTextareas[0], { target: { value: "Fast" } });
      fireEvent.change(consTextareas[0], { target: { value: "Expensive" } });

      fireEvent.change(descriptionInputs[1], { target: { value: "Option Two" } });
      fireEvent.change(prosTextareas[1], { target: { value: "Cheap" } });
      // consTextareas[1] left blank on purpose.

      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(onAdrSaved).toHaveBeenCalledTimes(1));
      const savedAdr = onAdrSaved.mock.calls[0][0];
      expect(savedAdr.consideredOptions).toBe("* Option One\n* Option Two");
      expect(savedAdr.prosAndConsOfTheOptions).toBe(
        "**Option One**\n* Good, because Fast\n* Bad, because Expensive\n\n**Option Two**\n* Good, because Cheap"
      );

      const refetched = await client.getAdr(id);
      if (!refetched.ok) throw new Error("expected getAdr to succeed");
      expect(refetched.adr.consideredOptions).toBe("* Option One\n* Option Two");
      expect(refetched.adr.prosAndConsOfTheOptions).toBe(
        "**Option One**\n* Good, because Fast\n* Bad, because Expensive\n\n**Option Two**\n* Good, because Cheap"
      );
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
      expect(screen.getByTestId("section-toggle-options")).toHaveAttribute(
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
