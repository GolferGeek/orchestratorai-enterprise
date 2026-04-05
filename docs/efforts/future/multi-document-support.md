# Future Effort: Multi-Document Support for Legal Department

## Current State
The workflow only processes `documents[0]` — the first document in the array. The `getDocumentText()` utility in `specialist-utils.ts` returns `state.documents[0]!.content`. If multiple documents are uploaded, only the first is analyzed.

## What's Needed
- Process all documents in the array, not just the first
- Each document should get its own metadata extraction via LegalIntelligenceService
- CLO routing should consider all documents' types when determining specialist routing
- Specialists should receive context from all documents (or the most relevant one)
- The synthesis node should cross-reference findings across documents
- Report generation should cover all documents

## Dependencies
- Changes to `getDocumentText()` in specialist-utils.ts
- Changes to the capability handler's document processing loop
- Potential token limit management (see input-size-limits effort)

## Estimated Scope
Large — touches the full pipeline from capability handler through all nodes.
