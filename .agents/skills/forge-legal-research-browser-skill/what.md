# Legal Research — What It Does

## Purpose

Legal Research answers a legal question using recursive sub-question generation and RAG-grounded citations from the firm's knowledge base. It generates a research tree — expanding sub-questions until depth limits or budget is hit — and produces a legal memo with verified citations.

## Key Features

1. **Recursive sub-question generation** — main question → sub-questions → sub-sub-questions
2. **Configurable depth and budget** — depth limit, max iterations, token/time budgets
3. **RAG-grounded citations** — every citation traced back to firm's document collection
4. **Verified/unverified labeling** — citations with firm document backing are "verified"; hallucinations are "unverified"
5. **Research tree visualization** — color-coded by confidence (green verified, red unverified, yellow uncertain)
6. **Scope statement** — "limited to N documents in the knowledge base"
7. **HITL: deepen specific branches** — reviewer can ask the AI to research specific sub-questions further, or redirect

## What Makes It Different from ChatGPT

The verified/unverified citation distinction is the key differentiator. Every citation in the memo is labeled:
- **Verified**: grounded in a specific document in the firm's RAG collection
- **Unverified**: generated from the LLM's training data — flagged for human review

This is the difference between "the AI said so" and "the AI found this in your files."

## Input

Text only — no file upload:
- Legal question (required)
- Jurisdiction
- Practice area
- Key facts
- Research depth controls (optional — depth limit, sub-question cap)

## Output

A legal research memo with:
- Research scope statement
- Full memo (markdown)
- Unverified citation count and list
- HITL-expanded sections (if reviewer requested deeper research)
