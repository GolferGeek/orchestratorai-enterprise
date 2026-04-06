# PRD: Harden the Legal Department Analyst

## Summary

The legal department analyst is an existing ~99-file LangGraph workflow in Forge that routes legal documents through 8 specialist agents, synthesizes their analysis, and generates reports. It was built by an intern and functions end-to-end, but contains 4 critical CLAUDE.md violations (silent fallbacks masking errors), 4 instances of copy-pasted code across all 8 specialists, 3 efficiency problems (wasted LLM calls, broken progress tracking), and 7 missing functionality gaps. This effort hardens the foundation before a 12-day legal workflow development sprint builds on top of it.

## Goals

### Critical Fixes

1. **Remove all silent fallback code from specialist nodes** — Delete `createFallbackAnalysis()` from all 8 specialist nodes. When LLM JSON parsing fails, the node must set `status: 'failed'` and `error` with the parse error message. No fake `confidence: 0.5` results.
   - *AC: Each specialist node has zero fallback/fake-result code paths. A malformed LLM response causes the workflow to enter `handle_error` state with a descriptive error message.*

2. **Remove minimalMetadata() fallback from LegalIntelligenceService** — When the LLM call or JSON parsing fails in `extractMetadata()`, throw the error instead of returning fake metadata.
   - *AC: `legal-intelligence.service.ts` has no `minimalMetadata()` function. LLM failures propagate to the capability handler, which propagates to the invoke response with `success: false`.*

3. **Remove PDF extraction fallbacks from capability handler** — When `pdf-parse` fails, throw. No base64 decode fallback, no placeholder string.
   - *AC: `extractPdfText()` either returns extracted text or throws. `extractDocumentText()` has exactly one code path per document type (PDF or text), no fallback chains.*

4. **Fix CLO routing error propagation** — Remove the catch block that silently defaults to contract specialist. Let routing errors set `status: 'failed'`.
   - *AC: `clo-routing.node.ts` error handler returns `{ error: ..., status: 'failed' }` instead of a fake routing decision.*

### Consistency Fixes

5. **Extract shared specialist utilities** — Create a shared module with `getDocumentText()`, `stripMarkdownFences()` (the JSON parsing preamble), and `buildBaseUserMessage()` used by all 8 specialists.
   - *AC: A single `specialist-utils.ts` file exists. Each specialist imports these functions instead of defining their own. No duplicate `getDocumentText()` definitions across the codebase.*

6. **Remove dead single-agent code paths** — Since `multiAgent` is hardcoded to `true`, remove the single-agent conditional edges from the graph (the 8 individual specialist -> hitl_checkpoint edges) and the single-agent routing branch in CLO routing.
   - *AC: The graph has no direct edges from individual specialist nodes. All specialist execution goes through orchestrator -> synthesis. The `clo_routing` conditional edges route to either `orchestrator` or `handle_error`, nothing else.*

### Efficiency Fixes

7. **Fix orchestrator to not re-create specialist closures** — Pass the specialist node functions into the orchestrator instead of having it create new instances.
   - *AC: `createOrchestratorNode()` accepts a map of specialist functions as a parameter. No `createXxxAgentNode()` calls inside the orchestrator file.*

8. **Remove wasteful echo LLM call in document flow** — When documents + metadata are present, echo should pass through without calling the LLM. The LLM call is only needed for chat-only mode (no documents).
   - *AC: Echo node skips LLM call when `state.documents.length > 0 && state.legalMetadata` is truthy. It still formats metadata for downstream context.*

9. **Fix progress percentages** — Assign non-overlapping progress ranges: start (0-10), echo (10-20), routing (20-30), specialists (30-70), synthesis (70-80), HITL (80-85), report (85-95), complete (95-100).
   - *AC: No two nodes emit the same progress percentage. Progress values are monotonically increasing across the workflow.*

### Infrastructure Fixes

10. **Align controller with invoke capability** — Ensure the controller's `/legal-department/process` endpoint delegates through the same `LegalDepartmentService.process()` path that the invoke capability uses, with no divergent behavior.
    - *AC: Controller and capability handler call the same service method with the same input shape. No logic in the controller that doesn't exist in the capability path.*

11. **Fix module provider registration** — Register `LegalIntelligenceService` in the appropriate module so DI resolves correctly.
    - *AC: `LegalIntelligenceService` is in the providers array of a module that the capability handler's module imports.*

### RAG Integration

