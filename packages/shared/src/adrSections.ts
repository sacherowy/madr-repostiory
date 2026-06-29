export interface AdrSections {
  contextAndProblemStatement: string;
  decisionDrivers: string;
  consideredOptions: string;
  decisionOutcome: string;
  consequences: string;
  confirmation: string;
  prosAndConsOfTheOptions: string;
  moreInformation: string;
}

export interface MadrSectionMeta {
  key: keyof AdrSections;
  heading: string;
  level: 2 | 3;
  required: boolean;
}

export const MADR_SECTIONS: readonly MadrSectionMeta[] = [
  { key: "contextAndProblemStatement", heading: "Context and Problem Statement", level: 2, required: true },
  { key: "decisionDrivers", heading: "Decision Drivers", level: 2, required: false },
  { key: "consideredOptions", heading: "Considered Options", level: 2, required: false },
  { key: "decisionOutcome", heading: "Decision Outcome", level: 2, required: true },
  { key: "consequences", heading: "Consequences", level: 3, required: false },
  { key: "confirmation", heading: "Confirmation", level: 3, required: false },
  { key: "prosAndConsOfTheOptions", heading: "Pros and Cons of the Options", level: 2, required: false },
  { key: "moreInformation", heading: "More Information", level: 2, required: false },
];
