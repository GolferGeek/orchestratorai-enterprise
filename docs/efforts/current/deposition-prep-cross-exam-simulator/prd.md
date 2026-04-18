# Deposition Prep & Cross-Examination Simulator — Product Requirements Document

**Effort**: deposition-prep-cross-exam-simulator  
**Priority**: #8 of 10 Legal Workflows  
**Created**: 2026-04-17  
**Status**: Draft

---

## 1. Overview

Workflow #8 in the Legal Department series. Provides litigators three outputs from a single deposition preparation session: (1) a structured preparation outline with questions organized by topic, (2) a predicted cross-examination with answer coaching frameworks, and (3) an interactive simulation where an adversarial agent plays opposing counsel in a live back-and-forth Q&A. The simulation is the first Legal Department workflow requiring real-time interaction rather than async job processing — establishing the interactive real-time agent session pattern reused by Monte Carlo Trial (#9) and Persistent Case Team (#10).

---

## 2. Goals & Success Criteria

**Goals:**
1. Deliver a preparation outline async job generating organized questions, exhibit references, and strategic notes from case facts and witness details.
2. Deliver a predicted cross-examination async job modeling opposing counsel's strategy with answer coaching for each predicted question.
3. Deliver an interactive simulation holding a live LangGraph execution with per-question `interrupt()`, scoring each witness response on evasion risk, consistency, and case damage.
4. Establish the interactive real-time agent session pattern (per-question interrupt/resume) for reuse in #9 and #10.

**Success Criteria:**
- Preparation outline job completes within 90 seconds for typical input (< 10K tokens).
- Predicted cross-examination job completes within 120 seconds.
- Simulation: each opposing counsel question is displayed within 10 seconds of the previous answer submission (Ollama target; < 5 seconds on cloud providers).
- Simulation supports 20–50 questions without checkpoint degradation.
- Debrief identifies the 5 weakest moments with specific coaching recommendations.
- Work product privilege disclaimer displayed on all simulation-facing UI.
- All three outputs accessible from a tabbed Deposition Workspace.

---

## 3. User Stories / Use Cases

**UC-1 — Deposing attorney (preparation outline):**  
Litigator uploads case facts, witness background, deposition topics, and relevant documents. Selects "Preparation Outline." System generates a structured question guide with open-ended questions, confrontation sequences, document exhibits, and trap sequences organized by topic.

**UC-2 — Defense attorney (witness preparation):**  
Defense attorney provides case facts, witness background, prior statements, and likely opposing theory. Selects "Predicted Cross-Exam." System generates the most likely opposing questions with answer frameworks and danger zones for each.

**UC-3 — Interactive witness prep session:**  
Attorney and witness use the simulation. An adversarial agent plays opposing counsel, asking questions one at a time. Witness types their answer. After 30 questions, simulation ends and a debrief shows the 5 weakest moments, evasion patterns, and specific coaching.

**UC-4 — Reviewing outputs:**  
User reviews all three outputs in a tabbed workspace. Outline and predicted cross-exam are static documents. Simulation can be run multiple times (each run has its own conversationId).

---

## 4. Technical Requirements

### 4.1 Architecture

**Two new LangGraph workflow graphs:**

**`deposition-prep.graph.ts`** (async job) — Handles both preparation outline and predicted cross-exam via `state.mode`. Follows the same async job pattern as `adversarial-brief.graph.ts` and `contract-review.graph.ts`.

**`cross-exam-simulation.graph.ts`** (interactive session) — Runs a live simulation loop with per-question `interrupt()`. Uses `PostgresCheckpointerService` identically to all other graphs, but the interrupt/resume cycle is per-question (every 30–60 seconds) rather than once per job at a predefined HITL gate.

**File structure:**
```
apps/forge/api/src/agents/legal-department/workflows/
  deposition-prep/
    deposition-prep.graph.ts
    deposition-prep.state.ts
    deposition-prep.module.ts
    nodes/
      case-analysis.node.ts
      question-generation.node.ts
      deposition-research.node.ts
      deposition-synthesis.node.ts
      opposing-perspective.node.ts
      cross-exam-generation.node.ts
      answer-coaching.node.ts
  cross-exam-simulation/
    cross-exam-simulation.graph.ts
    cross-exam-simulation.state.ts
    cross-exam-simulation.module.ts
    nodes/
      simulation-setup.node.ts
      question-generator.node.ts
      answer-scorer.node.ts
      next-move-decider.node.ts
      debrief-generator.node.ts

apps/forge/web/src/views/agents/legal-department/deposition-prep/
  DepositionPrepWorkspace.vue
  PreparationOutlineView.vue
  PredictedCrossExamView.vue
  SimulationView.vue
  SimulationDebriefView.vue
```

