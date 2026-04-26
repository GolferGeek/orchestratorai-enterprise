# Monte Carlo Trial Simulator — Where Everything Is

## Navigation
- Direct URL: `http://localhost:6201/app/agents/legal-department/monte-carlo`
- Sidebar: Legal Department → Monte Carlo Trial Simulator

## Submitting a Job

**Form**: `CaseRecordForm` (may be inline or in a modal)

Form fields (no file upload — all structured input):
- **Case Identity section**:
  - Matter ID input
  - Jurisdiction input
  - Court Level select (district/circuit/state supreme)
  - Case Type select (civil/criminal/administrative)
- **Claims** — dynamic list: each claim has description, elements, standard of proof
- **Defenses** — dynamic list: each defense has description, type
- **Evidence** — dynamic list: each item has description, strength (1–10), relevance score
- **Damages Model** — dynamic list: category, amount, probability
- **Simulation Count** number input — 1–200 (default: 20)
- **Non-dismissible disclaimer** — must acknowledge before submitting
- **Button**: "Run Simulation"

## Results Workspace

**Component**: `MonteCarloWorkspace`

After job completes, opens a workspace with tabs:
- **Overview** — win probability (%), expected damages range, confidence interval, key risk factors
- **Detailed Results** — per-simulation outcomes table, mean/median/std deviation
- **Charts** — probability distribution histogram, damages histogram (p10/p25/p75/p90), sensitivity analysis chart
- **Simulations** — per-simulation transcript viewer (click any simulation to read its full inner trial record)

## Client-Side Scenario Builder

Located in the Charts tab. Controls:
- Filter sliders or dropdowns for: evidence admissibility scenarios, witness credibility, jury composition profile
- The charts update instantly (no API call) when filters change — this is the key demo moment

## No HITL, No Review Modal

Monte Carlo has no `awaiting_review` status. The job goes directly from `processing` to `completed`.

## SSE Stages (StageLadder)

| Stage | Label |
|-------|-------|
| `generate_parameter_space` | Building Parameter Space |
| `run_simulations` | Running Simulations (N iterations) |
| `aggregate_results` | Aggregating Results |

## API Endpoints
```
POST /agents/legal-department/invoke  (JSON body — no file)
GET  /agents/legal-department/jobs?orgSlug=big-ideas
GET  /agents/legal-department/jobs/:id/stream
```
