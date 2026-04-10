# Document Onboarding — Status

## Working
- Full pipeline: metadata extraction → CLO routing → specialists → synthesis → HITL → report
- Stage ladder shows live progress via presentation manifest
- HITL review modal with approve/reject/modify
- Multi-document support
- PDF, DOCX, image (vision/OCR), text support
- 8 specialist agents (contract, compliance, IP, privacy, employment, corporate, litigation, real estate)
- Model config per capability role (workhorse/thinking) via DB

## Needs Attention
- **RAG enrichment**: plumbing exists (`queryCollectionForContext`) but no collections populated. Specialists run without reference material.
- **In-row ticker**: shows "Working..." during processing instead of stage names. Presentation manifest rules match for the detail modal but the ticker needs the SSE stream to be connected.
- **Metadata extraction observability**: events emitted but not all matched by presentation rules for the ticker.

## Not Started
- Template library for common document types
- Clause-level RAG comparison against firm precedents
- Export to DOCX/PDF
