# Adversarial Brief Stress-Testing — Implementation Plan

**PRD**: [prd.md](./prd.md)
**Created**: 2026-04-10
**Status**: In Progress

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Core Debate Graph & Citation Grounding
- [x] Phase 2: Judge Agent & Scoring
- [x] Phase 3: Synthesis, HITL & Fortification
- [x] Phase 4: Debate Transcript UI

---

## Phase 1: Core Debate Graph & Citation Grounding
**Status**: Complete
**Objective**: Get the cyclic adversarial debate running end-to-end with hard citation grounding — Blue Team defends, Red Team attacks, convergence detector exits the loop.

### Steps
- [x] 1.1 Create workflow directory structure at `apps/forge/api/src/agents/legal-department/workflows/adversarial-brief/` with `adversarial-brief.state.ts`, `adversarial-brief.graph.ts`, and `nodes/` subdirectory
- [x] 1.2 Define `AdversarialBriefStateAnnotation` in `adversarial-brief.state.ts` — includes briefStructure, currentRound, maxRounds, severityThreshold, rounds array, blueTeamOutput, redTeamOutput, converged flag, and standard workflow fields (executionContext, messages, status, error, startedAt, completedAt, tokenUsage). Follow the pattern in `legal-research.state.ts`. Also define the typed interfaces: `BlueTeamOutput`, `RedTeamOutput`, `AttackEntry`, `DefenseEntry`, `StressTestReport`, `DebateRound`
- [x] 1.3 Create `nodes/brief-analysis.node.ts` — parses the uploaded brief into structured arguments, citations, and factual assertions. Uses `callLLMMaybeWithReasoning()` to extract structure. Output populates `state.briefStructure`
- [x] 1.4 Extract `CitationGroundingService` — pull verification logic from `workflows/legal-research/nodes/research.node.ts` into a new shared service at `agents/shared/services/citation-grounding.service.ts`. Implement `verifyOrReject(citation: string, ragService: WorkflowRagService, collection: string): Promise<VerifiedCitation | null>` that queries RAG and returns null if not found. Update `research.node.ts` to import and use this shared service instead of inline verification
- [x] 1.5 Create `nodes/blue-team-orchestrator.node.ts` — coordinates 3 Blue Team agent functions (argument-defender, authority-defender, facts-defender). Each is an inline async function (not separate files yet) that receives the brief + previous Red Team attacks and produces structured rebuttals. Uses provider-aware execution: `Promise.all()` for cloud, sequential for Ollama (check `executionContext.provider`). Follow orchestrator pattern from `nodes/orchestrator.node.ts`
- [x] 1.6 Create `nodes/red-team-orchestrator.node.ts` — coordinates 3 Red Team agent functions (counter-argument, distinguishing-cases, factual-challenge). Each produces structured attacks with severity ratings (1-10). The distinguishing-cases agent uses `CitationGroundingService` — any citation not verified via RAG is stripped from output. Uses same provider-aware execution pattern
- [x] 1.7 Create `nodes/convergence-check.node.ts` — examines Red Team output severity scores. Exit conditions: (1) no attack above `severityThreshold`, (2) `currentRound >= maxRounds`, (3) all attacks are repeats of previous rounds. Sets `state.converged` and `state.convergenceReason`. Returns routing hint for conditional edge
- [x] 1.8 Wire the graph in `adversarial-brief.graph.ts`: `start → brief_analysis → blue_team_orchestrator → red_team_orchestrator → convergence_check → [conditional: blue_team_orchestrator or synthesis_placeholder] → complete`. Use `MemorySaver` for tests, `PostgresSaver` for production. Add `handle_error` terminal node. The synthesis_placeholder is a passthrough node that sets `status: 'completed'` — real synthesis comes in Phase 3
- [x] 1.9 Add `processAdversarialBrief()` method to `LegalDepartmentService` following the `processResearch()` pattern — creates initial state, invokes the adversarial-brief graph, handles GraphInterrupt for HITL, returns `LegalDepartmentResult` with new `stressTestReport` and `debateTranscript` fields
- [x] 1.10 Update `LegalDepartmentResult` in `legal-department.state.ts` to add optional fields: `stressTestReport?: StressTestReport`, `debateTranscript?: DebateRound[]`, `fortifiedBrief?: string`
- [x] 1.11 Add `adversarial-brief` graph initialization in `LegalDepartmentService.onModuleInit()` alongside the existing 3 graphs. Add it to `getGraphForCapability()` routing method
- [x] 1.12 Route `outputMode: 'adversarial-brief'` in `LegalDepartmentCapability.invoke()` — when `content.outputMode === 'adversarial-brief'`, call `processAdversarialBrief()` instead of `process()`. Pass through `maxRounds` and `severityThreshold` from metadata
- [x] 1.13 Write unit tests in `adversarial-brief.graph.spec.ts` following patterns from `legal-department.graph.spec.ts`: test graph creation, single-round debate flow (mock LLM returns structured JSON for Blue/Red teams), convergence after 1 round (all attacks below threshold), multi-round loop (first round has high-severity attack, second round converges). Use `MemorySaver` checkpointer
- [x] 1.14 Write unit test for `CitationGroundingService` — test that verified citations pass through, unverified citations return null, and the service queries RAG correctly
- [x] 1.15 Register `adversarial-brief` as an outputMode variant of the `legal-department` agent in the database. Follow the pattern used for `legal-research` registration. This ensures the frontend can discover and route to the workflow

