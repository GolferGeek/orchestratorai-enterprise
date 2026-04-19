# Brief Stress Test — What It Does

## Purpose

The Brief Stress Test takes a legal brief and subjects it to an adversarial debate between a Blue Team (defense) and Red Team (attack). A judge scores each round. The workflow continues until convergence (diminishing improvement) or a round cap is hit. The human then approves or rejects the stress-test findings, and the brief is "fortified" — rewritten with the accepted improvements.

**This is the highest wow-factor demo in the product.** Watching a Red Team AI shred a brief in real time, then seeing the brief rewritten with the accepted fixes, is viscerally compelling.

## Architecture

- **Blue Team** (3 agents): defends the brief's strongest arguments
- **Red Team** (3 agents): attacks weak citations, factual gaps, logical vulnerabilities
- **Judge** (1 agent): 5-dimension rubric scoring — rates attack severity, defense quality, remaining vulnerability
- **Convergence detector**: exits early if attack severity is below threshold or rounds reach cap
- **Fortification pass**: rewrites the brief with accepted Red Team recommendations
- **Provider-aware**: Anthropic/OpenAI run Blue+Red in parallel; Ollama runs sequentially

## Key Features

1. **Double-blind position randomization** — neither team knows the other's scoring
2. **Convergence detection** — severity threshold + round cap + diminishing returns
3. **Ranked attack list** — sorted by severity after all rounds
4. **Per-recommendation accept/reject** in HITL
5. **Fortification** — accepted changes rewrite the brief (not just annotate it)
6. **Citation grounding via RAG** — attacks reference firm knowledge base
7. **Real-time SSE streaming** — debate rounds appear as they complete

## HITL Moment

After all debate rounds, the graph pauses at `hitl_checkpoint`. The reviewer sees:
- Ranked list of all Red Team attacks with severity scores
- Which attacks were countered by Blue Team vs. which landed
- Per-recommendation: Accept (include in fortification) or Reject (discard)
- After approval: Fortification pass rewrites the brief with accepted changes

## Demo Moment

The StageLadder shows `blue_team_orchestrator` and `red_team_orchestrator` alternating — you can watch the debate happen round by round. When it reaches `synthesis` and then `hitl_checkpoint`, the reviewer sees a ranked attack list with severity scores. This is unlike anything else in legal tech.
