---
title: Monte Carlo Trial Simulator
video:
---

## Benefits

- **See the full range of trial outcomes before you commit to a strategy.** Instead of one lawyer's gut feeling about your odds, you get a probability distribution across 50–200 simulated trials — each with a different jury composition, judge profile, and evidence ruling set. You see not just the most likely outcome, but the variance, the tail risks, and the scenarios where you lose badly.

- **Know exactly which evidence and witnesses move the needle.** Sensitivity analysis compares plaintiff win rates across simulations where a piece of evidence was admitted vs. excluded, or where a witness was credible vs. low-credibility. The factor table tells you whether suppressing that key document is worth fighting for — in percentage-point terms.

- **Get a defensible settlement range grounded in simulation data.** The p25–p75 damages range from plaintiff-win simulations gives you a principled number to take into mediation. Not a guess — a range derived from hundreds of simulated verdicts with your actual case facts.

- **Test your case from multiple angles before trial.** The scenario builder lets you ask "what if the judge excludes our expert report AND the key witness isn't credible?" and see the distribution shift in real time — no API call, no re-run required.

- **Runs on your local infrastructure.** All LLM calls use your local Ollama instance. No case facts leave your machine. The simulation results are stored in your local database only.

## Features

- **Two-graph LangGraph architecture**: outer orchestrator runs N simulations; inner graph runs a complete adversarial mini-trial per simulation
- **5-node inner trial graph**: opening arguments, evidence presentation (with rolling context window), closing arguments, jury deliberation (heavy-reasoning model), record verdict
- **Deterministic parameter space**: stratified jury sympathy distribution (−1 to +1), evidence admissibility by risk tier, alternating witness credibility — reproducible, not random
- **Statistical aggregation**: outcome distribution (plaintiff/defense/mixed), damages histogram with p10/p25/p75/p90, expected value, settlement range
- **Sensitivity analysis**: partition simulations by evidence admitted/excluded and witness credibility; compute delta win-rate per factor with confidence N
- **Client-side scenario builder**: filter the simulation set by any combination of excluded evidence and low-credibility witnesses; distribution updates instantly
- **4-tab dashboard**: Progress (live updates), Outcomes (verdict bars + SVG histogram), Sensitivity (sortable factor table + scenario builder), Simulations (full transcript per simulation)
- **Simulation count**: 1–200; sequential on local Ollama, parallel batches of 10 on cloud providers
- **Non-dismissible disclaimer**: appears in Outcomes, Sensitivity, and every transcript view

## When to use it

- You're deciding whether to settle a case and want a data-backed range rather than a gut estimate
- You're preparing for trial and need to prioritize which evidentiary motions are worth fighting
- You want to know which witnesses carry the most risk if their credibility is attacked
- A litigation funder is asking for quantified outcome probabilities before committing capital
- You're stress-testing your trial strategy against adverse judge and jury compositions

## How it works

1. Click **Run New Simulation** and fill out the case record (claims, defenses, evidence items, witnesses, damages model)
2. Set the simulation count (50–200 recommended; higher = more statistical confidence)
3. Click **Estimate Cost** to see the estimated duration and confirm you understand the tool's limitations
4. Check the disclaimer acknowledgment and click **Launch Simulation**
5. Monitor the Progress tab as simulations run — verdict distribution updates in real time
6. When complete, review the Outcomes tab for distribution and financial summary
7. Use the Sensitivity tab to identify high-impact factors and test specific scenarios
8. Open the Simulations tab to read individual trial transcripts