**`DepositionPrepModule`** and **`CrossExamSimulationModule`** registered in `LegalDepartmentModule`.

Both capabilities registered in `LegalCapabilityRegistryService` (following `adversarial-brief` capability registration pattern).

### 4.2 Data Model Changes

**New job types** in `legal.agent_jobs.job_type`:
- `deposition-prep` — preparation outline and predicted cross-exam modes
- `cross-exam-simulation` — interactive simulation session

**New job status** in `legal.agent_jobs.status`:
- `awaiting_answer` — simulation paused waiting for witness response (parallel to `awaiting_review`)

If `job_type` or `status` are PostgreSQL enum types in the schema, a migration is required to add these values. If text columns, no migration needed. Phase 1 includes a migration step to verify and apply.

No new tables. Simulation state (all questions, answers, scores) persists in LangGraph's `langgraph_checkpoints` via `PostgresCheckpointerService` — same as all existing workflows. The 20–50 checkpoint writes per simulation session pose no scaling risk for the current single-tenant deployment.

**Input shape — `deposition-prep` job:**
```typescript
interface DepositionPrepInput {
  mode: 'preparation-outline' | 'predicted-cross-exam';
  caseFacts: string;
  witnessBackground: string;
  depositionTopics: string[];
  witnessType: 'corporate-officer' | 'expert-witness' | 'fact-witness';
  priorStatements?: string;
  opposingCounselName?: string;
  documents?: Array<{ name: string; content: string; type?: string }>;
}
```

**Input shape — `cross-exam-simulation` job:**
```typescript
interface CrossExamSimulationInput {
  caseFacts: string;
  witnessBackground: string;
  priorStatements?: string;
  documents?: Array<{ name: string; content: string; type?: string }>;
  maxQuestions: number; // 20–50, default 30
  simulationGoals?: string;
}
```

**Answer submission payload:**
```typescript
interface SimulationAnswerPayload {
  type: 'simulation_answer';
  answer: string;
}
```

**`DepositionPrepState`** (key fields):
```typescript
interface DepositionPrepState {
  executionContext: ExecutionContext;
  mode: 'preparation-outline' | 'predicted-cross-exam';
  input: DepositionPrepInput;
  // Shared
  caseAnalysis?: CaseAnalysisOutput;
  // Outline mode
  generatedQuestions?: QuestionSet[];
  researchFindings?: DepositionResearchOutput;
  preparationOutline?: PreparationOutlineOutput;
  // Cross-exam mode
  opposingPerspective?: OpposingPerspectiveOutput;
  predictedQuestions?: PredictedQuestionSet[];
  answerCoaching?: AnswerCoachingOutput;
  // Common
  response?: string;
  status: 'processing' | 'completed' | 'failed';
  error?: string;
  startedAt: number;
  completedAt?: number;
  messages: BaseMessage[];
}
```

**`CrossExamSimulationState`** (key fields):
```typescript
interface CrossExamSimulationState {
  executionContext: ExecutionContext;
  input: CrossExamSimulationInput;
  caseAnalysis?: CaseAnalysisOutput;
  simulationStrategy?: SimulationStrategy;
  sessionPhase: 'active' | 'debrief';
  currentTurn: number;
  questions: SimulationQuestion[];
  answers: SimulationAnswer[];
  scores: TurnScore[];        // { evasion: 0-10, consistency: 0-10, damage: 0-10, coachingNote: string }
  currentTopic: string;
  topicsExhausted: string[];
  documentsConfronted: string[];
  debrief?: SimulationDebrief;
  status: 'processing' | 'awaiting_answer' | 'completed' | 'failed';
  error?: string;
  startedAt: number;
  completedAt?: number;
  messages: BaseMessage[];    // Sliding window: last 10 Q&A pairs to prevent Ollama context overflow
}
```

### 4.3 API Changes

