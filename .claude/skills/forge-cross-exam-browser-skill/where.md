# Cross-Exam Simulation — Where Everything Is

## Access Path

Cross-Exam Simulation is accessed via Deposition Prep Workspace:

1. Complete a Deposition Prep job (see `forge-deposition-prep-browser-skill`)
2. In `DepositionPrepWorkspace`, click the **Simulation** tab
3. `SimulationView` component loads
4. Click "Start Simulation" or similar button to begin

## The Simulation Interface (SimulationView)

The simulation UI is fully contained in `SimulationView`:

**Active simulation layout**:
- **Question display** — the AI's question shown prominently
- **Answer textarea** — where the witness types their answer
- **Submit button** — submits the answer (triggers graph to resume from interrupt)
- **Progress indicator** — question number / topic
- **Timer** (if implemented) — time per answer

**Between questions**:
- Score for previous answer (clarity, consistency, vulnerability)
- Coaching note ("avoid saying X", "emphasize Y")
- Next question appears

**End of simulation**:
- Debrief section (overall score, strongest/weakest areas, practice recommendations)

## The Interactive Loop

This is **not** an approve/reject HITL — it's an interrupt-per-question loop:

1. Graph pauses at `question_generator` node
2. Question appears in the UI
3. Lawyer types answer in the textarea
4. Clicks Submit
5. Answer goes to `/answer` endpoint (not `/review`)
6. `answer_scorer` runs, `next_move_decider` decides: loop or debrief
7. Repeat

## API Endpoints
```
GET  /agents/legal-department/jobs/:simulationJobId  (active simulation state)
POST /agents/legal-department/jobs/:simulationJobId/answer  (submit witness answer)
GET  /agents/legal-department/jobs/:simulationJobId/stream  (SSE for question updates)
```

## No Standard HITL Modal

Cross-Exam Simulation does NOT use `LegalJobReviewModal`. The interrupt is handled inline in `SimulationView` itself.
