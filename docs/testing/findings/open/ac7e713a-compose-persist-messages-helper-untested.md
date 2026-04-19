---
id: ac7e713a
product: compose
severity: P2
status: open
type: coverage-gap
file: apps/compose/api/src/invoke/invoke-dispatch.service.ts
test: "InvokeDispatchService.persistMessages — DB insert error paths untested"
verify-command: "cd apps/compose/api && npx jest --testPathPattern='invoke-dispatch.service' --testNamePattern='persist' 2>&1 | tail -20"
assigned-agent: compose-test-agent
found-date: 2026-04-18
triaged-date:
fixed-date:
verified-date:
regression-lock:
---

## Issue

`InvokeDispatchService.persistMessages` (lines 104–179) is a private method but has significant DB logic: user message insert, assistant message insert, and `last_active_at` update. All three have error throw paths. Coverage shows lines 125–126, 141, 163, 175 as uncovered — these are the error throw lines inside `persistMessages`. 

Critically, `persistMessages` is called via `.catch()` from `invoke` (fire-and-forget), so its failures are logged as warnings and don't propagate. The test needs to verify that persistence failures do NOT break the invoke response.

## Evidence

```
invoke-dispatch.service.ts | 66.66 | 37.93 | 62.5 | 65.67 | 93,125-126,141,163,175,223,264-303
```

Lines 125–126 = user insert error throw. Line 141 = assistant insert error throw. Line 163 = update error throw.

## Failing Test / Missing Test

Missing tests:
1. User message DB insert fails — invoke still returns output (not thrown)
2. Assistant message DB insert fails — invoke still returns output
3. Conversation update fails — invoke still returns output
4. Attachment metadata correctly stripped to `{filename, mimeType}` (no base64)

## Verify Command

```bash
cd apps/compose/api && npx jest --testPathPattern='invoke-dispatch.service' --testNamePattern='persist' 2>&1 | tail -20
```
