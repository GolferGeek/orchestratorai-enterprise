# Judge Model Benchmark — Local Ollama Models

**Date**: 2026-04-10
**Task**: Evaluate gemma4:31b and qwq as sovereign judge models for adversarial brief stress-testing

## Test Setup
- Single debate exchange: CWA Section 301 liability argument
- Position A (defense): EPA inspection report as direct evidence
- Position B (attack): Evidence is circumstantial, no causal chain established
- Each model scored on: valid JSON output, scoring quality, reasoning depth, latency

## Results

| Metric | gemma4:31b | qwq |
|--------|-----------|-----|
| Latency | 60s | 65s |
| Valid JSON | Yes | Yes |
| Reasoning mode | Extended thinking (visible) | Chain-of-thought (`<think>` tags) |
| Position A scores | L:8 F:7 C:6 P:7 | L:8 F:9 C:8 P:8 |
| Position B scores | L:8 F:5 C:2 P:7 | L:9 F:6 C:5 P:7 |
| Overall Severity | 7/10 | 7/10 |

## Analysis

**gemma4:31b**
- Sharper differentiation in citation quality (Position B: 2/10 vs qwq's 5/10)
- More critical assessment — correctly identifies Position B's lack of citations
- Reasoning is structured and judicial in tone
- Slightly faster

**qwq**
- More balanced scoring across dimensions
- Extended chain-of-thought reasoning with explicit deliberation
- Slightly inflated scores for Position A (citation quality 8 seems generous)
- Good assessment text quality

## Recommendation

**Default: gemma4:31b** for the judge role in sovereign mode.

Rationale:
1. Sharper differentiation helps convergence detection — the whole point of the judge is to distinguish strong attacks from weak ones
2. gemma4:31b's lower citation quality score for Position B (2/10) correctly identifies that the attack lacks its own citations, which is critical for the adversarial workflow
3. Marginally faster
4. Both produce valid JSON reliably

**Fallback**: qwq is a viable alternative if gemma4:31b is unavailable. The scoring quality difference is marginal.

**Cloud fallback**: If neither local model meets quality requirements for a specific brief, the judge can use the cloud provider from ExecutionContext (breaks full sovereignty — document this tradeoff to the user).