**Existing endpoints (no changes required):**
- `POST /api/forge/legal-department/jobs` — new job types wired via capability handlers only
- `GET /api/forge/legal-department/jobs` — no change
- `GET /api/forge/legal-department/jobs/:id` — no change
- `POST /api/forge/legal-department/jobs/:id/review` — HITL only; NOT reused for simulation answers

**New endpoint:**
```
POST /api/forge/legal-department/jobs/:id/answer
Body:     { answer: string }
Response: 204 No Content
Auth:     Same JWT validation as all legal department endpoints
```

Implementation: sets `review_decision = JSON.stringify({ type: 'simulation_answer', answer })` and `status = 'queued'` on the job row — exactly how the existing `POST /jobs/:id/review` endpoint re-queues HITL jobs. The worker resumes with `Command({ resume: simulationAnswerPayload })`.

**`LegalJobsController`** — add `@Post(':id/answer')` handler.

**`LegalJobsWorkerService`** — treat `awaiting_answer` identically to `awaiting_review` (job not picked up for new execution while in that state). Add `resumeWithSimulationAnswer(jobId, answer)` method alongside existing `resumeWithDecision()`.

### 4.4 Frontend Changes

**`LegalDepartmentWorkspace.vue`** — add "Prep a Deposition" action button alongside existing workflow buttons (Due Diligence, Compliance Audit, Portfolio Sentinel, Discovery Review).

**`legalJobsService.ts`** — add `submitSimulationAnswer(jobId: string, answer: string): Promise<void>` calling `POST /jobs/:id/answer`.

**New component: `DepositionPrepWorkspace.vue`**
- Tab bar: "Preparation Outline" | "Predicted Cross-Exam" | "Simulation"
- Loads the 3 most recent deposition prep jobs for the current session
- Privilege disclaimer banner: _"These materials constitute attorney work product privileged under applicable law and are not subject to production in discovery."_

**New component: `PreparationOutlineView.vue`**
- Expandable topic sections, each containing: open-ended questions, follow-up questions, confrontation sequences, trap sequences
- Document exhibit list with timing notes
- Red flags section, fallback questions section

**New component: `PredictedCrossExamView.vue`**
- Questions listed by topic in recommended order
- Per-question expansion: suggested answer framework, danger zones, follow-up handling, when "I don't recall" is safe vs. dangerous

**New component: `SimulationView.vue`**
- "Start Simulation" button → opens setup modal → creates `cross-exam-simulation` job
- While `processing`: loading spinner ("Opposing counsel is preparing...")
- While `awaiting_answer`: opposing counsel question displayed prominently, text area for witness answer, "Submit Answer" button
- Running transcript panel: color-coded rows (green=damage 0–3, yellow=4–6, red=7–10) — scores shown only after simulation ends
- After `completed`: shows `SimulationDebriefView` inline
- Polls `GET /jobs/:id` every 2 seconds while status is `processing` or `awaiting_answer`

**New component: `SimulationDebriefView.vue`**
- Full transcript with per-turn evasion/consistency/damage scores
- "5 Weakest Moments" highlighted section
- Identified behavioral patterns (habitual evasion, over-explaining, volunteering)
- Specific coaching recommendations per weak moment
- Disclaimer: _"This simulation reflects one possible cross-examination strategy, not a guarantee of what will occur."_

**Deposition setup modal (inline in DepositionPrepWorkspace.vue or separate modal component):**
- Case facts (textarea), witness background (textarea), deposition topics (tag input), prior statements (optional textarea), witness type (dropdown: corporate officer / expert witness / fact witness), opposing counsel name (optional), document uploads (reuses existing upload pattern from other legal workflows)
- Output selection checkboxes: "Preparation Outline", "Predicted Cross-Exam"
- "Generate" button enqueues selected async jobs

**Simulation setup modal:**
- Max questions slider (20–50, default 30), optional simulation focus text
- Privilege/work product disclaimer
- "Begin Simulation" button creates `cross-exam-simulation` job

**`JobActivityList.vue`** — add `awaiting_answer` status badge variant (alongside existing `awaiting_review`).

### 4.5 Infrastructure Requirements

No new infrastructure. All existing systems handle deposition prep without changes:
- `PostgresCheckpointerService` — handles 50 checkpoint writes per session without schema changes
- `LegalJobsWorkerService` — 1-second polling cadence is sufficient for simulation turns
- Concurrency slot system — Ollama provider slot limits to 1 concurrent simulation automatically
- SSE streaming endpoint — `question-generator.node.ts` emits observability events pre-LLM and streams question tokens the same way all other nodes do

