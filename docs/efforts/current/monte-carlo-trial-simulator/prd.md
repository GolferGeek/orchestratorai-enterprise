# Monte Carlo Trial Simulator — Product Requirements Document

## 1. Overview

The Monte Carlo Trial Simulator is a Forge LangGraph workflow that runs 50–200 simulated mini-trials for a given case record and aggregates the results into a probability distribution of trial outcomes. Each simulation varies jury composition, judge temperament, evidence admissibility, and witness credibility. The platform executes adversarial plaintiff and defense agents, a judge agent, and a jury deliberation agent per simulation. The final output is a statistical outcome distribution, sensitivity analysis (which factors swing the result most), and a settlement range recommendation.

This is workflow #9 in the legal-department capability set. It introduces **parameterized parallel execution with aggregation** — a new orchestration pattern on the platform (N instances of the same graph with varied parameters → statistical aggregate).

---

## 2. Goals & Success Criteria

### Goals
1. A litigation team can submit a complete case record and receive a probability distribution of trial outcomes across 50–200 simulated trials.
2. The sensitivity analysis identifies which evidence items, witnesses, and jury/judge characteristics most affect outcomes.
3. The four-tab dashboard renders simulation progress in real time and makes the final distribution and sensitivity analysis actionable.
4. The system runs correctly on local Ollama (sequential, ~4–8 hours for 50 sims) and on cloud providers (parallel batches).
5. The "experimental" disclaimer is mandatory, non-removable, and appears before launch and in all result views.
6. Failed simulations are counted, excluded from aggregation, and reported — never silently swallowed.

### Success Criteria
- 50 simulations complete end-to-end without data loss or silent failure.
- Outcome distribution (plaintiff/defense/mixed %) and damages histogram render correctly.
- Sensitivity analysis correctly identifies the top-impact factor when a single evidence item is forced excluded in a validation test.
- Settlement range recommendation (25th–75th percentile damages) is mathematically correct.
- Token cost estimate is shown and requires explicit user approval before simulation starts.
- TypeScript compiles clean, lint passes, all quality gates pass.

---

## 3. User Stories / Use Cases

### Primary: Litigation Attorney — Settlement Decision
A partner at a litigation firm is defending a $12M breach-of-contract claim. She inputs the case record: 3 claims, 7 evidence items (2 with high admissibility risk), 5 witnesses, and a compensatory damages model of $8M–$14M. She sets simulation count to 75. The system estimates cost ($X) and she approves. Six hours later (Ollama) she reviews: defense wins 42%, mixed 38%, plaintiff wins 20%. The sensitivity analysis shows "Defendant's internal email (Evidence #3, high admissibility risk) is the top factor — excluding it shifts plaintiff win rate from 20% to 8%." She schedules a motion in limine to exclude it.

### Secondary: Litigation Funder — Portfolio Risk
A litigation funder evaluates 5 pending cases. For each, they run a Monte Carlo simulation and note the expected value (P(plaintiff) × E(damages)). They use the expected values to allocate capital across the portfolio. They never consult the simulations as "predictions" — only as risk-adjusted estimates.

### Secondary: Trial Preparation — Strategy Refinement
An associate uses the Sensitivity Analysis tab's scenario builder to test "what if Evidence #4 is excluded AND Witness #2 is not credible?" and reruns the aggregation with those constraints as filters against already-completed simulations, without re-executing the LLM workflow. The refiltered distribution updates in <1 second.

### Edge Cases
- User submits a case record with missing required fields → input validation blocks submission with field-level warnings.
- 3 of 50 simulations fail (model error, context overflow) → aggregation proceeds on 47, result shows "47/50 simulations completed — 3 excluded due to execution errors."
- User is on Ollama and launches 200 simulations → UI warns estimated completion time is 16–32 hours and requires explicit acknowledgment.

---

## 4. Technical Requirements

### 4.1 Architecture

The implementation follows the established Forge LangGraph pattern. Two graphs collaborate:

**Inner Graph: `trial-simulation.graph.ts`**
Executes one complete simulated trial. Has 6 functional nodes plus start/complete/handle_error. Called once per simulation run. Accepts a pre-generated `SimulationParameters` object as input.

