---
id: 928eef1b
product: compose
severity: P1
status: open
type: coverage-gap
file: apps/compose/api/src/invoke/runners/context-family.runner.ts
test: "ContextFamilyRunner multimodal image attachment path (generateResponse) untested"
verify-command: "cd apps/compose/api && npx jest --testPathPattern='context-family.runner' --testNamePattern='image' 2>&1 | tail -20"
assigned-agent: compose-test-agent
found-date: 2026-04-18
triaged-date:
fixed-date:
verified-date:
regression-lock:
---

## Issue

The `ContextFamilyRunner` has two LLM call paths: text-only (uses `generateUnifiedResponse`) and vision/multimodal (uses `generateResponse` when image attachments are present). The vision path — lines 84–106 — is entirely untested. This is a product feature (image+document analysis in chat) with no coverage.

The runner's `extractAttachments`, `buildUserMessageWithDocuments`, and `extractDocumentText` private methods are also untested because they are only exercised via the attachment paths.

## Evidence

```
context-family.runner.ts | 59.21 | 47.82 | 66.66 | 58.1 | 70,73,86-101,157-165,175-177,196-243,260,271
```

Lines 86–101 = vision branch in `invoke`. Lines 196–243 = `buildUserMessageWithDocuments` + `extractDocumentText`.

## Failing Test / Missing Test

Missing tests:
1. Image attachment path — `generateResponse` called with `images` array
2. PDF document attachment — `pdfExtractor.extractText` called, text prepended
3. DOCX document attachment — `docxExtractor.extractText` called
4. Plain text attachment — `textExtractor.extractText` called
5. Unsupported MIME type — throws with descriptive error
6. Mixed image + document — both paths exercised

## Verify Command

```bash
cd apps/compose/api && npx jest --testPathPattern='context-family.runner' --testNamePattern='image' 2>&1 | tail -20
```