---

## 5. Non-Functional Requirements

**Performance:**
- Preparation outline: < 90 seconds end-to-end
- Predicted cross-exam: < 120 seconds end-to-end
- Simulation per-turn (Ollama): question generated and displayed within 10 seconds of answer submission
- Debrief generation: < 30 seconds after final answer

**Reliability:**
- Simulation sessions survive page refresh — LangGraph checkpoint persistence at each turn guarantees this
- If the LLM fails during question generation, simulation enters `failed` state with a descriptive error. No silent failures, no fallback to weak questions. This satisfies both CLAUDE.md ABSOLUTE RULES (No Fallbacks) and the intention constraint ("simulation pauses with an error rather than asking a weak question")

**Security:**
- Simulation transcripts are attorney work product — no analytics extraction beyond what the existing observability plane records for billing/tracing
- Privilege disclaimer shown on all simulation UI surfaces (workspace banner + debrief disclaimer)
- No new auth requirements; same JWT validation as all Legal Department endpoints

**Context window management:**
- `CrossExamSimulationState.messages` maintains a sliding window of the last 10 Q&A pairs to prevent Ollama context overflow during long simulations (50 questions). Full history preserved in `state.questions` / `state.answers` arrays for debrief; only the sliding window feeds the LLM.

---

## 6. Out of Scope

