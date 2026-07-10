import { useState, type ReactNode } from "react";
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { AdrStatus, DerivationInput, SummarySuggestionResult } from "@adr/shared";
import { createQueryClient } from "../../state/queryClient.js";
import { createQueryWrapper } from "../../test/queryWrapper.js";
import type { ApiClient } from "../../api/client.js";
import { SummaryControl, type SummaryControlProps } from "./SummaryControl.js";

/**
 * SummaryControl owns the layer-1 author summary field, the source-ladder
 * indicator (Req 10.3 / 11 / 12), and — in edit mode only, for the last-saved
 * revision — the AI suggestion with Use this / Write my own (Req 13.3-13.4),
 * degrading quietly when the provider is unavailable (Req 13.5).
 *
 * Two test styles, mirroring `useSummarySuggestion.test.ts`: the source ladder
 * and create-mode boundary are pure; the AI cases seed a caller-owned
 * QueryClient with the design's `["summary-suggestion", id, blobSha]` key and
 * use a never-resolving stub client, so the seeded variant is what renders
 * without any real backend (the genuine offline `no-provider` fetch is already
 * proven in `useSummarySuggestion.test.ts`).
 */

const ADR_ID = "adr-1";
const BLOB_SHA = "sha-1";

/**
 * Stub `ApiClient` where only overridden methods are callable; every other
 * method throws so the component fails loudly if it reaches beyond its
 * contract (same pattern as `useSummarySuggestion.test.ts`).
 */
function makeStubClient(overrides: Partial<ApiClient>): ApiClient {
  const unexpected =
    (name: string) =>
    (): never => {
      throw new Error(`unexpected ApiClient.${name} call`);
    };
  const base = {
    createAdr: unexpected("createAdr"),
    getAdr: unexpected("getAdr"),
    updateAdr: unexpected("updateAdr"),
    getRelations: unexpected("getRelations"),
    createFolder: unexpected("createFolder"),
    moveAdr: unexpected("moveAdr"),
    getTree: unexpected("getTree"),
    getHistory: unexpected("getHistory"),
    getVersionAt: unexpected("getVersionAt"),
    getVersionDiff: unexpected("getVersionDiff"),
    compareAdrs: unexpected("compareAdrs"),
    search: unexpected("search"),
    getSimilar: unexpected("getSimilar"),
    getFeed: unexpected("getFeed"),
    getRawAdr: unexpected("getRawAdr"),
    getSummarySuggestion: unexpected("getSummarySuggestion"),
  } as unknown as ApiClient;
  return { ...base, ...overrides };
}

/** Wrapper around a caller-owned QueryClient so tests can pre-seed the cache. */
function wrapperFor(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }): JSX.Element {
    return createElement(QueryClientProvider, { client: queryClient }, children) as JSX.Element;
  };
}

/** Layer-2 derivation inputs (everything `resolveShortDescription` needs but `summary`). */
function baseDerivation(overrides: Partial<Omit<DerivationInput, "summary">> = {}): Omit<
  DerivationInput,
  "summary"
> {
  return {
    status: "proposed" as AdrStatus,
    decisionOutcome: "",
    consideredOptions: "",
    decisionDrivers: "",
    contextAndProblemStatement: "",
    date: "2026-07-09",
    relations: [],
    ...overrides,
  };
}

/** A never-resolving suggestion fetch: any rendered data must come from the seeded key. */
function neverResolvingClient(): ApiClient {
  return makeStubClient({ getSummarySuggestion: vi.fn().mockReturnValue(new Promise(() => {})) });
}

/** Seed the design's blob-sha-keyed cache with a chosen suggestion result. */
function seededClient(result: SummarySuggestionResult): {
  queryClient: QueryClient;
  apiClient: ApiClient;
} {
  const queryClient = createQueryClient();
  queryClient.setQueryData(["summary-suggestion", ADR_ID, BLOB_SHA], result);
  return { queryClient, apiClient: neverResolvingClient() };
}