**Outer Graph: `trial-simulator.graph.ts`** (the orchestrator)
Manages the full run: parameter space generation → simulation loop (sequential on Ollama, parallel batches on cloud) → aggregation node → sensitivity analysis node → final output.

Both graphs live in:
```
apps/forge/api/src/agents/legal-department/workflows/monte-carlo-trial-simulator/
```

The service, module, and capability adapter follow the identical structure as `deposition-prep/` and `adversarial-brief/`.

**Execution Mode Selection**:
- Provider is read from `executionContext.provider`.
- `provider === 'ollama'` → sequential execution (one simulation at a time, `simulationBatchSize = 1`).
- All other providers → parallel batch execution (`simulationBatchSize = 10`, configurable via agent config).
- This logic lives in the orchestrator graph, not in service or module code.

### 4.2 Data Model Changes

**New Supabase `agent_jobs` record fields** (via existing `result` JSONB column — no schema migration required):

The `result` column stores:
```typescript
interface MonteCarloTrialSimulatorResult {
  simulationsRequested: number;
  simulationsCompleted: number;
  simulationsFailed: number;
  outcomeDistribution: OutcomeDistribution;
  damagesDistribution: DamagesDistribution;
  expectedValue: number;
  settlementRange: { low: number; high: number };
  sensitivityAnalysis: SensitivityFactor[];
  strategyRecommendations: string[];
  simulations: SimulationResult[];  // Full array, up to 200 entries
  disclaimerText: string;
  durationMs: number;
}
```

No new tables. No schema migration. Uses existing `agent_jobs` table and `result` JSONB column.

### 4.3 Type Definitions

All types defined in:
```
apps/forge/api/src/agents/legal-department/workflows/monte-carlo-trial-simulator/
  monte-carlo-trial-simulator.types.ts
```

**Core input types** (as specified in the intention, reproduced here for completeness):
```typescript
interface CaseRecord {
  matterId: string;
  jurisdiction: string;
  courtLevel: 'federal-district' | 'state-trial' | 'appellate';
  judge?: string;
  caseType: string;
  claims: ClaimDefinition[];
  defenses: DefenseDefinition[];
  evidence: EvidenceItem[];
  witnesses: WitnessDefinition[];
  damagesModel: DamagesModelEntry[];
  simulationCount: number;        // 1–200, default 50
  variationParameters: string[];  // Subset of: 'jury', 'judge', 'evidence-admissibility', 'witness-credibility'
}
```

**Simulation parameter types:**
```typescript
interface SimulationParameters {
  simulationId: string;
  simulationIndex: number;
  juryComposition: JuryComposition;      // demographics, education, attitude biases
  judgeCharacteristics: JudgeProfile;    // strictness, sympathy, patience
  evidenceAdmissibility: Record<string, boolean>;   // evidenceId → admitted
  witnessCredibilityModifiers: Record<string, number>; // witnessId → multiplier 0.5–1.5
}

interface JuryComposition {
  averageAge: number;
  educationDistribution: Record<string, number>;
  occupationMix: string[];
  attitudeBiases: {
    plaintiffSympathy: number;   // -1 to 1
    corporateSkepticism: number; // -1 to 1
    expertDeference: number;     // -1 to 1
  };
}

interface JudgeProfile {
  strictnessOnEvidence: number;   // 0–1 (0 = permissive, 1 = strict)
  sympathyBias: number;           // -1 to 1 (negative = defense, positive = plaintiff)
  patienceWithObjections: number; // 0–1
}
```

**Simulation result type:**
```typescript
interface SimulationResult {
  simulationId: string;
  simulationIndex: number;
  parameters: SimulationParameters;
  verdict: 'plaintiff' | 'defense' | 'mixed';
  claimResults: { claimId: string; liable: boolean }[];
  damagesAwarded?: number;
  keyFactors: string[];       // Top 3 factors the LLM identifies as decisive
  pivotalMoments: string[];   // Narrative turning points
  transcript: SimulationTranscript;
  durationMs: number;
  error?: string;             // Set if simulation failed — result excluded from aggregation
}

interface SimulationTranscript {
  parameters: SimulationParameters;
  openingArguments: { plaintiff: string; defense: string };
  evidencePhase: EvidencePhaseEntry[];
  closingArguments: { plaintiff: string; defense: string };
  juryDeliberation: string;
  verdict: string;
}
```

