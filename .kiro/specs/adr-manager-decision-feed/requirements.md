# Requirements Document

## Project Description (Input)
Redesign the web app's UX and navigation around the approved Concept A 'Decision Feed' proposal (docs/proposals/ux-navigation-redesign/): an editorial-portal presentation layer for non-technical stakeholders (corporate/solution architects, business analysts) that keeps MADR semantics and git-as-source-of-truth intact. Scope: (1) plain-language vocabulary layer over statuses/relations/folders/history (proposed→In discussion, accepted→Decided, supersedes→Replaces, folders→Topics, git history→'story'/'saved versions'); (2) new Home: hero search, plain-word filter chips, feed of decision cards with one-line summaries, Topics rail, 'Needs your attention' digest; (3) decision page as an article: outcome-first summary box, friendly section names with canonical MADR heading tags, options as compare cards with chosen highlight, relations and history as plain sentences in a right rail, 'Technical view' escape hatch; (4) friendly single-page create/edit form: prompt-card sections with helper text, plain-word status segment, options cards with 'Mark as chosen' that pre-fills Decision Outcome in canonical 'Chosen option: X, because Y' form, Decision Outcome locked while in discussion, live feed-card preview rail; (5) short-description pipeline with three-layer resolution (author-owned frontmatter 'summary' field > deterministic derivation from outcome/options/relations > optional Gemini one-sentence polish cached in SQLite by blobSha, suggestion-only, offline-degradable). Presentation-layer change over existing API and packages/core domain; MADR file format, backend contracts and E2E offline capability preserved.

## Introduction

The ADR Manager web app currently presents an IDE-like, object-centric workspace
(delivered by the `adr-manager-contextual-shell` spec): a tree explorer, a Cmd-K
command palette, a contextual aspect switcher, and an inspector rail, all built for
engineers who already know git and MADR vocabulary. Non-technical stakeholders —
corporate and solution architects, business analysts — experience this as technical,
formal, and hard to approach: statuses read as `proposed`/`superseded`, relationships
as `supersedes`/`depends-on`, and browsing requires understanding a file/folder tree.

This feature replaces that navigation and presentation layer entirely with an
editorial-portal experience (Concept A, "Decision Feed"): a Home feed of decision
cards with hero search and plain-word filters, dedicated Topics and People
destinations, a decision page presented as an outcome-first article, a friendly
single-page create/edit form, and a three-layer short-description pipeline that gives
every decision a one-line summary. A plain-language vocabulary layer replaces
technical terms throughout, while the underlying MADR Markdown file format,
git-as-source-of-truth behavior, and backend API contracts remain unchanged, and a
"Technical view" keeps the raw record one click away for engineers.

The "system" subject in the acceptance criteria below refers to the ADR Manager
application as a whole (its web interface together with its supporting backend),
except Requirement 16, whose subject is the ADR Manager end-to-end test suite.

## Boundary Context

- **In scope**: a plain-language vocabulary layer over the five ADR statuses, the five
  relation types, folders, people roles, and git history, applied throughout the new
  navigation while the stored MADR values remain canonical and visible verbatim in
  Technical view; a new Home page (hero search, plain-word status filter chips, a feed
  of decision cards, a Topics rail, and a "Needs your attention" digest personalized to
  the session author-name field); dedicated Topics and People destinations; a decision
  article page (outcome-first summary, friendly section names carrying the canonical
  MADR heading as a subtle tag, options as compare cards with the chosen option
  highlighted, relations/history as plain sentences in a right rail) with a Technical
  view toggle exposing raw Markdown, file path, real git history, version diffs, and
  ADR-to-ADR comparison; a friendly single-page create/edit form (prompt-card
  sections, plain-word status segment, "Mark as chosen" options with Decision Outcome
  pre-fill and locking, a live feed-card preview); the three-layer short-description
  pipeline (author-owned `summary` frontmatter, deterministic derivation, optional
  cached Gemini one-sentence suggestion) and its offline degradation; and replacing the
  navigation introduced by `adr-manager-contextual-shell` (tree explorer, Cmd-K
  palette, inspector rail, contextual aspect switcher) with this new navigation.
- **Out of scope**: any change to the MADR Markdown file format beyond the additive
  `summary` frontmatter field, to git-as-source-of-truth behavior, or to existing
  backend API request/response contracts other than the additive summary-related
  surface described in Requirement 13; Concept B's kanban board/wizard flow and
  Concept C's document/property-block/inline-section-editing model — this spec
  implements Concept A only; authentication or user accounts (personalization
  continues to rely on the existing free-text session author-name field); a
  general-purpose commenting/discussion system, real-time collaboration, or
  notifications beyond the on-page "Needs your attention" digest; changes to the
  offline-by-default behavior, run lifecycle, or harness configuration of the
  `playwright-e2e`/`apps/e2e` suite (only new journey assertions are added); and
  editing the design token values in `docs/design.md` (new surfaces are built from the
  existing token system).
