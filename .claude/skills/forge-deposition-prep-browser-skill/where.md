# Deposition Prep — Where Everything Is

## Access Path (Not a Standalone Route)

Deposition Prep is accessed via Matter Dashboard:

1. Navigate to `http://localhost:6201/app/agents/legal-department/matters`
2. Click a matter to open `MatterDashboard`
3. Click the **Documents** tab (`DocumentsTab`)
4. Find a witness entity or document row
5. Click "Prepare for Deposition" or similar action button
6. `PrepDepositionModal` opens

## Submitting a Deposition Prep Job

**Modal**: `PrepDepositionModal`

Form fields:
- **Case Facts** textarea — required; the key facts of the case
- **Witness Background** textarea — required; who is this witness and their involvement
- **Witness Type** select — Corporate Officer / Expert Witness / Fact Witness
- **Deposition Topics** input — comma-separated list of topics
- **Prior Statements** textarea — optional; prior testimony or statements that could be attacked
- **Button**: "Prepare Witness"

## Results: DepositionPrepWorkspace

After job completes, opens `DepositionPrepWorkspace` (likely as a modal or slide-over):

**Tabs**:
1. **Preparation Outline** (via `PreparationOutlineView`) — structured prep document with Q&A coaching
2. **Predicted Cross-Exam** (via `PredictedCrossExamView`) — opposing counsel's likely attack questions with coaching
3. **Simulation** (via `SimulationView`) — launches Cross-Exam Simulation (see `forge-cross-exam-browser-skill`)

## No HITL

Deposition Prep jobs go directly from `processing` to `completed` — no `awaiting_review` state.

## SSE Stages (StageLadder)

Both modes share the same stage display:

| Stage | Label |
|-------|-------|
| `case_analysis` | Analyzing Case |
| `question_generation` / `opposing_perspective` | Building Questions |
| `deposition_research` / `cross_exam_generation` | Researching |
| `deposition_synthesis` / `answer_coaching` | Finalizing |

## API Endpoints
```
POST /agents/legal-department/matters/:matterId/deposition-prep  (or via main invoke)
GET  /agents/legal-department/jobs/:id
GET  /agents/legal-department/jobs/:id/stream
```
