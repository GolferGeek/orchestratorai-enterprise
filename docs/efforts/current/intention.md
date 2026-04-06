# Intention: Harden the Legal Department Analyst

## What
The legal department analyst is an existing LangGraph workflow in Forge with ~99 files and ~920KB of code, built by an intern. It has 8 specialist agents (contract, compliance, IP, privacy, employment, corporate, litigation, real estate), CLO routing, multi-agent orchestration, synthesis, HITL checkpoint, and report generation. The frontend has full Vue components for each specialist, document upload, progress tracking, and results display.

It works, but it needs to be hardened before we build additional legal workflows on top of it.

## Why
This is the foundation for a 12-day legal workflow development sprint. Every future workflow will reuse these specialist agents, the routing logic, the orchestration patterns, and the frontend components. If the foundation has problems, they multiply across everything we build next.

## Problems Found (18 issues across 4 categories)

### Critical — CLAUDE.md Violations (4)
1. **Fallback analysis in all 8 specialist nodes** — When LLM JSON parsing fails, each specialist silently creates a fake analysis with `confidence: 0.5` instead of failing. Violates "NO FALLBACKS. EVER."
2. **minimalMetadata() in legal-intelligence.service.ts** — When the LLM call fails or JSON parsing fails, returns a fake metadata object with `confidence: 0.1`. Masks failures completely.
3. **Triple PDF fallback in legal-department.capability.ts** — pdf-parse fails -> raw base64 decode -> placeholder string. Three layers of hiding the real problem.
4. **CLO routing error handler** — On any error, silently defaults to contract specialist with `confidence: 0.5` instead of propagating the failure.

### Consistency — Duplicated Code (4)
5. **`getDocumentText()`** — Identical function copy-pasted in all 8 specialist nodes.
6. **JSON parsing/markdown-stripping** — Same `parseXxxAnalysis()` logic duplicated 8+ times.
7. **`buildUserMessage()`** — Nearly identical across all 8 specialists with minor variations.
8. **`multiAgent` hardcoded to `true`** — Single-agent code paths in the graph are dead code.

### Efficiency (3)
9. **Orchestrator re-creates specialist closures** — Creates 8 new function instances on every call instead of reusing the graph's instances.
10. **Echo node wastes an LLM call** — In document analysis flow, echo calls the LLM to summarize metadata, then specialists each make their own calls. The echo LLM call is redundant.
11. **Progress percentages don't compose** — Multiple nodes report the same percentage (e.g., contract and compliance both claim 60%).

### Missing Functionality (7)
12. No streaming support (10+ LLM calls can take 60+ seconds with no output)
13. HITL is auto-approve pass-through (placeholder, not real)
14. Only processes documents[0] — no multi-document support
15. RAG collections exist in DB but no specialist queries them
16. Module doesn't register LegalIntelligenceService as a provider
17. Dual entry points (controller REST endpoints + invoke capability) — keep the controller for external clients but ensure it delegates to the same code path as invoke. Future workflows should ONLY build the invoke capability; REST wrappers only if/when an external client needs one.
18. No input size limits — large documents blow token limits without chunking

## Desired Outcome
- All 4 critical violations fixed (errors propagate, no silent fallbacks)
- Shared utilities extracted (DRY across 8 specialists)
- Dead code removed (single-agent paths if multi-agent is the only mode)
- Efficiency issues resolved (no wasted LLM calls, sensible progress tracking)
- Missing functionality documented as future effort items (or implemented if time permits)
- All existing tests still pass
- Build passes with no new lint errors

## Out of Scope
- New legal workflows (those are separate future efforts)
- Frontend redesign (only fix what breaks from backend changes)
- Production HITL with LangGraph interrupt() (separate effort, but document what's needed)
