# Document Onboarding — What It Does

## Purpose

Document Onboarding is the foundation workflow — it takes any legal document (or up to 10), runs it through 8 parallel specialist agents, and produces a structured analysis with risk matrix, extracted entities, and key findings. All other document-based workflows build on top of this pattern.

**When shared components are broken, test Document Onboarding first.** It exercises every shared component: StageLadder, LegalJobReviewModal, SSE stream, JobActivityList, DocumentAnalysisReviewSection. If this works, the shared infrastructure is healthy.

## What Makes It the Foundation

Document Onboarding is the canonical reference implementation. Every other workflow (Contract Review, Due Diligence, Compliance Audit) inherits its patterns:
- Same `OnboardDocumentModal` for file upload
- Same StageLadder for stage progress
- Same `LegalJobReviewModal` → `DocumentAnalysisReviewSection` for HITL
- Same SSE stream endpoint pattern

## Key Features

1. **Multi-format support** — PDF, DOCX, TXT, MD, JSON, CSV, PPTX, images, GIF (up to 10 files)
2. **Automatic document classification** — determines document type and routes to appropriate specialists
3. **8 parallel specialist agents** — each analyzes a different dimension (parties, dates, signatures, risk, compliance, financial terms, IP, obligations)
4. **Metadata extraction** — parties, dates, signatures, key clauses
5. **Cross-specialist synthesis** — synthesizes findings into a coherent analysis
6. **HITL review gate** — approve/reject/modify the analysis
7. **Markdown report with risk matrix** — professional output ready for client delivery
8. **RAG enrichment** — citations labeled against firm knowledge base

## Output

`JobDetailModal` with three sections:
- **Source** — original document viewer or extracted text
- **Events** — processing pipeline stages via StageLadder
- **Structured Output** — classified findings, entities, key facts

## Testing Value

Because this is the reference workflow, testing it validates:
- File upload works
- Worker picks up queued jobs
- LangGraph graph executes nodes in sequence
- SSE stream emits events
- HITL modal opens with content
- Completed jobs show results

Any regression here implies a systemic issue affecting all document-based workflows.