- **Adjacent expectations**: this feature supersedes the navigation delivered by
  `adr-manager-contextual-shell` — the tree explorer, Cmd-K palette, inspector rail,
  and contextual aspect switcher are removed from the experience entirely, not kept as
  an alternate mode; underlying ADR behavior not explicitly replaced here (save,
  relations, history, similarity data) continues to be provided through the reused API
  and, where applicable, through Technical view. This feature continues to build on the
  visual design system established by `adr-manager-frontend-redesign` (palette,
  typography, primitives) for its new surfaces, must not contradict the underlying ADR
  behavior and contracts defined by the `adr-manager` spec, and extends the
  `playwright-e2e`/`apps/e2e` suite with new journey coverage while preserving its
  offline-by-default run lifecycle.

## Requirements

### Requirement 1: Plain-Language Vocabulary Layer
**Objective:** As a non-technical stakeholder browsing decisions, I want statuses, relations, folders, and history shown in plain language, so that I can understand decisions without knowing git or MADR terminology.

#### Acceptance Criteria
1. The system shall display each of the five stored ADR statuses using a plain-language label: `proposed` as "In discussion", `accepted` as "Decided", `deprecated` as "Retired", `superseded` as "Replaced", and `rejected` as "Rejected".
2. The system shall display each stored relation type using a plain-language label: `supersedes` as "Replaces", `superseded-by` as "Replaced by", `depends-on` as "Builds on", `relates-to` as "Related to", and `conflicts-with` as "Conflicts with".
3. The system shall present folders as "Topics" throughout the Home, Topics, and decision-page navigation.
4. Outside Technical view, the system shall present git commit history entries as a plain-language "story"/"saved versions" narrative rather than raw commit metadata.
5. The system shall present the Decision owner, Input from, and Kept informed people fields using those plain-language labels in place of their stored field names.
6. The system shall make each underlying stored value (status, relation type, or field name) visible verbatim in Technical view.

### Requirement 2: Home Decision Feed
**Objective:** As a non-technical stakeholder, I want a home page that reads like a news feed of decisions, so that I can discover and understand what has been decided without navigating a file tree.

#### Acceptance Criteria
1. The system shall present a Home page as the application's default landing view.
2. The Home page shall present a hero search control that searches decisions using the existing keyword search behavior.
3. The Home page shall present a feed of decision cards, each showing the decision's title, plain-language status, one-line short description, topic, people, and a friendly relative timestamp.
4. The Home page shall present plain-word filter chips corresponding to the plain-language status categories (In discussion, Decided, Retired, Replaced, Rejected).
5. When the user selects a filter chip, the system shall narrow the feed to decisions matching that status category.
6. When the user selects a decision card, the system shall navigate to that decision's article page.
7. When a search or filter yields no matching decisions, the Home page shall display an empty state that invites the next action rather than a blank feed.

### Requirement 3: Topics Navigation
**Objective:** As a stakeholder browsing by subject area, I want to browse decisions grouped by topic, so that I can find related decisions without using a technical folder tree.

#### Acceptance Criteria
1. The system shall present a Topics destination listing every existing folder as a browsable topic, including nested folders as sub-topics.
2. When the user selects a topic, the system shall display the feed of decisions filtered to that topic and its sub-topics.
3. The Home page shall present a Topics rail summarizing available topics as a shortcut into the Topics destination.
4. Where a topic has no decisions, the system shall display an empty state for that topic rather than a blank feed.

### Requirement 4: People Directory
**Objective:** As a stakeholder, I want to see decisions grouped by the people involved, so that I can find decisions owned by or relevant to a specific person.

#### Acceptance Criteria
1. The system shall present a People destination listing each distinct person appearing as a Decision owner, Input from, or Kept informed on any decision.
2. When the user selects a person, the system shall display the decisions where that person is listed as Decision owner, Input from, or Kept informed.
3. The system shall group entries under a person by a case-insensitive, whitespace-trimmed match of the stored name text.

### Requirement 5: Needs Your Attention Digest
**Objective:** As a stakeholder using the session author-name field, I want a personalized digest of open decisions relevant to me, so that I can act on decisions waiting for my input.