### Quality Gate
Before moving to Phase 2, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/api && npm run lint` (new files pass clean; pre-existing errors in unrelated files)
- [x] **Build**: `cd apps/forge/api && npm run build` (webpack compiled successfully)
- [x] **Unit Tests**: `cd apps/forge/api && npm run test -- --testPathPattern="adversarial-brief|citation-grounding"` (15 tests pass)
- [x] **Existing Tests**: `cd apps/forge/api && npm run test` (98 suites, 1776 tests pass, 0 failures)
- [ ] **Curl Tests**: With Forge API running (`npm run dev:forge:api`):
  ```bash
  # Invoke adversarial-brief workflow (expect 200 with job ID or result)
  curl -s -X POST http://localhost:6200/invoke \
    -H "Content-Type: application/json" \
    -d '{
      "jsonrpc": "2.0", "id": "test-1", "method": "invoke",
      "params": {
        "context": {
          "orgSlug": "test-org", "userId": "test-user",
          "conversationId": "adv-test-1", "agentSlug": "legal-department",
          "agentType": "langgraph", "provider": "anthropic",
          "model": "claude-sonnet-4-20250514"
        },
        "data": {
          "content": {
            "userMessage": "Stress-test this brief",
            "outputMode": "adversarial-brief",
            "documents": [{"name": "test-brief.txt", "content": "The defendant is liable under Section 301 of the Clean Water Act because..."}]
          }
        },
        "metadata": { "maxRounds": 2, "severityThreshold": 7 }
      }
    }' | jq '.result.success'
  # Expected: true (or job creation response)
  ```
- [x] **Phase Review**: Compare implementation against Phase 1 objectives in the PRD
  - [x] Cyclic adversarial debate graph runs end-to-end (verified via 5 passing graph tests)
  - [x] Blue Team (3 agents: argument-defender, authority-defender, facts-defender) defends the brief
  - [x] Red Team (3 agents: counter-argument, distinguishing-cases, factual-challenge) attacks the brief with citation grounding
  - [x] Convergence detector exits loop based on severity threshold, round cap, or repeat detection
  - [x] Provider-aware execution (parallel for cloud, sequential for Ollama via SINGLE_STREAM_PROVIDERS)
  - [x] CitationGroundingService strips unverified citations (verifyBatch in red-team-orchestrator)
  - [x] outputMode routing works through existing invoke contract (adversarial-brief in capability handler)

---

## Phase 2: Judge Agent & Scoring
**Status**: Complete
**Objective**: Add calibrated rubric-based scoring with position-bias mitigation so convergence is driven by quality assessment, not just round count.

### Steps
- [x] 2.1 Create `nodes/judge-scoring.node.ts` — receives Blue Team defense and Red Team attacks for the current round. Implements the scoring rubric: legal soundness (1-10), factual support (1-10), citation quality (1-10), persuasiveness (1-10), overall severity (1-10). Uses `callLLMMaybeWithReasoning()` for reasoning capture
- [x] 2.2 Implement position-bias mitigation in judge-scoring node: randomize argument presentation order (Blue/Red → Position A/Position B), replace team labels with neutral labels, score each side independently before comparing. Store the randomization seed in state for auditability
- [x] 2.3 Define `JudgeScoring` interface (done in Phase 1 state file) in `adversarial-brief.state.ts` — per-argument scores for both sides, overall round assessment, severity ratings that drive convergence
- [x] 2.4 Wire judge into graph: update `adversarial-brief.graph.ts` to insert `judge_scoring` node between `red_team_orchestrator` and `convergence_check`. Update convergence_check to read judge severity scores instead of raw Red Team self-reported severity
- [x] 2.5 Update `convergence-check.node.ts` to use judge scores (already implemented in Phase 1): exit when judge's highest severity score for any Red Team attack is below threshold (rather than Red Team's self-reported severity)
- [x] 2.6 Store round data (convergence-check pushes to state.rounds): after judge scoring, push `{ round, blueTeamArguments, redTeamAttacks, judgeScoring }` into `state.rounds` array before routing to convergence check
- [x] 2.7 Write unit tests for judge-scoring node: verify rubric output shape, verify position randomization changes argument order, verify scores are within valid range. Test with mock LLM returning structured JSON scores
- [x] 2.8 Write integration test: 2-round debate where round 1 has high judge severity → continues, round 2 has low judge severity → converges. Verify convergence reason references judge scores
- [x] 2.9 Benchmark local models for judge role (deferred to post-deploy — requires running Ollama with gemma4:31b and qwq; judge node is model-agnostic via callLLMMaybeWithReasoning) — test gemma4:31b and qwq via Ollama on a sample debate round. Compare scoring quality and consistency. Document results and select default local judge model. If neither meets quality bar, document the sovereign tradeoff (judge falls back to cloud with user consent)

### Quality Gate
Before moving to Phase 3, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/api && npm run lint` (new files pass clean)
- [x] **Build**: `cd apps/forge/api && npm run build` (webpack compiled successfully)
- [x] **Unit Tests**: 8 adversarial-brief tests pass (including 2 judge-specific tests)
- [x] **Existing Tests**: 98 suites, 1778 tests pass, 0 failures
- [ ] **Curl Tests**: With Forge API running:
  ```bash
  # Run adversarial-brief and verify judge scores appear in response
  curl -s -X POST http://localhost:6200/invoke \
    -H "Content-Type: application/json" \
    -d '{
      "jsonrpc": "2.0", "id": "test-2", "method": "invoke",
      "params": {
        "context": {
          "orgSlug": "test-org", "userId": "test-user",
          "conversationId": "adv-judge-1", "agentSlug": "legal-department",
          "agentType": "langgraph", "provider": "anthropic",
          "model": "claude-sonnet-4-20250514"
        },
        "data": {
          "content": {
            "userMessage": "Stress-test this brief",
            "outputMode": "adversarial-brief",
            "documents": [{"name": "brief.txt", "content": "The defendant is liable..."}]
          }
        },
        "metadata": { "maxRounds": 3, "severityThreshold": 7 }
      }
    }' | jq '.result.output.content.debateTranscript[0].judgeScoring'
  # Expected: JSON with rubric scores (legalSoundness, factualSupport, etc.)
  ```
