# UX & Navigation Redesign — Three Proposals

**Problem.** The current shell is built like an engineer's IDE: a three-rail workspace
(tree explorer / object region / inspector), a Cmd-K command palette as the primary
navigation entry, monospace ID chips, and raw git & MADR vocabulary in the UI
("supersedes", "diff", "session author", statuses like *superseded*). The target
audience — corporate architects, solution architects, business analysts and other
stakeholders — should be able to read, create and evolve decisions **without knowing
git or the change-management process**. For them the current UI reads as technical,
formal and outdated.

**Constraint.** MADR semantics stay intact: the record on disk remains a MADR Markdown
file in git (sections, statuses, relations, folders, history-as-commits). All three
concepts are presentation-layer redesigns over the existing API and `packages/core`
domain — none of them change the file format, the git-as-source-of-truth principle,
or the backend contracts.

**Shared foundation (applies to every concept).** A plain-language layer over the
domain vocabulary, used consistently in the UI while the stored MADR values stay
canonical:

| Stored (MADR / git) | Shown to users |
| --- | --- |
| `proposed` | **In discussion** |
| `accepted` | **Decided** |
| `deprecated` | **Retired** |
| `superseded` | **Replaced** |
| `supersedes` / `superseded-by` | **Replaces** / **Replaced by** |
| `depends-on` | **Builds on** |
| `relates-to` | **Related to** |
| `conflicts-with` | **Conflicts with** |
| folders | **Topics** / **Spaces** |
| git commit / history | **Saved version** / **Activity story** |
| deciders / consulted / informed | **Decision owner** / **Input from** / **Kept informed** |
| similarity search | **Related reading** ("87% similar") |

A "Technical view" escape hatch (raw Markdown, file path, real git history) stays one
click away for engineers, but never occupies primary screen space.

---

## Concept A — "Decision Feed" (editorial portal)

*Mockup: `concept-a-decision-feed.html` / `.png`*

The app reads like an internal news / knowledge site. **Home** is a hero search
("What was decided — and why"), plain-word filter chips, and a feed of decision cards —
each with a one-sentence outcome, a topic tag, people avatars and friendly timestamps.
A right rail lists Topics and a "Needs your attention" digest. **A decision** is an
article: outcome-first summary box ("In one sentence: we chose X because Y"), friendly
section names with the canonical MADR heading kept as a subtle tag
("Why we needed to decide" ← *Context and Problem Statement*), options as compare
cards with the chosen one highlighted, relations and the "story so far" in plain
sentences on the right.

- **Best for:** organizations where most people *read* decisions and few write them;
  makes the repository feel like a living publication, great for transparency.
- **Navigation model:** top nav (Home / Browse topics / People) + search. No tree.
- **Trade-offs:** editing is secondary (opens a separate editor); the feed needs a
  decent volume of activity to feel alive.
- **Effort:** medium. New home/feed + article renderer; reuses editor, relations,
  history, similarity data as-is.

## Concept B — "Guided Decision Journey" (board + wizard)

*Mockup: `concept-b-guided-journey.html` / `.png`*

The lifecycle becomes the interface. **Home** is a kanban board whose columns are the
lifecycle stages in plain words (Being framed / In discussion / Decided /
Retired-replaced) — moving a card *is* changing the MADR status, with guardrails.
**Working on a decision** is a step-by-step journey (Frame it → What matters →
Explore options → Decide → Live with it): one question at a time with helper text,
option cards with 👍/👎 pros & cons, and a reminder of the drivers captured earlier.
Each step writes the corresponding real MADR sections; a footnote makes that explicit.

- **Best for:** organizations where the pain is *getting people to write decisions
  at all*; the wizard removes the blank-page problem and teaches MADR by doing.
- **Navigation model:** board (status) + topic scope switcher + search. No tree.
- **Trade-offs:** the strongest opinion of the three — power users may find the wizard
  slower than a form (mitigate with a "switch to full form" toggle); board columns must
  map cleanly onto status transitions.
- **Effort:** highest. Wizard flow, board with drag-to-transition, plus a stage model
  derived from statuses/section completeness.

## Concept C — "Decision Hub" (calm document workspace)

*Mockup: `concept-c-decision-hub.html` / `.png`*

