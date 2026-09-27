---
name: enterprise-workflow-skill
description: Build or change a LangGraph workflow on the enterprise workflow runtime (apps/api/src/workflows, the web kit). Use for a new workflow, a new step, a human gate, restart points, export, docs/showcase, or an ambient launch.
---

# Enterprise workflow

Read these first; they are the source of truth, this skill only points at them:

1. `docs/architecture/workflows.md`: the runtime, the file set, the rules,
   testing, the definition of done.
2. `docs/workflow-factory/intention-template.md`: fill it in (in the effort
   file) before coding a new workflow.
3. `apps/api/src/workflows/decision-risk/`: the reference implementation,
   including `__tests__/decision-risk.pilot.integration.spec.ts`.

Working loop:

- Agents are rows: seed `workflows.agent_definitions` and
  `agent_definition_links` in a migration (`OWNER TO postgres`); set
  `workflows.model_profiles` per org and role through
  `PUT /workflows/admin/model-profiles`.
- Changed `packages/transport-types`? Run `npm run build:transport-types`.
- Gates: `npx tsc --noEmit -p apps/api`, eslint, the API specs (pilot spec with
  `HUMAN_REVIEW_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:6011/postgres`),
  `npm test` and `npx vue-tsc --noEmit` in `apps/web`.
- Ship: commit to main, `scripts/migrate-deployed.sh` if there are migrations,
  `npm run deploy:studio`, then one live run in the browser.
