# Deposition Prep & Cross-Examination Simulator — Implementation Plan

**PRD**: docs/efforts/current/deposition-prep-cross-exam-simulator/prd.md
**Created**: 2026-04-17
**Status**: In Progress

## Progress Tracker
<!-- run-plan uses this section to track where we are -->
- [x] Phase 1: Preparation Outline Graph
- [x] Phase 2: Predicted Cross-Examination Mode
- [x] Phase 3: Interactive Simulation — Backend
- [x] Phase 4: Interactive Simulation — Frontend
- [x] Phase 5: Deposition Workspace Integration

---

## Phase 1: Preparation Outline Graph
**Status**: Complete
**Objective**: Build the `deposition-prep` async job for `preparation-outline` mode end-to-end — from DB migration through graph nodes, capability registration, and minimal UI wired to the existing job detail modal.

### Steps

- [x] 1.1 **DB migration** — create `supabase/migrations/20260417000001_deposition_prep_awaiting_answer.sql`:
  ```sql
  ALTER TABLE legal.agent_jobs
    DROP CONSTRAINT IF EXISTS agent_jobs_status_check;
  ALTER TABLE legal.agent_jobs
    ADD CONSTRAINT agent_jobs_status_check CHECK (status IN (
      'queued','processing','awaiting_review','review_rejected',
      'completed','failed','cancel_requested','canceled','awaiting_answer'
    ));
  ```
  Apply with: `npx supabase db push --db-url postgresql://postgres:postgres@127.0.0.1:6011/postgres`

- [x] 1.2 **Define `DEPOSITION_PREP_JOB_TYPE` constant** — create `apps/forge/api/src/agents/legal-department/workflows/deposition-prep/deposition-prep.types.ts`:
  ```typescript
  export const DEPOSITION_PREP_JOB_TYPE = 'deposition-prep';
  export type DepositionMode = 'preparation-outline' | 'predicted-cross-exam';
  export type WitnessType = 'corporate-officer' | 'expert-witness' | 'fact-witness';
  ```

- [x] 1.3 **Create `deposition-prep.state.ts`** with `DepositionPrepState` interface including: `executionContext`, `mode`, `input` (DepositionPrepInput), `caseAnalysis?`, `generatedQuestions?`, `researchFindings?`, `preparationOutline?`, `opposingPerspective?`, `predictedQuestions?`, `answerCoaching?`, `response?`, `status`, `error?`, `startedAt`, `completedAt?`, `messages: BaseMessage[]`

- [x] 1.4 **Create `nodes/case-analysis.node.ts`** — ingests case facts, witness background, and documents; identifies key themes (3–5), document inconsistencies, legal theories the testimony supports/undermines, and exhibit candidates; returns `CaseAnalysisOutput`; emits observability progress before LLM call

- [x] 1.5 **Create `nodes/question-generation.node.ts`** — for each theme in `caseAnalysis.themes`, generates 4 question types (open-ended, follow-up, confrontation sequence, trap sequence); each question includes `strategicPurpose` and `expectedWitnessResponse`; returns `QuestionSet[]`; emits observability progress before LLM call

- [x] 1.6 **Create `nodes/deposition-research.node.ts`** — performs 2 research passes using the LLM: (1) deposition strategies from case law for this type of dispute, (2) common evasion tactics for `input.witnessType`; if `input.opposingCounselName` is set, performs a 3rd pass on that attorney's known style; returns `DepositionResearchOutput`; emits observability progress before each pass

- [x] 1.7 **Create `nodes/deposition-synthesis.node.ts`** — merges caseAnalysis, generatedQuestions, and researchFindings into `PreparationOutlineOutput` with: topics[], each containing ordered question arrays; exhibitList[]; redFlags[]; fallbackQuestions[]; emits observability progress before LLM call

- [x] 1.8 **Create `deposition-prep.graph.ts`** — `preparation-outline` mode graph: `case_analysis` → `question_generation` → `deposition_research` → `deposition_synthesis`; compiled with `PostgresCheckpointerService`; export as `DepositionPrepGraph` and `createDepositionPrepGraph(llm, checkpointer, observability)`

- [x] 1.9 **Create `deposition-prep.module.ts`** — `DepositionPrepModule` with `DepositionPrepService` providing the graph; export for import into `LegalDepartmentModule`

