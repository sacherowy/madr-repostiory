/**
 * Pure, bidirectional mapping between UI-facing option rows and the existing
 * `consideredOptions`/`prosAndConsOfTheOptions` markdown strings owned by
 * `AdrSections`.
 *
 * Mirrors the no-throw, direct-cast style of
 * `packages/core/src/adr/sections.ts`: no React dependency, no side effects.
 * The markdown grammar owned here (bullet + bold-text block shape) is
 * defined and scoped entirely to `apps/web` -- see `research.md`'s
 * "Structured option markdown grammar" design decision and its amendment
 * replacing the per-option ATX heading with bold text.
 */

export interface OptionRow {
  id: string;
  description: string;
  pros: string;
  cons: string;
}

const CONSIDERED_OPTION_BULLET_PATTERN = /^\* (.*)$/;
const OPTION_BOLD_TEXT_PATTERN = /^\*\*(.*)\*\*$/;
const GOOD_BULLET_PATTERN = /^\* Good, because (.*)$/;
const BAD_BULLET_PATTERN = /^\* Bad, because (.*)$/;

interface ParsedBlock {
  description: string;
  pros: string[];
  cons: string[];
}

/**
 * Parses `consideredOptions` (one `* {description}` bullet per row) and
 * `prosAndConsOfTheOptions` (one `**{description}**` bold-text block per row,
 * followed by `* Good, because {line}` / `* Bad, because {line}` bullets) into rows,
 * pairing the two lists positionally by index. Never throws: content that
 * doesn't match the grammar is simply not recognized as a bullet/bold-text
 * line and is ignored, degrading to a best-effort row set (Requirement 3.7).
 */
export function parseOptions(consideredOptions: string, prosAndConsOfTheOptions: string): OptionRow[] {
  const descriptions = parseConsideredOptionBullets(consideredOptions);
  const blocks = parseOptionBlocks(prosAndConsOfTheOptions);

  const rowCount = Math.max(descriptions.length, blocks.length);
  const rows: OptionRow[] = [];

  for (let i = 0; i < rowCount; i++) {
    const description = i < descriptions.length ? descriptions[i] : (blocks[i]?.description ?? "");
    const block = blocks[i];

    rows.push({
      id: createId(),
      description,
      pros: block ? block.pros.join("\n") : "",
      cons: block ? block.cons.join("\n") : "",
    });
  }

  return rows;
}

function parseConsideredOptionBullets(consideredOptions: string): string[] {
  const descriptions: string[] = [];

  for (const line of consideredOptions.split("\n")) {
    const match = CONSIDERED_OPTION_BULLET_PATTERN.exec(line);
    if (match) {
      descriptions.push(match[1]);
    }
  }

  return descriptions;
}

function parseOptionBlocks(prosAndConsOfTheOptions: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let currentBlock: ParsedBlock | undefined;

  for (const line of prosAndConsOfTheOptions.split("\n")) {
    const boldTextMatch = OPTION_BOLD_TEXT_PATTERN.exec(line);
    if (boldTextMatch) {
      currentBlock = { description: boldTextMatch[1], pros: [], cons: [] };
      blocks.push(currentBlock);
      continue;
    }

    if (!currentBlock) {
      continue;
    }

    const goodMatch = GOOD_BULLET_PATTERN.exec(line);
    if (goodMatch) {
      currentBlock.pros.push(goodMatch[1]);
      continue;
    }

    const badMatch = BAD_BULLET_PATTERN.exec(line);
    if (badMatch) {
      currentBlock.cons.push(badMatch[1]);
    }
  }

  return blocks;
}

/**
 * Serializes rows into the `consideredOptions`/`prosAndConsOfTheOptions`
 * markdown grammar, in row order. Rows whose `description`, `pros`, and
 * `cons` are all empty after trimming are excluded (Requirement 3.6). A
 * `description` containing a newline (defensive case only; the paired UI
 * enforces single-line entry) has the newline replaced with a space so the
 * one-bullet/one-bold-text-line-per-option invariant holds.
 */
export function serializeOptions(rows: readonly OptionRow[]): {
  consideredOptions: string;
  prosAndConsOfTheOptions: string;
} {
  const includedRows = rows.filter((row) => !isBlankRow(row));

  const consideredOptions = includedRows.map((row) => `* ${sanitizeDescription(row.description)}`).join("\n");

  const prosAndConsOfTheOptions = includedRows.map((row) => serializeOptionBlock(row)).join("\n\n");

  return { consideredOptions, prosAndConsOfTheOptions };
}

function isBlankRow(row: OptionRow): boolean {
  return row.description.trim() === "" && row.pros.trim() === "" && row.cons.trim() === "";
}

function sanitizeDescription(description: string): string {
  return description.replace(/\n/g, " ");
}

function serializeOptionBlock(row: OptionRow): string {
  const lines = [`**${sanitizeDescription(row.description)}**`];

  for (const line of nonBlankLines(row.pros)) {
    lines.push(`* Good, because ${line}`);
  }

  for (const line of nonBlankLines(row.cons)) {
    lines.push(`* Bad, because ${line}`);
  }

  return lines.join("\n");
}

function nonBlankLines(value: string): string[] {
  return value.split("\n").filter((line) => line.trim() !== "");
}

/** Generates a stable, unique id string suitable as a React list key. */
function createId(): string {
  return crypto.randomUUID();
}