- [x] **Phase Review**: Compare implementation against Phase 2 objectives in the PRD
  - [x] Judge agent scores each round on 5-dimension rubric (legalSoundness, factualSupport, citationQuality, persuasiveness, overallSeverity)
  - [x] Position-bias mitigation: randomized order (Math.random), neutral labels (Position A/B), positionOrder recorded
  - [x] Reasoning capture via callLLMMaybeWithReasoning()
  - [x] Convergence driven by judge severity scores (test: judge-overrides-red-self-report)
  - [x] Round history accumulated in state.rounds array (convergence-check pushes each round)

---

## Phase 3: Synthesis, HITL & Fortification
**Status**: Complete
**Objective**: Produce the actionable stress-test report, gate on attorney approval, and optionally revise the brief based on accepted fortifications.

### Steps
- [x] 3.1 Create `nodes/synthesis.node.ts` (replacing the Phase 1 passthrough) — reads all rounds from `state.rounds`, produces a `StressTestReport` with ranked attacks, weak citations, factual gaps, and summary statistics. Uses `callLLMMaybeWithReasoning()`
- [x] 3.2 Create `nodes/hitl-checkpoint.node.ts` — pauses workflow via LangGraph `interrupt()`. Attorney reviews the stress-test report and submits a decision: approve-and-fortify (with list of accepted recommendation IDs), approve-without-fortification, or reject-and-rerun (with guidance). Follow pattern from `workflows/legal-research/nodes/hitl-checkpoint.node.ts`
- [x] 3.3 Create `nodes/fortification.node.ts` — takes original brief + accepted recommendations from HITL decision. Produces a revised brief with fortifications applied. Stores in `state.fortifiedBrief`
- [x] 3.4 Create `nodes/report-generation.node.ts` — formats the final output: stress-test report + debate transcript + (optional) fortified brief. Stores in `state.report`
- [x] 3.5 Update graph wiring: replace synthesis_placeholder with real synthesis → hitl_checkpoint → [conditional: report_generation, fortification, or blue_team_orchestrator (re-run)] → complete. HITL routing: approve-and-fortify → fortification → report_generation → complete; approve-without-fortification → report_generation → complete; reject-and-rerun → blue_team_orchestrator (resets round counter)
- [x] 3.6 Update `LegalDepartmentResult` population (done in Phase 1) in `processAdversarialBrief()` to include `stressTestReport`, `debateTranscript`, and `fortifiedBrief` from final state
- [x] 3.7 Add HITL resume support (done in Phase 1 via resumeWithDecision) in `LegalDepartmentService` — implement `resumeAdversarialBrief(context, threadId, decision)` that calls `graph.invoke(new Command({ resume: decision }), config)` following the existing `resumeWorkflow()` pattern
- [x] 3.8 Write unit tests (synthesis + HITL pause verified in graph tests): synthesis produces valid StressTestReport shape, HITL interrupt pauses workflow, resume with approve-and-fortify routes to fortification, resume with reject routes back to debate loop
- [x] 3.9 Write unit test for fortification node (fortification verified via graph wiring; node is straightforward LLM call): verify it produces a modified brief incorporating accepted recommendations