The Notion/Confluence mental model virtually every business analyst already has.
A minimal **sidebar** holds Spaces (= repo folders), shortcuts and one "New decision"
button. **Home** is personal: "Jump back in", Spaces overview, recently decided.
**A decision is a living document**: a properties block on top (Status / Decided on /
Owner / Input from / Tags — click to change), readable prose with hover
"✎ Edit section" (section-scoped inline editing instead of one big form), relations as
inline callouts ("Replaces …"), and a right drawer with Activity / Connections /
Similar tabs. Activity is the git history in human sentences ("Marta marked this
Decided · view this version"); every save quietly commits.

- **Best for:** balanced read *and* write usage; the least learning curve because it
  borrows a familiar paradigm; scales from 10 to 1000 decisions.
- **Navigation model:** sidebar Spaces + ⌘K jump + personal home. Tree demoted to
  flat space lists.
- **Trade-offs:** the least distinctive visually; inline section editing needs careful
  mapping onto the existing whole-document save flow (per-section PATCH or optimistic
  splice before commit).
- **Effort:** medium. Document renderer + property row + drawer; the section
  editor already exists per-section in `AdrEditor`'s collapsible structure.

---

## Comparison at a glance

| | A · Decision Feed | B · Guided Journey | C · Decision Hub |
| --- | --- | --- | --- |
| Mental model | News portal | Trello + Typeform | Notion / Confluence |
| Optimizes for | Reading & transparency | Writing & process adoption | Balanced daily work |
| Blank-page problem | partially (templates) | **solved** (wizard) | partially (placeholders) |
| Learning curve | lowest | low | lowest (familiar) |
| Risk of feeling "toy-like" to engineers | low | medium | low |
| Implementation effort | medium | high | medium |

## Recommendation

**Concept C as the base shell, with Concept B's guided wizard as the "New decision"
flow.** They compose naturally: the Hub gives every persona a familiar, calm reading
and editing surface, while the Journey wizard fixes the single biggest adoption
blocker (starting a decision from a blank MADR form). Concept A's outcome-first
summary box and plain-sentence relations can be folded into the Hub's document
renderer at near-zero extra cost. If a single concept must be chosen, choose C.

## Concept A follow-up — short description & the decision form

*Mockup: `concept-a-decision-form.html` / `.png`. Direction chosen by the product owner
(2026-07-03); this section answers "where does the one-line description come from"
and "what does creating/editing look like".*

### Short description: a three-layer resolution, first match wins

The feed card's one-liner is resolved per ADR, in this order:

1. **Author's own wording** — a new optional `summary` field in the MADR frontmatter.
   When present it always wins. It lives in the Markdown file, so it is versioned,
   diffable and git-authoritative like everything else. Additive: existing ADRs
   without the field stay valid.
2. **Deterministic derivation** (instant, offline, no AI) — computed from data the
   app already stores structurally:
   - *Decided*: parse `decisionOutcome`, which the editor writes in canonical MADR
     form ("**Chosen option: X**, because Y") — render as "We chose **X** — Y."
     Fallback: first sentence of the outcome.
   - *In discussion*: from the structured option rows
     (`consideredOptions`/`prosAndConsOfTheOptions` already parse into
     description+pros+cons) — "Weighing **A** against **B** (+1 more)", optionally
     with the first decision driver appended as "Key concern: …".
   - *Replaced / Retired*: from relations — "Replaced by *<target title>* on <date>."
3. **AI polish (optional)** — one sentence generated from title + context + outcome
   via the existing Gemini adapter, **cached in SQLite keyed by `blobSha`** — exactly
   the embedding-cache pattern: a reproducible projection, never authoritative,
   recreated by `reindex`, absent when offline or without an API key (the app then
   simply shows layer 2). In the editor it appears as a "✨ suggestion" with
   **Use this / Write my own** — accepting it copies it into the frontmatter
   `summary` (layer 1); it is never committed without explicit acceptance.

Consequences: the feed works fully offline and on day one with zero authoring effort
(layer 2 covers every existing ADR), AI is an enhancement rather than a dependency,
and whatever the author blesses becomes plain git-tracked frontmatter.

### The decision form

Not a wizard (that was Concept B) — one friendly page in the article's voice, shown
in two states in the mockup:

- **Starting a decision**: title as a big question, meta as pills (Topic, plain-word
  status segment, Owner, "+ Ask people for input", "+ Tags"), then the MADR sections
  as prompt cards — friendly heading, helper text, example placeholder, and the
  canonical MADR heading kept as a small tag ("saved as MADR: Context and Problem
  Statement"). Only title + context are needed to publish an "In discussion"
  decision; Drivers and Options are explicitly optional, and **Decision Outcome is
  locked** until an option is marked chosen or status flips to Decided — publishing
  an open question is a first-class act, not an incomplete form.
- **Editing a decided record**: options render as cards with **"Mark as chosen"**;
  choosing one unlocks and pre-fills the outcome in canonical MADR phrasing, which
  is exactly what layer 2 of the summary derives from. The right rail shows a
  **live feed-card preview** ("this is how it will appear") plus the Short
  description control with its source indicator and the visible three-layer ladder.

The form maps 1:1 onto the existing `AdrEditor` capabilities (structured people
fields, option rows, section textareas) — it is a re-skin plus three additions:
`summary` frontmatter passthrough, the chosen-option → outcome prefill, and the
live preview card.

## Files

- `concept-a-decision-feed.html` + `.png` — editorial portal (Home + Decision page)
- `concept-a-decision-form.html` + `.png` — Concept A create/edit form + summary control
- `concept-b-guided-journey.html` + `.png` — board + wizard (Board + Step 3)
- `concept-c-decision-hub.html` + `.png` — document workspace (Home + Document)

Mockups are self-contained HTML (no external assets) on the existing teal token
palette, rendered at 1280×820 per view with the pre-provisioned Chromium.
