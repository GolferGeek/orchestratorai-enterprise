# Adversarial Brief Stress-Testing ("Red Team Your Brief") — Product Requirements Document

## 1. Overview

A litigator uploads a draft motion, brief, or memo. The platform spins up a **mirror legal team** — an opposing counsel persona, a skeptical judge persona, and domain specialists aligned with the other side's interests — and runs a structured multi-round adversarial debate against the original argument. The output is a ranked list of the strongest attacks on the brief, the weakest citations, the factual gaps a good opponent would exploit, and suggested fortifications. A second pass revises the brief and re-runs the debate until the adversary team can no longer find high-severity attacks.

This builds directly on the existing Legal Department capability in Forge (`apps/forge/api/src/agents/legal-department/`), reusing the 8 specialist agents as the blue team foundation and the cyclic graph pattern proven by Legal Research Deep Dive.

### Why This Matters

- A partner currently asks a senior associate to "steelman the other side" — 8-20 hours, $4K-$10K, frequently skipped on smaller matters.
- Agent version: $10-30 in cloud, ~45-90 minutes on a Mac Studio with local models.
- **Every brief gets stress-tested** instead of only the biggest ones.
- The quality delta is real: human steelmanning is limited by what the associate remembers; the agent team systematically covers every citation and every factual assertion.

## 2. Goals & Success Criteria

### Goals

1. **Deliver a new "Adversarial Brief" workflow** within the Legal Department capability that runs a multi-round adversarial debate between Blue Team (defending the brief) and Red Team (attacking the brief), scored by a Judge agent.
2. **Hard-ground all citations** — no hallucinated case law, ever. Every citation the Red Team raises must come from verified sources in the RAG collection.
3. **Converge reliably** — the debate loop must terminate when the Red Team can no longer produce high-severity attacks, or at a configurable hard round cap.
4. **Provide a real-time debate transcript UI** so the litigator can watch the red team attack and blue team defend live.
5. **Gate on attorney approval** — the litigator reviews the stress-test report and decides which fortifications to accept before any brief revision occurs.

### Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| Debate converges within round cap | 100% of runs terminate without manual intervention |
| Zero hallucinated citations in Red Team output | Citation verification rejects any citation not in RAG sources; manual audit of 20 runs finds zero fabricated cases |
| Judge scoring is position-neutral | Position-swap test: judge scores do not statistically favor the side that argued last (p < 0.05 on 50-run sample) |
| End-to-end latency on local models | < 90 minutes on Mac Studio with Ollama for a 20-page brief, 5-round debate |
| Attorney can review and act on report | HITL gate presents actionable fortification recommendations; attorney can accept/reject/modify each |

## 3. User Stories / Use Cases

### US-1: Litigator Stress-Tests a Motion

A litigation partner uploads a draft motion for summary judgment. The system runs a 3-5 round adversarial debate. The partner receives a ranked report showing the 3 strongest attacks, 2 weak citations, and 4 factual gaps. They accept 6 of 9 recommended fortifications and request the brief be revised accordingly.

### US-2: Associate Hardens a Brief Before Filing

A junior associate uploads a brief before partner review. The stress test identifies that one key citation has been distinguished by a more recent case (found via RAG). The associate replaces the citation and re-runs — the second pass converges in 2 rounds with no high-severity attacks remaining.

### US-3: Real-Time Demo for Prospective Client

A sales engineer runs a stress test on a sample brief during a demo. The prospective client watches the Red Team shred the brief's weakest argument in real time via the debate transcript UI. The demo sells the platform.

### US-4: Sovereign Mode — Sealed Brief

A litigator working on a case with sealed facts runs the stress test entirely on local Ollama models. No brief content leaves the machine. The system uses the same workflow with provider-aware execution (sequential specialist invocation for single-GPU environments).

## 4. Technical Requirements

### 4.1 Architecture — Adversarial Debate Graph

A new LangGraph workflow within the Legal Department capability, following the cyclic graph pattern established by Legal Research (`apps/forge/api/src/agents/legal-department/workflows/legal-research/legal-research.graph.ts`).

**Graph topology:**

```
start → brief_analysis → blue_team_orchestrator → red_team_orchestrator →
judge_scoring → convergence_check → [conditional: red_team_orchestrator or synthesis] →
hitl_checkpoint → [conditional: report_generation or fortification] → complete
```

