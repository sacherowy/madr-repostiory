import type { Aspect } from "../state/workspaceStore.js";

/** Aspects that may carry a meaningful count (everything except Edit, Req 2.4). */
type CountableAspect = Exclude<Aspect, "editor">;

export interface AspectSwitcherProps {
  /** The currently active aspect; exactly one control is marked active (Req 2.3). */
  activeAspect: Aspect;
  /**
   * Live counts per countable aspect. A key is present only "where available"
   * (Req 2.4); an absent key renders no count, a present key (including 0) renders one.
   */
  counts: Partial<Record<CountableAspect, number>>;
  /** Reports the activated aspect (Req 2.3). */
  onSelectAspect: (aspect: Aspect) => void;
}

/** A single aspect control: its aspect, human label, and migrated test hook. */
interface AspectControl {
  aspect: Aspect;
  label: string;
  /** Migrated `panel-tab-*` hook from the old global tab bar (Req 11.1). */
  testId: string;
}

/**
 * The four contextual aspects in display order. Comparison is deliberately absent
 * — it is exposed as an action elsewhere, not as an aspect (Req 2.5). The "editor"
 * aspect keeps the `panel-tab-editor` hook and "similar" keeps `panel-tab-similarity`,
 * matching the legacy keys so the navigation tests stay stable (Hook Migration Map).
 */
const ASPECT_CONTROLS: readonly AspectControl[] = [
  { aspect: "editor", label: "Edit", testId: "panel-tab-editor" },
  { aspect: "relations", label: "Relations", testId: "panel-tab-relations" },
  { aspect: "history", label: "History", testId: "panel-tab-history" },
  { aspect: "similar", label: "Similar", testId: "panel-tab-similarity" },
];

/** Type guard: a countable aspect is any aspect other than "editor". */
function isCountable(aspect: Aspect): aspect is CountableAspect {
  return aspect !== "editor";
}

/**
 * Contextual aspect switcher replacing the old global tab bar (Req 2.1, 2.3, 11.1).
 *
 * Renders exactly four controls — Edit, Relations, History, Similar — as a labeled
 * `role="tablist"` of `role="tab"` controls (Req 9.2, 9.3), carrying the migrated
 * `panel-tab-*` test hooks. The active aspect is marked via `aria-selected`,
 * `aria-current`, and the `.tab--active` class. A count renders beside a countable
 * aspect only when its key is present in `counts` (Req 2.4 "where available"); Edit
 * never shows a count. There is no Comparison control (Req 2.5).
 *
 * Gating ("not shown when no ADR is selected", Req 2.2) is the App's responsibility:
 * App mounts this only with a non-null `activeAspect`, so this component always
 * renders its four controls when mounted.
 */
export function AspectSwitcher({
  activeAspect,
  counts,
  onSelectAspect,
}: AspectSwitcherProps) {
  return (
    <div
      className="tab-bar aspect-switcher"
      role="tablist"
      aria-label="ADR aspects"
    >
      {ASPECT_CONTROLS.map(({ aspect, label, testId }) => {
        const isActive = aspect === activeAspect;
        const count = isCountable(aspect) ? counts[aspect] : undefined;

        return (
          <button
            key={aspect}
            type="button"
            role="tab"
            data-testid={testId}
            className={`tab${isActive ? " tab--active" : ""}`}
            aria-selected={isActive}
            aria-current={isActive ? "true" : undefined}
            onClick={() => onSelectAspect(aspect)}
          >
            {label}
            {count !== undefined ? (
              <span className="tab__count">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
