# Future Effort: The Persistent Case Team ("Agent Associates Assigned for Life")

## Concept

When a matter is opened, a **persistent team of 6-10 agents is assigned to it** and stays assigned for the entire lifecycle of the case — months to years. Every new document, email, filing, deposition transcript, or news event gets ingested by the team. Agents hold daily "standups" where they update each other. At any moment, a partner can ask the team anything about the case and get an answer grounded in everything that ever happened on it. When a trigger fires (opposing motion filed, deposition transcript received, new witness identified), the team autonomously drafts response options and pages the human.

This is the **flagship story** of the platform. The other two workflows (Sentinel, Adversarial) sell the platform; this one reframes what "legal AI" even is.

## The team composition

- **Lead counsel agent** — owns overall strategy, answers the partner's questions, makes escalation decisions.
- **Facts agent** — owns the growing factual record. Every document, email, interview, and filing is absorbed into this agent's state. It is the single source of truth for "what do we know."
- **Research agent** — monitors case law and regulatory developments relevant to the matter's theories. Fires off recursive research when the legal landscape shifts.
- **Documents agent** — indexes and cross-references every document produced in discovery. Can answer "find every email where X mentions Y" in seconds.
- **Opposing party agent** — models the other side. Predicts what they'll do next based on their filings, known counsel strategy, and the state of the record.
- **Schedule/deadlines agent** — tracks every filing deadline, discovery cutoff, hearing date. Wakes up before things are due.
- **Client-comms agent** — maintains the running narrative for client updates, drafts status emails, tracks what the client has been told.
- **Strategy agent** — runs scenario analysis. When a new development hits, it drafts 2-4 strategic options and pushes them to the lead counsel agent.

## Why it was impossible before

- Required **long-context models** (100K+ tokens) that understand months of accumulated case history.
- Required **durable agent state** that persists across weeks and wakes on events — LangGraph checkpointing + Pulse event triggers make this tractable now, not before.
- Required **an event-driven architecture** that can fire agents based on incoming filings, emails, and news — Pulse's watcher pattern is purpose-built for this.
- Required **cost-effective continuous reasoning**. A human associate doing equivalent work across 200 matters simultaneously is impossible; a sovereign agent team per matter is a one-time hardware cost.

## Orchestration pattern

Long-running hierarchical multi-agent system with durable state and event-driven wake-ups:

- **Standing state**: each agent has a checkpointed state that survives indefinitely. The facts agent's state is the growing case knowledge graph. The documents agent's state is the evolving index.
- **Daily synthesis cycle**: every 24 hours (or on-demand), the lead counsel agent runs a cross-team synthesis — "what changed, what matters, what does the human need to know."
- **Event triggers**: Pulse watches incoming email, docket updates, client portal uploads. Any new artifact fires the appropriate agent, which decides whether to escalate.
- **Query mode**: the partner can ask the team anything at any time. The lead counsel agent routes the query to the right sub-agent(s) and produces a grounded answer with citations back to source documents.
- **Autonomous escalation**: when the strategy agent sees a development that requires human judgment, it drafts options and pages the partner.

## Economic unlock

- Current case teams are 1 partner + 2-4 associates, $2M-$10M over a complex matter's lifecycle. Associate hours are the bulk of the cost.
- Agent team augmentation cuts 40-60% of associate hours.
- **But the bigger unlock is continuity and coverage**: no more "let me get up to speed" when an associate rotates off. No more "sorry, I need to re-read the file" when the partner asks a question about matter #37 of 40 active matters. The team *actually knows* everything about every matter.
- For solo and small-firm practitioners, this is transformative: they can finally handle complex matters at the quality level of BigLaw because the persistent team covers the grunt work a solo lacks the bandwidth for.

## Dependencies

- Legal Department running on local Ollama models (current effort).
- Portfolio Sentinel infrastructure (persistent watchers, event dispatch, sovereign observability) — this workflow uses the same foundation, so it's the natural second build after Sentinel.
- **Durable per-matter state** — a LangGraph checkpointer backed by the sovereign database plane, scoped per matter with hard privilege boundaries.
- **A matter-scoped privilege model** — state from matter A must never leak into matter B. Enforced at the database plane with row-level security and at the orchestration plane with per-matter ExecutionContext scoping.
- **Long-context handling** — months of case history exceeds any model's context window. Requires a summarization/compression layer that the facts agent maintains, plus targeted retrieval for specific queries.
- **A matter management UI in Forge Web** — the partner needs to see the team's state, query it, and review escalations.

## Risks

- **State drift over months.** The team's model of the case gets subtly wrong in some corner, and the error compounds. Mitigate with periodic human-audited ground-truth resets and with citation-grounded answers that always trace back to source documents.
- **Privilege and confidentiality boundaries.** One team, one matter — enforced at every layer. A bug here is a disbarment-level event, not an engineering bug.
- **Long-context compression is lossy.** The facts agent's summarization must be extremely careful to never drop critical details. Requires structured intermediate representations, not just rolling summaries.
- **Hardware scaling.** One Mac Studio handles 20-50 active matters. A BigLaw firm with 500 active matters needs a cluster. That's fine for the product tier plan but needs to be clear up front.
- **The "hallucinated case memory" problem.** If the partner asks "did we already depose Smith?" and the facts agent says "yes" when the answer is no, the partner loses trust permanently. Answers must be grounded and cited, or explicitly marked "I don't know."

## Estimated scope

Large — 4-8 months of focused work after Portfolio Sentinel lands. This is the workflow that justifies the long-term platform investment, not a quick win.

## Why this is in the flagship trio

- **It's the story.** "Your cases now have AI associates that never forget, never rotate off, and work through the night" is the pitch that reframes the category.
- **It justifies every platform investment** — durable state, observability, sovereignty, event-driven orchestration — in a single compelling product.
- **It creates lock-in.** Once a firm has 100 matters being managed by persistent teams, switching costs are enormous. Subscription revenue with structural retention.
- **It unlocks the rest of the concept list.** Per-case Monte Carlo trial simulation, per-case adversarial brief stress-testing, per-case continuous research — all of these plug into an existing persistent case team trivially.
