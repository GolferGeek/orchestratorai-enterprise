# Future Effort: Streaming Support for Legal Department

## Current State
The legal department workflow makes 10+ LLM calls sequentially (echo, 3-8 specialists, synthesis, report). Total latency can exceed 60 seconds with no output to the user. Progress events are emitted via SSE but the final response only arrives at the end.

## What's Needed
- Stream each specialist's LLM response as it arrives (token-level streaming)
- Stream the synthesis and report generation LLM calls
- The invoke capability needs to implement `invokeStream()` returning `AsyncIterable<StreamChunk>`
- The frontend conversation window needs to render streaming specialist outputs progressively

## Dependencies
- LLM plane streaming support (already available via `callLLMStream` in LLMHttpClientService)
- Forge invoke endpoint already has `/invoke/stream` SSE support
- Frontend `useOutputRenderer` composable needs streaming JSON support

## Estimated Scope
Medium — the infrastructure exists, but wiring streaming through LangGraph nodes and the orchestrator's parallel execution requires careful coordination.
