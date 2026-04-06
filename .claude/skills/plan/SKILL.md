---
description: Turn a PRD into an implementation plan — milestones, agent assignments, risks, verification steps.
---

# /plan

**Input:** Path to the PRD file (e.g. `docs/artifacts/prd.md`). The command also reads the intention file referenced in the PRD.
**Output:** A plan file at the path the user specifies (default: `docs/artifacts/plan.md`).

When the user runs this command:

1. **Read the PRD** from the path provided. If no path is given, ask for it — don't guess.

2. **Read the intention file** that the PRD references. If the PRD doesn't name one, ask the user for the intention path.

3. **Produce a plan** with these sections:
   - **Milestones** — ordered list of build steps. Each milestone names:
     - What gets built
     - Which **agent** handles it (see below)
     - What files/directories are created or changed
     - How to verify it worked (build command, test command, or manual check)
   - **Risks** — what could go wrong and how to mitigate
   - **Verification** — the exact commands to run when the build is done (`npm run build`, `npm run test`, `xcodebuild`, etc.)

4. **Agent assignments** for each phase:

   **Phase 00:**
   - Monorepo shell → **monorepo-builder**
   - Track app → **app-builder-http-workspace**, **app-builder-team-wiki**, **app-builder-pipeline-crm**, or **app-builder-ops-pulse**

   **Phase 01 — Web apps** (QuickBooks killer, Trello killer):
   - Milestone 1: SurrealDB schema + auth + seed → **surrealdb-builder**
   - Milestone 2: Next.js app → **nextjs-saas-builder**

   **Phase 01 — iOS apps** (Twitter killer, Facebook killer):
   - Milestone 1: SwiftData models + SwiftUI views + tests → **ios-builder**
   - (Optional) Milestone 2: SurrealDB sync → **surrealdb-builder**

5. **Sanity check**: Does every PRD goal have a milestone that delivers it? Does any milestone build something not in the PRD? Flag mismatches.

6. **Challenge the user**: "Does this plan cover every PRD goal? Are the milestones in the right order?" Wait for their input before finalizing.

7. **Write the plan** to `docs/artifacts/plan.md` (or path they specify). Tell the user the exact path so they can pass it to `/run-plan`.

## Example usage

```
/plan docs/artifacts/prd.md
```

Arguments: `$ARGUMENTS` — path to the PRD file.
