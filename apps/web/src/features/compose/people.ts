/**
 * Pure, bidirectional mapping between UI-facing person rows and the existing
 * `decisionMakers`/`consulted`/`informed` string arrays owned by `AdrSections`.
 *
 * Mirrors the no-throw, direct-cast style of
 * `packages/core/src/adr/sections.ts`: no React dependency, no side effects.
 */

export type StakeholderRole = "Decision Maker" | "Consulted" | "Informed";

export interface PersonRow {
  id: string;
  name: string;
  role: StakeholderRole;
}

/**
 * Expands the three stakeholder arrays into one row per name, in the order
 * decisionMakers, then consulted, then informed, each row tagged with the
 * role matching the array it came from.
 */
export function rowsFromStakeholders(
  decisionMakers: readonly string[],
  consulted: readonly string[],
  informed: readonly string[]
): PersonRow[] {
  return [
    ...rowsForRole(decisionMakers, "Decision Maker"),
    ...rowsForRole(consulted, "Consulted"),
    ...rowsForRole(informed, "Informed"),
  ];
}

function rowsForRole(names: readonly string[], role: StakeholderRole): PersonRow[] {
  return names.map((name) => ({ id: createId(), name, role }));
}

/**
 * Groups person rows back into the three stakeholder arrays by role. Rows
 * whose trimmed name is empty are excluded from every category.
 */
export function stakeholdersFromRows(
  rows: readonly PersonRow[]
): { decisionMakers: string[]; consulted: string[]; informed: string[] } {
  const decisionMakers: string[] = [];
  const consulted: string[] = [];
  const informed: string[] = [];

  for (const row of rows) {
    if (row.name.trim() === "") {
      continue;
    }
    if (row.role === "Decision Maker") {
      decisionMakers.push(row.name);
    } else if (row.role === "Consulted") {
      consulted.push(row.name);
    } else {
      informed.push(row.name);
    }
  }

  return { decisionMakers, consulted, informed };
}

/** Generates a stable, unique id string suitable as a React list key. */
function createId(): string {
  return crypto.randomUUID();
}