12. **Wire RAG collections into specialist agents** — Each specialist queries the relevant RAG collection(s) before making its LLM call. Add a shared `queryCollectionForContext()` utility. Map collections to specialists:
    - `law-firm-policies-attributed` -> compliance, corporate
    - `law-contracts-hybrid` -> contract, employment
    - `law-litigation-cross-reference` -> litigation
    - `law-client-intake-temporal` -> general routing context
    - `law-estate-planning-attributed` -> real estate, corporate
    - Privacy and IP specialists query contracts + policies collections
    - *AC: Each specialist's LLM prompt includes relevant RAG results when the collection has matching content. A shared `queryCollectionForContext()` function exists in `specialist-utils.ts`. If a collection is empty, the specialist proceeds without RAG context (no error, just no enrichment).*

## Non-Goals

- New legal workflows (NDA generator, research assistant, etc.) — separate future efforts
- Frontend redesign — only fix what breaks from backend changes
- Production HITL with LangGraph `interrupt()` — separate effort (document what's needed in a future effort file)
- Streaming support — separate effort (document what's needed)
- Multi-document support — separate effort
- Input size limits / document chunking — separate effort

## Success Criteria

- `npm run build` passes for `apps/forge/api` with zero errors
- `npm run lint` passes for `apps/forge/api` with zero new warnings
- All existing unit tests pass (updated where they tested fallback behavior)
- A malformed LLM response in any specialist results in a failed workflow with descriptive error, not a fake analysis
- A failed PDF extraction results in a failed invoke response, not a placeholder
- No function named `createFallbackAnalysis`, `minimalMetadata`, or `createFallback*` exists in the codebase
- No duplicate `getDocumentText()` functions across specialist nodes
- Graph compilation succeeds with the simplified edge structure
- Specialists include RAG context in LLM prompts when collection data is available

## Test Expectations

Backend-only changes. Test coverage should verify:

1. **Specialist error propagation** — Unit tests for each specialist node: when LLM returns unparseable JSON, node returns `{ error: ..., status: 'failed' }`.
2. **LegalIntelligenceService error propagation** — When LLM call throws, `extractMetadata()` throws (not returns minimal).
3. **PDF extraction error propagation** — When pdf-parse throws, `extractPdfText()` throws.
4. **CLO routing error propagation** — When routing logic throws, node returns failed state.
5. **Orchestrator with injected specialists** — Orchestrator receives specialist map, invokes correct specialists.
6. **Echo node skip** — When documents + metadata present, no LLM call made.
7. **Progress monotonicity** — Integration test verifying emitted progress values are strictly increasing.
8. **RAG integration** — Specialist includes RAG results in prompt when collection returns matches; proceeds without RAG context when collection is empty.

## Intention Cross-Check

| Intention Item | PRD Goal | Status |
|---|---|---|
| #1 Fallback in specialists | Goal 1 | Covered |
| #2 minimalMetadata | Goal 2 | Covered |
| #3 PDF triple fallback | Goal 3 | Covered |
| #4 CLO routing error | Goal 4 | Covered |
| #5 Duplicated getDocumentText | Goal 5 | Covered |
| #6 Duplicated JSON parsing | Goal 5 | Covered |
| #7 Duplicated buildUserMessage | Goal 5 | Covered |
| #8 multiAgent hardcoded true | Goal 6 | Covered |
| #9 Orchestrator re-creates closures | Goal 7 | Covered |
| #10 Echo wastes LLM call | Goal 8 | Covered |
| #11 Progress percentages | Goal 9 | Covered |
| #12 No streaming | Non-goal | Documented |
| #13 HITL placeholder | Non-goal | Documented |
| #14 No multi-document | Non-goal | Documented |
| #15 RAG unused | Goal 12 | Covered |
| #16 Module registration | Goal 11 | Covered |
| #17 Dual entry points | Goal 10 | Covered |
| #18 No input size limits | Non-goal | Documented |

All 18 intention items accounted for. No orphan goals.

## Extension Points (for future workflows)

The hardened legal department establishes patterns that future legal workflows should follow:

- **New specialists** — Add a new node file following the same pattern: import shared utils, define output interface, single LLM call with structured JSON, map to relevant RAG collection(s). Register in the orchestrator's specialist map and the CLO routing's document-type mapping.
- **New workflow types** — NDA Generator, Research Assistant, etc. should be separate LangGraph graphs in `agents/legal-{name}/`, each registered as its own invoke capability. They can import and reuse the specialist nodes as building blocks.
- **RAG collection growth** — As more legal reference material is ingested, specialists automatically benefit. New collections can be mapped to specialists via the collection-to-specialist mapping in `specialist-utils.ts`.
- **Invoke-only entry** — Future workflows build only the invoke capability. REST controllers are added later only if an external client specifically needs one.
- **HITL production path** — When ready, replace the auto-approve checkpoint with LangGraph `interrupt()`. The graph structure already has the node in the right position; only the node internals change.
