import type { ChangeEvent } from "react";
import "../styles/portal.css";

/** The three top-level portal destinations reflected by the nav. */
export type TopNavDestination = "home" | "topics" | "people";

export interface TopNavProps {
  /**
   * The currently-active destination, so the nav can mark it as the current
   * page. `undefined` when no destination is active (e.g. a decision article or
   * the compose form), in which case none is marked current.
   */
  active?: TopNavDestination;
  /** Navigate to the Home decision feed. */
  onNavigateHome: () => void;
  /** Navigate to the Topics destination. */
  onNavigateTopics: () => void;
  /** Navigate to the People destination. */
  onNavigatePeople: () => void;
  /** Current session author-name value (free text; drives personalization). */
  authorName: string;
  /** Fired with the new value as the author edits the name field. */
  onAuthorNameChange: (name: string) => void;
  /** Fired when the New decision action is activated (opens the compose form). */
  onNewDecision: () => void;
}

interface DestinationSpec {
  key: TopNavDestination;
  label: string;
}

const DESTINATIONS: DestinationSpec[] = [
  { key: "home", label: "Home" },
  { key: "topics", label: "Topics" },
  { key: "people", label: "People" },
];

/**
 * Top navigation for the portal shell (design.md `TopNav`): the Home / Topics /
 * People destinations, the session author-name field, and a New decision
 * action. It reflects which destination is active via `aria-current="page"` (no
 * client-side router — Req 15.5 — navigation is store-driven view switching wired
 * by a later task).
 *
 * Purely presentational: it accepts props and fires callbacks; it never imports
 * the portal store or fetches data, so it is unit-testable in isolation and the
 * store wiring stays the single responsibility of task 8.1.
 */
export function TopNav({
  active,
  onNavigateHome,
  onNavigateTopics,
  onNavigatePeople,
  authorName,
  onAuthorNameChange,
  onNewDecision,
}: TopNavProps) {
  const handlers: Record<TopNavDestination, () => void> = {
    home: onNavigateHome,
    topics: onNavigateTopics,
    people: onNavigatePeople,
  };

  return (
    <nav className="top-nav" data-testid="top-nav" aria-label="Primary">
      <span className="top-nav__brand">Decisions</span>

      <div className="top-nav__destinations">
        {DESTINATIONS.map(({ key, label }) => {
          const isActive = active === key;
          const classes = ["top-nav__link", isActive ? "is-active" : null]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={key}
              type="button"
              className={classes}
              data-testid={`top-nav-${key}`}
              aria-current={isActive ? "page" : undefined}
              onClick={handlers[key]}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="top-nav__author">
        <label className="top-nav__author-label" htmlFor="top-nav-author">
          Your name
        </label>
        <input
          id="top-nav-author"
          className="field__input top-nav__author-input"
          type="text"
          data-testid="top-nav-author"
          placeholder="Add your name"
          value={authorName}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onAuthorNameChange(event.target.value)}
        />
      </div>

      <button
        type="button"
        className="btn btn--primary top-nav__new"
        data-testid="top-nav-new"
        onClick={onNewDecision}
      >
        New decision
      </button>
    </nav>
  );
}