**Aggregation types:**
```typescript
interface OutcomeDistribution {
  plaintiffWins: number;   // Count
  defenseWins: number;
  mixedVerdict: number;
  plaintiffWinRate: number;   // 0–1
  defenseWinRate: number;
  mixedRate: number;
}

interface DamagesDistribution {
  mean: number;
  median: number;
  p25: number;    // 25th percentile
  p75: number;    // 75th percentile
  p10: number;
  p90: number;
  histogram: { bucket: string; count: number }[];  // e.g., "$0-2M", "$2-4M"
  sampleSize: number;  // Only plaintiff-win simulations
}

interface SensitivityFactor {
  factorType: 'evidence' | 'witness' | 'jury-characteristic' | 'judge-characteristic';
  factorId: string;        // evidenceId, witnessId, or parameter name
  factorLabel: string;     // Human-readable
  baselineRate: number;    // Overall plaintiff win rate
  impactedRate: number;    // Plaintiff win rate when this factor is adverse
  deltaRate: number;       // impactedRate - baselineRate (negative = factor helps defense)
  confidenceN: number;     // How many simulations the impacted rate is based on
  impactMagnitude: 'high' | 'medium' | 'low';  // |deltaRate| > 0.15 = high, > 0.07 = medium
}
```

### 4.4 Inner Graph: `trial-simulation.graph.ts`

**State**: `TrialSimulationState` extends base with:
- `executionContext: ExecutionContext`
- `caseRecord: CaseRecord`
- `parameters: SimulationParameters`
- `openingArguments: { plaintiff: string; defense: string } | null`
- `evidencePhaseResults: EvidencePhaseEntry[]`
- `closingArguments: { plaintiff: string; defense: string } | null`
- `deliberationOutput: string | null`
- `simulationResult: SimulationResult | null`
- `status: 'processing' | 'completed' | 'failed'`
- `error: string | null`
- `tokenUsage: { input: number; output: number }`

**Nodes** (in order):

1. **`start`** — emits `emitProgress`, initializes messages.

2. **`opening_arguments`** — single LLM call with two system perspectives (plaintiff and defense). The system prompt instructs the model to respond with a JSON object `{ plaintiff: string, defense: string }` representing opening statements. Influenced by `parameters.judgeCharacteristics.sympathyBias` in the framing instruction.

3. **`evidence_presentation`** — iterates over admitted evidence items (per `parameters.evidenceAdmissibility`). For each admitted item: one LLM call with presenting side, opposing objection, and judge ruling (ruled by `parameters.judgeCharacteristics.strictnessOnEvidence`). Accumulates `evidencePhaseResults[]`. Uses a rolling context window: only the last 3 evidence items plus case summary stay in context (prevents context overflow across 50+ simulations with large case records).

4. **`closing_arguments`** — single LLM call. Plaintiff agent summarizes each claim element against the admitted evidence. Defense agent counters. `parameters.witnessCredibilityModifiers` are referenced in the system prompt to influence how strongly witnesses are characterized.

5. **`jury_deliberation`** — single LLM call. Jury persona is constructed from `parameters.juryComposition`. The jury evaluates each claim element against the standard of proof, weighs the admitted evidence and witness credibility, and produces a deliberation transcript. Returns a structured JSON verdict: `{ verdict, claimResults, damagesAwarded, keyFactors, pivotalMoments }`.

6. **`record_verdict`** — packages the full `SimulationResult` from state. Emits `emitProgress` with the verdict outcome. No LLM call.

7. **`complete`** — emits completion (does NOT call `emitCompleted` — the outer orchestrator manages the job-level completion event).

8. **`handle_error`** — sets `status: 'failed'`, records `error`. Returns partial result (no verdict, no damages) so the orchestrator can count and exclude it.

**Graph edges:**
```
__start__ → start
start → opening_arguments (or handle_error if error)
opening_arguments → evidence_presentation (or handle_error)
evidence_presentation → closing_arguments (or handle_error)
closing_arguments → jury_deliberation (or handle_error)
jury_deliberation → record_verdict (or handle_error)
record_verdict → complete
complete → END
handle_error → END
```

