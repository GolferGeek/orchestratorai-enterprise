# Future Effort: Adversarial Brief Stress-Testing ("Red Team Your Brief")

## Concept

A litigator uploads a draft motion, brief, or memo. The platform spins up a **mirror legal team** — an opposing counsel persona, a skeptical judge persona, and 3-5 domain specialists aligned with the *other side's* interests — and runs a structured multi-round debate against the original argument. Output: a ranked list of the strongest attacks on the brief, the weakest citations, the factual gaps a good opponent would exploit, and suggested fortifications. A second pass revises the brief and re-runs the debate until the adversary team can no longer find high-severity attacks.

## Why it was impossible before

- Requires **persistent adversarial personas** with access to the same case law and a **judge-persona scoring agent** that can calibrate which side is winning each sub-argument.
- Single-shot LLMs collapse into sycophancy when asked to both argue and critique. Only a true multi-agent loop with role isolation produces calibrated critique.
- Requires **cyclic graph execution with convergence detection** — a LangGraph native capability that didn't exist as a production pattern until recently.
- No current product is doing this. Harvey will critique a brief; it will not *simulate an opponent trying to destroy it*.

## Orchestration pattern

Cyclic adversarial debate graph:

1. **Blue team (3 agents)**: argument agent, authority agent, facts agent — each reading the existing brief and defending it.
2. **Red team (3 agents)**: counter-argument agent, distinguishing-cases agent, factual-challenge agent — each attacking the brief from the opposing side's perspective.
3. **Judge agent**: reads each round's exchange, scores each sub-argument on a rubric (legal soundness, factual support, citation quality), and decides who won each exchange.
4. **Convergence detector**: continues the loop until the red team can no longer raise high-severity attacks, or N rounds is reached.
5. **Synthesis agent**: produces the final stress-test report — ranked list of attacks, recommended fortifications, weak citations to replace, facts to shore up.
6. **HITL gate**: litigator reviews the report and decides which fortifications to accept.

## Economic unlock

- A partner currently asks a senior associate to "steelman the other side" — 8-20 hours of work, $4K-$10K, frequently skipped on smaller matters.
- Agent version: $10-30 in cloud, effectively free on sovereign local models, ~45-90 minutes overnight on a single Mac Studio.
- **Every brief gets stress-tested** instead of only the biggest ones.
- The quality delta is real: human steelmanning is limited by what the associate can remember; the agent team can systematically cover every citation and every factual assertion.

## Dependencies

- Legal Department running on local Ollama models (current effort) — the specialist agents become the blue team, mirrored to form the red team.
- A reasoning-tuned model for the judge agent. gemma4:31b and qwq are the realistic sovereign candidates; benchmark both.
- **Citation grounding.** This is the make-or-break safety requirement. Hallucinated counter-authority is catastrophic — you'd be fortifying against fake cases. Must be hard-plumbed to verified case law sources only; no model-generated citations ever.
- Convergence-detection logic in the LangGraph cyclic graph.
- A debate-transcript UI in Forge Web so the litigator can watch the red team attack and the blue team defend in real time (this is the demo).

## Risks

- **Hallucinated authority.** Already mentioned, cannot be overemphasized. Solved only by hard-grounded citation retrieval.
- **Judge agent bias toward the side that argued last.** Known multi-agent debate failure mode. Mitigate with double-blind scoring and position-swapping across rounds.
- **Runaway rounds.** Red team can always find *something* to attack if pushed. Needs a severity threshold and a hard round cap.
- **Quality of specialists as "opposing counsel."** A contract specialist needs to be able to argue the *other side's* reading of the same clause. This is a prompt design challenge, not an architectural one, but it's non-trivial.

## Estimated scope

Medium. The 8-specialist structure already exists; the red team is largely a re-use with mirrored prompts. The judge agent, convergence detector, and citation grounding are the net-new work. 4-8 weeks after the current local-model effort lands.

## Why this is in the flagship trio

- **Fastest to build** on the existing Legal Department foundation — highest wow-per-engineering-hour of anything on the list.
- **Most dramatic single-session demo.** Watching a red team shred a draft brief in real time is the kind of thing that sells the platform in one meeting.
- **Natural first paid workflow** for litigators, a segment where Harvey is strongest and where sovereignty matters because briefs contain sealed facts and privileged work product.
- **Validates the adversarial orchestration pattern** that later unlocks Monte Carlo Trial (Concept #9) and the Draft+Predict dual-track workflow (Concept #10).
