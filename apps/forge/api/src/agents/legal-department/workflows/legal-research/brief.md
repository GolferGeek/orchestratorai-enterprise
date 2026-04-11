---
title: Legal Research Deep Dive
video:
---

## Why this, not ChatGPT?

ChatGPT researches from its training data. This researches from **your firm's knowledge base** — your contracts, your policies, your litigation checklists, your prior work product. Every citation traces back to a document your organization ingested, not to a model's memory that might hallucinate a case that doesn't exist.

Three things ChatGPT cannot do:

1. **Ground citations in your documents.** Each citation carries a verified/unverified flag. Verified means the system found the source in your RAG collection. Unverified means it needs independent verification. You always know which is which.

2. **Keep sealed matters sealed.** Runs on local Ollama models — your research question and your documents never leave the machine. Privileged work product stays privileged.

3. **Search across your firm's institutional knowledge.** Firm policies, contract clause libraries, litigation playbooks, intake checklists, estate planning guides — all indexed and searchable. When you ask a legal question, the answer draws on what your firm already knows, not generic internet knowledge.

## Benefits

- **Recursive depth-first research, not single-shot answers.** The system identifies sub-questions, researches each one, discovers further sub-questions from what it finds, and continues until it has comprehensive coverage or hits your configured depth limit. This is how a good research associate works — following every thread.

- **Every citation is grounded in your knowledge base.** Citations come from your organization's ingested legal documents via hybrid search (keyword + semantic). Each citation carries a verified/unverified flag so you know exactly which sources are traceable to your documents.

- **You control the depth and cost.** Configure max research depth, sub-questions per level, token budget, and time budget before the job starts. The system synthesizes early when limits are hit — no runaway costs.

- **Visual research tree.** See the question/sub-question hierarchy building in real-time, color-coded by confidence. Click any node to see findings and citations for that specific sub-question.

- **You direct the research.** At the review stage, approve the memo, deepen specific sub-questions that need more analysis, or redirect the research when it went down the wrong path.

## Your Knowledge Base

Your organization's RAG collections power the research. Documents you've ingested are searched every time the system investigates a sub-question:

- **Firm Policies** — fee agreements, confidentiality, conflicts, retention policies
- **Contract Templates** — NDAs, engagement letters, MSAs, clause libraries
- **Litigation Playbooks** — motion checklists, discovery guides, deposition prep, trial prep
- **Client Intake** — intake checklists with version history
- **Estate Planning** — planning guides and templates

The more you ingest, the better the research. Upload your firm's work product through the Document Onboarding workflow to build your knowledge base over time.

## Features

- LLM-powered question analysis: breaks your legal question into 2-5 targeted sub-questions
- Recursive research with RAG-grounded citations from your knowledge base
- Configurable depth limits, sub-question caps, token budgets, and time budgets
- Per-citation verified/unverified tracking with prominent warnings
- Structured legal memorandum with issue-by-issue analysis and confidence ratings
- Research tree visualization with confidence color-coding (green/yellow/red/gray)
- HITL review: approve, deepen specific branches, or redirect wrong-path research
- Scope statement: "Research scope limited to [N] documents" so you know the boundaries
- SSE streaming: watch the research tree build in real-time

## When to use it

- You have a legal question and need a structured research memorandum grounded in your firm's documents
- You want to understand all the sub-issues involved in a legal question
- You need to know what your firm's own policies, contracts, and prior work say about a topic
- You're working on sealed or privileged matters that can't go to external AI services
- You want to iteratively deepen research on specific issues

## How it works

1. Click **New** and enter your question, jurisdiction, practice area, and key facts
2. Optionally adjust research controls (depth, sub-questions, budgets)
3. Watch the research tree build as the system analyzes sub-questions against your knowledge base
4. Review the structured legal memorandum with per-issue analysis and citations
5. Approve the memo, deepen specific branches, or redirect wrong-path research
6. Receive your final polished legal research memorandum