### 4.5 Outer Graph: `trial-simulator.graph.ts`

**State**: `TrialSimulatorState` extends base with:
- `executionContext: ExecutionContext`
- `caseRecord: CaseRecord`
- `parameterSets: SimulationParameters[]`
- `simulationResults: SimulationResult[]`
- `currentSimulationIndex: number`
- `aggregation: MonteCarloTrialSimulatorResult | null`
- `status: 'processing' | 'completed' | 'failed'`
- `error: string | null`
- `tokenUsage: { input: number; output: number }`

**Nodes:**

1. **`start`** — validates CaseRecord fields (required: matterId, jurisdiction, caseType, ≥1 claim, ≥1 evidence item, ≥1 damages model entry). If invalid, populates `error` and routes to `handle_error`. Emits `emitStarted`.

2. **`generate_parameter_space`** — LLM-assisted + deterministic stratified sampling. Generates `caseRecord.simulationCount` parameter sets. Stratified sampling ensures:
   - Jury compositions cover the demographic range (not purely random).
   - Evidence admissibility is varied systematically: for each medium/high-risk evidence item, roughly half the simulations admit it, half exclude it (to enable sensitivity analysis).
   - Judge characteristics span from permissive to strict across the full set.
   - Each parameter is varied independently unless correlated.
   Outputs `parameterSets[]`. No LLM call — pure deterministic computation. Emits progress.

3. **`run_simulations`** — the execution loop node. This is where provider-aware branching happens:
   - Reads `executionContext.provider`. If `'ollama'`, runs simulations sequentially via `for...of` loop. If cloud provider, runs in parallel batches of `simulationBatchSize` (default 10) via `Promise.allSettled`.
   - Each simulation invokes `trialSimulationGraph.invoke(initialState, { configurable: { thread_id: \`${ctx.conversationId}-sim-${idx}\` } })`.
   - After each simulation (or batch), emits progress: `"Simulation X/N complete — Y% plaintiff, Z% defense so far"`.
   - Appends each `SimulationResult` (including failed ones with `error` set) to `simulationResults`.
   - Failed simulations are included in the array with `error` field set; the aggregation node excludes them by filtering on `!result.error`.

4. **`aggregate_results`** — pure computation node (no LLM call):
   - Filters `simulationResults` to successful runs only.
   - Computes `OutcomeDistribution` (counts + rates).
   - Computes `DamagesDistribution` from plaintiff-win simulations (histogram, percentiles, mean, median).
   - Computes `expectedValue = plaintiffWinRate × damagesDistribution.median`.
   - Computes `settlementRange = { low: p25, high: p75 }` (from damages distribution).
   - Computes `SensitivityFactor[]`: for each evidence item and witness, partition simulations into "factor favorable" vs. "factor adverse" groups and compare plaintiff win rates. For jury/judge characteristics, partition by above/below median value.
   - Generates `strategyRecommendations[]` (top 3 action items based on top 3 sensitivity factors).
   Emits progress.

5. **`complete`** — packages `MonteCarloTrialSimulatorResult`, sets `disclaimerText` (fixed string from intention), emits `emitCompleted` with full result.

6. **`handle_error`** — emits failure event, sets `status: 'failed'`.

**Graph edges:**
```
__start__ → start
start → generate_parameter_space (or handle_error)
generate_parameter_space → run_simulations (or handle_error)
run_simulations → aggregate_results
aggregate_results → complete (or handle_error)
complete → END
handle_error → END
```

Note: `run_simulations` → `aggregate_results` is unconditional. Even if all simulations failed, aggregation runs and reports "0/N completed." The `handle_error` branch from `aggregate_results` covers aggregation computation failures only (e.g., division by zero on 0 successes → returns empty distribution with explicit counts).

### 4.6 Service, Module, and Capability Adapter

Following the exact pattern of `deposition-prep/`:

**Service** (`monte-carlo-trial-simulator.service.ts`):
- `OnModuleInit` constructs both graphs (inner and outer) via their factory functions.
- `process(params)` invokes the outer graph, returns `MonteCarloTrialSimulatorResult`.
- Passes the inner graph as a constructor argument to `createTrialSimulatorGraph()`.