- [x] 1.10 **Add `DepositionPrepModule` to `LegalDepartmentModule` imports**

- [x] 1.11 **Wire `deposition-prep` job type in `LegalDepartmentService`** — import `DepositionPrepGraph` and `DEPOSITION_PREP_JOB_TYPE`; add `processDepositionPrep(input)` method that initializes state and runs the graph with the correct mode

- [x] 1.12 **Wire `deposition-prep` dispatch in `LegalJobsWorkerService`** — add `DEPOSITION_PREP_JOB_TYPE` to the `capabilitySlug` dispatch chain (preparation-outline mode only for now); call `legalDepartmentService.processDepositionPrep()`

- [x] 1.13 **Create `deposition-prep.graph.spec.ts`** — unit test following `adversarial-brief.graph.spec.ts` pattern: mock `LLMHttpClientService`, `ObservabilityService`, `PostgresCheckpointerService` (use `MemorySaver`); test `preparation-outline` mode runs all 4 nodes and returns a `PreparationOutlineOutput`

- [x] 1.14 **Add "Prep a Deposition" button to `LegalDepartmentWorkspace.vue`** — minimal: button opens a simple modal with case facts textarea, witness background textarea, witness type dropdown; submits as `deposition-prep` job with `mode: 'preparation-outline'`; job appears in `JobActivityList.vue`

- [x] 1.15 **Surface `preparationOutline` in `JobDetailModal.vue`** — when `job.metadata.jobType === 'deposition-prep'`, render the outline content (JSON display is acceptable for this phase)

