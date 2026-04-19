# Deposition Prep — Test Cases

## Prerequisite
Create a matter with at least one uploaded document (run `forge-matters-browser-skill` tests MT-1 through MT-4).

## Test DP-1: Access from Matter Dashboard
Navigate to matter dashboard. Go to Documents tab. Verify: "Prepare for Deposition" or similar action button visible (on a witness entity or document). Click it. Verify `PrepDepositionModal` opens.

## Test DP-2: Preparation Outline Mode
Fill in `PrepDepositionModal`: case facts (2–3 sentences), witness background (1–2 sentences), witness type = "Fact Witness", deposition topics = "Contract terms, Payment schedule". Leave prior statements blank. Click "Prepare Witness". Verify: job created and begins processing.

## Test DP-3: SSE Stage Progress
Watch StageLadder (if visible for matters-based jobs). Verify stages fire: case_analysis → question_generation → deposition_research → deposition_synthesis.

## Test DP-4: No HITL
Verify: job goes directly from `processing` to `completed` — no `awaiting_review`.

## Test DP-5: DepositionPrepWorkspace Opens
After completion, verify `DepositionPrepWorkspace` is accessible. Three tabs visible: Preparation Outline, Predicted Cross-Exam, Simulation.

## Test DP-6: Preparation Outline Tab
Click Preparation Outline tab. Verify: structured prep document visible with narrative text. No blank, no raw JSON.

## Test DP-7: Predicted Cross-Exam Tab
Click Predicted Cross-Exam tab. Verify: question list with coaching notes visible. At least 3 predicted questions.

## Test DP-8: Expert Witness Mode
Run another prep job with witness type = "Expert Witness". Verify: output differs from Fact Witness mode (different question types, different coaching focus).

## Regression Checklist
- [ ] DP-1: PrepDepositionModal accessible from Matter Dashboard
- [ ] DP-2: Form submits and creates job
- [ ] DP-5: Workspace opens with 3 tabs
- [ ] DP-6/7: Preparation Outline and Predicted Cross-Exam have content
