import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import type { SearchHit } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { CommandPalette } from "./CommandPalette.js";

// Backend-free stub: CommandPalette is composition-only and never calls the
// ApiClient itself — only the mounted SearchPanel calls `apiClient.search(q)`.
// A stub returning canned hits ({ ok: true, hits: [{ id, score }] }) lets us
// drive the real SearchPanel (fill query → submit → click result) and observe
// the palette's selection wiring without a live Fastify backend.
function stubApiClient(hits: SearchHit[]): ApiClient {
  const notUsed = () => {
    throw new Error("CommandPalette stub: this ApiClient method must not be called");
  };
  return {
    search: vi.fn(async (_q: string) => ({ ok: true as const, hits })),
    createAdr: notUsed,
    getAdr: notUsed,
    updateAdr: notUsed,
    getRelations: notUsed,
    createFolder: notUsed,
    moveAdr: notUsed,
    getTree: notUsed,
    getHistory: notUsed,
    getVersionAt: notUsed,
    getVersionDiff: notUsed,
    compareAdrs: notUsed,
    getSimilar: notUsed,
  } as unknown as ApiClient;
}

function renderPalette(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const props = {
    open: true,
    apiClient: stubApiClient([]),
    onClose: vi.fn(),
    onSelectAdr: vi.fn(),
    onNewAdr: vi.fn(),
    onCompare: vi.fn(),
    ...overrides,
  };
  render(<CommandPalette {...props} />);
  return props;
}

describe("CommandPalette", () => {
  afterEach(() => cleanup());

  it("renders nothing while closed (req 4.1)", () => {
    renderPalette({ open: false });
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("renders an accessible dialog when open and moves focus to the search query field (req 4.1, 9.2, 9.3)", () => {
    renderPalette({ open: true });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName();
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();

    expect(screen.getByTestId("search-query-input")).toHaveFocus();
  });

  it("the New ADR action calls onNewAdr then onClose (req 4.4, 4.5)", () => {
    const props = renderPalette();
    fireEvent.click(screen.getByTestId("command-action-new"));
    expect(props.onNewAdr).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSelectAdr).not.toHaveBeenCalled();
  });

  it("the Compare action calls onCompare then onClose (req 4.4, 4.5)", () => {
    const props = renderPalette();
    fireEvent.click(screen.getByTestId("command-action-compare"));
    expect(props.onCompare).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSelectAdr).not.toHaveBeenCalled();
  });

  it("the Focus search action focuses the query field and does NOT close (req 4.4)", () => {
    const props = renderPalette();
    const input = screen.getByTestId("search-query-input");
    input.blur();
    fireEvent.click(screen.getByTestId("command-action-focus-search"));
    expect(input).toHaveFocus();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("pressing Escape closes the palette without changing selection (req 4.6)", () => {
    const props = renderPalette();
    fireEvent.keyDown(screen.getByTestId("command-palette"), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSelectAdr).not.toHaveBeenCalled();
  });

  it("clicking the overlay/backdrop closes the palette without changing selection (req 4.6)", () => {
    const props = renderPalette();
    fireEvent.click(screen.getByTestId("command-palette-overlay"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSelectAdr).not.toHaveBeenCalled();
  });

  it("clicking inside the dialog panel does NOT dismiss the palette (req 4.6)", () => {
    const props = renderPalette();
    fireEvent.click(screen.getByRole("dialog"));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("selecting a search result calls onSelectAdr(id) and closes the palette (req 4.3)", async () => {
    const hits: SearchHit[] = [{ id: "0007", score: 4.2 }];
    const props = renderPalette({ apiClient: stubApiClient(hits) });

    fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "anything" } });
    fireEvent.submit(screen.getByTestId("search-form"));

    await waitFor(() => expect(screen.getByTestId("search-result-0007")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-result-0007"));

    expect(props.onSelectAdr).toHaveBeenCalledWith("0007");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
