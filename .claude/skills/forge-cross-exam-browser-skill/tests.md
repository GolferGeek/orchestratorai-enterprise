# Cross-Exam Simulation — Test Cases

## Prerequisite
A completed Deposition Prep job must exist (run `forge-deposition-prep-browser-skill` tests through DP-5).

## Test CE-1: Simulation Tab Access
In `DepositionPrepWorkspace`, click Simulation tab. Verify `SimulationView` loads. "Start Simulation" button visible.

## Test CE-2: Simulation Start
Click "Start Simulation". Verify: first question appears within ~5s. Answer textarea visible. Submit button visible.

## Test CE-3: Answer Submission — First Cycle
Type a direct, clear answer to the first question. Click Submit. Verify: answer is acknowledged (disappears from input, or input clears). Next question appears within ~5s. No console error.

## Test CE-4: 3-Question Loop
Complete 3 question-answer cycles without error. Verify each cycle produces a new question. Timer resets (if timer present) between questions.

## Test CE-5: Scoring Feedback Appears
After each answer, verify some form of scoring or feedback appears: score badge, coaching note, or evaluation text. It should not be blank.

## Test CE-6: Weak Answer Response
Submit a very vague answer ("I don't know"). Verify: the AI responds with a follow-up or rephrasing — it should press on weak answers, not immediately move on.

## Test CE-7: Simulation Ends and Debrief
Continue answering until the simulation ends (or force-end if there's an exit button). Verify: `debrief_generator` output appears — overall score, strongest/weakest areas, recommendations. Not blank, not raw JSON.
**GIF**: Record full simulation loop + debrief. Save as `forge-cross-exam-simulation-{date}.gif`.

## Test CE-8: Console Health During Simulation
After every Submit click: verify no TypeError, no unhandled rejections, no 500 on the answer endpoint.

## Regression Checklist
- [ ] CE-1: Simulation tab loads with start button
- [ ] CE-2: First question appears on start
- [ ] CE-3: Submit advances to next question
- [ ] CE-7: Simulation ends with debrief
