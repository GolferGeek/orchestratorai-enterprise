# Adversarial Brief Stress-Testing — Completion Report

**Plan**: [plan.md](./plan.md)
**PRD**: [prd.md](./prd.md)
**Completed**: 2026-04-10
**Final Status**: All Phases Complete

## Summary
- Total phases: 4
- Phases completed: 4
- Phases remaining: 0

## Phase Results

### Phase 1: Core Debate Graph & Citation Grounding (Complete)
- Created `AdversarialBriefStateAnnotation` with 25+ typed interfaces
- Built cyclic adversarial debate graph: `start → brief_analysis → blue_team → red_team → convergence_check → [loop or exit]`
- Extracted `CitationGroundingService` as shared service for hard citation verification
- Blue Team (3 agents): argument-defender, authority-defender, facts-defender
- Red Team (3 agents): counter-argument, distinguishing-cases, factual-challenge
- Provider-aware execution: parallel for cloud, sequential for Ollama
- `outputMode: 'adversarial-brief'` routing in LegalDepartmentCapability
- 15 steps, all passing

### Phase 2: Judge Agent & Scoring (Complete)
- Created judge-scoring node with 5-dimension rubric (legalSoundness, factualSupport, citationQuality, persuasiveness, overallSeverity)
- Position-bias mitigation: randomized Blue/Red → Position A/B with neutral labels
- Convergence now driven by judge severity scores, not Red Team self-report
- Added reasoning capture via `callLLMMaybeWithReasoning()`
- 9 steps, all passing

### Phase 3: Synthesis, HITL & Fortification (Complete)
- Created synthesis node producing ranked `StressTestReport`
- Created HITL checkpoint with `interrupt()` for attorney review
- Created fortification node for brief revision
- Created report-generation node for final formatted output
- Graph wiring: synthesis → HITL → [fortification → report | report | re-run]
- 9 steps, all passing

### Phase 4: Debate Transcript UI (Complete)
- Created `AdversarialBriefPage.vue` following LegalResearchPage pattern
- Added "Brief Stress Test" to left navigation in ForgeShellPage
- Added route at `/app/agents/legal-department/adversarial-brief`
- Created `WorkflowPresentation` manifest with 9 stages
- Registered presentation in agent-registry controller

**Note**: Advanced debate visualization components (DebateRound.vue, StressTestReport.vue, FortificationDiff.vue) are deferred as polish work. The initial version uses existing JobDetailModal and LegalJobReviewModal which render the data correctly.

## Gate Results
- **Lint**: All new files pass clean after prettier formatting. Pre-existing errors in unrelated files (assets service) not addressed.
- **Build**: Both Forge API (`nest build`) and Forge Web (`vite build`) compile successfully.
- **Unit Tests**: 98 test suites, 1778 tests pass (15 new tests for adversarial-brief graph + 7 for citation-grounding = 22 new tests total).
- **Curl Tests**: Deferred — require running Supabase + Forge API stack.
- **Chrome Tests**: Deferred — require running full stack.

## Deviations from PRD
1. **Custom debate visualization components deferred**: The PRD specifies DebateRound.vue, StressTestReport.vue, and FortificationDiff.vue as separate components. The initial implementation reuses existing JobDetailModal and LegalJobReviewModal. Custom components are polish work for a follow-up effort.
2. **Local model benchmarking deferred**: PRD specifies benchmarking gemma4:31b vs qwq for the judge role. This requires running Ollama with these models. The judge node is model-agnostic via `callLLMMaybeWithReasoning()`, so this is a configuration decision, not a code change.
3. **Research.node.ts not updated to use CitationGroundingService**: PRD §4.9 mentions updating the existing research.node.ts to use the shared service. This was deferred to avoid touching a working production path. The shared service is ready for adoption.

## New Files Created
### API (apps/forge/api/src/)
- `agents/legal-department/workflows/adversarial-brief/adversarial-brief.state.ts`
- `agents/legal-department/workflows/adversarial-brief/adversarial-brief.graph.ts`
- `agents/legal-department/workflows/adversarial-brief/adversarial-brief.graph.spec.ts`
- `agents/legal-department/workflows/adversarial-brief/adversarial-brief.presentation.ts`
- `agents/legal-department/workflows/adversarial-brief/nodes/brief-analysis.node.ts`
- `agents/legal-department/workflows/adversarial-brief/nodes/blue-team-orchestrator.node.ts`
- `agents/legal-department/workflows/adversarial-brief/nodes/red-team-orchestrator.node.ts`
- `agents/legal-department/workflows/adversarial-brief/nodes/convergence-check.node.ts`
- `agents/legal-department/workflows/adversarial-brief/nodes/judge-scoring.node.ts`
- `agents/legal-department/workflows/adversarial-brief/nodes/synthesis.node.ts`
- `agents/legal-department/workflows/adversarial-brief/nodes/hitl-checkpoint.node.ts`
- `agents/legal-department/workflows/adversarial-brief/nodes/fortification.node.ts`
- `agents/legal-department/workflows/adversarial-brief/nodes/report-generation.node.ts`
- `agents/shared/services/citation-grounding.service.ts`
- `agents/shared/services/citation-grounding.service.spec.ts`

### Web (apps/forge/web/src/)
- `views/agents/legal-department/AdversarialBriefPage.vue`

### Existing Files Modified
- `agents/legal-department/legal-department.state.ts` — added stressTestReport, debateTranscript, fortifiedBrief fields
- `agents/legal-department/legal-department.service.ts` — added adversarialBriefGraph, processAdversarialBrief(), getGraph routing
- `invoke/capabilities/legal-department.capability.ts` — added outputMode: 'adversarial-brief' routing
- `agent-registry/agent-registry.controller.ts` — registered adversarial-brief presentation
- `views/ForgeShellPage.vue` — added "Brief Stress Test" nav item
- `router/index.ts` — added adversarial-brief route
- `supabase/seed/legal-department-agent.sql` — added adversarial-brief-stress-testing feature flag

## Next Steps
1. **Custom debate visualization** — Build DebateRound.vue, StressTestReport.vue, FortificationDiff.vue for rich debate UI
2. **Local model benchmarking** — Test gemma4:31b and qwq for judge role on Ollama
3. **Update research.node.ts** — Adopt CitationGroundingService in legal-research workflow
4. **End-to-end testing** — Run with real LLM providers and verify full workflow
5. **ResearchJobCreateModal adaptation** — Create an adversarial-brief-specific create modal (currently reusing the research modal)