/** Controlled harness lifting the summary field the way ComposePage (8.1) will. */
function Harness(
  props: Omit<SummaryControlProps, "summary" | "onSummaryChange"> & {
    initialSummary?: string;
    onSummaryChange?: (value: string) => void;
  },
) {
  const { initialSummary = "", onSummaryChange, ...rest } = props;
  const [summary, setSummary] = useState(initialSummary);
  return (
    <SummaryControl
      {...rest}
      summary={summary}
      onSummaryChange={(value) => {
        setSummary(value);
        onSummaryChange?.(value);
      }}
    />
  );
}

function summaryField(): HTMLInputElement {
  return screen.getByTestId("compose-summary-input") as HTMLInputElement;
}

describe("SummaryControl — source ladder indicator (Req 10.3, 11.2, 12)", () => {
  it("marks the source as the author's summary when the field is non-empty (layer 1)", () => {
    render(
      <SummaryControl
        summary="We standardised on Postgres for reporting."
        onSummaryChange={vi.fn()}
        derivation={baseDerivation()}
        apiClient={makeStubClient({})}
      />,
      { wrapper: createQueryWrapper() },
    );

    const indicator = screen.getByTestId("compose-summary-source");
    expect(indicator).toHaveAttribute("data-source", "summary");
    expect(screen.getByTestId("compose-summary-effective")).toHaveTextContent(
      "We standardised on Postgres for reporting.",
    );
  });

  it("marks the source as derived when the field is empty (layer 2)", () => {
    render(
      <SummaryControl
        summary=""
        onSummaryChange={vi.fn()}
        derivation={baseDerivation({
          status: "accepted",
          decisionOutcome: "Chosen option: PostgreSQL, because it fits our reporting needs",
        })}
        apiClient={makeStubClient({})}
      />,
      { wrapper: createQueryWrapper() },
    );

    const indicator = screen.getByTestId("compose-summary-source");
    expect(indicator).toHaveAttribute("data-source", "derived");
    expect(screen.getByTestId("compose-summary-effective")).toHaveTextContent(
      "We chose PostgreSQL — it fits our reporting needs",
    );
  });

  it("reports author edits and flips the indicator to the author's source (Req 11.2, 13.4)", () => {
    const onSummaryChange = vi.fn();
    render(
      <Harness
        derivation={baseDerivation({
          status: "accepted",
          decisionOutcome: "Chosen option: PostgreSQL, because it fits",
        })}
        apiClient={makeStubClient({})}
        onSummaryChange={onSummaryChange}
      />,
      { wrapper: createQueryWrapper() },
    );

    // Starts derived (empty field).
    expect(screen.getByTestId("compose-summary-source")).toHaveAttribute("data-source", "derived");

    fireEvent.change(summaryField(), { target: { value: "My own framing." } });

    expect(onSummaryChange).toHaveBeenLastCalledWith("My own framing.");
    expect(screen.getByTestId("compose-summary-source")).toHaveAttribute("data-source", "summary");
    expect(screen.getByTestId("compose-summary-effective")).toHaveTextContent("My own framing.");
  });
});

