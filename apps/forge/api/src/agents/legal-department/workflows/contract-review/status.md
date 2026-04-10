# Contract Review & Redlining — Status

## Working
- Full pipeline: metadata → clause segmentation → CLO routing → specialists → synthesis → HITL → report
- Separate workflow codebase under workflows/contract-review/
- Clause segmentation produces ClauseMap with per-clause entries
- Specialists produce ClauseAnnotation[] per clause
- Synthesis merges into RedlineOutput with risk breakdown
- HITL pauses for per-clause accept/reject/modify decisions
- Partial re-run on rejection (only rejected clauses re-analyzed)
- Stage ladder: metadata, segmentation, classify, synthesize, HITL, report stages all work
- Contract Review page with nav entry and Benefits button
- Model resolution uses gemma4:e4b correctly (not hardcoded to document-onboarding)

## Needs Attention
- **Specialist stages in stage ladder**: don't activate visually (activator step names need tuning — the specialist events emit but the walker doesn't promote the conditional stages)
- **RedlineViewer**: component built but not yet tested end-to-end in the HITL review modal
- **RAG enrichment**: same gap as document onboarding — no collections populated
- **In-row ticker**: shows "Working..." during processing (same issue as document onboarding)

## Not Started
- DOCX/PDF export of redlined contract
- Template library for common contract types (NDA, MSA, employment)
- Clause-level RAG comparison against firm precedents
- Multi-party contract support
- Negotiation tracking across redline rounds
