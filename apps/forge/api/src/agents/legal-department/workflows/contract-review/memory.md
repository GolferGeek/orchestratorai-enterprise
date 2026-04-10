# Contract Review & Redlining — Memory

Learnings, patterns, and institutional knowledge accumulated through building and running this workflow.

## Domain Insights

- Indemnification clauses and term length are the two highest-signal risk indicators in NDAs — they should always be flagged regardless of specialist routing
- "Unlimited indemnification" is almost always a critical finding — lawyers expect it to be called out prominently
- Perpetual confidentiality obligations are common in tech NDAs but unusual in commercial agreements — context matters for risk scoring
- Governing law and jurisdiction are often the first thing a lawyer looks for after the parties section

## Technical Learnings

- Clause segmentation quality depends heavily on document formatting. Well-structured contracts (numbered sections, clear clause boundaries) segment cleanly. Poorly formatted scanned PDFs produce section-level fallbacks
- gemma4:e4b handles clause segmentation well for contracts under 30K characters. Larger contracts trigger the chunked approach, which can produce clauseId collisions if the re-numbering logic isn't careful
- The contract-review graph skips the echo node — goes straight from start to CLO routing. This saves one LLM call compared to document-onboarding
- Model resolution was hardcoded to document-onboarding capability config — fixed to fall through to ExecutionContext.model so each workflow uses its own config
- The specialists produce ClauseAnnotation[] which is a different shape than the document-onboarding specialist outputs (ContractAnalysisOutput, etc.). The specialistOutputs type union accommodates both via `as unknown`

## Architecture Decisions

- **Separate workflow codebases**: Each workflow gets its own directory under workflows/ with its own graph, nodes, and brief. This was chosen over mode branches in existing nodes to scale to 11 planned legal workflows
- **Factory pattern for specialists**: All 8 contract-review specialists are generated from a config array in one file. They differ only in their domain prompt
- **Shared CLO routing**: The contract-review graph reuses the document-onboarding CLO routing node. It determines which specialists to invoke regardless of the output format

## User Patterns

- Attorneys want to see the redline (original vs. suggested) side-by-side, not in separate views
- "Flagged only" filtering is essential for large contracts — showing all 50+ clauses when only 6 are flagged is overwhelming
- The "Approve All" shortcut is used when the attorney trusts the analysis and wants to move fast

## What Needs Improvement

- Specialist stage activation in the presentation manifest — the walker doesn't promote specialist stages because the contract-review step names differ from document-onboarding
- RedlineViewer component needs end-to-end browser testing with real HITL data
- RAG enrichment would be especially valuable here — comparing clauses against a library of "approved" clauses from the firm's own contracts
