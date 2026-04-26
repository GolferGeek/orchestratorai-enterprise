# Monte Carlo Trial Simulator — Completeness Audit Reference

## Brief Status
**File**: `apps/forge/api/src/agents/legal-department/workflows/monte-carlo/brief.md`
**Quality**: Outstanding — the most detailed brief in the set
**video: field**: ✗ MISSING

## Feature Inventory

| Feature | In Code | In Brief |
|---------|---------|----------|
| Two-graph LangGraph architecture (outer + inner) | ✓ | ~ mentioned |
| 5-node inner trial graph | ✓ | ~ |
| Deterministic parameter space (stratified jury, tiered evidence, alternating witness) | ✓ | ✓ |
| Statistical aggregation (outcome distribution, damages histogram p10/p25/p75/p90) | ✓ | ✓ |
| Sensitivity analysis (delta win-rate per factor) | ✓ | ✓ |
| Client-side scenario builder (filter without re-run) | ✓ | ✓ |
| 4-tab dashboard | ✓ | ✓ |
| 1–200 simulation count | ✓ | ✓ |
| Non-dismissible disclaimer | ✓ | ✓ |
| Full per-simulation transcripts | ✓ | ~ mentioned briefly |
| StageLadder | ✓ | ✗ |
| Sovereign/local mode | ✓ | ✓ |

## Known Gaps

**Gap 1: video: field empty (P2)** — The scenario builder updating in real time is the must-see moment. A short screen recording of adjusting filters and watching distributions shift instantly would be compelling.

**Gap 2: Scenario builder "no re-run" not emphasized enough (P3)** — The brief mentions it but "filters update instantly with no API call" is a surprising technical fact that should be positioned as a differentiator (vs. tools that require re-running simulations to see scenario variations).

**Gap 3: Per-simulation transcript not positioned as a demo moment (P3)** — A lawyer actually reading a simulated trial transcript is compelling. The brief mentions it but doesn't frame it as a feature to show.

## Demo Script

*"Here are your trial odds — backed by 100 simulated trials"* (4 min)

| Step | Action | Say |
|------|--------|-----|
| 1 | Show a pre-run simulation (100 trials) on Overview tab | "100 independent trial simulations, randomized jury and evidence" |
| 2 | Show win probability + damages histogram | "67% win rate, median damages $2.1M — your expected value" |
| 3 | Switch to Sensitivity tab | "Which factors move the needle most?" |
| 4 | Adjust scenario builder — watch distributions update instantly | "Change any scenario assumption — updates instantly, no re-run needed" |
| 5 | Open one simulation transcript | "Here's the actual simulated trial — you can read what happened" |

**Key moment**: Step 4 — scenario builder updating instantly. This is unlike anything else in legal analytics.
