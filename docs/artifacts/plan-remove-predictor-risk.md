# Plan: Remove Predictor and Risk Runner Agents

## Context

Predictor (~175 files) and Risk Runner (~72 files) are Diviner-dependent dashboard agents that route through the Bridge to an external Spark machine. They add complexity without value for this dev repo. Total blast radius: ~690 files to delete or modify.

## Milestones

### M1: Forge Web — Remove Views, Components, Stores, Services

**Agent:** `web-architecture-agent`

**Delete directories:**
- `apps/forge/web/src/components/AgentPanes/Prediction/` (10 files)
- `apps/forge/web/src/components/AgentPanes/Risk/` (16 files)
- `apps/forge/web/src/components/prediction/` (43 files)
- `apps/forge/web/src/views/prediction/` (20 files)
- `apps/forge/web/src/views/risk/` (13 files)
- `apps/forge/web/tests/e2e/specs/prediction-agent/` (6 files)

**Delete files:**
- `src/stores/predictionStore.ts`, `riskDashboardStore.ts`, `missedOpportunityStore.ts`, `reviewQueueStore.ts`, `learningStore.ts`, `testArticleStore.ts`, `testPriceDataStore.ts`, `testScenarioStore.ts`, `testTargetMirrorStore.ts`, `analystStore.ts`, `sourceStore.ts`
- `src/services/divinerBridgeService.ts`, `predictionDashboardService.ts`, `predictionAnalyticsService.ts`, `riskDashboardService.ts`
- `src/types/prediction-agent.ts`, `risk-agent.ts`
- Store test files referencing prediction/risk

**Modify:**
- `src/router/index.ts` — remove prediction/* and risk-runner routes
- `src/views/ForgeShellPage.vue` — remove Risk Dashboard and Predictor nav items + icon imports
- `src/composables/useApplicationContext.ts` — remove prediction/risk references
- `src/utils/agent-interaction-mode.ts` — remove prediction/risk references
- `src/utils/routePreloader.ts` — remove prediction/risk preload entries
- `vite.config.ts` — remove prediction/risk proxy entries and manual chunks

**Verify:** `cd apps/forge/web && npm run build`

---

### M2: Forge API — Remove Capabilities and Agent Modules

**Agent:** `api-architecture-agent`

**Delete directories:**
- `apps/forge/api/src/agents/predictor/` (164 files)
- `apps/forge/api/src/agents/risk-runner/` (67 files)

**Delete files:**
- `src/invoke/capabilities/predictor.capability.ts` + spec
- `src/invoke/capabilities/risk-runner.capability.ts` + spec

**Modify:**
- `src/app.module.ts` — remove PredictorModule and RiskRunnerModule imports
- `src/invoke/capabilities/capabilities.module.ts` — remove capability registrations
- `src/crawler/` — surgically remove prediction-specific source/subscription references (keep crawler itself)

**Verify:** `cd apps/forge/api && npm run build`

---

### M3: Pulse API — Remove Processing Engines

**Agent:** `api-architecture-agent`

**Delete directories:**
- `apps/ambient/pulse/api/src/processing/predictor/` (175 files)
- `apps/ambient/pulse/api/src/processing/risk-runner/` (72 files)

**Modify:**
- `src/app/app.module.ts` — remove PredictorModule and RiskRunnerModule imports
- `src/services/trigger-executor.service.ts` — remove prediction/risk scheduling entries
- `src/invoke/pulse-dispatch.service.ts` — remove prediction/risk dispatch
- `src/crawler/` — surgically remove prediction-specific references
- Test files — remove prediction/risk test cases from shared specs

**Verify:** `cd apps/ambient/pulse/api && npm run build`

---

### M4: Database — Drop Schemas

**Agent:** `api-architecture-agent`

**Schemas to drop:**
- `prediction` — core prediction tables
- `predictions` — duplicate/earlier version
- `risk` — risk analysis tables  
- `crawler` — sources and articles (only consumer was prediction engine)

**Create migration:**
- New migration file: `DROP SCHEMA IF EXISTS prediction CASCADE; DROP SCHEMA IF EXISTS predictions CASCADE; DROP SCHEMA IF EXISTS risk CASCADE; DROP SCHEMA IF EXISTS crawler CASCADE;`
- Apply to all migration directories (supabase root at minimum)

**Delete:**
- 54 prediction + 12 risk + crawler migration files

**Also delete:**
- `apps/forge/api/src/crawler/` directory (crawler module, runner, service, repository)
- `apps/ambient/pulse/api/src/crawler/` directory (if present)
- Remove crawler module registrations from app.module.ts files

**Verify:** Run migration against local Supabase, confirm schemas dropped

---

### M5: Config and Env Cleanup

**Agent:** `general-purpose`

**Modify `.env`:**
- Remove `RISK_RUNNER_*` vars
- Remove `DISABLE_SCHEDULED_RISK`, `DISABLE_SCHEDULED_PREDICTION`, `DISABLE_PREDICTION_RUNNERS`
- Remove `VITE_USE_DIVINER_BRIDGE` and Diviner bridge comments
- Remove `VITE_DIVINER_AGENT_ID`

**Modify `packages/transport-types/products/product-registry.ts`:**
- Remove "risk analysis" description text if present

**Verify:** `npm run dev:all` — all services start clean

---

## Execution Order

M1 → M2 → M3 can run in parallel (independent products).
M4 after M2+M3 (ensure no code references schemas before dropping).
M5 last (cleanup).

## Risks

| Risk | Mitigation |
|------|-----------|
| Crawler entanglement — prediction sources feed the crawler | Surgically remove prediction-specific source types, keep crawler for other use cases |
| Database migration ordering — forward migrations must run after code removal | Create DROP SCHEMA migration with timestamp after all prediction/risk migrations |
| Shared type leakage — prediction/risk types imported in shared code | Build verification after each milestone catches this |
| Forge agent store references prediction/risk | Audit `forge-agents.store.ts` during M1 |

## Final Verification

```bash
cd apps/forge/web && npm run build
cd apps/forge/api && npm run build  
cd apps/ambient/pulse/api && npm run build
npm run dev:all  # all 12 services start healthy
```