**Module** (`monte-carlo-trial-simulator.module.ts`):
- Declares service, imports `SharedServicesModule`.

**Capability Adapter** (`monte-carlo-trial-simulator.capability.ts`):
- Registered in `legal-department-capability-registry.ts` under `job_type: 'monte-carlo-trial-simulator'`.
- Validates `data.content` as `CaseRecord`.
- Calls `service.process(...)`.
- Returns `InvokeOutput` with `outputType: 'json'`.

**Presentation Manifest** (`monte-carlo-trial-simulator.presentation.ts`):
```
Stages: parameter_generation, simulation_running, aggregating, sensitivity_analysis, complete
```
With `simulation_running` stage showing running count (e.g., "32/50 simulations").

### 4.7 Token Cost Estimation

Before launching the simulation, the API exposes a cost estimate endpoint:

**`POST /legal/monte-carlo/estimate`**

Input: `{ simulationCount: number, evidenceCount: number, witnessCount: number, provider: string }`

Output:
```typescript
{
  estimatedLlmCalls: number;       // simulationCount × 4 nodes (opening, evidence×N, closing, deliberation)
  estimatedTokensPerCall: number;  // Rough average based on evidence/witness count
  estimatedTotalTokens: number;
  estimatedCostUsd: number | null; // null for Ollama (local, no cost)
  estimatedDurationHours: number;
  warning?: string;                // e.g., "This run will take approximately 8 hours on Ollama"
}
```

The frontend calls this before showing the launch confirmation dialog. The user must check a checkbox: "I understand this is an experimental analytical tool and not a prediction of trial outcomes."

### 4.8 Frontend Changes

**New files:**
```
apps/forge/web/src/views/agents/legal-department/
  MonteCarloTrialSimulatorPage.vue       ← Job list + launch button
  monte-carlo/
    CaseRecordForm.vue                   ← Input form (all CaseRecord fields)
    SimulationProgressTab.vue            ← Tab 1: live progress
    OutcomeDistributionTab.vue           ← Tab 2: charts and stats
    SensitivityAnalysisTab.vue           ← Tab 3: sortable table + scenario builder
    SimulationBrowserTab.vue             ← Tab 4: individual simulation transcripts
    CostEstimateDialog.vue               ← Pre-launch confirmation + disclaimer
    MonteCarloWorkspace.vue              ← Modal shell with 4 tabs
```

**Routing:**
- Route added to `apps/forge/web/src/router/index.ts` under `/legal-department/monte-carlo`.
- Link added to Legal Department agent navigation.

**Tab 1 — Simulation Progress:**
- Progress bar: `simulationsCompleted / simulationsRequested`.
- Live rolling verdict distribution (updates on each poll as `simulationResults` accumulate in `job.result`).
- Displays "X/N complete — Y failed" when simulations are running.
- If status is `processing`, polls every 5 seconds (matching existing pattern).
- If status is `completed` or `failed`, polls stop.

**Tab 2 — Outcome Distribution:**
- Verdict pie chart (plaintiff / defense / mixed) using inline SVG or a lightweight chart library already in the project.
- Damages histogram (bar chart from `damagesDistribution.histogram`).
- Summary card: expected value, settlement range (p25–p75), simulation count.
- Disclaimer text rendered in a styled warning box (non-dismissible).

**Tab 3 — Sensitivity Analysis:**
- Sortable table of `SensitivityFactor[]` sorted by `|deltaRate|` descending.
- Color-coded impact badges (high/medium/low).
- **Scenario Builder** (client-side): user selects one or more factors to force-exclude/force-adverse. The frontend filters `job.result.simulations` client-side (already loaded) to match the scenario constraints, then recomputes outcome distribution locally (no API call). Shows "Scenario: if Evidence #3 excluded → Plaintiff wins 8% (vs. 20% baseline)."
- Scenario recomputation is synchronous/instant since all simulation data is already in memory.

**Tab 4 — Simulation Browser:**
- Table of all `SimulationResult[]` entries, sortable by verdict, damages, simulation index.
- Failed simulations shown greyed-out with error message.
- Click to expand: shows full `SimulationTranscript` with opening statements, evidence phase entries, closing arguments, deliberation, and verdict.
- Search/filter by verdict type.

