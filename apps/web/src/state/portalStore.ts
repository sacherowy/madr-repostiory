import type { AdrId } from "@adr/shared";
import { create } from "zustand";

/**
 * Discriminated union of every portal destination. There is no client-side
 * router (Req 15.5): this union IS the navigation model, and the App shell
 * switches over `view.kind`.
 */
export type PortalView =
  | { kind: "home" }
  | { kind: "topics" }
  | { kind: "topic"; path: string }
  | { kind: "people" }
  | { kind: "person"; name: string }
  | { kind: "decision"; id: AdrId; technical: boolean }
  | { kind: "compose"; id?: AdrId }; // id absent = create

/**
 * Cross-view UI state without a router. Persistence is in-memory; server
 * state stays in TanStack Query. `authorName` is the session author-name
 * feeding the "Needs your attention" digest (Req 5.1).
 */
export interface PortalState {
  view: PortalView;
  authorName: string;
  navigate(view: PortalView): void;
  setAuthorName(name: string): void;
  /** Only meaningful in the decision view; a no-op everywhere else. */
  toggleTechnicalView(): void;
}

/**
 * Typed Zustand store for portal navigation state.
 *
 * Framework-light: imports only Zustand's `create`, so it is unit-testable in
 * isolation and importable by any view without prop-drilling. The default
 * view is Home (Req 2.1).
 */
export const usePortalStore = create<PortalState>((set) => ({
  view: { kind: "home" },
  authorName: "",

  // Opening a decision always lands on the plain-language article: decision
  // views are normalized to technical:false, so toggleTechnicalView is the
  // only way into Technical view.
  navigate: (view) =>
    set({
      view: view.kind === "decision" ? { ...view, technical: false } : view,
    }),

  setAuthorName: (name) => set({ authorName: name }),

  // Total function by design: outside the decision view this is a no-op
  // rather than a guard/throw, so callers never need to pre-check the kind.
  toggleTechnicalView: () =>
    set((prev) =>
      prev.view.kind === "decision"
        ? { view: { ...prev.view, technical: !prev.view.technical } }
        : prev,
    ),
}));
