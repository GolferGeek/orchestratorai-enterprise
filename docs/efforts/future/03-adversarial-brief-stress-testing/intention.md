# Intention: Adversarial Brief Stress-Testing ("Red Team Your Brief")

## Priority: #3 of 10 Legal Workflows

## What

A litigator uploads a draft motion, brief, or memo. The Legal Department spins up a **mirror legal team** — a red team of adversarial agents playing opposing counsel, a blue team defending the original brief, and a judge agent scoring each exchange. The teams run a structured multi-round debate. After each round, the judge scores which side won each sub-argument on a rubric (legal soundness, factual support, citation quality). The debate continues until the red team can no longer raise high-severity attacks, or a configurable round cap is reached.

Output: a ranked list of the strongest attacks on the brief, the weakest citations, the factual gaps a good opponent would exploit, and suggested fortifications. A second pass optionally revises the brief and re-runs a validation debate to confirm the fortifications hold.

The user clicks "Stress-Test a Brief" in the Legal Department workspace, uploads the brief (and optionally the case record for grounding), and gets a job in the activity feed. The detail panel shows the debate unfolding in real time — round by round, argument by argument, with the judge's scores after each exchange.

## Why

### The competitive moat

No current product does this. Harvey, CoCounsel, and others will critique a brief — they will not **simulate an opponent trying to destroy it**. The difference is fundamental: a critique is a single-pass review that tends toward sycophancy ("overall this is a strong brief, but consider..."). An adversarial debate is a multi-round stress test where the red team is incentivized to find the strongest possible attacks. The quality of feedback is categorically different.

### The economic unlock

A partner currently asks a senior associate to "steelman the other side" — 8-20 hours of work, $4K-$10K in associate time, frequently skipped on smaller matters because the ROI doesn't justify it. The agent version costs $10-30 in cloud, effectively free on sovereign local models, and runs in 45-90 minutes overnight. The result: **every brief gets stress-tested**, not just the ones on the biggest matters. Quality goes up across the entire firm.

### The demo impact

Watching a red team shred a draft brief in real time — seeing the judge score each exchange, watching the blue team scramble to defend weak citations, seeing the fortification suggestions emerge — is the most dramatic single-session demo in the entire workflow portfolio. This is the workflow that sells the platform in one meeting.

### The pattern it introduces

**Cyclic adversarial debate with judge-scored convergence** is a new orchestration pattern that no other workflow in the current system uses. Once built, it directly enables:

