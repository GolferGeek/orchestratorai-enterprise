# Intention: The Persistent Case Team ("Agent Associates Assigned for Life")

## Priority: #10 of 10 Legal Workflows (Capstone)

## What

When a matter is opened, a **persistent team of 6-8 agents is assigned to it** and stays assigned for the entire lifecycle of the case — months to years. Every new document, email, filing, deposition transcript, or news event gets ingested by the team. Agents hold periodic synthesis cycles where they update each other on what's changed. At any moment, a partner can ask the team anything about the case and get an answer grounded in everything that has ever happened on it. When a trigger fires (opposing motion filed, deposition transcript received, new witness identified, court deadline approaching), the team autonomously drafts response options and pages the human.

This is the **capstone workflow** — the one that reframes what "legal AI" even is. The other nine workflows sell the platform; this one builds the moat. Once a firm has 50-100 matters being managed by persistent teams, switching costs are enormous. The team knows the case, the case knows the team, and the accumulated knowledge is irreplaceable.

## Why

### The fundamental problem in legal practice

Every lawyer has too many matters and not enough bandwidth. A litigation partner at a mid-size firm juggles 15-40 active matters. For each one, the state of knowledge lives in:
- The partner's memory (incomplete, lossy, biased toward recent events)
- Physical and digital files (comprehensive but unsearchable in practice)
- Associate work product (scattered across memos, emails, and draft pleadings)
- The docket (authoritative for deadlines but disconnected from strategy)

When the partner needs to make a decision on Matter #23, they spend 30-60 minutes re-reading the file to "get up to speed." When an associate rotates off a case, 80% of their contextual knowledge is lost. When a new development hits, the response time is gated by how quickly someone can review the entire file.

### What the Persistent Case Team changes

The team **never forgets, never rotates off, and never needs to "get up to speed."** Every document, every filing, every email, every court order is ingested and synthesized into a living knowledge base. The partner can ask "what's the status of the Smith deposition?" and get a grounded answer in seconds, not after a 30-minute file review. When a new filing arrives, the team has drafted strategic response options before the partner opens their email.

For solo and small-firm practitioners, this is transformative. They can handle complex matters at BigLaw quality because the persistent team covers the institutional knowledge and grunt work that a solo lacks the bandwidth for. A solo practitioner with 30 persistent case teams has more case knowledge capacity than a 50-attorney firm.

### Why it was impossible before

- Required **long-context models** (100K+ tokens) that understand months of accumulated case history
- Required **durable agent state** that persists across weeks and wakes on events — LangGraph checkpointing + Pulse event triggers make this tractable now
- Required **an event-driven architecture** that fires agents based on incoming filings, emails, and news — Pulse's watcher pattern (proven in Portfolio Sentinel #6)
- Required **cost-effective continuous reasoning** — sovereign local models make it economically viable to maintain a team per matter

### Why it's the capstone

Every pattern built in workflows #1-9 converges here:

| Pattern | Source workflow | Role in Case Team |
|---------|---------------|-------------------|
| Clause-level annotation | #1 Contract Review | Documents agent annotates incoming contracts |
| Recursive research | #2 Legal Research | Research agent runs deep dives on new legal developments |
| Adversarial debate | #3 Brief Stress-Testing | Strategy agent pressure-tests proposed responses |
| Batch document processing | #4 Due Diligence | Documents agent ingests discovery productions |
| Regulatory cross-reference | #5 Compliance Audit | Research agent monitors regulatory changes affecting the matter |
| Persistent watchers | #6 Portfolio Sentinel | Event triggers on filings, emails, deadlines |
| Batch HITL review | #7 Discovery Review | Human reviews the team's recommendations in batches |
| Interactive sessions | #8 Deposition Prep | Partner queries the team in real time |
| Parameterized simulation | #9 Monte Carlo Trial | Strategy agent runs scenario analysis on new developments |

Building this workflow first would have required building all of these patterns inline, messily, with massive scope and risk. Building it last means every component is battle-tested and the work is primarily integration and orchestration.

## The shape of the thing

### Team composition

Each matter gets a team of 6-8 agents, each with a distinct role and persistent state:

1. **Lead Counsel Agent** — the team's spokesperson and decision-maker:
   - Answers the partner's questions by routing to the right sub-agent(s)
   - Synthesizes cross-agent insights into coherent answers
   - Makes escalation decisions (when to page the human)
   - Maintains the case's "strategic narrative" — the evolving story of what the case is about

2. **Facts Agent** — owns the growing factual record:
   - Every document, email, deposition transcript, and filing is absorbed
   - Maintains a structured case knowledge graph: entities, events, relationships, timeline
   - Can answer "what do we know about [X]?" in seconds
   - Flags factual inconsistencies across documents

