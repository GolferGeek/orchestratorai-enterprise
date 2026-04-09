# Intention: Legal Research Deep Dive

## Priority: #2 of 10 Legal Workflows

## What

A lawyer poses a legal question — "Can we enforce this non-compete in California post-AB 1076?", "What is the current state of the law on AI-generated works and copyright?", "Does ERISA preempt our state-law claim?" — and the Legal Department dispatches a **recursive research team** that runs a depth-first investigation. The research agent identifies the core question, breaks it into sub-questions, researches each sub-question, identifies further sub-questions from what it finds, and continues until it has comprehensive coverage or hits a configured depth limit. Output: a structured legal memorandum with a complete citation chain, organized by issue and sub-issue, with confidence ratings per conclusion.

This is the second capability added to the Legal Department workspace. The user clicks "Research a Legal Question" in the capabilities sidebar, enters their question and any relevant context (jurisdiction, practice area, key facts), and gets a job in the activity feed. When the job completes, the detail panel shows a structured legal memo.

## Why

### The universal legal task

Every lawyer, in every practice area, at every firm size, does legal research. It's the most time-consuming recurring task in legal practice — associates spend 30-50% of their billable hours on research. The quality variance is enormous: a thorough research memo from a senior associate at a top firm is a completely different product than what a solo practitioner can produce in the same time.

### What exists today vs. what's missing

Current legal AI tools (Westlaw AI, LexisNexis+, CoCounsel) do single-shot research: ask a question, get an answer with citations. None of them do **recursive depth-first research** where the system identifies that answering Question A requires first answering Questions B and C, and answering Question B requires answering Questions D and E, and so on. This is exactly what a good research associate does — they follow the thread wherever it leads, building up a complete picture. Single-shot tools miss the sub-questions they don't know to ask.

### The pattern it introduces

**Recursive research with depth tracking and convergence detection** is the most-reused pattern in the entire 10-workflow sequence:

- Adversarial Brief (#3): the red team's counter-argument agent uses recursive research to find distinguishing cases and counter-authority.
- Due Diligence (#4): when a DD flag requires deeper investigation, the research pattern fires.
- Portfolio Sentinel (#6): when a regulatory signal is ambiguous, the research pattern investigates whether it actually applies.
- Deposition Prep (#8): preparing cross-examination questions requires researching the legal theories the other side might pursue.
- Monte Carlo Trial (#9): each simulated trial needs researched legal arguments for both sides.
- Persistent Case Team (#10): the research agent on the case team uses this exact pattern.

Building it correctly as a standalone workflow — where the output is easy to evaluate (a legal memo is a well-understood format) — means every downstream workflow gets a battle-tested research engine for free.

## The shape of the thing

### The recursive research graph

A new LangGraph workflow — `legal-research.graph.ts` — separate from the existing `legal-department.graph.ts`. This is a distinct capability with its own graph, not a modification of the document analysis workflow.

The graph is a **cyclic DAG with depth tracking**:

1. **Question Analysis node** — receives the user's question and context. Produces:
   - A restated legal question (precise, unambiguous)
   - The jurisdiction(s) in scope
   - 2-5 initial sub-questions that must be answered to address the main question
   - A research plan (which sub-questions to pursue first, what sources to check)

2. **Research node** — takes a single sub-question and produces:
   - A summary of findings (2-4 paragraphs)
   - Citations with relevance scores
   - 0-3 new sub-questions that emerged from the research
   - A confidence rating (high/medium/low) on the answer to this sub-question

3. **Depth controller node** — receives the research node's output and decides:
   - If new sub-questions were generated AND current depth < max depth AND confidence is not yet high: route back to the research node for each new sub-question
   - If max depth reached OR all sub-questions answered with high confidence: route to synthesis
   - Tracks the research tree: which questions led to which sub-questions, preventing circular research

4. **Synthesis node** — receives the complete research tree and produces:
   - A structured legal memorandum organized by issue
   - Each issue includes: the question, the answer, the reasoning, and the supporting citations
   - A confidence assessment per issue and for the overall conclusion
   - An "open questions" section for anything the research couldn't resolve

5. **HITL gate** — the lawyer reviews the memo. Options:
   - **Approve** — the memo is final
   - **Deepen** — the lawyer identifies specific sub-questions to research further (the graph resumes from the depth controller with new sub-questions)
   - **Redirect** — the lawyer says "you went down the wrong path on issue 3, research X instead" (the graph replays from the research node with corrected sub-questions)

### Citation grounding: the safety-critical requirement

Legal research with hallucinated citations is worse than no research at all. A lawyer who relies on a fake case citation faces sanctions, malpractice liability, and reputational destruction.

**For sovereign/local model deployment:**
- Citations must come from a **grounded source** — either a RAG collection of verified legal texts that the organization has ingested, or an external legal database API (Courtlistener, Google Scholar legal, state court RSS feeds).
- The research node NEVER generates citations from model knowledge alone. It queries the grounded source, retrieves actual documents, and cites from what it retrieves.
- Every citation includes a `verified: boolean` flag. If the citation comes from a grounded source, `verified: true`. If the model asserts a citation that couldn't be verified against the grounded source, `verified: false` and the memo marks it with a warning.
- The HITL gate highlights unverified citations prominently. The lawyer must acknowledge each one.

**For cloud model deployment:**
- Same grounding requirement. Cloud models hallucinate citations just as readily as local models.
- The only difference is that cloud models may have more recent training data, so they may "know about" more cases. But knowing about a case is not the same as having a verified citation. The grounding requirement is the same.

**For this initial build:**
- We ship with RAG-based citation grounding. The organization must ingest legal texts into a RAG collection before the research workflow can cite them.
- External legal database integrations (Courtlistener API, etc.) are a follow-up. The architecture supports them — the research node has a pluggable source interface — but we don't build the adapters in this effort.
- The memo clearly states "Research scope limited to [N] documents in the organization's legal knowledge base" so the lawyer knows the research is bounded.

### Research tree visualization

The frontend shows the research as a **tree**:

- Root: the original question
- Branches: sub-questions, with their answers and citations
- Leaves: terminal sub-questions (answered with high confidence, or max depth reached)
- Color-coded by confidence: green (high), yellow (medium), red (low)
- Click any node to see the full research output for that sub-question

This tree visualization is also useful for Adversarial Brief (#3 — the debate tree) and Persistent Case Team (#10 — the case knowledge graph). Building it as a generic `ResearchTree.vue` component pays forward.

### Depth and cost controls

Recursive research can run away. Controls:

- **Max depth** — configurable per job, default 3 levels. Deeper research costs more tokens and time.
- **Max sub-questions per level** — configurable, default 3. Prevents exponential branching.
- **Token budget** — configurable per job. When the cumulative token usage approaches the budget, the depth controller forces synthesis even if sub-questions remain.
- **Time budget** — configurable. Same forcing behavior.
- All limits are visible to the user at job creation time and shown in the job detail panel.

## Constraints

- **No hallucinated citations. Ever.** This is the absolute rule. If the grounded source doesn't contain relevant material, the memo says "insufficient sources available" for that sub-question. It does not make up cases.
- **No fallbacks.** If the research node fails on a sub-question (LLM error, source unavailable), the job fails for that branch and the memo includes the failure. We do not silently skip sub-questions.
- **ExecutionContext is the capsule.** One job, one conversationId, all research nodes share the same context.
- **The research graph is a separate workflow from the document analysis graph.** They share the same workspace, the same job queue, and the same specialist infrastructure, but they are distinct LangGraph graphs. This keeps each graph's state clean and testable.
- **The recursive pattern must be extractable.** While this effort builds the research graph as a Legal Department capability, the recursive research pattern (question → research → sub-questions → depth control → synthesis) should be structured so it can be extracted into a reusable LangGraph sub-graph. Adversarial Brief (#3) will need it. Don't over-abstract now, but don't hardcode legal-specific logic into the recursion mechanics.

## Out of scope

- **External legal database integrations.** Courtlistener, PACER, Google Scholar Legal, state court feeds. These are future source adapters. This effort uses RAG collections only.
- **Case law update monitoring.** Alerting when a cited case is overruled or distinguished. That's Portfolio Sentinel territory.
- **Comparative jurisdiction analysis.** "How does this rule differ across all 50 states?" is a valid use case but requires a different graph structure (parallel research across jurisdictions). Future enhancement.
- **Brief/memo formatting templates.** The output is structured markdown. Formatting it as a firm-branded memo (with caption, table of authorities, etc.) is a future export feature.

## Dependencies

- Legal Department async workspace (completed)
- Legal Department HITL (completed)
- RAG collections in Compose (existing — the research node queries them via the database plane)
- Contract Review (#1) — not a hard dependency, but clause segmentation and the annotation output format should be settled before this effort starts, since both workflows share the specialist infrastructure

## Estimated scope

Medium. 2-3 weeks. The new LangGraph graph is the bulk of the work: question analysis, recursive research with depth tracking, synthesis, and the research tree visualization. The research node's source interface (RAG query) is straightforward since the RAG plane already exists.

## Why this goes second

- Introduces the recursive research pattern — the single most reused pattern across all 10 workflows.
- Produces a billable work product (legal memo) that every lawyer needs.
- Lower risk than Adversarial Brief (#3) because the output is a memo, not a debate — easier to evaluate correctness.
- The citation grounding challenge, solved here, is reused by every subsequent workflow that involves legal citations.
- The research tree visualization component is reused by #3, #8, #9, and #10.