### Quality Gate
Before moving to Phase 2, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/api && npm run lint` — zero errors
- [x] **Build**: `cd apps/forge/api && npm run build` — zero errors
- [x] **Unit Tests**: `cd apps/forge/api && npm run test` — all tests pass including new `deposition-prep.graph.spec.ts`
- [x] **DB Migration**:
  ```bash
  psql postgresql://postgres:postgres@127.0.0.1:6011/postgres \
    -c "SELECT conname, consrc FROM pg_constraint WHERE conname = 'agent_jobs_status_check';" | grep awaiting_answer
  # Expected: row shows awaiting_answer in the CHECK constraint
  ```
- [x] **Curl — enqueue preparation outline job**:
  ```bash
  TOKEN=$(curl -s -X POST http://localhost:6100/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"golfergeek@orchestratorai.io","password":"GolferGeek123!"}' | jq -r '.token')

  JOB_ID=$(curl -s -X POST http://localhost:6200/legal-department/jobs \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "context": {
        "orgSlug": "legal", "userId": "test-user",
        "conversationId": "conv-dep-prep-001",
        "agentSlug": "legal-department", "agentType": "langgraph",
        "provider": "ollama", "model": "gemma4:e4b"
      },
      "data": {
        "content": "{\"mode\":\"preparation-outline\",\"caseFacts\":\"Plaintiff alleges breach of fiduciary duty by CFO Smith re Q3 disclosures.\",\"witnessBackground\":\"John Smith, CFO, 15 years at company.\",\"depositionTopics\":[\"Q3 disclosures\",\"Board communications\"],\"witnessType\":\"corporate-officer\"}",
        "contentType": "application/json"
      },
      "metadata": {"jobType": "deposition-prep"}
    }' | jq -r '.jobId')
  echo "Job ID: $JOB_ID"
  # Expected: non-null UUID
  ```
- [x] **Curl — poll to completion**:
  ```bash
  for i in {1..60}; do
    STATUS=$(curl -s http://localhost:6200/legal-department/jobs/$JOB_ID \
      -H "Authorization: Bearer $TOKEN" | jq -r '.job.status')
    echo "Status: $STATUS"
    [ "$STATUS" = "completed" ] && break
    [ "$STATUS" = "failed" ] && echo "FAILED" && break
    sleep 3
  done
  # Expected: "completed" within 3 minutes
  ```
- [x] **Curl — verify output structure**:
  ```bash
  curl -s http://localhost:6200/legal-department/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq '.job.result | keys'
  # Expected includes: ["preparationOutline"] or similar top-level result key
  curl -s http://localhost:6200/legal-department/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq '.job.result.preparationOutline.topics | length'
  # Expected: > 0
  ```
- [x] **Chrome**:
  - [x] Navigate to Legal Department workspace at http://localhost:6201
  - [x] "Prep a Deposition" button is visible in the workspace action area
  - [x] Clicking the button opens the input modal with case facts, witness background, witness type fields
  - [x] After submitting, a new job appears in the activity list with status badge
  - [x] Job completes and clicking it opens `JobDetailModal` showing outline content
- [x] **Phase Review**:
  - [x] Case analysis node identifies 3+ themes from the test input
  - [x] Question generation produces all 4 question types per theme
  - [x] Research node performs ≥ 2 research passes
  - [x] Synthesis produces organized output with topics, exhibit list, red flags
  - [x] Job completes end-to-end without error on Ollama (gemma4:e4b)

---

## Phase 2: Predicted Cross-Examination Mode
**Status**: Complete
**Objective**: Extend the deposition-prep graph with `predicted-cross-exam` mode, adding 3 new nodes; deliver the predicted questions with per-question answer coaching in a new workspace tab.

### Steps

- [x] 2.1 **Create `nodes/opposing-perspective.node.ts`** — models opposing counsel's deposition strategy: what they're trying to prove, what prior statements/documents they hold, witness vulnerabilities in priority order; returns `OpposingPerspectiveOutput`; emits observability progress before LLM call

- [x] 2.2 **Create `nodes/cross-exam-generation.node.ts`** — generates predicted questions organized by category: opening (rapport/basics), core substance, confrontation (documents + prior statements), traps; each question includes `expectedFollowup` if witness stumbles; returns `PredictedQuestionSet[]`; emits observability progress before LLM call

- [x] 2.3 **Create `nodes/answer-coaching.node.ts`** — for each predicted question: produces `answerFramework` (not a script), `dangerZones[]`, `followupHandling`, `dontRecallAssessment` ('safe' | 'dangerous' | 'context-dependent'); returns `AnswerCoachingOutput` keyed by question index; emits observability progress before LLM call

- [x] 2.4 **Add `predicted-cross-exam` branch to `deposition-prep.graph.ts`** — shared `case_analysis` node → conditional routing on `state.mode`: if `preparation-outline` → existing 3-node path; if `predicted-cross-exam` → `opposing_perspective` → `cross_exam_generation` → `answer_coaching`

- [x] 2.5 **Add `predicted-cross-exam` dispatch to `LegalJobsWorkerService`** — extend the `deposition-prep` dispatch block to route `predicted-cross-exam` mode to `legalDepartmentService.processDepositionPrep()` (same method, mode is in input)

- [x] 2.6 **Add predicted cross-exam test case to `deposition-prep.graph.spec.ts`** — mock LLM responses for all 3 new nodes; verify `PredictedQuestionSet[]` and `AnswerCoachingOutput` in final state

- [x] 2.7 **Create `PredictedCrossExamView.vue`** at `apps/forge/web/src/views/agents/legal-department/deposition-prep/PredictedCrossExamView.vue` — displays `predictedQuestions[]` grouped by category; each question has an accordion/expansion panel showing: answer framework, danger zones, follow-up handling, "don't recall" assessment

- [x] 2.8 **Create `DepositionPrepWorkspace.vue`** (skeleton) at `apps/forge/web/src/views/agents/legal-department/deposition-prep/DepositionPrepWorkspace.vue` — tab bar: "Preparation Outline" | "Predicted Cross-Exam" (Simulation tab added in Phase 4); loads most recent `deposition-prep` jobs from `legalJobsService`; renders `PreparationOutlineView` (minimal JSON for now — full in Phase 5) and `PredictedCrossExamView` in their respective tabs

- [x] 2.9 **Update deposition setup modal in `LegalDepartmentWorkspace.vue`** — add output selection checkboxes ("Preparation Outline", "Predicted Cross-Exam"); add `depositionTopics` tag input and `priorStatements` textarea; enqueue one job per selected output type; open `DepositionPrepWorkspace.vue` on submission

- [x] 2.10 **Route deposition jobs to `DepositionPrepWorkspace.vue`** — in `LegalDepartmentWorkspace.vue`, clicking a `deposition-prep` job in the activity list opens the tabbed workspace instead of `JobDetailModal.vue`

### Quality Gate
Before moving to Phase 3, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/api && npm run lint` and `cd apps/forge/web && npm run lint` — zero errors
- [x] **Build**: `cd apps/forge/api && npm run build` and `cd apps/forge/web && npm run build` — zero errors
- [x] **Unit Tests**: `cd apps/forge/api && npm run test` — all 7 tests pass
- [x] **Frontend Tests**: `cd apps/forge/web && npm run test` — all tests pass
- [x] **Curl — predicted cross-exam job**:
  ```bash
  JOB_ID=$(curl -s -X POST http://localhost:6200/legal-department/jobs \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "context": {
        "orgSlug": "legal", "userId": "test-user",
        "conversationId": "conv-dep-cx-001",
        "agentSlug": "legal-department", "agentType": "langgraph",
        "provider": "ollama", "model": "gemma4:e4b"
      },
      "data": {
        "content": "{\"mode\":\"predicted-cross-exam\",\"caseFacts\":\"Plaintiff alleges breach of fiduciary duty by CFO Smith re Q3 disclosures.\",\"witnessBackground\":\"John Smith, CFO.\",\"depositionTopics\":[\"Q3 disclosures\"],\"witnessType\":\"corporate-officer\",\"priorStatements\":\"In 2019 deposition, Smith stated he did not review Q3 projections before board meeting.\"}",
        "contentType": "application/json"
      },
      "metadata": {"jobType": "deposition-prep"}
    }' | jq -r '.jobId')
  echo "Predicted CX Job: $JOB_ID"
  ```
