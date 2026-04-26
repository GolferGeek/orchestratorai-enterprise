# Cross-Exam Simulation — Pass/Fail Expectations

## Prerequisite
A completed Deposition Prep job must exist. The `DepositionPrepWorkspace` must be open.

## Flow 1: Simulation Tab Access
**PASS**: Clicking the Simulation tab in `DepositionPrepWorkspace` loads `SimulationView`. A "Start Simulation" button is visible.
**FAIL**: Simulation tab blank → P1. No start button → P1.

## Flow 2: Simulation Starts
**PASS**: Clicking "Start Simulation" begins a new simulation job. The first question appears in `SimulationView`. An answer input field is visible. No answer textarea is missing.
**FAIL**: Button does nothing → P1. No question appears → P0. Answer field missing → P0.

## Flow 3: Interactive Question-Answer Loop
**PASS**: Typing an answer and clicking Submit causes:
- Previous answer and score appear (or answer acknowledged)
- Next question appears within ~5s
- At least 3 question-answer cycles complete without error

**FAIL**: Submit does nothing → P0. No next question appears → P0. Loop breaks (never advances) → P0. Console error on submit → P1.

## Flow 4: Scoring Feedback
**PASS**: After each answer, a score or feedback appears (clarity/consistency/vulnerability or similar). Coaching notes visible.
**FAIL**: No feedback after answer → P2. Feedback blank → P2.

## Flow 5: Simulation Ends with Debrief
**PASS**: After enough questions or when the AI ends the session, a debrief section appears. Debrief shows overall score, strongest/weakest areas, recommendations. Session summary not blank.
**FAIL**: Simulation never ends (infinite loop) → P1. Debrief blank → P1. Debrief shows raw JSON → P1.

## Flow 6: Console Health During Simulation
**PASS**: No unhandled promise rejections during the interactive loop. No TypeError on submit. No 500 on the answer endpoint.
**FAIL**: 500 on answer endpoint → P0. TypeError on submit → P1.

## Regression Checklist
- [ ] First question appears on simulation start
- [ ] Submit answer advances to next question
- [ ] Scoring/feedback appears after each answer
- [ ] Simulation ends with debrief
