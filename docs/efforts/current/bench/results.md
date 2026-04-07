# Local Model Bench Results

Test document: `TEST-01-onesided-nda.pdf` (one-sided NDA)
Harness: `./run.sh <model>`
API: Forge API @ localhost:5201/invoke/stream → Ollama @ localhost:11434

## Critical infrastructure issue: Two Ollamas

`localhost:11434` (HTTP API the backend uses) and `ollama` CLI (`ollama ls`) report **completely different model lists**, with only `gemma4:e4b` overlapping.

- API (`curl localhost:11434/api/tags`) sees: gemma4:e4b, qwen3-next:80b, qwen3:32b, qwen3-coder:30b, qwen3:30b, qwen3:14b, qwq, deepseek-r1, qwen2.5:7b, qwen3:8b, llama3.2:1b/3b, qwen2.5-coder:7b/14b, nemotron-mini:4b, sqlcoder, nomic-embed-text
- `ollama ls` sees: gemma4:26b, gemma4:31b, gemma4:e2b, gemma4:e4b, qwen3.5:*, gpt-oss:20b, qwq, qwen3-coder:30b, qwen2.5:7b, qwen2.5-coder:7b/14b, llama3.2:*, deepseek-r1, sqlcoder, nomic-embed-text

Two Ollama installations running side-by-side. Need to consolidate or point the API at the right one. Until then, the gemma4:26b/31b/e2b are NOT reachable from the API.

## Run 2 — gemma4:e4b (after orchestrator fix) — ✅ SUCCESS

End-to-end completed in **~89 seconds** with full report.

| Step | Duration |
| --- | --- |
| metadata_extraction_llm | ~24s |
| contract specialist | 23s |
| synthesis | 24s |
| report_generation | 18s |
| **total** | **~89s** |

**Notes:**
- CLO routing decided this NDA only needed the **contract specialist** (1 of 8). The parallel-vs-sequential fix is in place but wasn't exercised on this document.
- Output quality is excellent — structured contract analysis, executive summary, risk matrix, recommendations. **gemma4:e4b is producing partner-grade first drafts on a Mac Studio.**
- Need a multi-specialist document next to validate the sequential orchestrator under load.

## Run 1 — gemma4:e4b (baseline, BEFORE fix)

| Time | Event |
| --- | --- |
| 0:00 | document_text_extraction (PDF parse) |
| 0:00 | metadata_extraction_llm — first LLM call started |
| 2:16 | first LLM call **completed successfully** |
| 2:16 | next LLM call started (specialist or routing) |
| 5:00 | **timeout of 300000ms exceeded** — hard 300s ceiling hit |

**Verdict:** e4b is functional. The metadata extraction call took 2:16 (acceptable). The next call exceeded a hard 300s timeout, killing the run. Find the timeout, find which node was running, chunk it.

## Root cause analysis

**Two compounding problems:**

### Problem 1: Orchestrator runs specialists in parallel against a single-stream backend
`apps/forge/api/src/agents/legal-department/nodes/orchestrator.node.ts:77` uses `Promise.all` to fan out all 8 specialists simultaneously. The comment claims "parallel execution: max(30s, 30s, 30s) = 30s instead of 30s + 30s + 30s = 90s" — but **Ollama on a Mac is single-stream**. The 8 LLM calls land in the daemon's queue and execute serially. Specialists at the back of the queue wait for the GPU and easily blow past the 300s per-call timeout before they ever generate a token.

### Problem 2: Each specialist makes ONE giant LLM call
Every specialist (contract, compliance, ip, privacy, employment, corporate, litigation, real_estate) follows the same pattern: pass the full document + a long system prompt + ask for a deeply-nested JSON schema in one shot, with `maxTokens: 3000` and a 50-line prompt. On gemma4:e4b each such call takes ~2 minutes. 8 of them queued = 16 minutes wallclock. The 300s ceiling kills it.

The metadata extraction (`legal-intelligence.service.ts`) is the same anti-pattern: 50,000-char user message, 100-line system prompt, ~110-field nested JSON output, 4000 max tokens. It happens to fit in 2:16 only because it runs alone.

## The fix (two layers)

**Layer 1 — Stop pretending parallel works on Ollama.** Make orchestrator run specialists sequentially when the LLM provider is `ollama` (or any single-stream backend). Keep parallel for cloud providers. This is also more honest — parallel against a single-stream backend was always a misrepresentation.

**Layer 2 — Chunk each specialist into 2-4 small focused calls.** Replace one giant nested-JSON call with a pipeline like:
1. Classify (one-line answer, ~5s on e4b)
2. Extract key clauses (small JSON, ~30s on e4b)
3. Score against playbook (small JSON, ~10s on e4b)
4. Summarize (one paragraph, ~15s on e4b)

Total per specialist: ~60s vs ~120s. Each sub-call fits well under the 300s timeout, with progress events between them so the SSE stream stays alive and the user sees progress.

## Action plan

1. **Patch orchestrator** for sequential execution under Ollama (smallest, highest-leverage change). Re-run bench to confirm no more 300s timeouts.
2. **Carve up the contract specialist** as the reference implementation of the chunked pattern. Re-run bench, measure each sub-call.
3. **Apply the pattern** to the other 7 specialists.
4. **Carve up `legal-intelligence.service.ts`** metadata extraction the same way (split into separate doc-type / sections / parties / dates / signatures sub-calls).
5. **Per-node model tier selection** — declare what each sub-call needs (`fast-classifier`, `structured-extractor`, `reasoner`) so we can route to e4b, qwen3:8b, qwen3:14b, etc.
