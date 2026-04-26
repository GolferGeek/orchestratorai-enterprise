# Monte Carlo Trial Simulator — Pass/Fail Expectations

## Flow 1: Page Load
**PASS**: Page loads, form input or "New Simulation" button visible, non-dismissible disclaimer present.
**FAIL**: Blank screen → P0. Disclaimer missing → P2 (legal risk).

## Flow 2: Case Record Form Submission
**PASS**: `CaseRecordForm` accessible, all field types work (case identity, dynamic claims/defenses/evidence/damages lists, simulation count), disclaimer acknowledged, "Run Simulation" submits. Job queued → processing.
**FAIL**: Form inaccessible → P1. Dynamic list add/remove broken → P1. Job stays `queued` >30s → P0.

## Flow 3: SSE Stage Progress
**PASS**: StageLadder shows `generate_parameter_space` → `run_simulations` (showing N simulations counting up) → `aggregate_results`. SSE connection confirmed.
**FAIL**: StageLadder static → P1. Simulation count doesn't progress → P1.

## Flow 4: No HITL (Verify Direct Completion)
**PASS**: Job goes directly from `processing` to `completed` — no `awaiting_review` state.
**FAIL**: Job reaches `awaiting_review` unexpectedly → P1 (architecture error).

## Flow 5: Results Dashboard — All 4 Tabs
**PASS**: `MonteCarloWorkspace` opens. Overview tab shows win probability and damages range. Charts tab shows histogram and distribution. Simulations tab shows per-simulation list. Detailed tab shows statistics.
**FAIL**: Any tab blank → P1. Win probability missing → P1. Charts not rendering → P1.

## Flow 6: Client-Side Scenario Builder
**PASS**: In Charts tab, adjusting scenario filters instantly updates the probability distribution without any API call (verify no network request is fired on filter change). Multiple adjustments all work.
**FAIL**: Filter causes API call → P1 (performance issue). Distribution doesn't update on filter → P1. Charts blank after filter → P1.

## Flow 7: Per-Simulation Transcript
**PASS**: In Simulations tab, clicking a simulation opens/expands the full inner trial transcript. Transcript shows trial phases (opening, evidence, witnesses, closing, verdict).
**FAIL**: Transcript blank or shows JSON → P1. Clicking simulation does nothing → P1.

## Regression Checklist
- [ ] Page loads with disclaimer
- [ ] Case record form submits
- [ ] Job completes without HITL
- [ ] All 4 tabs render with data
- [ ] Scenario builder updates charts without API call
