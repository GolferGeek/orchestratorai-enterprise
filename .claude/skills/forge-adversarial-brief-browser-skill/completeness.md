# Brief Stress Test — Completeness Audit Reference

## Brief Status
**File**: `apps/forge/api/src/agents/legal-department/workflows/adversarial-brief/brief.md`
**Quality**: Excellent — best marketing framing in the set ("watch your brief get shredded")
**video: field**: ✗ MISSING

## Feature Inventory

| Feature | In Code | In Brief |
|---------|---------|----------|
| Blue Team + Red Team + Judge architecture | ✓ | ✓ |
| 5-dimension judge rubric | ✓ | ~ mentioned |
| Double-blind position randomization | ✓ | ✓ |
| Convergence detection (threshold + round cap + diminishing returns) | ✓ | ✓ |
| Ranked attack list sorted by severity | ✓ | ✓ |
| Per-recommendation accept/reject | ✓ | ✓ |
| Fortification pass (brief rewritten with accepted changes) | ✓ | ✓ |
| Citation grounding via RAG | ✓ | ~ |
| Provider-aware execution (parallel cloud vs sequential Ollama) | ✓ | ✗ |
| SSE real-time debate streaming | ✓ | ~ |
| StageLadder with thinking badges | ✓ | ✗ |
| Sovereign/local mode | ✓ | ~ |

## Known Gaps

**Gap 1: video: field empty (P2)** — This has the best demo moment in the product: watching a Red Team AI attack a brief in real time. Ideal video: ~3 minutes showing debate streaming → ranked attack list → fortification diff.

**Gap 2: Provider-aware execution not mentioned (P3)** — Cloud = parallel Blue+Red teams, Ollama = sequential. Power users care about this for sensitive documents.

**Gap 3: StageLadder not described (P3)** — Same gap across all briefs.

## Demo Script

*"Watch your brief get shredded by AI, then fixed"* (3–4 min)

| Step | Action | Say |
|------|--------|-----|
| 1 | Upload a 2-page legal argument | "Upload any brief or legal argument" |
| 2 | Watch StageLadder: Blue/Red teams alternating | "3-on-3 debate between defense and attack teams" |
| 3 | Watch convergence (rounds complete) | "Stops when the attacks stop finding new weaknesses" |
| 4 | Open HITL — show ranked attack list | "Every vulnerability, ranked by severity" |
| 5 | Accept top 3 recommendations | "Lawyer decides what to incorporate" |
| 6 | Show FortificationDiff | "The brief is rewritten with the accepted improvements" |

**Key moment**: Step 4 — the ranked attack list with severity scores. This is legally defensible AI assistance.
