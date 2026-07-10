import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import type { FeedCard as FeedCardModel } from "@adr/shared";
// Same relative-path device as HomePage.test.tsx/TopicsPage.test.tsx: @adr/api
// has no `exports` field, so it is reached via a relative path into its `src/`
// for test-only use inside the pnpm workspace. features/people sits at the same
// depth as features/topics, so the `../` depth matches those specs exactly.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { createQueryWrapper } from "../../test/queryWrapper.js";
import {
  PeoplePage,
  derivePeople,
  filterCardsForPerson,
  normalizePersonKey,
} from "./PeoplePage.js";

const AUTHOR = "Test Author <test@example.com>";
const NOW = new Date("2026-07-08T12:00:00Z");

/** Minimal FeedCard for the pure-helper unit tests (no backend needed). */
function card(
  id: string,
  people: {
    decisionMakers?: string[];
    consulted?: string[];
    informed?: string[];
  }
): FeedCardModel {
  return {
    id,
    title: `Decision ${id}`,
    status: "proposed",
    path: `${id}.md`,
    topic: "",
    date: "2026-01-01",
    decisionMakers: people.decisionMakers ?? [],
    consulted: people.consulted ?? [],
    informed: people.informed ?? [],
    shortDescription: { text: `About ${id}.`, source: "derived" },
  };
}

describe("people projection helpers (pure)", () => {
  it("normalizes a name by trimming whitespace and lowercasing (Req 4.3)", () => {
    expect(normalizePersonKey("  Marta  ")).toBe("marta");
    expect(normalizePersonKey("MARTA")).toBe("marta");
    expect(normalizePersonKey("marta")).toBe("marta");
  });

  it("lists each distinct person appearing in any of the three roles (Req 4.1)", () => {
    const cards = [
      card("A", { decisionMakers: ["Ada"], consulted: ["Bo"] }),
      card("B", { informed: ["Cleo"] }),
    ];
    const people = derivePeople(cards);
    expect(people.map((p) => p.name).sort()).toEqual(["Ada", "Bo", "Cleo"]);
  });

  it("groups people by a case-insensitive, whitespace-trimmed match (Req 4.3)", () => {
    // "Marta", " marta ", and "MARTA" are the same person across two decisions
    // and two roles — they must collapse to exactly one directory entry.
    const cards = [
      card("A", { decisionMakers: ["Marta"] }),
      card("B", { consulted: [" marta "], informed: ["MARTA"] }),
    ];
    const people = derivePeople(cards);
    expect(people).toHaveLength(1);
    expect(people[0]?.key).toBe("marta");
    // The display name is the first-seen trimmed original spelling.
    expect(people[0]?.name).toBe("Marta");
    // The count is the number of distinct decisions the person appears on, not
    // the number of role occurrences (A and B → 2, not 3).
    expect(people[0]?.count).toBe(2);
  });

  it("counts a person's decisions once even when they hold multiple roles on it", () => {
    const cards = [card("A", { decisionMakers: ["Ada"], consulted: ["Ada"] })];
    const people = derivePeople(cards);
    expect(people).toHaveLength(1);
    expect(people[0]?.count).toBe(1);
  });

  it("selects the decisions where a person appears in ANY role, by normalized key (Req 4.2)", () => {
    const cards = [
      card("A", { decisionMakers: ["Marta"] }),
      card("B", { consulted: [" MARTA "] }),
      card("C", { informed: ["Someone else"] }),
    ];
    // Marta owns A and is consulted on B; the case/whitespace variants still match.
    expect(filterCardsForPerson(cards, "marta").map((c) => c.id)).toEqual(["A", "B"]);
    expect(filterCardsForPerson(cards, "someone else").map((c) => c.id)).toEqual(["C"]);
  });
});