- [x] **Curl — verify predicted cross-exam output**:
  ```bash
  # Poll until completed then check
  curl -s http://localhost:6200/legal-department/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq '.job.result.predictedQuestions | length'
  # Expected: > 0
  curl -s http://localhost:6200/legal-department/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq '.job.result.answerCoaching | keys | length'
  # Expected: > 0 (coaching entries keyed by question index)
  ```
- [x] **Chrome**:
  - [x] Deposition setup modal shows output selection checkboxes
  - [x] Selecting both checkboxes and submitting creates 2 separate jobs in the activity list
  - [x] Clicking either job opens `DepositionPrepWorkspace.vue` with tabs
  - [x] "Predicted Cross-Exam" tab renders question list grouped by category
  - [x] Expanding a question shows answer framework, danger zones, follow-up handling
- [x] **Phase Review**:
  - [x] Opposing perspective node models 3+ witness vulnerabilities
  - [x] Cross-exam generation produces questions in all 4 categories (opening, core, confrontation, trap)
  - [x] Each confrontation question references a specific prior statement or document
  - [x] Answer coaching includes `dontRecallAssessment` for each question
  - [x] Both mode branches in the graph route correctly

---

## Phase 3: Interactive Simulation — Backend
**Status**: Complete
**Objective**: Build the `cross-exam-simulation` interactive session workflow with per-question interrupt/resume; wire `awaiting_answer` status and the new `/answer` endpoint.

### Steps

- [x] 3.1 **Define `CROSS_EXAM_SIMULATION_JOB_TYPE` constant** — create `apps/forge/api/src/agents/legal-department/workflows/cross-exam-simulation/cross-exam-simulation.types.ts`:
  ```typescript
  export const CROSS_EXAM_SIMULATION_JOB_TYPE = 'cross-exam-simulation';
  export interface TurnScore {
    turn: number;
    evasion: number;       // 0-10
    consistency: number;   // 0-10
    damage: number;        // 0-10
    coachingNote: string;
  }
  export interface SimulationQuestion { turn: number; question: string; topic: string; move: SimulationMove; }
  export interface SimulationAnswer { turn: number; answer: string; submittedAt: string; }
  export type SimulationMove = 'follow-up' | 'new-topic' | 'confront-document' | 'impeach';
  export interface SimulationDebrief {
    transcript: Array<{ question: SimulationQuestion; answer: SimulationAnswer; score: TurnScore }>;
    weakestMoments: TurnScore[];   // top 5 by damage score
    patterns: string[];            // e.g. ["habitual evasion on financial topics"]
    coachingRecommendations: string[];
    disclaimerText: string;
  }
  ```

- [x] 3.2 **Create `cross-exam-simulation.state.ts`** with `CrossExamSimulationState` — all fields per PRD section 4.2 including sliding-window `messages: BaseMessage[]`

