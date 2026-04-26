# Deposition Prep — What It Does

## Purpose

Deposition Prep helps lawyers prepare a witness for deposition. It generates a preparation outline, predicts opposing counsel's cross-examination, and optionally runs a live simulation (Cross-Exam Simulation) where a lawyer can practice answering questions.

## Two Modes

**Mode 1: Preparation Outline**
- Analyzes case facts and witness background
- Generates ordered deposition questions the witness should expect
- Researches supporting case law and facts
- Synthesizes a structured prep outline: what to say, what to avoid, key facts to remember

**Mode 2: Predicted Cross-Exam**
- Analyzes from opposing counsel's perspective
- Generates the hardest questions opposing counsel is likely to ask
- Provides coaching on how to answer each question
- Focuses on weak points in the witness's likely testimony

## Input

Form fields (no file upload at this stage — the matter already has documents):
- **Case Facts** — the key facts of the case as they relate to this witness
- **Witness Background** — who is this person, their role, their involvement
- **Witness Type** — Corporate Officer / Expert Witness / Fact Witness (affects prep strategy)
- **Deposition Topics** — the areas opposing counsel will likely cover
- **Prior Statements** — any prior testimony or statements (inconsistencies are attack vectors)

## Access Path

Deposition Prep is not a standalone route — it's accessed from the Matter Dashboard:
1. Navigate to `/app/agents/legal-department/matters`
2. Open a matter
3. Documents tab → find a witness entity → "Prepare for Deposition" button
4. `PrepDepositionModal` opens, fills in context from the matter

## Output: DepositionPrepWorkspace (3 Tabs)

1. **Preparation Outline** — structured prep document
2. **Predicted Cross-Exam** — opposing counsel's question list with coaching
3. **Simulation** — launches `Cross-Exam Simulation` (separate interactive workflow)

## No HITL

Deposition Prep outputs are informational — no review gate. The lawyer reads the prep materials and uses their judgment. The simulation tab is interactive (its own interrupt-based loop) but doesn't require a formal HITL approval.
