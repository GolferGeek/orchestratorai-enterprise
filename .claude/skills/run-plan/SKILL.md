---
description: Execute a plan — invoke the assigned agents in order to build the code.
---

# /run-plan

**Input:** Path to the plan file (e.g. `docs/artifacts/plan.md`). The command also reads the PRD and intention for context.
**Output:** Built code under `apps/` and/or `packages/`, plus a summary of what was created.

When the user runs this command:

1. **Read the plan** from the path provided. If no path is given, ask for it — don't guess. If the plan is missing or ambiguous, send the user back to `/plan`.

2. **Read the PRD and intention** referenced in the plan for full context.

3. **Execute milestones in order**, invoking the agent named in each milestone:

   **Phase 00 — Monorepo shell:**
   - Invoke **monorepo-builder** → creates Turbo layout, `apps/`, `packages/`, `turbo.json`, root scripts.

   **Phase 00 — Track app:**
   - Invoke the track agent: **app-builder-http-workspace**, **app-builder-team-wiki**, **app-builder-pipeline-crm**, or **app-builder-ops-pulse**.

   **Phase 01 — Web SaaS killer (QuickBooks, Trello):**
   1. Invoke **surrealdb-builder** → schema files, auth scopes, seed data, shared `packages/surrealdb/`.
   2. Invoke the app-specific builder:
      - **app-builder-quickbooks-killer** → invoices, expenses, dashboard at `apps/quickbooks-killer/`
      - **app-builder-trello-killer** → boards, lists, cards at `apps/trello-killer/`

   **Phase 01 — iOS SaaS killer (Twitter, Facebook):**
   1. Invoke the app-specific builder:
      - **app-builder-twitter-killer** → feed, posts, follows at `apps/twitter-killer/`
      - **app-builder-facebook-killer** → profiles, friends, feed at `apps/facebook-killer/`
   2. (If plan includes sync) Invoke **surrealdb-builder** → schema and auth for server sync.

4. **After each milestone**, run the verification step from the plan (build, test) and fix trivial issues.

5. **Summarize** what was created:
   - Files and directories created
   - Exact commands to run the app (`npm run dev`, `surreal start`, `xcodebuild`, etc.)
   - Any env vars or setup steps needed
   - Test results

## Example usage

```
/run-plan docs/artifacts/plan.md
```

Arguments: `$ARGUMENTS` — path to the plan file.
