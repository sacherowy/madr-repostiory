---
id: "adr-8"
status: accepted
date: 2026-05-20
---

# Store architecture decision records as Markdown in git

## Context and Problem Statement
Architecture decisions are scattered across wiki pages and chat threads and are hard to find or review. We want decisions versioned, reviewable and close to the code.

## Considered Options
- Markdown files (MADR) in a git repository
- Confluence pages
- Google Docs

## Decision Outcome
Chosen option: "Markdown in git", because decisions get full history, pull-request review and live next to the code. We follow the MADR template.

### Consequences
- Good, because every change is reviewed and versioned.
- Bad, because non-engineers may find git less approachable.
