---
id: 3c8e61c6
product: compose
severity: P1
status: open
type: coverage-gap
file: apps/compose/api/src/invoke/invoke.controller.ts
test: "POST /invoke/stream SSE streaming endpoint has no tests"
verify-command: "cd apps/compose/api && npx jest --testPathPattern='invoke.controller' --testNamePattern='invokeStream' 2>&1 | tail -20"
assigned-agent: compose-test-agent
found-date: 2026-04-18
triaged-date:
fixed-date:
verified-date:
regression-lock:
---

## Issue

`InvokeController.invokeStream` (POST /invoke/stream) is entirely untested. The method handles SSE header setup, keepalive interval, error event emission, and delegates to `dispatch.invokeStream`. Lines 294–345 are all uncovered. This is a primary product entry point for all streaming agent invocations.

## Evidence

Coverage report:
```
invoke.controller.ts | 36.9 | 17.24 | 18.18 | 35.36 | 83,93-96,115-116,137-200,211-225,294-345
```

Lines 294–345 are the entire `invokeStream` method. The existing spec file only covers `invoke` (POST /invoke), `listProvidersAndModels`, and the missing-params guard.

## Failing Test / Missing Test

Missing tests in `apps/compose/api/src/invoke/invoke.controller.spec.ts`:

```typescript
describe('invokeStream', () => {
  it('sets SSE headers and delegates to dispatch.invokeStream', async () => { ... });
  it('sends error SSE event when dispatch throws', async () => { ... });
  it('returns 400 when params are missing', async () => { ... });
});
```

## Verify Command

```bash
cd apps/compose/api && npx jest --testPathPattern='invoke.controller' --testNamePattern='invokeStream' 2>&1 | tail -20
```
