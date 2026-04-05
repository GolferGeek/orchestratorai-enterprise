# Future Effort: Input Size Limits for Legal Department

## Current State
There are no guardrails on document size. The `buildUserMessage()` in legal-intelligence.service.ts truncates at 50,000 characters, but specialist nodes pass the full document text to the LLM without truncation. Large documents (100+ page contracts) will blow token limits and cause LLM call failures.

## What's Needed
- Document chunking strategy: split large documents into chunks that fit within token limits
- Summarize chunks before passing to specialists, or run specialists on each chunk and merge
- Token counting utility to estimate whether a document fits in a single LLM call
- Graceful handling when document exceeds maximum processable size
- Consider using RAG collections for large document storage and retrieval

## Dependencies
- Token counting utility (tiktoken or similar)
- Decision on chunking strategy (summarize-then-analyze vs. chunk-and-merge)
- Multi-document support effort may interact with this

## Estimated Scope
Medium — the chunking strategy decision is the hard part, implementation follows from that.