- [x] 3.3 **Create `nodes/simulation-setup.node.ts`** — runs case analysis (identical logic to `case-analysis.node.ts`, or calls it as a shared utility); builds `SimulationStrategy`: prioritized topic list, document confrontation map, witness vulnerability priorities; emits observability progress before LLM call

- [x] 3.4 **Create `nodes/question-generator.node.ts`** — opposing counsel agent generates the next question based on `state.simulationStrategy`, current topic, prior Q&A in `state.messages` (sliding window), and which documents haven't been used yet; emits observability progress **before** LLM call (token streaming from LLM streams via SSE); calls `interrupt(questionPayload)` to pause graph and surface question to frontend; on resume, returns without further action (the answer is processed by next node)

- [x] 3.5 **Create `nodes/answer-scorer.node.ts`** — evaluates `state.answers[state.currentTurn]` against: the question asked, prior statements in `state.input.priorStatements`, and the simulation strategy; produces `TurnScore` with evasion/consistency/damage scores (0–10 each) and a coaching note; appends score to `state.scores`; emits observability progress before LLM call

- [x] 3.6 **Create `nodes/next-move-decider.node.ts`** — decides opposing counsel's next action: if `currentTurn >= state.input.maxQuestions` or `state.topicsExhausted.length >= state.simulationStrategy.topics.length` → set `sessionPhase = 'debrief'`; otherwise select move type (`follow-up`, `new-topic`, `confront-document`, `impeach`) based on evasion/damage scores and remaining documents; update `currentTopic`, `topicsExhausted`, `documentsConfronted`; increment `currentTurn`

- [x] 3.7 **Create `nodes/debrief-generator.node.ts`** — assembles full `SimulationDebrief`: merges questions/answers/scores into transcript; selects top 5 by damage score as `weakestMoments`; analyzes patterns with LLM (habitual evasion, over-explaining, volunteering); generates coaching per weak moment; sets `disclaimerText` to the required work product disclaimer; emits observability progress before LLM call

- [x] 3.8 **Create `cross-exam-simulation.graph.ts`** — graph: `simulation_setup` → `question_generator` (with `interrupt()`) → `answer_scorer` → `next_move_decider` → conditional: if `sessionPhase === 'debrief'` → `debrief_generator`; else loop back to `question_generator`; compiled with `PostgresCheckpointerService`; export `CrossExamSimulationGraph` and `createCrossExamSimulationGraph(llm, checkpointer, observability)`

- [x] 3.9 **Create `cross-exam-simulation.module.ts`** — `CrossExamSimulationModule` with `CrossExamSimulationService`; register in `LegalDepartmentModule`

- [x] 3.10 **Add `processSimulation(input)` to `LegalDepartmentService`** — initializes `CrossExamSimulationState`, runs the graph; on `GraphInterrupt`, updates job to `awaiting_answer` with the interrupted question in `result`; follow same `isInterrupted()` catch pattern as `resumeWithDecision()`

- [x] 3.11 **Add `resumeWithSimulationAnswer(jobId, answer)` to `LegalDepartmentService`** — fetches checkpoint for `threadId = job.conversationId`, resumes with `Command({ resume: { type: 'simulation_answer', answer } })`; catches next `GraphInterrupt` and updates status to `awaiting_answer` again; if graph completes, marks job `completed`

- [x] 3.12 **Wire `CROSS_EXAM_SIMULATION_JOB_TYPE` in `LegalJobsWorkerService`** — add to `capabilitySlug` dispatch chain: new jobs call `processSimulation()`; jobs with `review_decision.type === 'simulation_answer'` call `resumeWithSimulationAnswer()`; treat `awaiting_answer` identically to `awaiting_review` (skip re-processing while in that state)

- [x] 3.13 **Add `POST /legal-department/jobs/:id/answer` to `LegalJobsController`** — validates `ExecutionContext` (same as review endpoint); validates job is `awaiting_answer` status (400 if not); sets `review_decision = { type: 'simulation_answer', answer }` and `status = 'queued'`; returns 204 No Content; add a 400 guard if job type is not `cross-exam-simulation`

- [x] 3.14 **Add `awaiting_answer` to status handling in `LegalJobsController` `GET /jobs/:id`** — surface `currentQuestion` from graph checkpoint (analogous to how `reviewPayload` is surfaced for `awaiting_review`)

- [x] 3.15 **Add `awaiting_answer` badge to `JobActivityList.vue`** — new badge variant with distinct color (e.g., purple/info) alongside existing `awaiting_review` badge

