# Document Onboarding — Memory

Learnings, patterns, and institutional knowledge accumulated through building and running this workflow.

## Domain Insights

- Lawyers care most about risk flags they can act on immediately — the risk matrix in the final report is the first thing they look at
- Document type classification confidence matters: when the system says "NDA with 0.9 confidence," the attorney trusts the routing. Below 0.7, they want to verify
- Multi-document jobs (e.g., an NDA + its amendment) need cross-document synthesis — findings in one document affect risk assessment of the other

## Technical Learnings

- Metadata extraction on gemma4:e4b occasionally fails to parse JSON — the worker continues without metadata and the CLO routing still works, but specialist analysis is less targeted
- The echo node (simple LLM greeting) runs before CLO routing — it's a vestige of the M0 milestone and could be skipped for document-heavy flows
- Ollama serializes GPU calls for local models — specialists run sequentially on single-stream providers, which means 8 specialists × ~10s each = ~80s minimum on local hardware

## User Patterns

- Most uploads are single-document NDAs and employment agreements
- Attorneys rarely use the "modify" option in HITL — they approve or reject, then edit the final report manually
- The "reject with feedback" path re-runs all specialists, which is expensive. Partial re-run (only rejected specialists) would save significant time

## What Works Well

- The multi-specialist parallel analysis is the core differentiator — attorneys consistently say "I wouldn't have caught the [privacy/IP/employment] issue"
- The structured report format (risk matrix + recommendations) is preferred over narrative prose
- HITL pause gives attorneys confidence that the system isn't autonomous

## What Needs Improvement

- RAG enrichment: infrastructure exists but no collections are populated. When populated, specialists could compare against the firm's own clause library
- Stage ladder observability: works in the job detail modal but the in-row ticker still shows "Working..." during processing
