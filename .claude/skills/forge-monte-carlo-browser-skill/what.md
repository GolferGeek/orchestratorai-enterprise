# Monte Carlo Trial Simulator — What It Does

## Purpose

The Monte Carlo Trial Simulator runs N simulated trials (1–200) with randomized jury composition, evidence admissibility, and witness credibility to produce a probability distribution of outcomes, a damages histogram, and a sensitivity analysis.

**This is the most technically impressive workflow for a non-lawyer audience.** Probability distributions and sensitivity analysis are concepts people understand instantly. "You have a 67% chance of winning, but if this key evidence is excluded, it drops to 31%" — that's immediately actionable.

## Architecture

Two-graph LangGraph architecture:
- **Outer graph** (`trial-simulator.graph.ts`): generates parameter space → runs N simulations → aggregates
- **Inner graph** (`trial-simulation.graph.ts`): one trial per invocation — opening, evidence, witnesses, closing, verdict

The inner graph runs via `Promise.all` (cloud) or sequential (Ollama) for the N simulation count.

## Parameter Space (Deterministic)

The parameter space is deterministic but randomly sampled:
- **Stratified jury** — composition drawn from demographic distributions
- **Tiered evidence admissibility** — each evidence item has an admissibility probability
- **Alternating witness credibility** — witness credibility varies per simulation

This means two runs with the same input will produce similar but not identical distributions — it's a true Monte Carlo, not deterministic.

## Output Dashboard (4 Tabs)

1. **Overview** — win probability, expected damages range, key risk factors
2. **Detailed Results** — per-simulation outcomes, statistics
3. **Charts** — outcome probability distribution, damages histogram (p10/p25/p75/p90), sensitivity analysis
4. **Simulations** — per-simulation transcripts (readable inner trial records)

## Client-Side Scenario Builder

The scenario builder in the Charts tab lets the reviewer filter simulations by evidence admissibility, witness credibility, jury composition — and the distributions update **instantly without any API call**. This is a client-side filter over the already-computed results. The visual impact of watching probability distributions shift in real time is the key demo moment.

## No HITL

Monte Carlo is a pure computation workflow — no human review gate. The results are purely statistical, no human approval needed.