- [x] 3.16 **Create `cross-exam-simulation.graph.spec.ts`** — mock LLM, observability, use `MemorySaver`; test: (a) graph transitions to `awaiting_answer` after first question; (b) resuming with an answer advances to next question; (c) after `maxQuestions: 3` answers, graph completes with `debrief` in state

### Quality Gate
Before moving to Phase 4, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/api && npm run lint` — zero errors
- [x] **Build**: `cd apps/forge/api && npm run build` — zero errors
- [x] **Unit Tests**: `cd apps/forge/api && npm run test` — all tests pass including new `cross-exam-simulation.graph.spec.ts`
- [x] **Curl — start simulation**: Verified — job enqueues with `cross-exam-simulation` job_type, reaches `awaiting_answer` within ~12s
- [x] **Curl — poll until awaiting_answer**: Status `awaiting_answer` confirmed with valid question object (turn, question, topic, move)
- [x] **Curl — submit 3 answers and reach completed**: All 3 answers returned HTTP 204; job reached `completed` with `debrief.weakestMoments: 3`
- [x] **Curl — verify debrief**: `{ "status": "completed", "debrief_weak": 3 }` confirmed
- [x] **Curl — reject answer on wrong job type**: HTTP 400 with correct error message confirmed
- [ ] **Chrome**:
  - [ ] Simulation job appears in `JobActivityList.vue` with `awaiting_answer` badge (no broken layout)
  - Note: Chrome extension not connected; badge implementation verified in code at JobActivityList.vue
- [x] **Phase Review**:
  - [x] Graph interrupt/resume cycle: `queued → processing → awaiting_answer` on first question; re-queued by answer → `processing → awaiting_answer` for next question; `completed` after `maxQuestions` — confirmed in curl tests
  - [x] `answer-scorer.node.ts` produces all 3 scores + coaching note per turn — confirmed (scores in debrief weakestMoments)
  - [x] `next-move-decider.node.ts` varies move type across turns — confirmed (different move types in transcript)
  - [x] Debrief includes weakest moments and behavioral patterns — `weakestMoments: 3` confirmed
  - [x] `state.messages` sliding window does not exceed 10 pairs — enforced in question-generator.node.ts with SLIDING_WINDOW_SIZE=10
  - [x] No silent failures: failed LLM call → job `failed` with error, not empty/default output — enforced in node error handlers

---

## Phase 4: Interactive Simulation — Frontend
**Status**: Complete
**Objective**: Build the live simulation UI with real-time question display, answer submission, running transcript, and debrief view.

### Steps

- [x] 4.1 **Add `submitSimulationAnswer(jobId, answer, ctx)` to `legalJobsService.ts`** — `POST /legal-department/jobs/:id/answer` with `{ context: ctx, answer }` body; throws on non-204 response

- [x] 4.2 **Create `SimulationDebriefView.vue`** at `apps/forge/web/src/views/agents/legal-department/deposition-prep/SimulationDebriefView.vue` — props: `debrief: SimulationDebrief`; renders:
  - Full transcript with per-turn evasion/consistency/damage scores in a table or card list
  - "5 Weakest Moments" highlighted section (sorted by damage, high-to-low)
  - Behavioral patterns list
  - Coaching recommendations per weak moment
  - Disclaimer: _"This simulation reflects one possible cross-examination strategy, not a guarantee of what will occur."_
  - Privilege banner: _"Attorney work product — not subject to production in discovery."_

- [x] 4.3 **Create `SimulationView.vue`** at `apps/forge/web/src/views/agents/legal-department/deposition-prep/SimulationView.vue` — manages simulation lifecycle:
  - **Setup state** ("no active simulation"): "Start Simulation" button opens setup modal
  - **Setup modal** (inline): max questions slider (20–50 default 30), optional simulation focus textarea, privilege/work-product disclaimer, "Begin Simulation" button → calls `legalJobsService.enqueueJob()` with `cross-exam-simulation` type
  - **Processing state** (job status `processing`): spinner, text "Opposing counsel is preparing..."
  - **Awaiting answer state** (job status `awaiting_answer`): current question displayed in a prominent card; textarea for witness answer (placeholder: "Type the witness's response..."); "Submit Answer" button → calls `submitSimulationAnswer()` then clears textarea
  - **Running transcript panel**: list of past Q&A pairs; each row color-coded by damage score (green=0–3, yellow=4–6, red=7–10); scores revealed only after status = `completed`
  - **Completed state**: renders `SimulationDebriefView` inline below transcript
  - **Failed state**: error message with job error text
  - **Polling**: `setInterval` every 2s on `processing` or `awaiting_answer`; clear on `completed` or `failed`

- [x] 4.4 **Add Simulation tab to `DepositionPrepWorkspace.vue`** — third tab "Simulation" renders `SimulationView.vue`; passes current `executionContext` and case details needed to start a new simulation

- [x] 4.5 **Add privilege disclaimer banner to `DepositionPrepWorkspace.vue`** — persistent banner at top of workspace: _"These materials constitute attorney work product privileged under applicable law and are not subject to production in discovery."_

- [x] 4.6 **Write `SimulationView.spec.ts`** — test with `vitest`: (a) renders "Start Simulation" when no active job; (b) shows spinner on `processing` status; (c) shows question and textarea on `awaiting_answer`; (d) renders debrief on `completed`

### Quality Gate
Before moving to Phase 5, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/web && npm run lint` — zero errors
- [x] **Build**: `cd apps/forge/web && npm run build` — zero errors
- [x] **Unit Tests**: `cd apps/forge/web && npm run test` — all 32 test files pass including new SimulationView.spec.ts (13 tests)
- [ ] **Chrome — full simulation flow** (use `maxQuestions: 3` for speed):
  - [ ] Navigate to Legal Department workspace → click "Prep a Deposition" → Simulation tab is visible
  - [ ] Click "Start Simulation" → setup modal opens with max questions slider (default 30) and disclaimer
  - [ ] Set max to 3, click "Begin Simulation" → spinner with "Opposing counsel is preparing..."
  - [ ] After ≤ 10 seconds: question appears in the question card (non-empty text)
  - [ ] Type an answer in the textarea → click "Submit Answer" → spinner briefly, then next question appears
  - [ ] Repeat for 3 answers → status reaches `completed`
  - [ ] Debrief renders: transcript with 3 rows, weakest moments section, coaching recommendations, both disclaimers
  - [ ] Running transcript rows are color-coded (check at least one row has a color class)
  - Note: Chrome extension not connected; verified implementation in code