#### Acceptance Criteria
1. While the session author-name field is set, the Home page shall present a "Needs your attention" digest listing decisions that are In discussion and whose Decision owner, Input from, or Kept informed fields match the current session author's name (case-insensitive, whitespace-trimmed).
2. While the session author-name field is empty, the Home page shall present the "Needs your attention" digest in a generic empty/prompt state rather than attempting personalized matching.
3. When the user selects an entry in the digest, the system shall navigate to that decision's article page.

### Requirement 6: Decision Article Page
**Objective:** As a stakeholder reading a decision, I want it presented as an article with the outcome up front, so that I can understand what was decided and why without parsing a technical document.

#### Acceptance Criteria
1. When the user opens a decision, the system shall present it as an article page.
2. The article page shall present an outcome-first summary box stating the decision's short description before any other section content.
3. The article page shall present each MADR section under a friendly section name, with the canonical MADR heading shown as a subtle tag alongside it.
4. Where a decision has considered options, the article page shall present them as compare cards with the chosen option (as derived per Requirement 12) visually highlighted.
5. The article page shall present the decision's relations and history as plain-language sentences in a right rail (for example, "Replaces <title>" or "Marked Decided on <date>").
6. The article page shall present the decision's people using the plain-language labels from Requirement 1.

### Requirement 7: Technical View Escape Hatch
**Objective:** As an engineer reading a decision, I want a one-click technical view, so that I can see the raw MADR file, its path, and its real git history when I need it.

#### Acceptance Criteria
1. The article page shall present a control that toggles a Technical view for the current decision.
2. While Technical view is active, the system shall display the decision's raw Markdown content, canonical MADR section headings, and file path.
3. While Technical view is active, the system shall display the decision's real git commit history and allow the user to view a version diff, reusing the existing history and diff behavior.
4. While Technical view is active, the system shall offer access to the existing ADR-to-ADR comparison capability for the current decision.
5. When the user toggles Technical view off, the system shall return to the friendly article presentation.

### Requirement 8: Friendly Decision Create/Edit Form
**Objective:** As a stakeholder authoring a decision, I want one friendly page to create or edit it, so that I am guided section by section instead of facing a blank technical form.

#### Acceptance Criteria
1. The system shall present decision creation and editing as a single page composed of prompt-card sections, each with a friendly heading, helper text, and an example placeholder, and the canonical MADR heading shown as a subtle tag.
2. The form shall present status as a plain-word segmented control using the labels from Requirement 1.
3. The form shall require only title and context to publish a decision as In discussion; Decision Drivers and Options shall be optional at that point.
4. The form shall allow the user to add and remove Decision owner, Input from, Kept informed people, and relations to other decisions, using the plain-language labels from Requirement 1.
5. When the user saves the form, the system shall persist the decision through the existing save behavior, including its existing conflict-recovery handling.

### Requirement 9: Option Selection and Decision Outcome Behavior
**Objective:** As a stakeholder editing a decision, I want to mark an option as chosen and have the outcome written for me, so that I do not need to hand-write the canonical MADR outcome phrasing.

#### Acceptance Criteria
1. Where a decision has considered options, the form shall present each option as a card offering a "Mark as chosen" action.
2. When the user marks an option as chosen, the form shall pre-fill the Decision Outcome field with the canonical "Chosen option: X, because Y" phrasing derived from that option.
3. While a decision is In discussion and no option has been marked as chosen, the form shall lock the Decision Outcome field rather than accept free-text outcome entry.
4. When the user marks an option as chosen or sets the status to Decided, the form shall unlock the Decision Outcome field for further editing.
5. The system shall enforce Decision Outcome locking only in the form UI and shall not alter the underlying save API's validation behavior.

### Requirement 10: Live Feed-Card Preview
**Objective:** As a stakeholder authoring a decision, I want to see how it will appear in the feed while I edit it, so that I can judge whether my short description and content read well before publishing.

#### Acceptance Criteria
1. The form shall present a live preview rail showing the decision card as it would appear in the Home feed.
2. When the user edits fields that affect the feed card (title, status, short description, topic, people), the form shall update the live preview to reflect the change.
3. The form shall indicate, in the preview rail, which layer of the short-description pipeline (Requirement 11, 12, or 13) is currently the source of the previewed short description.

### Requirement 11: Author-Owned Short Description
**Objective:** As a decision author, I want to write my own one-line summary, so that the feed shows my intended framing rather than a generated one.

#### Acceptance Criteria
1. The system shall support an optional `summary` field in the MADR frontmatter.
2. Where a decision's frontmatter includes a `summary` value, the system shall use that value as the decision's short description in the feed, on the article page, and in the live preview, taking precedence over any derived or generated value.
3. The system shall treat decisions without a `summary` field as valid and shall not require authors to provide one.

