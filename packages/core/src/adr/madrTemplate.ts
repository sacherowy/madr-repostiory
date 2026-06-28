/**
 * Initial body content for newly created ADRs.
 *
 * Contains the 8 MADR v4.0.0 section headings, in order and at the same
 * heading levels as the official template
 * (https://github.com/adr/madr/blob/4.0.0/template/adr-template.md):
 * six `##` (H2) sections, with "Consequences" and "Confirmation" nested as
 * `###` (H3) subsections under "Decision Outcome" rather than flattened to
 * the same level as the others.
 *
 * The two sections MADR marks as required ("Context and Problem Statement",
 * "Decision Outcome") carry no marker beneath their heading. The six
 * sections MADR marks as optional each carry an HTML comment beneath their
 * heading, mirroring MADR's own template convention for marking optional
 * elements. Every section's content is otherwise left empty for the author
 * to fill in.
 *
 * This is a single string constant with no logic or parsing dependency on
 * `parse.ts` or any other module.
 */
export const MADR_BODY_SCAFFOLD = `## Context and Problem Statement

## Decision Drivers

<!-- Optional: list the decision drivers that motivated this choice. -->

## Considered Options

<!-- Optional: list the options that were considered. -->

## Decision Outcome

### Consequences

<!-- Optional: describe the consequences of this decision. -->

### Confirmation

<!-- Optional: describe how compliance with this decision is confirmed. -->

## Pros and Cons of the Options

<!-- Optional: detail the pros and cons of each considered option. -->

## More Information

<!-- Optional: add supporting evidence, links, or follow-up notes. -->`;
