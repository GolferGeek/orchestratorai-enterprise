---
id: {8-char-hash}
product: compose|forge
severity: P0|P1|P2|P3
status: open|triaged|in-fix|needs-verify|closed
type: test-failure|coverage-gap|contract-violation|error-suppression
file: apps/{product}/api/src/{path-to-file}.ts
test: "{exact test name or describe block}"
verify-command: "cd apps/{product}/api && npx jest {path} --testNamePattern '{pattern}' 2>&1 | tail -20"
assigned-agent: forge-product-agent|compose-product-agent|general-purpose
found-date: YYYY-MM-DD
triaged-date: 
fixed-date: 
verified-date: 
regression-lock: 
---

## Issue

{Clear 1-2 sentence description of what is wrong or missing. Focus on WHY it matters, not just what failed.}

## Evidence

```
{Paste the exact test output, error message, or coverage gap that surfaced this finding}
```

## Failing Test / Missing Test

```typescript
{
  If test-failure: paste the failing test or the test name
  If coverage-gap: describe what scenario is not covered and sketch the test that should exist
}
```

## Verify Command

Run this exact command to confirm the fix works:

```bash
{verify-command from frontmatter — copy it here for easy access}
```

## Root Cause

{Leave blank until triage or fix agent fills this in}

## Fix Applied

{Leave blank until fix agent fills this in — what changed and why}

## Closed Notes

{Leave blank until verify agent closes — regression lock confirmation}
