# PRD: Remove Predictor and Risk Runner Agents

**Intention:** [intention.md](./intention.md)

## Goals

1. **Remove all Predictor agent code** — views, components, stores, services, API capability, processing engine, types
2. **Remove all Risk Runner agent code** — views, components, stores, services, API capability, processing engine, types
3. **Remove the crawler** — sources, articles, source_crawls, agent_article_outputs — it only feeds prediction
4. **Remove the Diviner bridge service** — divinerBridgeService.ts routes prediction/risk through Bridge to Diviner; no other consumer
5. **Drop database schemas** — `prediction`, `predictions`, `risk`, `crawler` via forward migration
6. **Clean all references** — imports, module registrations, router entries, nav items, env vars, proxy entries, vite chunks, type re-exports
7. **Zero technical debt** — no orphaned code, no dead imports, no broken references anywhere in the monorepo

## Non-Goals

- Do NOT remove Marketing Swarm, Legal Department, or CAD Agent
- Do NOT remove the crawler concept if it's needed elsewhere (it isn't — verified)
- Do NOT touch the enterprise repo (orchestratorai-enterprise) — it keeps these agents
- Do NOT remove Protocol Lab (it has its own port range and is independent)
- Do NOT change the Bridge product itself — only remove the Diviner-specific bridge service in Forge web

## Scope by Product

