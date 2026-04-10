# Intention: Self-Improving Workflow Memory

## What

Build a reflection process into each legal workflow so it writes back to its own `memory.md` file when it discovers something noteworthy during document processing. The workflow gets smarter with every document it analyzes.

## The shape of the thing

A dedicated **reflection node** at the end of the LangGraph graph — after report generation, before the complete node. It:

1. Reads the current `memory.md` for this workflow
2. Reads the analysis results (specialist outputs, synthesis, risk assessment)
3. Asks a lightweight LLM: "What did you learn from this document that would help analyze the next one? What patterns, domain insights, or risk indicators should be remembered?"
4. Compares the response against existing memory to avoid duplicates
5. Appends genuinely new insights to `memory.md`

The reflection should be:
- **Lightweight** — small model (e2b), short prompt, < 5 seconds
- **Selective** — only append if the insight is new and non-obvious
- **Pruning-aware** — periodically consolidate or remove stale entries
- **Non-blocking** — if reflection fails, the job still completes successfully

This is a centralized pattern that lives outside any single workflow — a `WorkflowMemoryService` that any LangGraph graph can use. The service handles file read/write, dedup, and pruning.

## Why

The memory.md is already injected into every LLM system prompt. But right now it's only updated manually. Making the workflow self-improving means:
- Domain insights accumulate automatically (e.g., "perpetual confidentiality is standard in tech NDAs")
- Risk patterns emerge from real data (e.g., "3 of the last 5 MSAs had unlimited indemnification")
- Each firm's workflows become tuned to their specific document patterns over time

## Dependencies

- memory.md per workflow (done)
- Memory injection into system prompts (done — `loadWorkflowMemory` + `formatMemoryForPrompt`)
- LangGraph graph modification (add reflection node)
- File write capability from the API process

## Estimated scope

Small-medium. 2-3 days. One shared service, one reflection node template, wire into both existing workflows.
