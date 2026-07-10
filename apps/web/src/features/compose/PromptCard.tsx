import { useId } from "react";
import type { AdrSections } from "@adr/shared";
import "../../styles/compose.css";

export interface PromptCardProps {
  /** The MADR section this card authors; drives the stable test/DOM ids. */
  sectionKey: keyof AdrSections;
  /** Plain-language heading shown to the author (Req 8.1). */
  friendlyName: string;
  /** Canonical MADR heading, kept verbatim for the subtle tag (Req 8.1). */
  canonicalHeading: string;
  /** Guiding helper text under the heading (Req 8.1). */
  helperText: string;
  /** Example placeholder shown inside the empty field (Req 8.1). */
  placeholder: string;
  /** Controlled field value. */
  value: string;
  /** Reports the field's new value on every edit. */
  onChange: (value: string) => void;
  /** Marks the section as required (context is the only required prompt card). */
  required?: boolean;
}

/**
 * Friendly prompt-card section for the compose form (design.md File Structure
 * Plan → `features/compose/PromptCard.tsx`; Req 8.1).
 *
 * Each MADR section is presented as a card with a plain-language heading, helper
 * text, and an example placeholder, while the canonical MADR heading rides along
 * as a subtle tag ("saved as MADR: <heading>", per the approved Concept A
 * proposal's compose form). Pure and presentational: the card owns no state — its
 * value/onChange are controlled by {@link ComposePage} so the same card composes
 * into create and edit modes and the live preview reads the same source.
 */
export function PromptCard({
  sectionKey,
  friendlyName,
  canonicalHeading,
  helperText,
  placeholder,
  value,
  onChange,
  required = false,
}: PromptCardProps) {
  const fieldId = useId();

  return (
    <section className="prompt-card" data-testid={`compose-prompt-${sectionKey}`}>
      <div className="prompt-card__head">
        <label className="prompt-card__title" htmlFor={fieldId}>
          {friendlyName}
          {required ? <span className="prompt-card__required" aria-hidden="true"> *</span> : null}
        </label>
        <span className="prompt-card__tag" data-testid={`compose-prompt-tag-${sectionKey}`}>
          saved as MADR: {canonicalHeading}
        </span>
      </div>
      <p className="prompt-card__helper" id={`${fieldId}-helper`}>
        {helperText}
      </p>
      <textarea
        id={fieldId}
        data-testid={`compose-prompt-input-${sectionKey}`}
        className="prompt-card__input field__input"
        aria-describedby={`${fieldId}-helper`}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  );
}
