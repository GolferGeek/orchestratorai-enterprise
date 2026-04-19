# Contract Review — What It Does

## Purpose

Contract Review analyzes legal contracts clause by clause using 8 parallel specialist agents. It produces a redline — a color-coded risk assessment with suggested replacement language for each clause — and gates final output behind a human review (HITL) step.

This is the "AI-powered redline" workflow. A lawyer uploads a contract, the AI finds every risky clause, suggests better language, and asks the lawyer to approve/reject/modify each clause before generating the final report.

## What Makes It Different

- **Clause-level granularity** — not a document summary, but a per-clause breakdown
- **Per-clause HITL** — the reviewer accepts or rejects each clause recommendation independently
- **Partial re-run** — if the reviewer rejects the synthesis, specialists re-run with the feedback, but only for the rejected clauses (not a full restart)
- **Redline viewer** — color-coded risk badges (critical/high/medium/low/acceptable) with a diff view showing original vs suggested text
- **Conflict detection** — if multiple specialists flag the same clause, the conflict is surfaced

## Graph Architecture

The workflow has 7 nodes in sequence, with a re-run loop on reject:

1. **start** — validates input, initializes state
2. **clo_routing** — classifies document, determines which specialists to invoke
3. **orchestrator** — runs 8 domain specialists in parallel via `Promise.all`, collects clause findings
4. **synthesis** — aggregates specialist outputs into a unified redline with conflict detection
5. **hitl_checkpoint** — `interrupt(state)` pauses the graph. Job status becomes `awaiting_review`. Reviewer sees the full redline.
6. **report_generation** — if approved: generates final Markdown report with accepted clauses
7. **complete** — marks job done
8. **handle_error** — catches unhandled errors, marks job failed

### HITL Loop

On **reject**: the graph routes back to `orchestrator`, re-runs specialists with the reviewer's notes as additional context, then hits `hitl_checkpoint` again. A second approval is required.

On **modify**: reviewer's edits are incorporated directly — no re-run. Synthesis applies the manual changes and routes to `report_generation`.

On **approve**: graph proceeds to `report_generation` immediately.

## Specialists (8 Total)

The 8 parallel specialists in the orchestrator node cover:
1. Liability clauses
2. Indemnification and warranties
3. IP and confidentiality
4. Termination and breach
5. Payment and financial terms
6. Dispute resolution and jurisdiction
7. Regulatory compliance
8. Force majeure and general risk

Each specialist outputs: clause reference, original text, risk level, issue description, suggested replacement.

## Risk Levels

Each clause gets a risk badge:
- **Critical** — must fix before signing
- **High** — should fix, significant exposure
- **Medium** — review recommended
- **Low** — minor concern
- **Acceptable** — no action needed

## Output

Two-tab results view:
1. **Redlined Contract** — `RedlineViewer`: per-clause cards with risk badge, original text, suggested replacement, diff, accept/reject/modify controls
2. **Risk Assessment** — synthesis summary, specialist outputs by domain, reasoning accordion

## Key Demo Moments

1. Watching 8 specialists fan out in the StageLadder
2. The RedlineViewer with color-coded risk badges — visually compelling
3. Per-clause HITL: clicking "Reject" on a critical clause and watching the partial re-run
4. The diff view: original vs suggested text side by side