describe("PeoplePage (real backend)", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "people-page-"));
    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig("user.name", "Test Author");
    await git.addConfig("user.email", "test@example.com");
    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "" },
    });
    await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);
    app = await buildServer(container);
    const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    client = createApiClient(baseUrl);
  });

  afterEach(async () => {
    cleanup();
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  /**
   * Create an ADR and save it through the update path so its people fields
   * (Decision owner / Input from / Kept informed) are persisted and surface on
   * the feed card. The feed endpoint returns decisionMakers/consulted/informed
   * on each card, which the People directory projects over.
   */
  async function seedAdr(opts: {
    title: string;
    decisionMakers?: string[];
    consulted?: string[];
    informed?: string[];
  }): Promise<{ id: string }> {
    const created = await client.createAdr({ title: opts.title, folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    const saved = await client.updateAdr(created.adr.id, {
      title: opts.title,
      status: "proposed",
      date: created.adr.date,
      decisionMakers: opts.decisionMakers ?? [],
      consulted: opts.consulted ?? [],
      informed: opts.informed ?? [],
      contextAndProblemStatement: "Context and problem statement text.",
      decisionOutcome: "We proceed for now.",
      decisionDrivers: "",
      consideredOptions: "",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      author: AUTHOR,
      baseBlobSha: created.adr.blobSha,
    });
    if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");
    return { id: created.adr.id };
  }

  function renderPeople(props?: Partial<React.ComponentProps<typeof PeoplePage>>) {
    const onSelectPerson = props?.onSelectPerson ?? vi.fn();
    const onOpenDecision = props?.onOpenDecision ?? vi.fn();
    render(
      <PeoplePage
        apiClient={client}
        onSelectPerson={onSelectPerson}
        onOpenDecision={onOpenDecision}
        now={NOW}
        {...props}
      />,
      { wrapper: createQueryWrapper() }
    );
    return { onSelectPerson, onOpenDecision };
  }

  it("lists each distinct person across owner/input/informed roles (Req 4.1)", async () => {
    await seedAdr({ title: "Adopt event sourcing", decisionMakers: ["Ada Lovelace"] });
    await seedAdr({ title: "Standardize on PostgreSQL", consulted: ["Bo Katan"] });
    await seedAdr({ title: "Retire the monolith", informed: ["Cleo North"] });

    renderPeople();

    await waitFor(() =>
      expect(screen.getByTestId("person-item-ada lovelace")).toBeInTheDocument()
    );
    expect(screen.getByTestId("person-item-bo katan")).toBeInTheDocument();
    expect(screen.getByTestId("person-item-cleo north")).toBeInTheDocument();
    // Each distinct person appears exactly once.
    expect(screen.getAllByTestId(/^person-item-/)).toHaveLength(3);
  });

  it("groups name variants into a single person by normalized name (Req 4.3)", async () => {
    // The same human named three different ways across roles and decisions.
    await seedAdr({ title: "First decision", decisionMakers: ["Marta"] });
    await seedAdr({ title: "Second decision", consulted: [" marta "], informed: ["MARTA"] });

    renderPeople();

    await waitFor(() => expect(screen.getByTestId("person-item-marta")).toBeInTheDocument());
    // Exactly one entry despite three spellings across two decisions.
    expect(screen.getAllByTestId(/^person-item-/)).toHaveLength(1);
    // Display is the first-seen trimmed original spelling ("Marta").
    expect(screen.getByTestId("person-item-marta")).toHaveTextContent("Marta");
    // The count reflects both decisions the person is involved in.
    expect(screen.getByTestId("person-item-marta")).toHaveTextContent("2");
  });

  it("shows a person's decisions across any role when selected (Req 4.2)", async () => {
    await seedAdr({ title: "Owned by Marta", decisionMakers: ["Marta"] });
    await seedAdr({ title: "Marta consulted", consulted: [" MARTA "] });
    await seedAdr({ title: "Not Marta at all", decisionMakers: ["Someone Else"] });

    renderPeople({ selectedPerson: "marta" });

    // Both the owned and the consulted-on decision appear (matched case-insensitively).
    await waitFor(() => expect(screen.getByText("Owned by Marta")).toBeInTheDocument());
    expect(screen.getByText("Marta consulted")).toBeInTheDocument();
    // A decision that does not involve Marta is excluded.
    expect(screen.queryByText("Not Marta at all")).not.toBeInTheDocument();
  });

  it("navigates into a person when their list entry is selected (Req 4.1 → 4.2 wiring)", async () => {
    await seedAdr({ title: "Owned by Ada", decisionMakers: ["Ada Lovelace"] });
    const onSelectPerson = vi.fn();
    renderPeople({ onSelectPerson });

    await waitFor(() =>
      expect(screen.getByTestId("person-item-ada lovelace")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("person-item-ada lovelace"));
    // Navigation carries the normalized key so the per-person view resolves it.
    expect(onSelectPerson).toHaveBeenCalledWith("ada lovelace");
  });

  it("opens a decision from within a person's feed (Req 2.6 pattern reused)", async () => {
    const { id } = await seedAdr({ title: "Owned by Ada", decisionMakers: ["Ada Lovelace"] });
    const onOpenDecision = vi.fn();
    renderPeople({ selectedPerson: "ada lovelace", onOpenDecision });

    await waitFor(() => expect(screen.getByText("Owned by Ada")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Owned by Ada/i }));
    expect(onOpenDecision).toHaveBeenCalledWith(id);
  });

  it("shows an inviting empty state when a selected person has no decisions", async () => {
    await seedAdr({ title: "Owned by Ada", decisionMakers: ["Ada Lovelace"] });

    // A normalized key that matches nobody renders the empty per-person state.
    renderPeople({ selectedPerson: "nobody here" });

    await waitFor(() => expect(screen.getByTestId("person-empty")).toBeInTheDocument());
    expect(screen.getByTestId("person-empty")).toHaveTextContent(/no decisions/i);
  });

  it("shows an inviting empty state when there are no people at all", async () => {
    // A decision with no people named still yields no directory entries.
    await seedAdr({ title: "Nobody assigned" });

    renderPeople();

    await waitFor(() => expect(screen.getByTestId("people-empty")).toBeInTheDocument());
    const empty = screen.getByTestId("people-empty");
    expect(within(empty).getByText(/no people/i)).toBeInTheDocument();
  });
});
