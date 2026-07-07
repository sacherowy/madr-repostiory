import { beforeEach, describe, expect, it } from "vitest";
import { type PortalView, usePortalStore } from "./portalStore.js";

/** Read the current view (vanilla getState, no React render needed). */
function view(): PortalView {
  return usePortalStore.getState().view;
}

describe("portalStore", () => {
  // Each test starts from the documented initial state. The PortalState
  // contract has no reset() action, so test isolation uses setState directly.
  beforeEach(() => {
    usePortalStore.setState({ view: { kind: "home" }, authorName: "" });
  });

  // Req 2.1: Home is the application's default landing view.
  it("defaults to the Home view with an empty author name", () => {
    expect(view()).toEqual({ kind: "home" });
    expect(usePortalStore.getState().authorName).toBe("");
  });

  // Design contract: navigate() reaches every member of the view union.
  it("navigate transitions to each portal destination", () => {
    const store = usePortalStore.getState();

    store.navigate({ kind: "topics" });
    expect(view()).toEqual({ kind: "topics" });

    store.navigate({ kind: "topic", path: "platform/storage" });
    expect(view()).toEqual({ kind: "topic", path: "platform/storage" });

    store.navigate({ kind: "people" });
    expect(view()).toEqual({ kind: "people" });

    store.navigate({ kind: "person", name: "Ada Lovelace" });
    expect(view()).toEqual({ kind: "person", name: "Ada Lovelace" });

    store.navigate({ kind: "compose" });
    expect(view()).toEqual({ kind: "compose" });

    store.navigate({ kind: "compose", id: "ADR-0007" });
    expect(view()).toEqual({ kind: "compose", id: "ADR-0007" });

    store.navigate({ kind: "home" });
    expect(view()).toEqual({ kind: "home" });
  });

  // Design note: opening a decision always starts in the plain-language
  // article, never in Technical view.
  it("navigating to a decision starts with technical:false", () => {
    usePortalStore
      .getState()
      .navigate({ kind: "decision", id: "ADR-0007", technical: false });
    expect(view()).toEqual({
      kind: "decision",
      id: "ADR-0007",
      technical: false,
    });
  });

  // Pinned invariant: navigate() normalizes decision entry to technical:false
  // even if a caller passes technical:true — toggleTechnicalView is the only
  // way into Technical view.
  it("navigate normalizes a decision view to technical:false", () => {
    usePortalStore
      .getState()
      .navigate({ kind: "decision", id: "ADR-0007", technical: true });
    expect(view()).toEqual({
      kind: "decision",
      id: "ADR-0007",
      technical: false,
    });
  });

  // Req 5.1: the session author-name field feeds the attention digest.
  it("setAuthorName records the session author name", () => {
    usePortalStore.getState().setAuthorName("Ada Lovelace");
    expect(usePortalStore.getState().authorName).toBe("Ada Lovelace");
  });

  // Req 7.x / design note: the technical flag toggles on the decision view.
  it("toggleTechnicalView flips the technical flag in the decision view", () => {
    const store = usePortalStore.getState();
    store.navigate({ kind: "decision", id: "ADR-0007", technical: false });

    usePortalStore.getState().toggleTechnicalView();
    expect(view()).toEqual({
      kind: "decision",
      id: "ADR-0007",
      technical: true,
    });

    usePortalStore.getState().toggleTechnicalView();
    expect(view()).toEqual({
      kind: "decision",
      id: "ADR-0007",
      technical: false,
    });
  });

  // Pinned design decision: outside the decision view toggleTechnicalView is a
  // total-function no-op — it neither throws nor changes any state.
  it("toggleTechnicalView is a no-op outside the decision view", () => {
    const nonDecisionViews: PortalView[] = [
      { kind: "home" },
      { kind: "topics" },
      { kind: "topic", path: "platform" },
      { kind: "people" },
      { kind: "person", name: "Ada Lovelace" },
      { kind: "compose" },
      { kind: "compose", id: "ADR-0007" },
    ];
    usePortalStore.getState().setAuthorName("Ada Lovelace");

    for (const target of nonDecisionViews) {
      usePortalStore.getState().navigate(target);
      expect(() => usePortalStore.getState().toggleTechnicalView()).not.toThrow();
      expect(view()).toEqual(target);
      expect(usePortalStore.getState().authorName).toBe("Ada Lovelace");
    }
  });
});