### Forge Web (`apps/forge/web/`)
| What | Files | Action |
|------|-------|--------|
| `src/components/AgentPanes/Prediction/` | 10 | Delete directory |
| `src/components/AgentPanes/Risk/` | 16 | Delete directory |
| `src/components/prediction/` | 43 | Delete directory |
| `src/views/prediction/` | 20 | Delete directory |
| `src/views/risk/` | 13 | Delete directory |
| `tests/e2e/specs/prediction-agent/` | 6 | Delete directory |
| Prediction stores (predictionStore, analystStore, learningStore, etc.) | ~11 | Delete files |
| Risk store (riskDashboardStore) | 1 | Delete file |
| divinerBridgeService, predictionDashboardService, predictionAnalyticsService, riskDashboardService | 4 | Delete files |
| prediction-agent.ts, risk-agent.ts types | 2 | Delete files |
| Store test files referencing prediction/risk | ~4 | Delete files |
| `src/router/index.ts` | — | Remove prediction/* and risk-runner routes |
| `src/views/ForgeShellPage.vue` | — | Remove Risk Dashboard and Predictor nav items |
| `src/composables/useApplicationContext.ts` | — | Remove prediction/risk refs |
| `src/utils/routePreloader.ts` | — | Remove prediction/risk preload entries |
| `src/utils/agent-interaction-mode.ts` | — | Remove prediction/risk refs |
| `vite.config.ts` | — | Remove proxy entries and manual chunks |

### Forge API (`apps/forge/api/`)
| What | Files | Action |
|------|-------|--------|
| `src/agents/predictor/` | 164 | Delete directory |
| `src/agents/risk-runner/` | 67 | Delete directory |
| `src/crawler/` | ~10 | Delete directory |
| predictor.capability.ts + spec | 2 | Delete files |
| risk-runner.capability.ts + spec | 2 | Delete files |
| `src/app.module.ts` | — | Remove PredictorModule, RiskRunnerModule, CrawlerModule |
| `src/invoke/capabilities/capabilities.module.ts` | — | Remove capability registrations |

### Pulse API (`apps/ambient/pulse/api/`)
| What | Files | Action |
|------|-------|--------|
| `src/processing/predictor/` | 175 | Delete directory |
| `src/processing/risk-runner/` | 72 | Delete directory |
| `src/crawler/` (if present) | ~10 | Delete directory |
| `src/app/app.module.ts` | — | Remove PredictorModule, RiskRunnerModule |
| `src/services/trigger-executor.service.ts` | — | Remove prediction/risk scheduling |
| `src/invoke/pulse-dispatch.service.ts` | — | Remove prediction/risk dispatch |
| Test files referencing prediction/risk | ~8 | Modify or delete |

### Database
| Schema | Tables | Action |
|--------|--------|--------|
| `prediction` | predictors, predictions, analysts, universes, targets, learnings, etc. | DROP SCHEMA CASCADE |
| `predictions` | (duplicate/earlier version) | DROP SCHEMA CASCADE |
| `risk` | scopes, subjects, dimensions, assessments, composite_scores, debates | DROP SCHEMA CASCADE |
| `crawler` | sources, articles, source_crawls, agent_article_outputs | DROP SCHEMA CASCADE |

### Config / Environment
| What | Action |
|------|--------|
| `RISK_RUNNER_*` env vars | Remove from .env |
| `DISABLE_SCHEDULED_RISK`, `DISABLE_SCHEDULED_PREDICTION`, `DISABLE_PREDICTION_RUNNERS` | Remove from .env |
| `VITE_USE_DIVINER_BRIDGE`, `VITE_DIVINER_AGENT_ID` | Remove from .env |
| `VITE_BRIDGE_API_URL` Diviner comment block | Remove from .env |
| `.env.secrets` prediction/risk vars | Remove |

### Shared Packages
| What | Action |
|------|--------|
| `packages/transport-types/products/product-registry.ts` | Audit — remove any prediction/risk description text |
| `packages/transport-types/database/database.interface.ts` | Audit — prediction schema example in JSDoc |

## Success Criteria

1. **Build passes for all products:**
   ```
   cd apps/forge/web && npm run build       # ✅
   cd apps/forge/api && npm run build       # ✅
   cd apps/ambient/pulse/api && npm run build  # ✅
   cd apps/compose/web && npm run build     # ✅
   cd apps/admin/web && npm run build       # ✅
   cd apps/command/web && npm run build     # ✅
   ```

2. **All services start:**
   ```
   npm run dev:all   # 12/13 services healthy (protocol-lab excluded)
   ```

3. **Remaining agents work:**
   - Marketing Swarm loads at `/app/agents/marketing-swarm`
   - Legal Department loads at `/app/agents/legal-department`
   - CAD Agent loads at `/app/agents/cad-agent`

4. **No orphaned references:**
   ```
   grep -r "predictor\|prediction\|risk-runner\|risk_runner\|RiskRunner\|Predictor" \
     apps/forge/ apps/ambient/pulse/ apps/compose/ apps/admin/ apps/command/ packages/ \
     --include="*.ts" --include="*.vue" | grep -v node_modules | grep -v CLAUDE.md | \
     grep -v protocol-lab | grep -v dist/ | grep -v test-marketing | wc -l
   # Should be 0 (or near-zero with only comments/docs)
   ```

5. **Database schemas dropped:**
   ```sql
   SELECT schema_name FROM information_schema.schemata
   WHERE schema_name IN ('prediction', 'predictions', 'risk', 'crawler');
   -- Should return 0 rows
   ```

6. **No dead nav items** — sidebar shows only Marketing Swarm, Legal Department, CAD Agent

7. **No dead routes** — navigating to `/app/prediction/*` or `/app/agents/risk-runner` returns 404 or redirects cleanly

8. **No dead env vars** — `.env` has no `RISK_RUNNER_*`, `DISABLE_SCHEDULED_PREDICTION`, `VITE_DIVINER_*` entries

## Test Expectations

- Existing Marketing Swarm, Legal Department, and CAD Agent tests continue to pass
- Forge API builds without errors (no missing module imports)
- Forge Web builds without errors (no missing component/view imports)
- Pulse API builds without errors (no missing processing module imports)
- No TypeScript errors referencing deleted types

## Risks

| Risk | Mitigation |
|------|-----------|
| Shared types leak — prediction/risk types imported by non-prediction code | Build verification after each milestone; grep audit |
| Crawler entanglement — other code might reference crawler tables | Verified: no non-prediction consumers. Delete entirely |
| Migration ordering — DROP SCHEMA must run correctly | Use `IF EXISTS` and `CASCADE`; test against local Supabase |
| Store cross-references — forge-agents.store.ts might import prediction stores | Audit during Forge Web milestone |
| Forge API app.module has deep import chains | Delete directories first, then fix imports — build errors will surface everything |