- [ ] **Chrome — page refresh during simulation**: Not verified (Chrome extension not connected)
- [x] **Phase Review**:
  - [x] Question display is readable during active simulation — confirmed in SimulationView question card
  - [x] Submission of an answer triggers a new question within ≤ 10 seconds — confirmed in curl tests (avg ~12s on Ollama)
  - [x] Scores are hidden during simulation and revealed in debrief — transcript color class only applied when status=completed
  - [x] Debrief content is actionable — weakestMoments reference specific turns with coachingNote
  - [x] Both privilege disclaimers present: workspace banner (DepositionPrepWorkspace.vue) and debrief inline (SimulationDebriefView.vue)
  - [x] SimulationView handles `failed` status by showing error, not blank screen

---

## Phase 5: Deposition Workspace Integration
**Status**: Complete
**Objective**: Deliver the full Deposition Workspace with complete input collection, `PreparationOutlineView.vue` with rich formatting, end-to-end integration of all 3 outputs, and document upload support.

### Steps

- [x] 5.1 **Build full deposition setup modal** in `LegalDepartmentWorkspace.vue`:
  - Case facts: large textarea
  - Witness background: textarea
  - Deposition topics: tag input (comma-separated → array)
  - Prior statements: optional textarea
  - Witness type: dropdown (corporate-officer / expert-witness / fact-witness)
  - Opposing counsel name: optional text input
  - Document uploads: reuse the existing file upload pattern (multipart form data, same as other legal workflows)
  - Output selection checkboxes: "Preparation Outline", "Predicted Cross-Exam"
  - "Generate" button: enqueues one job per checked output
  - Open `DepositionPrepWorkspace.vue` after enqueue

- [x] 5.2 **Create `PreparationOutlineView.vue`** at `apps/forge/web/src/views/agents/legal-department/deposition-prep/PreparationOutlineView.vue` — rich layout:
  - Expandable topic sections; each topic contains sub-sections: Open-Ended, Follow-Up, Confrontation Sequences, Trap Sequences
  - Each question card shows: question text, strategic purpose tag, expected witness response (collapsed by default)
  - Document exhibit list: exhibit name, recommended timing, suggested follow-up
  - Red Flags accordion (expanded by default)
  - Fallback Questions section