Per intention:
- Video/voice simulation — text-based only
- Multi-witness coordination across the same matter
- Opposing counsel style profiling based on their prior depositions
- Auto-generated deposition notices or subpoenas
- Persistent Case Team (#10) integration

---

## 7. Dependencies & Risks

**Dependencies:**
- **Adversarial Brief (#3)** — adversarial agent pattern, `DebateRound.vue` (Q&A adaptation). Implemented and verified.
- **Legal Research (#2)** — recursive research pattern for `deposition-research.node.ts`. Implemented and verified.
- **Legal Department async workspace** — job queue, worker, HITL infrastructure. Implemented and verified.
- **LLM streaming support** — existing SSE infrastructure. Verified working.

**Risks:**

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| High-frequency checkpoint writes (50/session) cause Postgres contention | Low | High | Each simulation has its own `thread_id` (conversationId); no cross-session lock contention |
| Ollama context overflow during long simulations | Medium | Medium | Sliding window of last 10 Q&A pairs in `messages`; full transcript in state arrays only |
| Simulation UI latency feels too slow for interactive use | Medium | High | 2-second polling + SSE token streaming makes questions feel fast even if full turn is 8–10s |
| `awaiting_answer` status breaks existing job monitoring UI | Low | Low | Add badge variant in `JobActivityList.vue` in Phase 3 |
| Simulation transcripts treated as discoverable documents | Low | High | Clear privilege disclaimer in UI + documented as work product |

---

## 8. Phasing

### Phase 1: Deposition Prep Graph — Preparation Outline

**Objective:** Build and wire the `deposition-prep` async job for `preparation-outline` mode, end-to-end from "Prep a Deposition" button to job result.

**Steps:**
- [ ] 1.1 Verify/apply DB migration: add `deposition-prep` and `cross-exam-simulation` to `job_type`; add `awaiting_answer` to `status` (migration or text column verification)
- [ ] 1.2 Create `DepositionPrepState` interface in `deposition-prep.state.ts`
- [ ] 1.3 Create `case-analysis.node.ts` — ingests case facts, witness background, documents; outputs key themes, inconsistencies, legal theories, exhibit candidates
- [ ] 1.4 Create `question-generation.node.ts` — generates open-ended, follow-up, confrontation, and trap sequences per theme; each question tagged with strategic purpose
- [ ] 1.5 Create `deposition-research.node.ts` — 2–3 recursive research passes: deposition strategies from case law, witness-type evasion tactics, opposing counsel style if name provided
- [ ] 1.6 Create `deposition-synthesis.node.ts` — produces `PreparationOutlineOutput`: questions by topic in recommended order, exhibit list, red flags, fallback questions
- [ ] 1.7 Wire `deposition-prep.graph.ts` in `preparation-outline` mode: case-analysis → question-generation → deposition-research → deposition-synthesis
- [ ] 1.8 Create `DepositionPrepModule` and register in `LegalDepartmentModule`
- [ ] 1.9 Register `deposition-prep` capability in `LegalCapabilityRegistryService`
- [ ] 1.10 Add "Prep a Deposition" button to `LegalDepartmentWorkspace.vue` (opens minimal form for case facts + witness details, fires outline job only)
- [ ] 1.11 Display preparation outline result in existing `JobDetailModal.vue`

**Quality Gate:**
- [ ] **Lint**: `npm run lint --workspace=apps/forge/api`
- [ ] **Build**: `npm run build --workspace=apps/forge/api` — zero errors
- [ ] **Unit Tests**: `npm run test --workspace=apps/forge/api` — existing tests still pass
- [ ] **Curl — enqueue job**:
  ```bash
  curl -s -X POST http://localhost:6200/api/forge/legal-department/jobs \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "jobType": "deposition-prep",
      "input": {
        "mode": "preparation-outline",
        "caseFacts": "Plaintiff alleges breach of fiduciary duty by corporate officer Smith regarding Q3 disclosures.",
        "witnessBackground": "John Smith, CFO, 15 years at company, prior deposition in 2019 SEC matter.",
        "depositionTopics": ["Q3 disclosures", "Board communications", "Prior knowledge of losses"],
        "witnessType": "corporate-officer"
      }
    }' | jq .
  # Expected: { "jobId": "...", "status": "queued" }
  ```
- [ ] **Curl — poll to completion**:
  ```bash
  curl -s http://localhost:6200/api/forge/legal-department/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq .status
  # Expected: "completed" within 90s
  ```
- [ ] **Curl — verify output structure**:
  ```bash
  curl -s http://localhost:6200/api/forge/legal-department/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq '.result.preparationOutline'
  # Expected: non-null object with topics[], exhibitList[], redFlags[]
  ```
- [ ] **Chrome**: "Prep a Deposition" button visible in Legal Department workspace; clicking it opens the input form; after submission, job appears in activity list; clicking completed job shows preparation outline content
- [ ] **Phase Review**:
  - [ ] Case analysis node identifies themes, inconsistencies, legal theories, exhibits from input
  - [ ] Question generation produces tagged questions in all 4 categories (open-ended, follow-up, confrontation, trap)
  - [ ] Research node performs 2–3 research passes
  - [ ] Synthesis organizes output by topic with exhibit list and red flags
  - [ ] Job completes end-to-end without error for the test input above

---

### Phase 2: Predicted Cross-Examination Mode

**Objective:** Extend `deposition-prep.graph.ts` with `predicted-cross-exam` mode; deliver the predicted questions with answer coaching.

**Steps:**
- [ ] 2.1 Create `opposing-perspective.node.ts` — models opposing counsel's strategy: deposition goals, available prior statements/documents, witness vulnerabilities
- [ ] 2.2 Create `cross-exam-generation.node.ts` — generates predicted questions organized by: opening (rapport/basics), core substance, confrontation (documents + prior statements), trap questions; each with likely follow-up if witness stumbles
- [ ] 2.3 Create `answer-coaching.node.ts` — for each predicted question: answer framework (not a script), danger zones, follow-up handling guidance, "I don't recall" safety assessment
- [ ] 2.4 Add `predicted-cross-exam` branch to `deposition-prep.graph.ts`: shared case-analysis node → opposing-perspective → cross-exam-generation → answer-coaching
- [ ] 2.5 Update deposition setup form to show output selection checkboxes (Prep Outline, Predicted Cross-Exam) — allow both to be enqueued as separate jobs
- [ ] 2.6 Create `PredictedCrossExamView.vue` — questions listed by topic, expandable per-question showing framework, danger zones, follow-up handling
- [ ] 2.7 Create `DepositionPrepWorkspace.vue` skeleton (tabbed: Outline | Predicted Cross-Exam) — replace `JobDetailModal.vue` usage for deposition jobs

**Quality Gate:**
- [ ] **Lint**: `npm run lint --workspace=apps/forge/api && npm run lint --workspace=apps/forge/web`
- [ ] **Build**: both api and web build without errors
- [ ] **Unit Tests**: `npm run test --workspace=apps/forge/api`
- [ ] **Curl — predicted cross-exam job**:
  ```bash
  curl -s -X POST http://localhost:6200/api/forge/legal-department/jobs \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "jobType": "deposition-prep",
      "input": {
        "mode": "predicted-cross-exam",
        "caseFacts": "Plaintiff alleges breach of fiduciary duty by corporate officer Smith regarding Q3 disclosures.",
        "witnessBackground": "John Smith, CFO, 15 years at company, prior deposition in 2019 SEC matter.",
        "depositionTopics": ["Q3 disclosures", "Board communications", "Prior knowledge of losses"],
        "witnessType": "corporate-officer",
        "priorStatements": "In 2019 deposition, Smith stated he did not review Q3 projections before board meeting."
      }
    }' | jq .
  ```
- [ ] **Curl — verify output**:
  ```bash
  curl -s http://localhost:6200/api/forge/legal-department/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq '.result.predictedQuestions | length'
  # Expected: > 0
  curl -s http://localhost:6200/api/forge/legal-department/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq '.result.answerCoaching'
  # Expected: non-null with per-question coaching entries
  ```
- [ ] **Chrome**: Deposition workspace shows both tabs; Predicted Cross-Exam tab renders questions with expandable coaching; both outline and predicted cross-exam jobs visible in the workspace
- [ ] **Phase Review**:
  - [ ] Opposing perspective node models the other side's deposition strategy
  - [ ] Cross-exam generation covers all 4 question categories with follow-ups
  - [ ] Answer coaching includes framework, danger zones, follow-up handling, and "don't recall" guidance per question
  - [ ] `DepositionPrepWorkspace.vue` tabs work: each tab shows its respective job result

---

### Phase 3: Interactive Simulation — Backend

**Objective:** Build the `cross-exam-simulation` interactive session workflow with per-question interrupt/resume.

**Steps:**
- [ ] 3.1 Create `CrossExamSimulationState` interface in `cross-exam-simulation.state.ts`; include `TurnScore`, `SimulationQuestion`, `SimulationAnswer`, `SimulationDebrief` types
- [ ] 3.2 Create `simulation-setup.node.ts` — runs case analysis (reuse `CaseAnalysisOutput` type), builds simulation strategy: prioritized topic list, documents available for confrontation, witness vulnerability map
- [ ] 3.3 Create `question-generator.node.ts` — opposing counsel agent generates next question based on current topic, prior answers, available documents, and simulation strategy; emits observability progress event before LLM call; uses `interrupt()` to pause and surface question to frontend
- [ ] 3.4 Create `answer-scorer.node.ts` — scores the witness response: evasion (0–10), consistency with prior statements (0–10), case damage (0–10); appends coaching note to state (shown at debrief, not during simulation)
- [ ] 3.5 Create `next-move-decider.node.ts` — opposing counsel decides: follow up on same topic / move to next topic / confront with document / attempt impeachment; also determines if simulation is complete (max questions reached or all topics exhausted)
- [ ] 3.6 Create `debrief-generator.node.ts` — produces `SimulationDebrief`: full transcript with per-turn scores, 5 weakest moments (highest damage), behavioral pattern analysis, coaching recommendations; includes disclaimer text field
- [ ] 3.7 Wire `cross-exam-simulation.graph.ts`: simulation-setup → question-generator → [interrupt] → answer-scorer → next-move-decider → [conditional: complete? → debrief-generator : question-generator loop]
- [ ] 3.8 Implement sliding window for `messages`: keep last 10 Q&A pairs in `state.messages`; full history in `state.questions` / `state.answers`
- [ ] 3.9 Create `CrossExamSimulationModule` and register in `LegalDepartmentModule`
- [ ] 3.10 Register `cross-exam-simulation` capability in `LegalCapabilityRegistryService`
- [ ] 3.11 Add `awaiting_answer` to `LegalJobsWorkerService` status handling — treat identically to `awaiting_review` (not picked up for new execution while in this state)
- [ ] 3.12 Add `resumeWithSimulationAnswer(jobId: string, answer: string)` to `LegalJobsWorkerService`
- [ ] 3.13 Add `POST /api/forge/legal-department/jobs/:id/answer` endpoint to `LegalJobsController`
- [ ] 3.14 Add `awaiting_answer` badge variant to `JobActivityList.vue`

**Quality Gate:**
- [ ] **Lint**: `npm run lint --workspace=apps/forge/api`
- [ ] **Build**: `npm run build --workspace=apps/forge/api` — zero errors
- [ ] **Unit Tests**: `npm run test --workspace=apps/forge/api`
- [ ] **Curl — start simulation**:
  ```bash
  curl -s -X POST http://localhost:6200/api/forge/legal-department/jobs \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "jobType": "cross-exam-simulation",
      "input": {
        "caseFacts": "Plaintiff alleges breach of fiduciary duty by corporate officer Smith regarding Q3 disclosures.",
        "witnessBackground": "John Smith, CFO. Prior deposition in 2019 SEC matter where he stated he did not review Q3 projections.",
        "maxQuestions": 5
      }
    }' | jq .jobId
  ```
- [ ] **Curl — poll until awaiting_answer**:
  ```bash
  curl -s http://localhost:6200/api/forge/legal-department/jobs/$JOB_ID \
    -H "Authorization: Bearer $TOKEN" | jq '{status: .status, question: .result.currentQuestion}'
  # Expected: { "status": "awaiting_answer", "question": "<non-null question string>" }
  ```
- [ ] **Curl — submit answer**:
  ```bash
  curl -s -X POST http://localhost:6200/api/forge/legal-department/jobs/$JOB_ID/answer \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"answer": "I reviewed the projections approximately two weeks before the board meeting."}' \
    -w "\nHTTP %{http_code}"
  # Expected: HTTP 204
  ```
- [ ] **Curl — cycle 5 questions then verify debrief**:
  Submit 5 answers via script; verify final `status: "completed"` and `result.debrief` non-null with `weakestMoments` array of length 5
- [ ] **Curl — verify answer endpoint rejects wrong job type**:
  ```bash
  # Use a deposition-prep job ID (not a simulation job) — should return 400
  curl -s -X POST http://localhost:6200/api/forge/legal-department/jobs/$PREP_JOB_ID/answer \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"answer": "test"}' -w "\nHTTP %{http_code}"
  # Expected: HTTP 400
  ```
- [ ] **Chrome**: `JobActivityList.vue` shows `awaiting_answer` badge (not broken/blank) for active simulation jobs
- [ ] **Phase Review**:
  - [ ] Graph interrupt/resume cycle works: job goes `queued → processing → awaiting_answer` on first question; `queued → processing → awaiting_answer` on each subsequent answer; `completed` after maxQuestions
  - [ ] `answer-scorer.node.ts` produces all three scores + coaching note per turn
  - [ ] `next-move-decider.node.ts` varies the opposing counsel's approach (not always the same move)
  - [ ] Debrief identifies 5 weakest moments and includes behavioral pattern analysis
  - [ ] Sliding window prevents context overflow (verify `messages` array length ≤ 10 in checkpoint)

---

### Phase 4: Interactive Simulation — Frontend

**Objective:** Build the live simulation UI with real-time question display, answer submission, and debrief.

**Steps:**
- [ ] 4.1 Add `submitSimulationAnswer(jobId, answer)` to `legalJobsService.ts` — `POST /jobs/:id/answer`
- [ ] 4.2 Create `SimulationDebriefView.vue` — full transcript with per-turn evasion/consistency/damage scores, 5 weakest moments section, behavioral patterns, coaching recommendations, disclaimer text
- [ ] 4.3 Create `SimulationView.vue`:
  - "Start Simulation" button → simulation setup modal → creates `cross-exam-simulation` job
  - While `processing`: loading spinner with "Opposing counsel is preparing..."
  - While `awaiting_answer`: question displayed prominently, textarea for witness answer, "Submit Answer" button
  - Running transcript side panel: rows colored by damage score (green ≤ 3, yellow 4–6, red ≥ 7); scores revealed only after simulation completes
  - Polls `GET /jobs/:id` every 2 seconds while `processing` or `awaiting_answer`
  - On `completed`: renders `SimulationDebriefView` inline
  - On `failed`: displays error message
- [ ] 4.4 Add simulation setup modal (inside `SimulationView.vue`): max questions slider (20–50), optional focus text, privilege disclaimer, "Begin Simulation" button
- [ ] 4.5 Add privilege disclaimer banner to `SimulationView.vue` and `SimulationDebriefView.vue`: _"These materials constitute attorney work product privileged under applicable law and are not subject to production in discovery."_
- [ ] 4.6 Connect `SimulationView.vue` as the third tab in `DepositionPrepWorkspace.vue`

**Quality Gate:**
- [ ] **Lint**: `npm run lint --workspace=apps/forge/web`
- [ ] **Build**: `npm run build --workspace=apps/forge/web` — zero errors
- [ ] **Chrome — full simulation flow**:
  - [ ] Navigate to Legal Department workspace → click "Prep a Deposition" → select Simulation tab
  - [ ] Click "Start Simulation" → simulation setup modal appears with slider and disclaimer
  - [ ] Click "Begin Simulation" → loading spinner appears
  - [ ] Job transitions to `awaiting_answer` → opposing counsel question renders clearly
  - [ ] Type an answer and click "Submit Answer" → loading spinner briefly, then next question appears
  - [ ] After 5 answers (using `maxQuestions: 5` for this test): simulation completes and debrief renders
  - [ ] Debrief shows transcript with scores, weakest moments section, coaching, and disclaimer
  - [ ] Privilege disclaimer banner visible throughout simulation and debrief
- [ ] **Chrome — edge case: page refresh during active simulation**:
  - [ ] Start simulation, get first question, refresh page
  - [ ] Workspace reloads, Simulation tab shows job in `awaiting_answer` state with the same question still displayed (checkpoint persistence verified)
- [ ] **Phase Review**:
  - [ ] Question display is clear and readable during active simulation
  - [ ] Answer submission and next-question cycle feels interactive (< 10 seconds per turn on Ollama)
  - [ ] Debrief content is actionable: weakest moments include specific quotes from the transcript
  - [ ] Privilege disclaimer present on all simulation surfaces

---

### Phase 5: Deposition Workspace Integration & Polish

**Objective:** Unify all three outputs in the Deposition Workspace with full input collection, complete the deposition setup modal, and verify end-to-end flow.

**Steps:**
- [ ] 5.1 Build full deposition setup modal: case facts, witness background, deposition topics (tag input), prior statements, witness type dropdown, opposing counsel name, document uploads (reusing existing upload pattern from other legal workflows), output selection checkboxes
- [ ] 5.2 Update "Prep a Deposition" flow to enqueue selected async jobs (outline and/or predicted cross-exam) and record job IDs in workspace session state
- [ ] 5.3 `PreparationOutlineView.vue` — full layout: expandable topic sections showing all 4 question types, document exhibit list with timing notes, red flags section, fallback questions section
- [ ] 5.4 Verify `DepositionPrepWorkspace.vue` tab persistence: user can switch between tabs without losing loaded content; active simulation job polling continues regardless of active tab
- [ ] 5.5 Add privilege disclaimer banner to `DepositionPrepWorkspace.vue` (workspace-level, shown always)
- [ ] 5.6 End-to-end validation: start all three outputs from one workspace session, all three complete, all three visible in tabs

**Quality Gate:**
- [ ] **Lint**: `npm run lint --workspace=apps/forge/api && npm run lint --workspace=apps/forge/web`
- [ ] **Build**: both api and web build without errors
- [ ] **Unit Tests**: `npm run test --workspace=apps/forge/api`
- [ ] **Chrome — full end-to-end**:
  - [ ] Click "Prep a Deposition" → fill all fields in setup modal → check both "Preparation Outline" and "Predicted Cross-Exam" → submit
  - [ ] Both async jobs appear in activity list; workspace tabs show loading states
  - [ ] Both jobs complete; Preparation Outline tab shows organized question sections with exhibits and red flags
  - [ ] Predicted Cross-Exam tab shows predicted questions with expandable coaching per question
  - [ ] Switch to Simulation tab → run a 5-question simulation → debrief renders correctly
  - [ ] Privilege disclaimer visible on workspace banner and simulation/debrief views
  - [ ] Refresh page → workspace loads with all previously completed job results intact
- [ ] **Chrome — document upload**:
  - [ ] Upload a PDF document in the deposition setup modal
  - [ ] Verify preparation outline references the document in the exhibit list
  - [ ] Verify simulation confronts the witness with document content
- [ ] **Phase Review**:
  - [ ] Setup modal collects all input fields specified in the intention
  - [ ] Document upload works and document content flows into all three job types
  - [ ] All three outputs are accessible, readable, and actionable for a litigator
  - [ ] All privilege disclaimers present
  - [ ] No fallback behavior: if a job fails, it shows an error — not empty/default content
  - [ ] PRD success criteria met: job timing targets, debrief quality, disclaimer coverage, workspace navigation
