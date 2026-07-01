import type { ReactNode } from "react";

export interface CollapsibleSectionProps {
  /**
   * Stable key used to generate data-testid="section-toggle-{sectionKey}".
   * For MADR sections: the camelCase section key (e.g. "decisionDrivers").
   * For special groups: "additionalContent" | "people".
   */
  sectionKey: string;
  /** Visible title text in the header (asterisk appended internally when required). */
  title: string;
  /** When true, applies teal left-border accent and appends asterisk to title. */
  required?: boolean;
  /** Whether the body is currently visible. */
  isOpen: boolean;
  /** Called when the user clicks the header row. */
  onToggle: () => void;
  /**
   * First non-empty line of the section's current value, pre-derived by the parent.
   * Empty string → "— empty" is shown. Only rendered when isOpen=false.
   */
  preview: string;
  /** The textarea (and optional label) for this section. */
  children: ReactNode;
}

export function CollapsibleSection({
  sectionKey,
  title,
  required = false,
  isOpen,
  onToggle,
  preview,
  children,
}: CollapsibleSectionProps) {
  const wrapperClass = [
    "collapsible-section",
    required ? "collapsible-section--required" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const chevronClass = [
    "collapsible-section__chevron",
    isOpen ? "collapsible-section__chevron--open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClass}>
      <button
        className="collapsible-section__header"
        data-testid={`section-toggle-${sectionKey}`}
        aria-expanded={isOpen}
        type="button"
        onClick={onToggle}
      >
        <span
          id={`section-title-${sectionKey}`}
          className="collapsible-section__title"
        >
          {title}
          {required ? " *" : ""}
        </span>
        {!isOpen && (
          <span className="collapsible-section__preview">
            {preview !== "" ? preview : "— empty"}
          </span>
        )}
        <svg
          className={chevronClass}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="collapsible-section__body" hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}
