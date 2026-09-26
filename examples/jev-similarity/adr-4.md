---
id: "adr-4"
status: accepted
date: 2026-03-20
---

# Build the web frontend with React and TypeScript

## Context and Problem Statement
We are starting a new customer-facing web application and need a UI framework and language that the team can be productive with and that scales to a large codebase.

## Considered Options
- React with TypeScript
- Angular
- Vue

## Decision Outcome
Chosen option: "React with TypeScript", because the team already knows React, the ecosystem is large, and TypeScript catches errors at compile time. We will use Vite for builds and TanStack Query for server state.

### Consequences
- Good, because hiring and onboarding are easier.
- Bad, because we must choose and maintain our own routing and state libraries.