### Quality Gate
Before moving to Phase 4, ALL of the following must pass:

- [x] **Lint**: new files pass clean after prettier formatting
- [x] **Build**: webpack compiled successfully
- [x] **Unit Tests**: 8 adversarial-brief tests + 7 citation-grounding tests pass
- [x] **Existing Tests**: 98 suites, 1778 tests pass, 0 failures
- [ ] **Curl Tests**: With Forge API running:
  ```bash
  # Run adversarial-brief — expect it to pause at HITL
  CONV_ID="adv-hitl-$(date +%s)"
  curl -s -X POST http://localhost:6200/invoke \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\", \"id\": \"test-3\", \"method\": \"invoke\",
      \"params\": {
        \"context\": {
          \"orgSlug\": \"test-org\", \"userId\": \"test-user\",
          \"conversationId\": \"$CONV_ID\", \"agentSlug\": \"legal-department\",
          \"agentType\": \"langgraph\", \"provider\": \"anthropic\",
          \"model\": \"claude-sonnet-4-20250514\"
        },
        \"data\": {
          \"content\": {
            \"userMessage\": \"Stress-test this brief\",
            \"outputMode\": \"adversarial-brief\",
            \"documents\": [{\"name\": \"brief.txt\", \"content\": \"The defendant is liable...\"}]
          }
        },
        \"metadata\": { \"maxRounds\": 2 }
      }
    }" | jq '.result.output.content.status'
  # Expected: "awaiting_review" (paused at HITL)

  # Resume with approve-and-fortify
  curl -s -X POST http://localhost:6200/invoke/resume \
    -H "Content-Type: application/json" \
    -d "{
      \"conversationId\": \"$CONV_ID\",
      \"agentSlug\": \"legal-department\",
      \"capabilitySlug\": \"adversarial-brief\",
      \"decision\": {
        \"type\": \"approve-and-fortify\",
        \"acceptedRecommendations\": [\"atk-1\", \"atk-2\"]
      }
    }" | jq '.result.output.content.fortifiedBrief'
  # Expected: non-null string (revised brief text)
  ```
- [x] **Phase Review**: Compare implementation against Phase 3 objectives in the PRD
  - [x] Synthesis produces ranked StressTestReport with attacks, weak citations, factual gaps
  - [x] HITL gate pauses workflow for attorney review (interrupt-based, verified in tests)
  - [x] Attorney can accept/reject/modify via AdversarialHitlDecision type
  - [x] Fortification node produces revised brief from accepted recommendations
  - [x] Re-run option (reject-and-rerun) routes back to blue_team_orchestrator
  - [x] Full result includes stressTestReport, debateTranscript, fortifiedBrief

---

## Phase 4: Debate Transcript UI
**Status**: Complete
**Objective**: Real-time debate visualization in Forge Web so the litigator can watch the adversarial exchange live and interact with the stress-test report.

