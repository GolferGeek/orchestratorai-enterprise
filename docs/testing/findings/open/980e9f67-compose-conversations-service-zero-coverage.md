---
id: 980e9f67
product: compose
severity: P1
status: open
type: coverage-gap
file: apps/compose/api/src/invoke/conversations.service.ts
test: "ConversationsService.fetchForUser — no tests exist"
verify-command: "cd apps/compose/api && npx jest --testPathPattern='conversations' 2>&1 | tail -20"
assigned-agent: compose-test-agent
found-date: 2026-04-18
triaged-date:
fixed-date:
verified-date:
regression-lock:
---

## Issue

`ConversationsService.fetchForUser` has **0% function coverage**. No test file exists for this service. This is a critical data-access path: the conversations sidebar nav depends on `GET /invoke/conversations`, which calls `fetchForUser` directly. An untested DB query with custom field mapping (`agent_name` → `agentName`, snake_case → camelCase) is a silent breakage risk.

## Evidence

Coverage report:
```
conversations.service.ts | 33.33 | 0 | 0 | 23.07 | 24-54
```

Lines 24–54 are the entire `fetchForUser` method body — the constructor and property declarations account for the 33% statements hit. No `*.spec.ts` file exists for `conversations.service.ts`.

## Failing Test / Missing Test

No test file exists. Need to create:
`apps/compose/api/src/invoke/conversations.service.spec.ts`

Test cases needed:
1. Happy path — returns mapped ConversationRecord array
2. DB error — throws with message
3. Empty result — returns empty array
4. Partial row fields — defaults applied (`agentType: 'context'`, `organizationSlug: 'global'`, etc.)

## Verify Command

```bash
cd apps/compose/api && npx jest --testPathPattern='conversations.service' 2>&1 | tail -20
```
