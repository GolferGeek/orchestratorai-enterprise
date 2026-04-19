---
id: 4fc9270b
product: compose
severity: P2
status: open
type: coverage-gap
file: apps/compose/api/src/invoke/invoke.controller.ts
test: "DELETE /invoke/conversations/:conversationId endpoint untested"
verify-command: "cd apps/compose/api && npx jest --testPathPattern='invoke.controller' --testNamePattern='deleteConversation' 2>&1 | tail -20"
assigned-agent: compose-test-agent
found-date: 2026-04-18
triaged-date:
fixed-date:
verified-date:
regression-lock:
---

## Issue

`InvokeController.deleteConversation` (DELETE /invoke/conversations/:conversationId) is untested. Lines 211–225 are uncovered. While simpler than the messages endpoint, the DB delete + error propagation path is unverified. Note: cascade deletes messages — this is relied on by frontend and is a destructive operation.

## Evidence

```
invoke.controller.ts | 36.9 | 17.24 | 18.18 | 35.36 | 83,93-96,115-116,137-200,211-225,294-345
```

## Failing Test / Missing Test

1. Happy path — returns `{ deleted: true }` 
2. DB error — throws (not swallowed)

## Verify Command

```bash
cd apps/compose/api && npx jest --testPathPattern='invoke.controller' --testNamePattern='deleteConversation' 2>&1 | tail -20
```