**CaseRecordForm:**
- Form with sections matching `CaseRecord` interface.
- Claims section: add/edit/remove claims with elements as comma-separated input.
- Evidence section: add/edit/remove evidence items with strength and admissibility risk selectors.
- Witnesses section: add/edit/remove witnesses.
- Damages model section: add/edit/remove damages entries.
- Simulation count: numeric input (1–200), default 50. Warning shown when >100.
- Required field validation (client-side) before allowing submission.
- "Estimate Cost" button calls the estimate endpoint and shows `CostEstimateDialog`.

**CostEstimateDialog:**
- Shows estimated LLM calls, estimated tokens, estimated cost (or "Free (local model)" for Ollama), estimated duration.
- Shows duration warning if >4 hours.
- Disclaimer text (full text from intention) in a styled block.
- Checkbox: "I understand this is an experimental analytical tool."
- "Launch Simulation" button only enabled when checkbox is checked.

### 4.9 Infrastructure Requirements

No new infrastructure. Uses:
- Existing `PostgresCheckpointerService` for state persistence.
- Existing `LLMHttpClientService` for LLM calls.
- Existing `ObservabilityService` for progress events.
- Existing `agent_jobs` table (no migration).
- Existing Forge API job submission and polling pattern.

---

## 5. Non-Functional Requirements

**Performance:**
- Sequential Ollama execution: ~6–12 minutes per simulation → 50 simulations ≈ 5–10 hours. This is expected and documented to the user upfront.
- Cloud parallel execution: batch of 10 concurrent simulations → 50 simulations ≈ 5 batches → wall time ~30–60 minutes depending on provider latency.
- Aggregation computation (post-simulations) must complete in <5 seconds for up to 200 results.
- Client-side scenario recomputation must complete in <100ms for up to 200 results.

**Correctness:**
- Simulation failure (model error, JSON parse failure, context overflow) sets `result.error`, increments failure count, and is excluded from aggregation. The system never silently discards a failure.
- Statistical calculations (mean, median, percentiles) are verified against known inputs in tests.
- Sensitivity analysis delta rates are directionally correct: forcing exclusion of prosecution-favorable evidence must reduce plaintiff win rate.

**Security:**
- `CaseRecord` content (evidence text, witness testimony) is treated as privileged legal information. It is stored only in the `agent_jobs` table (existing security boundary) and never logged to observability events as raw content.
- The `simulationCount` field is clamped server-side to 200 regardless of what the frontend sends.

**Scalability:**
- Up to 200 simulations per run. The `SimulationResult[]` array can be up to 200 entries, each with a transcript. Maximum expected payload: ~200 × ~5KB = ~1MB JSON. The existing `result` JSONB column can hold this.
- No concurrent multi-user simulation contention handling is required at this time (single-user per conversationId, existing pattern).

**Compatibility:**
- Works with Ollama (gemma4:e4b for most nodes, gemma4:26b for jury deliberation and aggregation per the local-models feedback rule).
- Works with any cloud provider supported by the LLM plane.
- No breaking changes to existing legal-department capability registry or agent_jobs schema.

---

## 6. Out of Scope

Per the intention:
- **Appeal simulation** — different model (panel judges, no jury, different review standard). Future.
- **Class action simulation** — certification analysis, aggregate damages modeling. Future.
- **Real-time settlement negotiation support** — using results during active mediation. Future.
- **Historical validation framework** — building the case dataset to validate simulation accuracy against known outcomes. Separate research effort.
- **Juror profile database** — modeling jurisdiction-specific jury demographics from empirical data. Initial version uses simplified distributions.
- **Interactive mode** — attorney stepping through simulations and redirecting arguments mid-simulation. Future (builds on cross-exam-simulation HITL pattern).
- **Removal of the "Experimental" label** — this label stays until a separate validation effort completes.

---

## 7. Dependencies & Risks