**New directory:**
```
apps/forge/api/src/agents/legal-department/workflows/adversarial-brief/
  adversarial-brief.graph.ts        — Graph definition
  adversarial-brief.state.ts        — State annotation
  nodes/
    brief-analysis.node.ts          — Parse brief structure, extract arguments, citations, facts
    blue-team-orchestrator.node.ts  — Coordinate 3 blue team agents defending the brief
    red-team-orchestrator.node.ts   — Coordinate 3 red team agents attacking the brief
    judge-scoring.node.ts           — Score each sub-argument exchange on rubric
    convergence-check.node.ts       — Decide whether to continue or exit the loop
    synthesis.node.ts               — Produce ranked stress-test report
    fortification.node.ts           — Revise brief based on accepted fortifications
    hitl-checkpoint.node.ts         — Attorney review gate
    report-generation.node.ts       — Format final report
```

**State shape** (new `AdversarialBriefStateAnnotation`):

```typescript
{
  executionContext: ExecutionContext,
  messages: BaseMessage[],
  userMessage: string,
  documents: Array<{ name: string; content: string; type?: string }>,
  documentsMetadata: LegalDocumentMetadata[],

  // Brief analysis
  briefStructure: {
    arguments: Array<{ id: string; claim: string; support: string; citations: string[] }>,
    citations: Array<{ id: string; text: string; source: string; verified: boolean }>,
    factualAssertions: Array<{ id: string; assertion: string; support: string }>,
  },

  // Debate state
  currentRound: number,
  maxRounds: number,          // configurable, default 5
  severityThreshold: number,  // minimum severity to continue, default 7 (1-10 scale)
  rounds: Array<{
    round: number,
    blueTeamArguments: BlueTeamOutput,
    redTeamAttacks: RedTeamOutput,
    judgeScoring: JudgeScoring,
  }>,

  // Team outputs (current round)
  blueTeamOutput: BlueTeamOutput | undefined,
  redTeamOutput: RedTeamOutput | undefined,
  judgeOutput: JudgeScoring | undefined,

  // Convergence
  converged: boolean,
  convergenceReason: string | undefined,

  // Synthesis
  stressTestReport: StressTestReport | undefined,

  // HITL
  hitlDecision: ReviewDecisionPayload | undefined,
  acceptedFortifications: string[],  // IDs of accepted recommendations

  // Fortified brief
  fortifiedBrief: string | undefined,

  // Standard workflow fields
  status: 'started' | 'processing' | 'completed' | 'failed',
  error: string | undefined,
  startedAt: number,
  completedAt: number | undefined,
  report: string | undefined,
  tokenUsage: { input: number; output: number },
}
```

### 4.2 Blue Team Agents (3 agents)

The Blue Team defends the brief. These reuse the existing specialist infrastructure (`specialist-utils.ts`, `runSpecialistOverDocuments()`, `callLLMMaybeWithReasoning()`) with defense-oriented prompts.

| Agent | Role | Reuse |
|-------|------|-------|
| **Argument Agent** | Defends the logical structure of each argument | New node, reuses specialist-utils patterns |
| **Authority Agent** | Defends cited authorities, distinguishes Red Team counter-cases | New node, queries RAG for supporting authority |
| **Facts Agent** | Defends factual assertions, identifies corroborating evidence | New node, queries RAG for factual support |

Blue Team agents receive the brief plus the Red Team's attacks from the previous round (empty on round 1). They produce structured rebuttals.

### 4.3 Red Team Agents (3 agents)

The Red Team attacks the brief. These are the mirror of the Blue Team with inverted prompts — they argue from the opposing side's perspective.

| Agent | Role |
|-------|------|
| **Counter-Argument Agent** | Attacks the logical structure, identifies fallacies, weaknesses |
| **Distinguishing-Cases Agent** | Finds cases that distinguish or undermine cited authorities |
| **Factual-Challenge Agent** | Identifies unsupported assertions, missing evidence, contradictions |

**Citation grounding requirement:** The Distinguishing-Cases Agent MUST only cite cases retrieved from the RAG collection (`workflow-rag.service.ts`). The node will:
1. Query RAG with the cited authority + "distinguish" or "overrule" context
2. Only include counter-authorities that appear in RAG results with `verified: true`
3. Any LLM-generated citation not found in RAG is stripped before output

Red Team agents receive the brief plus the Blue Team's defense from the current round. They produce structured attacks with severity ratings (1-10).

### 4.4 Judge Agent

A single reasoning-capable agent that scores each sub-argument exchange on a rubric.

**Scoring rubric:**
- Legal soundness (1-10)
- Factual support (1-10)
- Citation quality (1-10)
- Persuasiveness (1-10)
- Overall severity of attack (1-10) — this drives convergence

