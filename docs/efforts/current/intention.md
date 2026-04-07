# Future Effort: Legal Department Upgrades

A consolidated set of upgrades for the Legal Department workflow (Forge / LangGraph). Each section below was previously a standalone future-effort doc.

---

## 1. Production HITL

### Current State
The `hitl-checkpoint.node.ts` is an auto-approve pass-through. It emits progress events and immediately continues to report generation. There is no human review step.

### What's Needed
- Replace auto-approve with LangGraph `interrupt()` to pause the workflow
- The frontend needs a review/approval UI showing specialist outputs and synthesis before proceeding
- The user should be able to: approve (continue to report), reject (re-run specialists with feedback), or modify (edit specialist outputs before synthesis)
- Checkpoint persistence is already in place via PostgresCheckpointerService — resumption after interrupt should work

### Dependencies
- LangGraph `interrupt()` and `Command` for workflow resumption
- Frontend approval UI component
- SSE event for "awaiting human review" state

### Estimated Scope
Medium-large — LangGraph interrupt mechanics are straightforward, but the frontend approval flow and re-run logic add complexity.

---

## 2. Input Size Limits

### Current State
There are no guardrails on document size. The `buildUserMessage()` in legal-intelligence.service.ts truncates at 50,000 characters, but specialist nodes pass the full document text to the LLM without truncation. Large documents (100+ page contracts) will blow token limits and cause LLM call failures.

### What's Needed
- Document chunking strategy: split large documents into chunks that fit within token limits
- Summarize chunks before passing to specialists, or run specialists on each chunk and merge
- Token counting utility to estimate whether a document fits in a single LLM call
- Graceful handling when document exceeds maximum processable size
- Consider using RAG collections for large document storage and retrieval

### Dependencies
- Token counting utility (tiktoken or similar)
- Decision on chunking strategy (summarize-then-analyze vs. chunk-and-merge)
- Multi-document support effort may interact with this

### Estimated Scope
Medium — the chunking strategy decision is the hard part, implementation follows from that.

---

## 3. Multi-Document Support

### Current State
The workflow only processes `documents[0]` — the first document in the array. The `getDocumentText()` utility in `specialist-utils.ts` returns `state.documents[0]!.content`. If multiple documents are uploaded, only the first is analyzed.

### What's Needed
- Process all documents in the array, not just the first
- Each document should get its own metadata extraction via LegalIntelligenceService
- CLO routing should consider all documents' types when determining specialist routing
- Specialists should receive context from all documents (or the most relevant one)
- The synthesis node should cross-reference findings across documents
- Report generation should cover all documents

### Dependencies
- Changes to `getDocumentText()` in specialist-utils.ts
- Changes to the capability handler's document processing loop
- Potential token limit management (see Input Size Limits section)

### Estimated Scope
Large — touches the full pipeline from capability handler through all nodes.

---

## 4. Streaming Support

### Current State
The legal department workflow makes 10+ LLM calls sequentially (echo, 3-8 specialists, synthesis, report). Total latency can exceed 60 seconds with no output to the user. Progress events are emitted via SSE but the final response only arrives at the end.

### What's Needed
- Stream each specialist's LLM response as it arrives (token-level streaming)
- Stream the synthesis and report generation LLM calls
- The invoke capability needs to implement `invokeStream()` returning `AsyncIterable<StreamChunk>`
- The frontend conversation window needs to render streaming specialist outputs progressively

### Dependencies
- LLM plane streaming support (already available via `callLLMStream` in LLMHttpClientService)
- Forge invoke endpoint already has `/invoke/stream` SSE support
- Frontend `useOutputRenderer` composable needs streaming JSON support

### Estimated Scope
Medium — the infrastructure exists, but wiring streaming through LangGraph nodes and the orchestrator's parallel execution requires careful coordination.
