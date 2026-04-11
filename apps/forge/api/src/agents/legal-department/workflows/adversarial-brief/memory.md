---
title: Adversarial Brief Stress-Testing — Institutional Knowledge
---

## Domain Insights

- **Chain of custody is the #1 attack vector.** In our first real test (USA v. Pacific Industrial Coatings, CWA motion), the Red Team's highest-severity attack (10/10) targeted chain of custody documentation for EPA water samples. This is a classic defense move — attack the admissibility of the evidence rather than the legal theory. The brief-analysis node should flag when a brief relies heavily on lab results without mentioning chain of custody.

- **Convergence with severity threshold 6 is aggressive.** The CWA test converged in 2 rounds (out of 3 max) because the threshold was 6 and by Round 2 no attack exceeded it. A threshold of 7 (the default) would likely have converged in 1 round. For thorough stress-testing, consider lowering the threshold to 5 or below.

## Technical Learnings

- **Ollama models always wrap JSON in markdown fences.** Every node that parses LLM JSON output must use `stripMarkdownFences()` from specialist-utils. This bit us on the first live test — the brief-analysis node received valid JSON inside triple-backtick fences and failed to parse it.

- **gemma4:e4b is viable but slow for 3-round debates.** Sequential execution on a single GPU means 7 LLM calls per round. A 2-round debate takes ~10 minutes. 3 rounds would be ~15 minutes. gemma4:31b produces better judge scores (sharper differentiation) but is even slower. Cloud providers run all 3 agents per team in parallel, cutting per-round time to ~30 seconds.

- **The job worker's progress column doesn't update during graph execution.** The worker sets `current_step: 'starting stress test'` before invoking the graph and doesn't update again until the graph completes. Real-time progress comes from observability events via SSE, not from the job row. This is fine for the UI (it uses SSE) but makes database monitoring less useful.

- **reviewPayload extraction matters for HITL.** During `awaiting_review`, the job's `result` column is null. The stress-test report lives in the LangGraph checkpoint state and must be extracted by the controller's GET endpoint into `reviewPayload`. This is the same pattern legal-research uses for the research tree.

## Architecture Decisions

- **Blue/Red teams are 3 focused agents, not 8 mirrored specialists.** The intention suggested mirroring all 8 legal specialists. We chose 3 per team (argument/authority/facts) because adversarial debate operates at the argument/citation/fact level, not the domain level. The 8 specialists are analysis-focused (contract, compliance, IP...) — the adversarial agents are argument-focused.

- **Judge uses position randomization, not separate scoring passes.** Instead of scoring Blue and Red independently in separate calls, we randomize the presentation order and use neutral labels (Position A/B) in a single call. This halves the LLM cost while still mitigating position bias.
