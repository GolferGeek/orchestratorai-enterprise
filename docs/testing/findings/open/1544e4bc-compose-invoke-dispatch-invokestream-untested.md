---
id: 1544e4bc
product: compose
severity: P1
status: open
type: coverage-gap
file: apps/compose/api/src/invoke/invoke-dispatch.service.ts
test: "InvokeDispatchService.invokeStream — no tests at all"
verify-command: "cd apps/compose/api && npx jest --testPathPattern='invoke-dispatch.service' --testNamePattern='invokeStream' 2>&1 | tail -20"
assigned-agent: compose-test-agent
found-date: 2026-04-18
triaged-date:
fixed-date:
verified-date:
regression-lock:
---

## Issue

`InvokeDispatchService.invokeStream` (lines 257–311) has zero test coverage. This method handles the entire streaming dispatch path including: the sync-fallback path when a runner has no `invokeStream` method (sends output + completed events then calls `res.end()`), and the delegate path when the runner supports streaming. Lines 264–303 are uncovered.

## Evidence

```
invoke-dispatch.service.ts | 66.66 | 37.93 | 62.5 | 65.67 | 93,125-126,141,163,175,223,264-303
```

Lines 264–303 = entire `invokeStream` body.

## Failing Test / Missing Test

Missing tests in `apps/compose/api/src/invoke/invoke-dispatch.service.spec.ts`:

```typescript
describe('invokeStream', () => {
  it('delegates to runner.invokeStream when the runner supports streaming', async () => { ... });
  it('falls back to sync invoke and writes output+completed SSE events when runner has no invokeStream', async () => { ... });
  it('throws when agent definition not found', async () => { ... });
  it('throws when no runner for the agent family', async () => { ... });
});
```

## Verify Command

```bash
cd apps/compose/api && npx jest --testPathPattern='invoke-dispatch.service' --testNamePattern='invokeStream' 2>&1 | tail -20
```