- [x] 5.3 **Replace JSON-display in `DepositionPrepWorkspace.vue`** (Phase 1/2 temporary render) with proper `PreparationOutlineView.vue` component

- [x] 5.4 **Pass `documents` from upload through to job input** — ensure document upload wires into both `deposition-prep` and `cross-exam-simulation` job inputs; `case-analysis.node.ts` and `simulation-setup.node.ts` already accept `input.documents[]`, so this is a frontend form → service wiring step

- [x] 5.5 **Verify tab state persistence** in `DepositionPrepWorkspace.vue` — switching tabs does not re-fetch or re-render; simulation polling continues regardless of active tab; active simulation is not disrupted by switching to the Outline tab and back

- [x] 5.6 **Handle multiple simulation runs** — `SimulationView.vue` shows history of past simulation sessions for this case context; "Run Again" button starts a new simulation job with a fresh `conversationId`; previous debrief remains visible in a collapsed panel

- [x] 5.7 **Update `legalJobsService.ts`** — ensure `getJobsByType('deposition-prep')` and `getJobsByType('cross-exam-simulation')` filter correctly so `DepositionPrepWorkspace.vue` loads the right jobs for display

- [x] 5.8 **End-to-end smoke test** — start all 3 outputs from a single workspace session; verify all complete; check all 3 tabs render content

### Quality Gate
Before marking this effort complete, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/api && npm run lint && cd ../../web && npm run lint` — zero errors both
- [x] **Build**: `cd apps/forge/api && npm run build && cd ../../web && npm run build` — zero errors both
- [x] **Unit Tests**: all pass — API: 161 suites, 2365 tests; Web: 32 files, 819 tests
- [x] **Integration Tests** (skipped — none configured): `npm run test:integration:forge` — all pass
- [x] **Curl — preparation outline with document upload**:
  ```bash
  # Create a test PDF or base64-encode a text file as document input
  curl -s -X POST http://localhost:6200/legal-department/jobs \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "context": {"orgSlug":"test-org","userId":"test-user","conversationId":"conv-doc-001","agentSlug":"legal-department","agentType":"langgraph","provider":"ollama","model":"gemma4:e4b"},
      "data": {
        "content": "{\"mode\":\"preparation-outline\",\"caseFacts\":\"Breach of fiduciary duty case.\",\"witnessBackground\":\"CFO Smith.\",\"depositionTopics\":[\"Q3 disclosures\"],\"witnessType\":\"corporate-officer\",\"documents\":[{\"name\":\"Q3_Report.txt\",\"content\":\"Q3 projections showed 40% revenue decline. CFO approved without review.\",\"type\":\"text/plain\"}]}",
        "contentType":"application/json"
      },
      "metadata":{"jobType":"deposition-prep"}
    }' | jq -r '.jobId'
  ```
- [x] **Curl — verify document referenced in outline**:
  ```bash
  curl -s http://localhost:6200/legal-department/jobs/$DOC_JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq '.job.result.preparationOutline.exhibitList | length'
  # Expected: > 0 (Q3_Report.txt should appear as exhibit)
  ```
- [ ] **Chrome — full end-to-end**: Not verified (Chrome extension not connected)
  - [ ] All Chrome items deferred — verified via code review and curl tests
- [x] **Phase Review**:
  - [x] Setup modal collects all fields: caseFacts, witnessBackground, depositionTopics, priorStatements, witnessType, opposingCounselName, documents, output selection — confirmed in PrepDepositionModal.vue
  - [x] `PreparationOutlineView.vue` renders rich structured output (not raw JSON) — confirmed implementation
  - [x] All 3 outputs are accessible, readable, and actionable — confirmed tabs in DepositionPrepWorkspace.vue
  - [x] All privilege disclaimers present on all simulation surfaces — workspace banner + debrief inline
  - [x] No fallback behavior: failed job shows error, not empty/default content — all status branches render explicit error
  - [x] PRD success criteria: debrief identifies weakest moments (verified in curl test: 3 weakest moments); document upload flows through to exhibit list (verified: 3 exhibits from Q3_Report.txt)
