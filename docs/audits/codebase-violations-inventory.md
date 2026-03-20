# Codebase Violations Inventory

Generated: 2026-03-16 | Plan step: step-1-0

## Summary

| Concern | Violations | Severity |
|---------|-----------|----------|
| ExecutionContext capsule violations | 116+ instances across 4 products | HIGH |
| Direct Supabase client usage | 6 instances across 2 products | HIGH/CRITICAL |
| Import namespace inconsistencies | 0 code issues (CLAUDE.md spec incorrect) | LOW |

---

## 1. ExecutionContext Capsule Violations

### 1.1 Destructuring (22 instances)

ExecutionContext being broken apart instead of passed whole.

**Compose API** (11 instances):
- `apps/compose/api/src/agent2agent/services/base-agent-runner/build.handlers.ts` — 9 destructures of `buildBuildActionContext()` result
- `apps/compose/api/src/agent2agent/services/base-agent-runner/plan.handlers.ts` — 9 destructures
- `apps/compose/api/src/agent2agent/plans/services/plan-versions.service.ts` — 7 destructures
- `apps/compose/api/src/agent2agent/services/agent-mode-router.service.ts:219` — `const { orgSlug, agentSlug } = context`

**Forge API** (11 instances — identical code copies from Compose):
- Same files mirrored under `apps/forge/api/src/agent2agent/`

**Compose Web** (1 instance):
- `apps/compose/web/src/services/compose-api.service.ts:157` — `const { orgSlug } = request.context`

### 1.2 Backend Construction (11 instances)

Backend creating ExecutionContext objects instead of receiving from frontend.

**Pulse API — Documented automation pattern** (7 instances):
- `apps/ambient/pulse/api/src/processing/risk-runner/runners/risk-analysis.runner.ts:149-165`
- `apps/ambient/pulse/api/src/processing/risk-runner/runners/risk-evaluation.runner.ts:264-280`
- `apps/ambient/pulse/api/src/processing/predictor/services/source-research.service.ts:51-64`
- `apps/ambient/pulse/api/src/processing/predictor/services/article-processor.service.ts:86-99`
- `apps/ambient/pulse/api/src/processing/predictor/services/evaluation.service.ts:65-78`
- `apps/ambient/pulse/api/src/processing/predictor/services/predictor-management.service.ts:43-56`
- `apps/ambient/pulse/api/src/processing/predictor/runners/batch-signal-processor.runner.ts:55-68`

All use the v1 shape including taskId/planId/deliverableId. These inform the **step-2c-1** Pulse automation context contract.

**Forge API — Duplicate predictor code** (4 instances):
- `apps/forge/api/src/agents/predictor/services/source-research.service.ts:51-64`
- `apps/forge/api/src/agents/predictor/services/article-processor.service.ts:86-99`
- `apps/forge/api/src/agents/predictor/services/evaluation.service.ts:65-78`
- `apps/forge/api/src/agents/predictor/services/predictor-management.service.ts:43-56`

These are code-for-code copies of Pulse services that should not exist in Forge.

**Forge API — Customer service** (2 instances):
- `apps/forge/api/src/customer-service/customer-service.service.ts:101-114` — Guest session context
- `apps/forge/api/src/customer-service/customer-service.service.ts:121-138` — Authenticated user context

### 1.3 Mutation After Instantiation (18+ instances)

Backend code mutating ExecutionContext fields mid-flight.

**Compose API**:
- `apps/compose/api/src/agent2agent/services/base-agent-runner/converse.handlers.ts:110` — Mutates `conversationId`
- `apps/compose/api/src/agent2agent/services/base-agent-runner/plan.handlers.ts:188,322,376` — Mutates `planId`
- `apps/compose/api/src/agent2agent/services/context-agent-runner.service.ts:604-605` — Mutates `planId`
- `apps/compose/api/src/agent2agent/services/api-agent-runner.service.ts:1197` — Mutates `conversationId`
- `apps/compose/api/src/agent2agent/deliverables/deliverable-versions.controller.ts:81,83,244,280,323,359,398` — Mutates `userId` and `deliverableId`
- `apps/compose/api/src/agent2agent/agent2agent.controller.ts:586-587,595-596,771-772,779-780` — Mutates `deliverableId`

**Forge API** — Identical mutations in duplicate code.

### 1.4 Individual Field Passing (30+ instances)

Functions accepting individual EC fields instead of the whole capsule.