### Dependencies
- **Adversarial Brief (#3)** — adversarial agent pattern (plaintiff vs. defense agents) is the conceptual foundation for opening/closing argument nodes. No direct code import; the pattern is applied fresh with trial-specific prompts.
- **Legal Research (#2)** — grounding for legal theory prompts. No runtime dependency; prompt engineering draws on patterns established there.
- **Deposition Prep (#8)** — service/module/capability structure is the direct template. No runtime dependency.
- **Legal Department async workspace** — the job submission, polling, and workspace modal pattern. Complete. No changes required to the shared job infrastructure.
- **Postgres Checkpointer** — must be running. Covered by existing Docker/Supabase setup.

### Technical Risks

**Risk 1: Context overflow per simulation**
- 50+ evidence items × multi-turn argument/objection/ruling = large context per simulation.
- **Mitigation**: Rolling context window in `evidence_presentation` node — keep only case summary + last 3 evidence items in active context. Full transcript is accumulated in state (not passed back to LLM).

**Risk 2: Sensitivity analysis statistical validity**
- With only 50 simulations, partitioning by factor (e.g., 25 "evidence admitted" vs. 25 "excluded") gives small-N statistics. Delta rates can be noisy.
- **Mitigation**: `SensitivityFactor.confidenceN` is always shown. UI displays "Based on N simulations" alongside each factor. Low-N factors are labeled "insufficient data" if N < 10.

**Risk 3: Sequential Ollama duration**
- 50 simulations × ~10 minutes = ~8 hours. The job may run overnight.
- **Mitigation**: Cost/duration estimate is shown before launch. Intermediate results are persisted to `agent_jobs.result` after each simulation batch so partial progress survives a server restart. (The result field is updated progressively, not only at job completion.)

**Risk 4: LLM JSON parsing failures**
- Jury deliberation and parameter generation nodes return structured JSON. Malformed JSON from the LLM causes the simulation to fail.
- **Mitigation**: Use `stripMarkdownFences` + `JSON.parse` wrapped in a try/catch that marks the simulation as failed with `error: 'JSON parse failure: [first 200 chars of response]'`. No fallback parsing or regex extraction — per CLAUDE.md absolute rule #1.

**Risk 5: Prompt quality for adversarial agents**
- The 6-node trial flow requires the LLM to maintain consistent roles (plaintiff agent, defense agent, judge agent, jury agent) within a single simulation. Poor role maintenance leads to incoherent verdicts.
- **Mitigation**: Each node has a crisp system prompt that (a) names the role explicitly, (b) provides the relevant case record subset only, (c) requires structured JSON output. Node-level prompts are tested individually before end-to-end simulation tests.

---

## 8. Phasing

### Phase 1: Types, State, and Graph Scaffold
**Deliverables:**
- `monte-carlo-trial-simulator.types.ts` — all types defined (CaseRecord, SimulationParameters, SimulationResult, OutcomeDistribution, DamagesDistribution, SensitivityFactor, MonteCarloTrialSimulatorResult).
- `trial-simulation.state.ts` — inner graph state annotation.
- `trial-simulator.state.ts` — outer orchestrator state annotation.
- `trial-simulation.graph.ts` — scaffold with all 6 functional nodes as stubs that return empty state.
- `trial-simulator.graph.ts` — scaffold with 4 nodes as stubs.
- `monte-carlo-trial-simulator.service.ts`, `.module.ts`, `.capability.ts` — wired up and registered in the capability registry.
- Quality gates: TypeScript compiles clean, lint passes, Forge API starts.

**Quality Gate:** `npm run build:forge:api` passes. Capability appears in the registry and returns `{ success: false, error: 'not implemented' }` on invocation.

---

### Phase 2: Inner Simulation Graph (Single Trial End-to-End)
**Deliverables:**
- All 6 inner graph nodes implemented with real LLM prompts:
  - `opening-arguments.node.ts` — plaintiff and defense opening statements
  - `evidence-presentation.node.ts` — admitted evidence loop with objections and rulings
  - `closing-arguments.node.ts` — closing statements referencing admitted evidence
  - `jury-deliberation.node.ts` — verdict with claim-by-claim analysis and damages
  - `record-verdict.node.ts` — packages SimulationResult
- `generate-parameters.util.ts` — deterministic parameter generation for a single set (used by tests).
- Rolling context window in `evidence_presentation` (last 3 items + case summary).
- Simulation failure handling (JSON parse error → marks simulation failed, error captured).
- Node-level observability calls.

**Quality Gate:** Integration test (`trial-simulation.integration.spec.ts`) runs a single simulation with a fixture CaseRecord (3 claims, 4 evidence items, 2 witnesses) and returns a `SimulationResult` with verdict, claimResults, and damagesAwarded. Test verifies JSON structure of result. Runs against real Ollama (no mocking).

---

### Phase 3: Orchestrator Graph and Aggregation
**Deliverables:**
- `generate-parameter-space.node.ts` — stratified sampling for N simulations with systematic evidence admissibility coverage.
- `run-simulations.node.ts` — provider-aware execution (sequential for Ollama, batched parallel for cloud). Progressive result persistence to job record after each batch.
- `aggregate-results.node.ts` — outcome distribution, damages distribution, expected value, settlement range, sensitivity analysis (per-factor delta rates with confidence N).
- `monte-carlo-trial-simulator.service.ts` — outer graph `process()` invocation passing inner graph.
- Cost estimate endpoint: `POST /legal/monte-carlo/estimate`.

**Quality Gate:**
- Integration test runs 5 simulations (small count for speed) with a fixture case. Verifies: `simulationsCompleted = 5`, `outcomeDistribution` sums to 5, `damagesDistribution.sampleSize` equals plaintiff-win count, `settlementRange.low ≤ settlementRange.high`.
- Intentional failure test: inject a case record that causes one simulation to fail (empty evidence list in one parameter set). Verifies `simulationsFailed = 1`, `simulationsCompleted = 4`, and aggregation proceeds correctly.

---

### Phase 4: Frontend — Case Record Form and Job Submission
**Deliverables:**
- `CaseRecordForm.vue` — full form for all CaseRecord fields with client-side validation.
- `CostEstimateDialog.vue` — calls estimate endpoint, shows cost/duration, disclaimer, checkbox.
- `MonteCarloTrialSimulatorPage.vue` — job list view with "Run New Simulation" button.
- Job submission flow: form → estimate → dialog → submit → polling starts.
- Route wired into the Legal Department navigation.

**Quality Gate:** Manual browser test: submit a complete CaseRecord with 2 claims, 3 evidence items, 2 witnesses, simulation count 2. Verify job appears in list with status `queued` → `processing`. Disclaimer text visible in dialog. Cost estimate renders without error.

---

### Phase 5: Frontend — Four-Tab Workspace Dashboard
**Deliverables:**
- `MonteCarloWorkspace.vue` — 4-tab modal shell wired to job polling.
- `SimulationProgressTab.vue` — progress bar, rolling distribution, failure count.
- `OutcomeDistributionTab.vue` — verdict pie, damages histogram, expected value, settlement range, disclaimer box.
- `SensitivityAnalysisTab.vue` — sortable factor table, impact badges, scenario builder (client-side filter + recompute).
- `SimulationBrowserTab.vue` — simulation table (sortable by verdict/damages), expandable transcript view.

**Quality Gate:** Manual browser test with a completed job (from Phase 3 integration test result, loaded as fixture). Verify all 4 tabs render correctly. Scenario builder: force-exclude one evidence item, verify outcome distribution shifts. Simulation browser: expand one simulation, verify full transcript visible.

---

### Phase 6: Hardening and Validation
**Deliverables:**
- End-to-end test with 10 simulations against a realistic fixture case (breach-of-contract, 5 evidence items, 3 witnesses). Runtime on Ollama expected ~90 minutes — run as a CI-excluded manual test.
- Edge case: 0 simulations complete (all fail) → job reports failure with clear message, no crash.
- Edge case: simulation count = 1 → valid, produces a distribution of 1 (meaningful for development/testing).
- Edge case: all simulations return "defense" verdict → damages distribution reports 0 plaintiff-win samples explicitly.
- Disclaimer text verified in all result views (tab 2, tab 3, simulation transcript header).
- `simulationCount` server-side clamping test: sending `simulationCount: 9999` is clamped to 200.
- Presentation manifest stages verified against actual observability event sequence.

**Quality Gate:** All unit and integration tests pass. TypeScript compiles clean. Lint passes. Forge API and web start. All 4 dashboard tabs render with completed job data. Disclaimer visible and non-removable.
