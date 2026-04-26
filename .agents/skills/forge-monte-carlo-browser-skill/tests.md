# Monte Carlo Trial Simulator — Test Cases

## Test MC-1: Page Load and Disclaimer
Navigate to `/app/agents/legal-department/monte-carlo`. Verify: page loads, non-dismissible disclaimer visible, form accessible.

## Test MC-2: Case Record Form
Open or access `CaseRecordForm`. Fill in: case identity (jurisdiction, court level, case type), at least 2 claims, 2 defenses, 3 evidence items (varied strengths), 2 damages categories. Set simulation count = 10 (fast test). Acknowledge disclaimer. Click "Run Simulation". Verify: job queued → processing.

## Test MC-3: SSE Stage Progress
Watch StageLadder. Verify `generate_parameter_space` → `run_simulations` (showing N simulations counted) → `aggregate_results` stages appear. Note if simulation progress counter is visible (1/10, 2/10, etc.).

## Test MC-4: No HITL (Direct Completion)
Verify: job goes directly from `processing` to `completed` — no `awaiting_review`. This is architecturally expected.

## Test MC-5: Results Dashboard — All 4 Tabs
Open completed job / `MonteCarloWorkspace`. Navigate each tab:
- **Overview**: Win probability % visible. Damages range visible. Key risk factors listed.
- **Detailed Results**: Per-simulation outcomes table visible with statistics.
- **Charts**: Probability distribution histogram visible. Damages histogram visible (p10/p25/p75/p90 markers).
- **Simulations**: Per-simulation list visible with readable summary per row.
**GIF**: Record results dashboard + tab navigation. Save as `forge-monte-carlo-results-{date}.gif`.

## Test MC-6: Client-Side Scenario Builder (Key Demo Feature)
In Charts tab, interact with scenario builder controls. **Use network inspector to verify no API call fires when adjusting filters.** Verify probability distribution updates instantly. Try at least 3 different filter combinations.
**GIF**: Record scenario builder in action. Save as `forge-monte-carlo-scenario-{date}.gif`.

## Test MC-7: Per-Simulation Transcript
In Simulations tab, click one simulation. Verify: transcript expands or opens showing the full inner trial record (opening, evidence, witnesses, closing, verdict). Transcript has readable narrative, not raw JSON.

## Regression Checklist
- [ ] MC-1: Disclaimer visible
- [ ] MC-2: Form submits
- [ ] MC-4: Job completes without HITL
- [ ] MC-5: All 4 tabs have content
- [ ] MC-6: Scenario builder fires no API call
