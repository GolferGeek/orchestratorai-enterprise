---
id: 0141cd57
product: compose
severity: P1
status: open
type: coverage-gap
file: apps/compose/api/src/invoke/invoke.controller.ts
test: "GET /invoke/conversations/:conversationId/messages endpoint untested"
verify-command: "cd apps/compose/api && npx jest --testPathPattern='invoke.controller' --testNamePattern='getConversationMessages' 2>&1 | tail -20"
assigned-agent: compose-test-agent
found-date: 2026-04-18
triaged-date:
fixed-date:
verified-date:
regression-lock:
---

## Issue

`InvokeController.getConversationMessages` (GET /invoke/conversations/:conversationId/messages) is completely untested. This method contains complex inline JSON parsing logic for both `metadata` (string or object) and `attachments` (string JSON or array). The try/catch swallowing for JSON.parse errors on metadata is a silent failure scenario that needs explicit coverage.

## Evidence

Coverage report — lines 137–200 uncovered:
```
invoke.controller.ts | 36.9 | 17.24 | 18.18 | 35.36 | 83,93-96,115-116,137-200,211-225,294-345
```

Lines 137–200 include: DB query, error throw, row mapping with metadata/attachment JSON parsing, and fallback handling.

## Failing Test / Missing Test

Missing tests needed:
1. Happy path — returns message array with mapped fields
2. DB error — throws error (error propagates, not swallowed)
3. Metadata as string — parsed to object
4. Metadata as object — passed through as-is
5. Attachments as JSON string — parsed
6. Attachments as array — passed through

## Verify Command

```bash
cd apps/compose/api && npx jest --testPathPattern='invoke.controller' --testNamePattern='getConversationMessages' 2>&1 | tail -20
```
