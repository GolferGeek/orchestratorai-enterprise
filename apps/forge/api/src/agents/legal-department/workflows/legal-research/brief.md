---
title: Legal Research Deep Dive
video:
---

## Benefits

- **Recursive depth-first research, not single-shot answers.** The system identifies sub-questions, researches each one, discovers further sub-questions from what it finds, and continues until it has comprehensive coverage or hits your configured depth limit. This is how a good research associate works — following every thread.

- **Every citation is grounded.** Citations come from your organization's ingested legal knowledge base, not from the model's memory. Each citation carries a verified/unverified flag so you know exactly which sources are traceable to your documents and which need independent verification.

- **You control the depth and cost.** Configure max research depth, sub-questions per level, token budget, and time budget before the job starts. The system synthesizes early when limits are hit — no runaway costs.

- **Visual research tree.** See the question/sub-question hierarchy building in real-time, color-coded by confidence. Click any node to see findings and citations for that specific sub-question.

- **You direct the research.** At the review stage, approve the memo, deepen specific sub-questions that need more analysis, or redirect the research when it went down the wrong path.

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

- You have a legal question and need a structured research memorandum
- You want to understand all the sub-issues involved in a legal question
- You need citation-grounded analysis bounded to your firm's knowledge base
- You want to iteratively deepen research on specific issues

## How it works

1. Click **Research a Legal Question** and enter your question, jurisdiction, practice area, and key facts
2. Optionally adjust research controls (depth, sub-questions, budgets)
3. Watch the research tree build as the system analyzes sub-questions
4. Review the structured legal memorandum with per-issue analysis and citations
5. Approve the memo, deepen specific branches, or redirect wrong-path research
6. Receive your final polished legal research memorandum