describe("SummaryControl — AI suggestion Use this (Req 13.1, 13.3)", () => {
  it("offers the labeled suggestion in edit mode and never writes it into the field on its own (Req 13.3)", () => {
    const onSummaryChange = vi.fn();
    const { queryClient, apiClient } = seededClient({ available: true, suggestion: "AI one-liner." });

    render(
      <Harness
        derivation={baseDerivation()}
        adrId={ADR_ID}
        blobSha={BLOB_SHA}
        apiClient={apiClient}
        onSummaryChange={onSummaryChange}
      />,
      { wrapper: wrapperFor(queryClient) },
    );

    // Suggestion is shown, labeled, but the field stays empty until accepted (13.3).
    expect(screen.getByTestId("compose-summary-suggestion-text")).toHaveTextContent("AI one-liner.");
    expect(summaryField().value).toBe("");
    expect(onSummaryChange).not.toHaveBeenCalled();
  });

  it("Use this copies the suggestion into the author summary field (Req 13.3)", () => {
    const onSummaryChange = vi.fn();
    const { queryClient, apiClient } = seededClient({ available: true, suggestion: "AI one-liner." });

    render(
      <Harness
        derivation={baseDerivation()}
        adrId={ADR_ID}
        blobSha={BLOB_SHA}
        apiClient={apiClient}
        onSummaryChange={onSummaryChange}
      />,
      { wrapper: wrapperFor(queryClient) },
    );

    fireEvent.click(screen.getByTestId("compose-summary-use"));

    expect(onSummaryChange).toHaveBeenCalledWith("AI one-liner.");
    // Copied into the field → now the author-owned (layer 1) source.
    expect(summaryField().value).toBe("AI one-liner.");
    expect(screen.getByTestId("compose-summary-source")).toHaveAttribute("data-source", "summary");
  });
});

describe("SummaryControl — Write my own override (Req 13.4)", () => {
  it("dismisses the suggestion and lets the author's own text stand, never copying the suggestion", () => {
    const onSummaryChange = vi.fn();
    const { queryClient, apiClient } = seededClient({ available: true, suggestion: "AI one-liner." });

    render(
      <Harness
        derivation={baseDerivation()}
        adrId={ADR_ID}
        blobSha={BLOB_SHA}
        apiClient={apiClient}
        onSummaryChange={onSummaryChange}
      />,
      { wrapper: wrapperFor(queryClient) },
    );

    fireEvent.click(screen.getByTestId("compose-summary-write-own"));

    // The AI affordance is gone (no Use this / no suggestion card).
    expect(screen.queryByTestId("compose-summary-suggestion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("compose-summary-use")).not.toBeInTheDocument();

    // The author writes their own; the suggestion text is never copied in.
    fireEvent.change(summaryField(), { target: { value: "My own words." } });
    expect(summaryField().value).toBe("My own words.");
    expect(onSummaryChange).not.toHaveBeenCalledWith("AI one-liner.");
    expect(screen.getByTestId("compose-summary-source")).toHaveAttribute("data-source", "summary");
  });
});

describe("SummaryControl — degraded / unavailable states (Req 13.5, availability boundary)", () => {
  it("omits the AI affordance in create mode (no adrId) and shows a quiet save hint", () => {
    render(
      <SummaryControl
        summary=""
        onSummaryChange={vi.fn()}
        derivation={baseDerivation()}
        apiClient={makeStubClient({})}
      />,
      { wrapper: createQueryWrapper() },
    );

    expect(screen.queryByTestId("compose-summary-suggestion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("compose-summary-use")).not.toBeInTheDocument();
    const hint = screen.getByTestId("compose-summary-ai-hint");
    expect(hint).toHaveTextContent(/save/i);
    // The ladder + field still work without AI.
    expect(screen.getByTestId("compose-summary-source")).toBeInTheDocument();
  });

  it("omits the AI affordance with a subdued hint when the provider is unavailable (no-provider, 13.5)", () => {
    const { queryClient, apiClient } = seededClient({ available: false, reason: "no-provider" });

    render(
      <SummaryControl
        summary=""
        onSummaryChange={vi.fn()}
        derivation={baseDerivation()}
        adrId={ADR_ID}
        blobSha={BLOB_SHA}
        apiClient={apiClient}
      />,
      { wrapper: wrapperFor(queryClient) },
    );

    expect(screen.queryByTestId("compose-summary-suggestion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("compose-summary-use")).not.toBeInTheDocument();
    // No error thrown; a subdued hint stands in for the missing affordance.
    expect(screen.getByTestId("compose-summary-ai-hint")).toBeInTheDocument();
    // The deterministic ladder still resolves the short description.
    expect(screen.getByTestId("compose-summary-source")).toHaveAttribute("data-source", "derived");
  });
});
