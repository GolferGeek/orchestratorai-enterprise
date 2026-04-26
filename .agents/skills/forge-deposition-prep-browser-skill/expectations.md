# Deposition Prep — Pass/Fail Expectations

## Prerequisite
A matter must exist. Navigate via `/app/agents/legal-department/matters` → open matter → Documents tab.

## Flow 1: Access from Matter Dashboard
**PASS**: "Prepare for Deposition" or similar button visible in Documents tab. Clicking it opens `PrepDepositionModal`.
**FAIL**: No access path to Deposition Prep from Documents tab → P1. Modal doesn't open → P1.

## Flow 2: Form Submission
**PASS**: `PrepDepositionModal` shows all fields (case facts, witness background, witness type, topics, prior statements). "Prepare Witness" submits. Job appears in matter's job list as `queued` → `processing`.
**FAIL**: Required fields missing → P1. Submit disabled with valid input → P1. Job not created → P1.

## Flow 3: SSE Stage Progress
**PASS**: StageLadder shows case_analysis → question generation → research → synthesis stages.
**FAIL**: StageLadder static → P1. Job stuck `processing` >5min → P0.

## Flow 4: No HITL (Verify Direct Completion)
**PASS**: Job goes directly from `processing` to `completed` — no `awaiting_review`.
**FAIL**: Job reaches `awaiting_review` unexpectedly → P1.

## Flow 5: DepositionPrepWorkspace Opens
**PASS**: After job completes, `DepositionPrepWorkspace` opens (or is accessible). Three tabs visible: Preparation Outline, Predicted Cross-Exam, Simulation.
**FAIL**: Workspace doesn't open → P1. Only 1–2 tabs visible → P1. All tabs blank → P1.

## Flow 6: Tab Content
**PASS**: Preparation Outline tab shows structured prep document (not blank). Predicted Cross-Exam tab shows question list with coaching notes. Simulation tab shows a "Start Simulation" control.
**FAIL**: Any tab blank → P1. Raw JSON in any tab → P1.

## Regression Checklist
- [ ] Access path from Matter Dashboard works
- [ ] Form submits and creates job
- [ ] Job completes without HITL
- [ ] Workspace opens with all 3 tabs populated