3. **Research Agent** — monitors legal developments relevant to the matter:
   - Uses the recursive research pattern from #2 for deep dives
   - Monitors case law and regulatory developments via Portfolio Sentinel (#6) patterns
   - Fires off recursive research when the legal landscape shifts
   - Maintains a running legal analysis that evolves as new authority emerges

4. **Documents Agent** — indexes and cross-references every document:
   - Uses the annotation pattern from #1 for incoming contracts
   - Uses the batch processing pattern from #4 for discovery productions
   - Can answer "find every email where X mentions Y" in seconds
   - Maintains a document relationship map (which documents reference which others)

5. **Opposing Party Agent** — models the other side:
   - Predicts what opposing counsel will do next based on filings, known strategy, and the state of the record
   - Uses the adversarial pattern from #3 to pressure-test predictions
   - Updates its model when new filings or events reveal opposing strategy

6. **Schedule/Deadlines Agent** — tracks every timeline obligation:
   - Filing deadlines, discovery cutoffs, hearing dates, statute of limitations
   - Wakes up before things are due (configurable lead time per deadline type)
   - Maintains a calendar view of the case's timeline
   - Alerts when a new filing creates new deadline obligations

7. **Client Communications Agent** — maintains the client relationship:
   - Drafts status update emails for the partner's review
   - Tracks what the client has been told vs. what has changed since
   - Maintains the running narrative for client consumption
   - Flags when the client should be updated about a new development

8. **Strategy Agent** — runs scenario analysis:
   - When a new development hits, drafts 2-4 strategic options
   - Uses Monte Carlo patterns from #9 for outcome modeling
   - Pushes options to the Lead Counsel Agent for partner review
   - Maintains a strategy tracker: what was decided, why, and whether the rationale still holds

### Persistent state architecture

Each agent maintains **durable state** that persists indefinitely:

- **LangGraph checkpoints** backed by the PostgreSQL database plane, scoped per matter
- Each checkpoint contains the agent's accumulated knowledge, current assessments, and pending work
- The **matter schema** — a Postgres schema per matter (e.g., `matter_12345`) that contains:
  - `agent_state` — per-agent checkpointed state
  - `documents` — document index and content
  - `knowledge_graph` — entities, events, relationships
  - `timeline` — chronological case events
  - `decisions` — partner decisions and rationale
  - `communications` — client update drafts and history

**State management challenges:**

- **Long-context handling** — months of case history exceeds any model's context window. Each agent maintains a **compressed state summary** (structured, not just rolling prose) plus a **detailed archive** for retrieval. When answering a specific question, the agent loads its summary plus relevant detailed sections from the archive.
- **State consistency** — when the Facts Agent updates the knowledge graph, the Research Agent and Strategy Agent need to know. The **synthesis cycle** handles this.
- **State drift** — over months, an agent's model of the case can drift from reality. Mitigated with citation-grounded answers (always trace back to source documents) and periodic human-audited ground-truth resets.

### Synthesis cycle

Every 24 hours (configurable), or on-demand when a significant event occurs, the Lead Counsel Agent runs a **cross-team synthesis**:

1. Each agent reports what changed in its domain since the last synthesis
2. The Lead Counsel Agent merges the updates into a unified case status
3. Any cross-agent implications are surfaced (e.g., Facts Agent found a new document that changes the Research Agent's legal analysis)
4. If the synthesis reveals anything the partner should know, an alert is generated

The synthesis cycle is a lightweight graph execution that runs against each agent's current state. On sovereign hardware (Ollama), it takes 5-10 minutes per matter.

### Event-driven wake-ups

Pulse watchers fire the appropriate agent when events occur:

- **New filing detected** (docket watcher) → Schedule Agent (deadlines), Facts Agent (content), Research Agent (legal implications), Opposing Party Agent (strategy signals)
- **New document uploaded** (portfolio watcher) → Documents Agent (indexing), Facts Agent (knowledge graph update)
- **Deadline approaching** (schedule trigger) → Schedule Agent generates an alert
- **Client communication due** (schedule trigger) → Client Communications Agent drafts an update

Each wake-up is a focused graph execution: the triggered agent processes the event, updates its state, and decides whether to escalate. Only significant events propagate to the synthesis cycle.

### Query mode: talking to the team

The partner can ask the team anything at any time via the Legal Department workspace:

- The query goes to the Lead Counsel Agent
- Lead Counsel routes to the appropriate sub-agent(s)
- The sub-agent(s) answer from their current state, citing source documents
- Lead Counsel synthesizes the sub-agent answers into a coherent response
- The response streams back to the partner in real time (using the interactive session pattern from #8)

Queries do NOT modify agent state. They are read-only operations against the current team knowledge. Only events (new documents, filings, etc.) modify state.

### Autonomous escalation

When the Strategy Agent identifies a development requiring human judgment:

1. It drafts 2-4 strategic options, each with:
   - The proposed action
   - The rationale (grounded in case facts and legal analysis)
   - The risk assessment (using simulation patterns from #9 if appropriate)
   - The recommended deadline for decision

2. The options are pushed to the **partner inbox** in the workspace

3. The partner reviews and selects an option (or provides their own), with a rationale

4. The decision is recorded in the matter's `decisions` table and propagated to all agents

### Frontend: Matter Dashboard

A new view in the Legal Department workspace — the **Matter Dashboard**:

1. **Case Overview** — the Lead Counsel Agent's current case narrative: key parties, claims, current status, next milestones
2. **Team Status** — each agent's last activity, pending work, and current assessment
3. **Timeline** — chronological case events, past and future (deadlines), with the team's analysis of each event's significance
4. **Documents** — the document index with search, annotations, and cross-references
5. **Knowledge Graph** — visual representation of entities, events, and relationships (interactive, zoomable)
6. **Partner Inbox** — pending escalations, strategic options awaiting decision, draft client communications
7. **Query Interface** — the real-time Q&A panel for asking the team anything
8. **Audit Trail** — complete history of every event processed, every synthesis, every decision, every query

### Matter-scoped privilege model

**This is the single most critical security requirement.**

State from Matter A must NEVER leak into Matter B. A law firm managing matters for competing clients (common and ethical, as long as there's no conflict) must have absolute isolation between matters. Leakage is not a bug — it's a **disbarment-level event**.

Enforcement:
- **Database level**: per-matter Postgres schemas with row-level security. A database role scoped to Matter A cannot read Matter B's schema.
- **ExecutionContext level**: every agent invocation includes the matterId in the context. The agent's state loader ONLY loads state from that matter's schema.
- **LLM level**: agents for Matter A never see any content from Matter B, even if they run on the same hardware.
- **Observability level**: audit trails are per-matter. A user with access to Matter A's audit trail cannot see Matter B's events.

## Constraints

- **Matter isolation is absolute.** No cross-matter state leakage at any layer. This is the hardest engineering constraint in the entire workflow portfolio.
- **Citation grounding for all answers.** When the team answers a question, the answer cites source documents. "According to the deposition transcript of Smith (Exhibit 47, p. 23)..." — not "Smith said X" with no source.
- **No autonomous actions beyond escalation.** The team drafts options and recommends; the human decides. The team never files a motion, sends a client email, or makes a strategic decision autonomously.
- **ExecutionContext is the capsule.** Each event processing, each synthesis cycle, each query gets its own ExecutionContext with the matter's conversationId.
- **Synthesis cycles respect Ollama concurrency.** On sovereign hardware, synthesis cycles across 50 matters are serialized. At ~5 minutes per matter, a nightly synthesis across 50 matters takes ~4 hours — fits in the overnight window on a single Mac Studio.
- **State cleanup on matter closure.** When a matter is closed, the team's state is archived (not deleted) and the agents stop processing events. Archived state remains queryable but no longer receives updates.

## Out of scope

- **Automated filing.** The team drafts; it doesn't file with the court. Future integration.
- **Cross-matter analytics.** "Show me trends across all my active matters." Future feature that requires careful privilege boundary design.
- **Conflict checking.** Detecting conflicts of interest across matters. A critical firm-level function, but it's a different workflow that operates above the matter level.
- **Billing integration.** Tracking time spent by agents for client billing purposes. Interesting product extension but not part of the core workflow.
- **Multi-firm collaboration.** Multiple firms sharing a persistent case team for joint defense or co-counsel arrangements. Complex privilege implications.
- **Voice/meeting integration.** Ingesting audio/video from depositions, hearings, or client meetings. Requires media processing pipeline.

## Dependencies

All nine previous workflows contribute patterns:
- Contract Review (#1) — annotation output format
- Legal Research (#2) — recursive research pattern
- Adversarial Brief (#3) — adversarial debate for strategy testing
- Due Diligence (#4) — batch document processing
- Regulatory Compliance (#5) — regulatory cross-reference
- Portfolio Sentinel (#6) — persistent watchers, event-driven dispatch
- Discovery Document Review (#7) — batch HITL review
- Deposition Prep (#8) — interactive sessions
- Monte Carlo Trial (#9) — scenario simulation

Additional dependencies:
- Legal Department async workspace (completed)
- Pulse event-driven infrastructure (proven in #6)
- Database plane with per-matter schema isolation
- LLM plane with long-context handling (summarization + retrieval)

## Estimated scope

Very large. 4-8 months of focused work. This is not a single effort — it's a series of efforts:

1. **Phase A**: matter creation, team instantiation, document ingestion (Facts + Documents agents)
2. **Phase B**: event-driven wake-ups (Schedule, Filing triggers via Pulse)
3. **Phase C**: query mode (Lead Counsel routing, real-time Q&A)
4. **Phase D**: synthesis cycles and autonomous escalation (Strategy agent, partner inbox)
5. **Phase E**: client communications and opposing party modeling
6. **Phase F**: knowledge graph visualization and matter dashboard

Each phase is a standalone effort with its own PRD and plan, building on the previous.

## Why this goes last

- It requires every pattern from #1-9 to be built and tested
- It's the most complex single workflow (6-8 persistent agents, durable state, event-driven, real-time query)
- The matter-scoped privilege model is the hardest security constraint in the portfolio
- But it's the story that sells the platform: "Your cases now have AI associates that never forget, never rotate off, and work through the night"
- It creates structural lock-in — once a firm has 100 matters on persistent teams, the switching cost is enormous
- It justifies every platform investment: durable state, observability, sovereignty, event-driven orchestration, LangGraph, Pulse, Bridge — all of it converges here