- Deposition Prep (#8): the adversarial cross-examination simulator is the same pattern with a different domain
- Monte Carlo Trial (#9): each simulated trial is an adversarial debate with randomized parameters
- Persistent Case Team (#10): when the strategy agent evaluates a new development, it can spin up a quick adversarial debate to pressure-test proposed responses

## The shape of the thing

### The adversarial debate graph

A new LangGraph workflow — `adversarial-brief.graph.ts`. This is a **cyclic graph** with explicit round tracking and convergence detection.

**Blue team (3 agents):**
- **Argument agent** — defends the brief's legal arguments, responds to the red team's counter-arguments
- **Authority agent** — defends the brief's citations, finds additional supporting authority when citations are attacked
- **Facts agent** — defends the factual assertions in the brief, responds to factual challenges

**Red team (3 agents):**
- **Counter-argument agent** — attacks the brief's legal arguments from the opposing side's perspective, uses the recursive research pattern from #2 to find distinguishing cases
- **Distinguishing-cases agent** — attacks the brief's citations by finding cases that distinguish, limit, or overrule the cited authority
- **Factual-challenge agent** — attacks the factual assertions by identifying gaps, inconsistencies, and alternative interpretations of the record

**Judge agent:**
- Reads each round's exchanges
- Scores each sub-argument on a rubric: legal soundness (1-10), factual support (1-10), citation quality (1-10)
- Declares a winner for each exchange
- Produces a round summary with the current state of the debate

**Convergence detector:**
- After each round, evaluates whether the red team raised any new high-severity attacks (severity 7+)
- If no new high-severity attacks in the last round: converge → synthesis
- If round cap reached (configurable, default 5): converge → synthesis
- If the red team is still finding high-severity attacks: continue → next round

**Synthesis agent:**
- Receives the full debate transcript and all judge scores
- Produces the final stress-test report:
  - Ranked list of attacks by severity (the red team's strongest hits)
  - Weakest citations (authority the red team successfully distinguished)
  - Factual gaps (assertions the red team challenged that the blue team couldn't fully defend)
  - Suggested fortifications (specific changes to the brief that would address each high-severity attack)

**Optional second pass — fortification validation:**
- If the user accepts fortification suggestions (via HITL gate), the synthesis agent applies them to the brief
- A shortened 2-round validation debate runs against the fortified brief
- The report shows which attacks are now resolved and which remain

### Real-time debate UI

The frontend shows the debate in a **split-panel debate view**:

- Left: blue team arguments (defense)
- Right: red team arguments (attack)
- Center: judge scores and round summaries
- Bottom: running severity chart showing how many high/medium/low attacks are active

Each round streams in real time via SSE events. The litigator watches the red team attack and the blue team defend, round by round. This is the demo.

A new `DebateViewer.vue` component handles the split-panel rendering. It's built generically — Deposition Prep (#8) reuses it for the cross-examination simulation.

### Citation grounding for the red team

The red team's distinguishing-cases agent MUST use the same citation grounding system built in Legal Research (#2). It cannot hallucinate counter-authority — a red team that attacks with fake cases is useless at best and dangerous at worst (the litigator might fortify against a non-existent threat and weaken the brief in the process).

The recursive research pattern from #2 powers the red team's case research. When the red team claims "Smith v. Jones distinguishes your cited authority," that citation must be verified against the grounded source. Unverified citations are flagged in the debate transcript.

### Role isolation: preventing sycophancy collapse

The critical prompt engineering challenge: each agent must maintain its assigned perspective across multiple rounds without collapsing into agreement. Known failure modes:

- **Red team softening**: after 2-3 rounds, the red team starts hedging ("while the brief has some weaknesses, it's generally well-argued..."). Mitigate with strong system prompts that reward finding attacks and penalize concessions.
- **Blue team capitulating**: the blue team agrees with the red team's attacks instead of defending. Mitigate with role isolation — each agent has no memory of the other team's system prompt.
- **Judge bias toward the last speaker**: the judge scores the most recent argument higher regardless of quality. Mitigate with a structured rubric that the judge must fill out per exchange, and with double-blind scoring (judge sees arguments without team labels in alternating rounds).

These are prompt design challenges, not architectural ones. They're solvable with careful system prompt engineering and the structured scoring rubric.

## Constraints

- **No hallucinated counter-authority.** The red team's citations must be grounded. This is a safety-critical requirement, not a nice-to-have.
- **No fallbacks on convergence.** If the debate hits the round cap without converging, the report says so and includes all remaining high-severity attacks. We do not pretend convergence happened.
- **ExecutionContext is the capsule.** One job, one conversationId. All 6 team agents, the judge, and the synthesis agent share the same context.
- **Role isolation is enforced architecturally.** Each agent's system prompt is set at graph construction time. No agent reads another agent's system prompt. The judge receives arguments without team labels in alternating rounds (double-blind scoring).
- **The debate graph is separate from the document analysis and research graphs.** Three distinct LangGraph workflows in the Legal Department, sharing the workspace and job queue.
- **Round cap is configurable but has a hard maximum.** Default 5, max 10. This prevents runaway debates that consume unlimited tokens.

## Out of scope

- **Automatic brief revision.** The fortification validation pass is optional and runs only if the user explicitly accepts suggestions. The system does not autonomously rewrite the brief.
- **Multi-brief comparison.** Stress-testing two versions of the same brief side by side. Future enhancement.
- **Jury simulation.** The judge agent is a legal scoring agent, not a jury prediction model. Monte Carlo Trial (#9) handles jury simulation.
- **Real-time collaborative review.** Multiple lawyers watching and annotating the debate simultaneously. Future enhancement.

## Dependencies

- Legal Department async workspace (completed)
- Legal Department HITL (completed)
- Legal Research Deep Dive (#2) — the recursive research pattern and citation grounding system. This is a hard dependency: the red team's quality depends on grounded research.
- Contract Review (#1) — soft dependency. Not technically required, but the specialist prompt update pattern from #1 informs how we prompt the adversarial agents.

## Estimated scope

Medium. 3-4 weeks. The new graph is the bulk: 6 team agents, judge, convergence detector, synthesis. The debate viewer UI is significant. Citation grounding reuses #2's infrastructure. The prompt engineering for role isolation is the hardest part — it requires iterative testing against multiple models to prevent sycophancy collapse.

## Why this goes third

- First high-impact demo moment in the sequence — the payoff for building the research foundation in #2.
- Validates the adversarial cyclic pattern that #8 and #9 depend on.
- Builds directly on #2's recursive research and citation grounding.
- Strong market differentiation — no competitor does this.
- Natural first paid workflow for litigators — the highest-value segment where sovereignty matters most (briefs contain sealed facts and privileged work product).