### Requirement 12: Deterministic Short-Description Derivation
**Objective:** As a stakeholder viewing decisions that have no author-written summary, I want a short description generated automatically from existing data, so that every decision has a useful one-line summary without extra authoring effort.

#### Acceptance Criteria
1. Where a decision has no `summary` value and its status is Decided, the system shall derive its short description from the Decision Outcome text in the form "We chose <option>, <reason>", falling back to the first sentence of the outcome text when it does not match the canonical "Chosen option: X, because Y" pattern.
2. Where a decision has no `summary` value and its status is In discussion, the system shall derive its short description from its considered options (for example, "Weighing <option A> against <option B>"), optionally appending the first decision driver.
3. Where a decision has no `summary` value and its status is Replaced, the system shall derive its short description from its superseded-by relation (for example, "Replaced by <target title> on <date>").
4. Where a decision has no `summary` value and no status-specific derivation rule applies (for example, Retired without a replacement, or Rejected), the system shall derive its short description from the Decision Outcome text, or from the first sentence of the Context and Problem Statement when the outcome is empty.
5. The system shall compute the deterministic short description without any network access or external service call.

### Requirement 13: AI Summary Suggestion
**Objective:** As a decision author, I want an optional AI-generated one-sentence suggestion for my short description, so that I can accept it or write my own without depending on it.

#### Acceptance Criteria
1. Where a Gemini API key is configured and network access is available, the form shall offer a generated one-sentence summary suggestion for the current decision, labeled as a suggestion.
2. The system shall cache each generated summary suggestion keyed to the decision content's blob SHA, so that unchanged content is not resubmitted to the external service.
3. When the user accepts a summary suggestion, the form shall copy it into the decision's `summary` frontmatter field on save; the system shall never write a generated suggestion into the saved decision without explicit user acceptance.
4. When the user chooses to write their own short description instead of the suggestion, the form shall let the author's text override the suggestion.
5. While no Gemini API key is configured, or network access is unavailable, the system shall omit the AI suggestion and rely on the deterministic short description (Requirement 12) without error.

### Requirement 14: Search
**Objective:** As a stakeholder, I want to find decisions by keyword from the home page, so that I can locate relevant decisions without browsing topics.

#### Acceptance Criteria
1. The system shall search decisions using the existing keyword search behavior when the user submits a query through the hero search control.
2. The system shall present search results as decision cards in the same feed presentation used on the Home page.

### Requirement 15: Navigation Replacement and Contract Preservation
**Objective:** As a maintainer, I want the new portal to fully replace the prior shell while preserving underlying behavior and contracts, so that the redesign is a presentation change, not a functional regression.

#### Acceptance Criteria
1. The system shall remove the tree explorer, Cmd-K command palette, inspector rail, and contextual aspect switcher navigation introduced by `adr-manager-contextual-shell`, replacing them entirely with the Home Decision Feed, Topics, People, and decision-article navigation described in this specification.
2. The system shall preserve all existing user-facing decision behavior (create/edit/save with conflict recovery, relations, history, comparison, search, and similarity) through the new navigation and Technical view.
3. The system shall not alter its existing API request/response contracts for ADR create, save, tree, relations, history, diff, search, or similarity, other than the additive `summary` frontmatter field and the summary-suggestion cache described in Requirement 13.
4. The system shall preserve the MADR Markdown file format and git-as-source-of-truth behavior; the `summary` field is the only additive frontmatter change.
5. The system shall introduce no new CSS framework, component library, or client-side router.

### Requirement 16: Automated Verification
**Objective:** As a maintainer, I want automated checks that the new portal navigation and vocabulary are honored, so that regressions are caught without manual inspection.

#### Acceptance Criteria
1. The ADR Manager end-to-end test suite shall assert, through the rendered DOM, that the Home feed, filter chips, Topics destination, People destination, "Needs your attention" digest, decision article page, Technical view toggle, and friendly create/edit form are present and behave as specified.
2. The ADR Manager end-to-end test suite shall assert that the plain-language vocabulary labels (Requirement 1) are rendered in place of raw MADR values outside Technical view.
3. The ADR Manager end-to-end test suite shall run in the pre-provisioned Chromium browser without requiring network access or a live Gemini API key, exercising the deterministic short-description path (Requirement 12) as the default.
4. The ADR Manager end-to-end test suite shall preserve its existing offline-by-default run lifecycle and shall not introduce pixel-baseline snapshot regression.