**Position-bias mitigation:**
- The Judge receives Blue and Red arguments in randomized order each round (not always Blue-then-Red)
- The Judge scores each side independently before comparing
- Double-blind: team labels are replaced with neutral "Position A" / "Position B" labels, swapped randomly

**Model selection:**
- Cloud: Use the provider/model from ExecutionContext (thinking-capable models preferred)
- Sovereign/local: gemma4:31b or qwq via Ollama — benchmark both during development to select default
- Uses `callLLMMaybeWithReasoning()` to leverage reasoning capture when available

### 4.5 Convergence Detector

The `convergence-check` node examines the Judge's scoring from the current round and decides whether to continue.

**Exit conditions (any one triggers exit):**
1. No Red Team attack scored above `severityThreshold` (default 7) — Red Team cannot find high-severity weaknesses
2. `currentRound >= maxRounds` — hard cap reached (default 5)
3. All Red Team attacks from the current round are repeats of previous rounds (diminishing returns)

**Routing:**
- If not converged → route back to `red_team_orchestrator` (next round begins with Red Team attacking the Blue Team's latest defense)
- If converged → route to `synthesis`

### 4.6 Synthesis & Report

The `synthesis` node produces a `StressTestReport`:

```typescript
interface StressTestReport {
  // Ranked by severity (highest first)
  attacks: Array<{
    id: string;
    severity: number;       // 1-10, from judge scoring
    category: 'argument' | 'citation' | 'factual';
    description: string;    // What the attack is
    briefSection: string;   // Which part of the brief it targets
    redTeamReasoning: string;
    blueTeamRebuttal: string;
    judgeAssessment: string;
    recommendation: string; // Suggested fortification
  }>;
  weakCitations: Array<{
    id: string;
    originalCitation: string;
    weakness: string;
    suggestedReplacement: string | null;  // null if no better authority found
  }>;
  factualGaps: Array<{
    id: string;
    assertion: string;
    gap: string;
    suggestedEvidence: string;
  }>;
  summary: {
    totalRounds: number;
    convergenceReason: string;
    overallStrength: number;  // 1-10, composite score
    criticalWeaknesses: number;
    moderateWeaknesses: number;
    minorWeaknesses: number;
  };
}
```

### 4.7 HITL Gate

After synthesis, the workflow pauses at the HITL checkpoint. The attorney reviews the stress-test report and for each recommendation can:
- **Accept** — include in fortification pass
- **Reject** — exclude from fortification
- **Modify** — edit the recommendation before accepting

The attorney can also:
- **Approve and fortify** — proceed to fortification with accepted recommendations
- **Approve without fortification** — accept the report as-is, skip brief revision
- **Reject and re-run** — send back to the debate loop with additional guidance

### 4.8 Fortification Pass

If the attorney chooses "Approve and fortify," the `fortification` node:
1. Takes the original brief + accepted recommendations
2. Produces a revised brief with the fortifications applied
3. Optionally re-runs the debate on the fortified brief (attorney's choice at HITL)

### 4.9 Citation Grounding — Hard Enforcement

This is the make-or-break safety requirement. Current citation verification in Legal Research (`research.node.ts`) uses soft string matching. For Adversarial Brief, we need **hard grounding**.

**Implementation:**
1. Extract a `CitationGroundingService` from the existing verification logic in `research.node.ts`
2. Add a `verifyOrReject(citation: string, ragService: WorkflowRagService): Promise<VerifiedCitation | null>` method
3. Any citation that returns `null` (not found in RAG) is **stripped from the output** — it never reaches the attorney
4. The report marks stripped citations as "Attempted citation removed — not found in verified sources" so the attorney knows the Red Team tried to cite something that couldn't be verified
5. RAG queries use the existing `law-contracts-hybrid` collection plus any org-specific collections

**This service is shared** — Legal Research should also adopt it to replace its current soft matching.

### 4.10 Provider-Aware Execution

Following the existing pattern in `orchestrator.node.ts`:
- **Cloud providers** (OpenAI, Anthropic, Google): Blue and Red team agents run in parallel via `Promise.all()`
- **Local providers** (Ollama): Agents run sequentially to avoid GPU contention
- The orchestrator nodes check `executionContext.provider` to determine execution strategy

### 4.11 API Changes

**No new endpoints.** The adversarial brief workflow is invoked through the existing Forge invoke contract:

```json
{
  "jsonrpc": "2.0",
  "id": "...",
  "method": "invoke",
  "params": {
    "context": { "agentSlug": "legal-department", ... },
    "data": {
      "content": "Stress-test this brief",
      "contentType": "text"
    },
    "metadata": {
      "outputMode": "adversarial-brief",
      "maxRounds": 5,
      "severityThreshold": 7
    }
  }
}
```

The `LegalDepartmentCapability` handler routes to the adversarial-brief graph when `metadata.outputMode === 'adversarial-brief'`.

**New output type on `LegalDepartmentResult`:**
```typescript
stressTestReport?: StressTestReport;
debateTranscript?: DebateRound[];
fortifiedBrief?: string;
```

### 4.12 Frontend Changes

#### 4.12.1 Debate Transcript UI

A new view for the adversarial-brief workflow in `apps/forge/web/src/views/agents/legal-department/`. This differs from the existing stage ladder — instead of a linear progression, it shows a **round-by-round debate**.

**Components:**
- `AdversarialBriefView.vue` — top-level workflow view
- `DebateRound.vue` — a single round showing Blue arguments, Red attacks, and Judge scores
- `StressTestReport.vue` — the final ranked report with accept/reject/modify controls
- `FortificationDiff.vue` — side-by-side original vs. fortified brief

**Real-time updates:** Uses the existing SSE job event stream (`useJobEventStream.ts`) with new event types for debate rounds.

#### 4.12.2 Presentation Manifest

A new `WorkflowPresentation` for the adversarial-brief workflow with stages:

| Stage ID | Label |
|----------|-------|
| `brief_analysis` | Analyzing your brief |
| `blue_team` | Blue Team defending (Round N) |
| `red_team` | Red Team attacking (Round N) |
| `judge` | Judge scoring (Round N) |
| `convergence` | Checking convergence |
| `synthesis` | Writing stress-test report |
| `hitl_review` | Awaiting attorney review |
| `fortification` | Applying fortifications |
| `report` | Generating final report |

Round-specific stages (`blue_team`, `red_team`, `judge`) update their labels with the current round number via event payload.

#### 4.12.3 Left Navigation

Add "Brief Stress Test" to the Legal Department section in the Forge web left navigation, consistent with the existing "Legal Research" entry.

### 4.13 Data Model Changes

**No new database tables.** The workflow uses:
- Existing LangGraph checkpointer (`PostgresSaver`) for state persistence
- Existing conversation/message tables for storing the debate transcript
- The `StressTestReport` is stored as structured JSON in the workflow output

### 4.14 Database Agent Registration

Register the `adversarial-brief` workflow as a new agent variant in the database, following the existing pattern for `legal-research`. This is an `outputMode` variant of the `legal-department` agent, not a separate agent.

## 5. Non-Functional Requirements

### Performance
- Cloud execution (3 agents per team, 5 rounds): < 10 minutes for a 20-page brief
- Local execution (Ollama, sequential): < 90 minutes for a 20-page brief, 5 rounds
- Each round should produce visible progress via SSE within 30 seconds of starting

### Security
- Brief content never leaves the machine in sovereign mode
- Citation grounding prevents hallucinated case law (safety-critical)
- All debate content is scoped to the org via ExecutionContext

### Scalability
- Round count and severity threshold are configurable per invocation
- Specialist count (3 per team) is hardcoded initially; extensible via configuration in future efforts

### Compatibility
- Works with all providers supported by the Legal Department (Anthropic, OpenAI, Google, Ollama)
- Provider-aware parallelization (existing pattern)
- Reasoning capture works when available, gracefully absent when not

## 6. Out of Scope

- **Automatic filing** — the workflow produces a report and optionally a fortified brief; it does not file anything
- **Multi-brief comparison** — stress-testing compares one brief against adversarial attack, not multiple briefs against each other
- **Custom specialist count** — Blue and Red teams are fixed at 3 agents each in this effort
- **External case law APIs** — citation grounding uses the existing RAG collection only; integration with external legal databases (Westlaw, LexisNexis) is a separate effort
- **Monte Carlo Trial simulation** (Concept #9) — this effort validates the adversarial pattern; Monte Carlo is a future effort that builds on it
- **Draft+Predict dual-track** (Concept #10) — separate future effort
- **Expanding the RAG collection** — this effort assumes the `law-contracts-hybrid` collection exists and is populated; populating it with more case law is orthogonal

## 7. Dependencies & Risks

### Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| Legal Department running (8 specialists) | Complete | Blue team foundation |
| Legal Research cyclic graph pattern | Complete | Graph topology pattern |
| Workflow RAG service + `law-contracts-hybrid` collection | Complete | Citation retrieval |
| Reasoning capture infrastructure | Complete | Judge agent reasoning |
| Presentation manifest system | Complete | Debate UI stage tracking |
| HITL checkpoint pattern | Complete | Attorney review gate |
| PostgresCheckpointer | Complete | Multi-round state persistence |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Hallucinated counter-authority** — Red Team cites fake cases | Critical | Hard citation grounding: `CitationGroundingService` strips any citation not found in RAG. Report flags stripped citations explicitly. |
| **Judge agent position bias** — favors the side that argued last | High | Double-blind scoring with randomized position labels and argument order. Validated via position-swap test in success criteria. |
| **Runaway rounds** — Red Team always finds something to attack | Medium | Severity threshold (default 7) + hard round cap (default 5). Convergence detector exits when no attack exceeds threshold. |
| **Specialist quality as opposing counsel** — arguing the other side's reading of a clause is a prompt design challenge | Medium | Iterative prompt engineering during development. Start with litigation and contract specialists (most natural adversarial role), validate before extending to all 3 Red Team roles. |
| **Local model quality for Judge** — reasoning-capable local models (gemma4:31b, qwq) may produce lower-quality scoring | Medium | Benchmark both candidates during Phase 1. If neither meets quality bar, Judge agent falls back to cloud provider with user consent (breaks full sovereignty). Document this tradeoff. |
| **RAG collection gaps** — if `law-contracts-hybrid` lacks relevant case law, Red Team can't find counter-authorities | Low | Stripped-citation reporting makes gaps visible. User can populate RAG collection before re-running. Out of scope to auto-populate. |

## 8. Phasing

### Phase 1: Core Debate Graph & Citation Grounding (Foundational)

**Goal:** Get the cyclic adversarial debate running end-to-end with hard citation grounding.

**Deliverables:**
- `AdversarialBriefStateAnnotation` — state definition
- `adversarial-brief.graph.ts` — graph with all nodes wired
- `brief-analysis.node.ts` — parses brief into arguments, citations, facts
- `CitationGroundingService` — extracted from research.node.ts, hard verification
- Blue Team orchestrator + 3 agent nodes (argument, authority, facts)
- Red Team orchestrator + 3 agent nodes (counter-argument, distinguishing-cases, factual-challenge)
- Convergence detector with severity threshold + round cap
- Provider-aware execution (parallel cloud, sequential local)
- `outputMode: 'adversarial-brief'` routing in LegalDepartmentCapability

**Validation:** Run 5 stress-tests on sample briefs. Verify: debate converges, zero hallucinated citations (manual audit), round transcripts are coherent.

### Phase 2: Judge Agent & Scoring (Quality)

**Goal:** Add calibrated scoring so convergence is driven by quality assessment, not just round count.

**Deliverables:**
- `judge-scoring.node.ts` — rubric-based scoring with position-bias mitigation
- Double-blind argument presentation (randomized order, neutral labels)
- Judge reasoning capture via `callLLMMaybeWithReasoning()`
- Local model benchmarking (gemma4:31b vs qwq for judge role)
- Update convergence detector to use judge severity scores

**Validation:** Position-swap test on 20 runs — judge scores should not statistically favor the side that argued last. Convergence should be driven by severity, not round count.

### Phase 3: Synthesis, HITL & Fortification (Completion)

**Goal:** Produce the actionable stress-test report and let the attorney drive fortification.

**Deliverables:**
- `synthesis.node.ts` — ranked stress-test report generation
- `hitl-checkpoint.node.ts` — attorney review with accept/reject/modify per recommendation
- `fortification.node.ts` — revise brief based on accepted fortifications
- `report-generation.node.ts` — final formatted report
- Updated `LegalDepartmentResult` with `stressTestReport`, `debateTranscript`, `fortifiedBrief`

**Validation:** Attorney can review report, accept/reject recommendations, and receive a fortified brief. Re-run on fortified brief converges faster (fewer high-severity attacks).

### Phase 4: Debate Transcript UI (Experience)

**Goal:** Real-time debate visualization so the litigator can watch the adversarial exchange live.

**Deliverables:**
- `AdversarialBriefView.vue` — workflow view with round-by-round debate display
- `DebateRound.vue` — Blue/Red/Judge exchange per round
- `StressTestReport.vue` — interactive report with accept/reject/modify controls
- `FortificationDiff.vue` — side-by-side original vs. fortified brief
- Adversarial-brief `WorkflowPresentation` manifest with round-aware stages
- Left nav entry for "Brief Stress Test"
- SSE event stream integration for real-time debate updates

**Validation:** Demo end-to-end: upload brief, watch debate in real time, review report, accept fortifications, see revised brief. The demo should be compelling enough to sell the platform in one meeting.
