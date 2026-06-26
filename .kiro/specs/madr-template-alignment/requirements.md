# Requirements Document

## Project Description (Input)
Align the ADR data model and serialization with the official MADR template (https://github.com/adr/madr/blob/develop/template/adr-template.md).

**Who has the problem:** Maintainers and users of the ADR Manager. The app advertises MADR-style ADRs but the stored format diverges from the official `adr-template.md`, so exported/committed ADRs are not portable to other MADR tooling and omit template-defined fields and sections.

**Current situation (as found in the codebase):**
- Frontmatter (`packages/shared/src/types.ts` `AdrFrontmatter`, parsed/serialized via `packages/core/src/adr/parse.ts` using `gray-matter`) uses `deciders` instead of MADR's `decision-makers`, and lacks `consulted` and `informed`. It also adds non-MADR keys (`id`, `title`, `tags`, `relations`).
- `AdrStatus` (`types.ts:3`) is `proposed | accepted | deprecated | superseded` — missing MADR's `rejected`; supersession is modeled through the `relations` array rather than the status string.
- `AdrEditingService.create()` (`packages/core/src/adr/editingService.ts`) writes an **empty body**, so new ADRs have none of the MADR sections (Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome / Consequences / Confirmation, Pros and Cons of the Options, More Information).
- The title is stored in frontmatter and rendered as the page H1, whereas MADR uses the H1 heading as the title.
- Existing ADR fixtures (e.g. `examples/0001-…md`) use a custom non-MADR body layout.

**What should change:** Bring the ADR structure into alignment with the official MADR template across the four divergences below, while preserving the existing architecture (git as source of truth, SQLite projection + `pnpm reindex`, optimistic concurrency by blob SHA) and keeping the unit, web, and Playwright E2E suites green (including any required migration of existing ADR files/fixtures and the parser back-compat path).

### In-scope divergences
1. **Frontmatter naming & coverage** — rename `deciders` → `decision-makers`; add optional `consulted` and `informed`. Provide a parser back-compat / migration path for existing files using `deciders`. Touch points: `packages/shared/src/types.ts`, `packages/core/src/adr/parse.ts`, `packages/core/src/adr/editingService.ts`, API routes (`apps/api/src/routes/adrs.ts` and request/response types), web client and edit form (`apps/web/src/api/client.ts`, ADR form components).
2. **Status enum** — add `rejected` to `AdrStatus`; reconcile the relationship between the `rejected`/`superseded` status values and relations-based supersession; surface `rejected` in the web status selector.
3. **Body scaffold** — change `create()` to emit the MADR section skeleton instead of an empty body; ensure parse/serialize round-trips and search indexing still behave.
4. **Title placement** — decide and implement whether the title remains in frontmatter or moves to the H1 heading (MADR convention); apply consistently across parse/serialize, API, web rendering/editing, and compare/diff.

### Constraints
- Preserve git-as-source-of-truth and the SQLite projection rebuildable via `pnpm reindex`.
- Preserve optimistic concurrency via blob SHA.
- Migrate or update existing ADR fixtures (`examples/`, E2E seed in `apps/e2e/harness/globalSetup.ts`) as needed.
- Keep `pnpm --filter @adr/e2e test:e2e`, web vitest, and core/shared/api unit suites green.

## Requirements
<!-- Will be generated in /kiro-spec-requirements phase -->