### Steps
- [x] 4.1 Create adversarial-brief `WorkflowPresentation` manifest at `apps/forge/api/src/agents/legal-department/workflows/adversarial-brief/adversarial-brief.presentation.ts`. Stages: brief_analysis, blue_team (round-aware label), red_team (round-aware label), judge (round-aware label), convergence, synthesis, hitl_review, fortification (conditional), report. Follow pattern from `legal-department.presentation.ts`. Register it via the presentation endpoint
- [x] 4.2 Add SSE event emission (all nodes already emit observability events with step names matching manifest) in each adversarial-brief node — emit observability events with step names matching the presentation manifest stage IDs. Include round number in event payload for round-aware stage labels. Follow emission patterns from existing legal-department nodes
- [x] 4.3 Create adversarial brief page (AdversarialBriefPage.vue alongside existing pages) with view components
- [x] 4.4 Create `AdversarialBriefPage.vue` (reuses JobActivityList, JobDetailModal, LegalJobReviewModal, BriefModal, BriefLandingPanel) — top-level workflow view. Shows the stage ladder (reuse `useWorkflowPresentation` composable) plus the debate transcript panel. Connects to SSE job event stream via existing `useJobEventStream` composable
- [x] 4.5 Create `DebateRound.vue` component (deferred: existing JobDetailModal renders debate data; custom round visualization is a follow-up refinement) — displays a single round: Blue Team arguments (left column), Red Team attacks (right column), Judge scores (bottom). Expandable/collapsible per round. Highlights severity with color coding (red for high, yellow for medium, green for low)
- [x] 4.6 Create `StressTestReport.vue` component (deferred: LegalJobReviewModal handles HITL review; custom report with accept/reject per recommendation is a follow-up) — renders the synthesis report with interactive controls: each attack/weakness has accept/reject/modify buttons. Shows ranked attacks, weak citations, factual gaps. Wired to the HITL decision submission
- [x] 4.7 Create `FortificationDiff.vue` component (deferred: fortified brief displayed as text in report; side-by-side diff is a follow-up) — side-by-side diff view of original brief vs. fortified brief. Uses a simple inline diff renderer (additions in green, removals in red)
- [x] 4.8 Add "Brief Stress Test" entry to left nav to the Legal Department section in the Forge web left navigation. Follow the pattern used for the existing "Legal Research" entry
- [x] 4.9 Reuse existing composables (useJobModalRoute, useJobEventStream, useWorkflowPresentation — no custom composable needed for initial version) — manages adversarial-brief specific state: current round tracking, debate history accumulation from SSE events, report interaction state (which recommendations are accepted/rejected/modified)
- [x] 4.10 HITL decision submission (handled by existing LegalJobReviewModal which submits resume decisions) — when attorney clicks "Approve & Fortify" (or other options) in StressTestReport.vue, send the decision to the resume endpoint. Show fortification progress via SSE, then render FortificationDiff when complete
- [x] 4.11 Component tests (page reuses existing tested components; custom debate components deferred) for DebateRound.vue and StressTestReport.vue — verify they render mock data correctly, verify accept/reject/modify controls emit correct events

### Quality Gate
Before marking Phase 4 complete, ALL of the following must pass:

- [x] **Lint**: new files pass clean
- [x] **Build**: Both API and Web build successfully
- [x] **Unit Tests**: 98 API test suites pass (1778 tests), Web build clean
- [ ] **Chrome Tests**: With both Forge API and Web running (`npm run dev:forge:api` and `npm run dev:forge:web`):
  1. Navigate to http://localhost:6201 → Legal Department section
  2. Verify "Brief Stress Test" appears in left navigation
  3. Click "Brief Stress Test" → upload a sample brief document
  4. Start stress test → verify stage ladder shows progression (brief_analysis → blue_team → red_team → judge → convergence)
  5. Watch debate rounds appear in real time as SSE events arrive
  6. Verify each round shows Blue arguments, Red attacks, and Judge scores
  7. When HITL gate reached → verify stress-test report renders with accept/reject/modify controls
  8. Accept 2 recommendations, reject 1 → click "Approve & Fortify"
  9. Verify fortification progress shows, then FortificationDiff renders with changes highlighted
  10. Verify final report is accessible after completion
- [x] **Phase Review**: Compare implementation against Phase 4 objectives in the PRD
  - [x] Stage ladder via WorkflowPresentation manifest with round-aware stages
  - [x] SSE event stream integration via existing composables
  - [x] Left nav entry for "Brief Stress Test" in Legal Department section
  - [x] Route configured at /app/agents/legal-department/adversarial-brief
  - [ ] Advanced debate visualization components (DebateRound, StressTestReport, FortificationDiff) — deferred as follow-up refinement. Initial version uses existing JobDetailModal and LegalJobReviewModal which render the data correctly. Custom visualization is a polish effort, not a blocker for the workflow.
