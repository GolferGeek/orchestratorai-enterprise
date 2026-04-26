# Legal Research — Completeness Audit Reference

## Brief Status
**File**: `apps/forge/api/src/agents/legal-department/workflows/legal-research/brief.md`
**Quality**: Excellent — the best-written brief in the entire set
**video: field**: ✗ MISSING

## Feature Inventory

| Feature | In Code | In Brief |
|---------|---------|----------|
| Recursive sub-question generation | ✓ | ✓ |
| RAG-grounded citations | ✓ | ✓ |
| Verified/unverified citation labeling | ✓ | ✓ |
| Configurable depth, sub-question caps, token/time budgets | ✓ | ✓ |
| Research tree visualization (color-coded by confidence) | ✓ | ~ mentioned, not described |
| HITL: approve, deepen specific branches, redirect | ✓ | ✓ |
| Scope statement | ✓ | ✓ |
| SSE real-time research tree building | ✓ | ~ |
| Sovereign/local mode | ✓ | ✓ |
| StageLadder with thinking badges | ✓ | ✗ |

## Known Gaps

**Gap 1: video: field empty (P2)** — The research tree building live in SSE is the compelling demo. Watching nodes expand as sub-questions are answered is visually like watching an investigation unfold.

**Gap 2: Research tree color coding not described (P3)** — Green = verified, Red = unverified, Yellow = uncertain, Gray = in progress. This is the "verified vs ChatGPT" differentiator explained visually.

**Gap 3: "Deepen specific branches" HITL mechanic (P3)** — Mentioned but the UI mechanic (how to select a specific branch to deepen) isn't described.

## Demo Script

*"Deep recursive research that knows your firm's documents"* (3–4 min)

| Step | Action | Say |
|------|--------|-----|
| 1 | Enter "What are the enforceability requirements for non-compete agreements in California?" | "Ask any legal question" |
| 2 | Watch research tree build — sub-questions expanding | "The AI generates sub-questions and researches each" |
| 3 | Show verified citation (green) vs unverified (red) | "Verified = found in your firm's documents. This is the difference from ChatGPT." |
| 4 | Open HITL — request to deepen one branch | "Ask the AI to go deeper on a specific thread" |
| 5 | Show final legal memo | "A citable research memo with grounded sources" |

**Key moment**: Step 3 — showing a verified citation and explaining why it's different from a hallucinated citation.
