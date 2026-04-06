# Legal Department Analyst — Hardening

## Goal
Review and fix the existing legal department LangGraph workflow for completeness, consistency, efficiency, proper coding techniques, and missing functionality.

## Issues Found (18)

### Critical (CLAUDE.md violations)
1. [ ] `createFallbackAnalysis()` in all 8 specialist nodes — violates NO FALLBACKS rule
2. [ ] `minimalMetadata()` in legal-intelligence.service.ts — masks LLM failures
3. [ ] PDF extraction triple fallback in legal-department.capability.ts
4. [ ] CLO routing error handler silently defaults to contract specialist

### Consistency
5. [ ] Duplicated `getDocumentText()` across all 8 specialist nodes
6. [ ] Duplicated JSON parsing/markdown-stripping logic across all 8 nodes
7. [ ] Duplicated `buildUserMessage()` across all 8 nodes
8. [ ] `multiAgent` hardcoded to `true` — single-agent paths are dead code

### Efficiency
9. [ ] Orchestrator re-creates all 8 specialist closures on every call
10. [ ] Echo node makes wasteful LLM call in document analysis flow
11. [ ] Progress percentages don't compose (multiple nodes claim same %)

### Missing
12. [ ] No streaming support (10+ LLM calls, 60+ second workflows)
13. [ ] HITL is auto-approve pass-through (placeholder)
14. [ ] Only processes documents[0] — no multi-document support
15. [ ] RAG collections exist in DB but no specialist queries them
16. [ ] Module doesn't register LegalIntelligenceService
17. [ ] Dual entry points (controller REST + invoke capability)
18. [ ] No input size limits — large docs blow token limits

## Approach
Fix in priority order: critical > consistency > efficiency > missing.
Missing items 12-18 get documented as future effort items if not completed today.