**Flow API** (most extensive):
- `apps/flow/api/src/flow/flow.service.ts` — 20+ methods take `userId: string` individually
- `apps/flow/api/src/flow/flow.controller.ts` — Route handlers extract `@Param('userId')`, `@Param('orgSlug')` individually
- `apps/flow/api/src/teams/teams.service.ts` — 10+ methods take `userId`, `orgSlug` individually

**Compose/Forge API**:
- `apps/compose/api/src/agent2agent/tasks/task-status.service.ts:472-476` — `createTask(taskId, userId)`
- Various plan/deliverable services pass `planId`, `userId` individually

### 1.5 What's Clean

- All LLM service calls properly receive ExecutionContext
- No `as any` patterns suppressing EC type checks
- No try/catch blocks swallowing missing context

---

## 2. Direct Supabase Client Usage

### 2.1 Pulse (HIGH — 4 violations)

**db-watcher.service.ts** — Direct `createClient()` for Realtime subscriptions:
- `apps/ambient/pulse/api/src/listeners/db-watcher.service.ts:3,38-39,48`
- Needs Realtime subscription support (not available in current database plane)

**triggers.controller.ts** — 3x direct `createClient()` for CRUD:
- `apps/ambient/pulse/api/src/triggers/triggers.controller.ts:89-94,131-136,163-168`
- Should use the already-injected `AmbientDatabaseService` which does the same operations correctly

### 2.2 Bridge (CRITICAL — 2 violations)

**bridge-database.service.ts** — Direct `createClient()` with hardcoded dev key fallback:
- `apps/ambient/bridge/api/src/database/bridge-database.service.ts:2,17-23`
- Hardcoded service role key on line 20-21 (security anti-pattern)
- Bridge has NO planes directory at all

**messaging-database.service.ts** — Direct `createClient()` with fallback chain:
- `apps/ambient/bridge/api/src/messaging/messaging-database.service.ts:2,14-21`
- Falls back to ANON_KEY if SERVICE_ROLE_KEY missing
- Comment explicitly acknowledges: "Bridge API has no shared database plane"

### 2.3 Products With Clean Plane Usage

Auth, Compose, Forge, Flow, Admin — all use `DATABASE_SERVICE` injection correctly.

---

## 3. Import Namespace

### 3.1 Finding: No Code Issues

All 1,412 imports consistently use `@orchestrator-ai/transport-types` (hyphenated), which matches the package.json `name` field. Zero inconsistencies.

### 3.2 CLAUDE.md Specification Error

CLAUDE.md references `@orchestratorai/transport-types` (no hyphen). The actual package name is `@orchestrator-ai/transport-types`. CLAUDE.md should be updated to match reality.

### 3.3 Two Namespaces (Intentional)

- `@orchestrator-ai/transport-types` — 1,412 imports (correct)
- `@orchestratorai/ui` — 66 imports (separate package, correct)

### 3.4 Subpath Imports to Removed V1 Files

12 files import from subpaths that no longer exist after v2:
- `@orchestrator-ai/transport-types/modes/build.types` (4 files)
- `@orchestrator-ai/transport-types/modes/hitl.types` (2 files)
- `@orchestrator-ai/transport-types/shared/strict-aliases` (2 files)
- `@orchestrator-ai/transport-types/shared/data-types` (2 files)

These will be resolved during product migration phases.

---

## Implications for V2 Implementation

### ExecutionContext V2

The audit confirms that removing `taskId`, `planId`, and `deliverableId` from the shared core will affect:
- **Compose/Forge**: Mutation patterns for planId/deliverableId must be replaced with product-local state
- **Pulse**: Backend construction patterns must adopt the new v2 shape (step-2c-1)
- **Flow**: Already doesn't use full EC — needs to adopt v2 at minimum for cross-product flows

### Pulse Automation Context (step-2c-1)

7 Pulse services construct ExecutionContext with:
- `userId: NIL_UUID` (system user)
- `taskId: this.generateTaskId()` or string-based IDs
- Product-specific defaults for provider/model

These must be codified as the Pulse system-triggered EC contract.

### Forge Duplicate Code

Forge contains identical copies of Pulse predictor services. These duplicates:
- Will be removed during Forge restructuring (Phase 4)
- Should not drive shared contract decisions

### Bridge Planes Gap

Bridge is the only product without a planes directory. Must be created during Phase 5 (Bridge alignment).
