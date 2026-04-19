---
name: testing-team-skill
description: Testing team workflow — finding file format, folder protocol, deduplication algorithm, severity rules, regression lock. Use in all testing team agents (compose-test-agent, forge-test-agent, test-triage-agent, test-verify-agent).
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Testing Team Skill

Shared knowledge for all testing team agents. Covers the finding lifecycle, file format, deduplication, severity, and the full workflow from discovery to closure.

## Folder Structure

```
docs/testing/
  TEAM.md                    ← Team brief, roster, full workflow
  findings/
    open/                    ← Testers drop new findings here
    triaged/                 ← Triage assessed, severity + owner assigned
    in-fix/                  ← Fix agent actively working
    needs-verify/            ← Fix done, verify-command must pass
    closed/                  ← Verified fixed, regression-locked
    TEMPLATE.md              ← Finding file template
  reports/
    {date}-compose.md        ← Daily Compose test run summaries
    {date}-forge.md          ← Daily Forge test run summaries
    triage-{date}.md         ← Triage run summaries
    verify-{date}.md         ← Verification run summaries
```

## Finding File Format

**Naming**: `{8-char-hash}-{product}-{short-slug}.md`

The 8-char hash is the deduplication key. Compute it as:
```
sha1("{product}:{relative-file-path}:{test-name}") | head -c 8
```

In bash:
```bash
echo -n "forge:apps/forge/api/src/agents/legal-department/jobs/legal-jobs-worker.service.ts:detects HITL interrupt" | shasum | cut -c1-8
```

If a test name is not available (coverage gap), use the file path + description:
```bash
echo -n "forge:apps/forge/api/src/agents/legal-department/jobs/legal-jobs-worker.service.ts:coverage-gap-cancel-detection" | shasum | cut -c1-8
```

**Finding frontmatter fields**:

```yaml
---
id: {8-char-hash}
product: compose|forge
severity: P0|P1|P2|P3
status: open|triaged|in-fix|needs-verify|closed
type: test-failure|coverage-gap|contract-violation|error-suppression|regression
file: apps/{product}/api/src/{path}.ts
test: "{exact test describe block > test name, or description for coverage gaps}"
verify-command: "cd apps/{product}/api && npx jest {path-pattern} --testNamePattern '{name}' 2>&1 | tail -20"
assigned-agent: forge-product-agent|compose-test-agent|forge-test-agent|general-purpose
found-date: YYYY-MM-DD
triaged-date: YYYY-MM-DD (blank until triaged)
fixed-date: YYYY-MM-DD (blank until fixed)
verified-date: YYYY-MM-DD (blank until verified)
regression-lock: {test-file}:{test-name} (blank until closed)
---
```

## Finding Types

| Type | Meaning |
|------|---------|
| `test-failure` | An existing test is actively failing |
| `coverage-gap` | A code path exists but has no test |
| `contract-violation` | Response shape doesn't match JSON-RPC 2.0 |
| `error-suppression` | Error is caught and swallowed instead of propagated |
| `regression` | A previously-closed finding re-appeared |
| `browser-failure` | A user flow fails or errors in Chrome |
| `browser-blank-screen` | Page renders blank or white in Chrome |
| `browser-hitl-broken` | HITL review modal missing or non-functional |
| `browser-sse-broken` | SSE progress stream not updating in UI |
| `browser-console-error` | Unhandled JS error detected in browser console |

## Severity Definitions

**P0 — Fix today**:
- Active test failure (not just missing test)
- HITL flow broken (interrupt not detected, resume not triggered)
- Worker poll loop not functioning
- Transport contract violation
- Any regression (was closed, now re-opened)
- Forge Tier 1 coverage gap (legal-department core: service, worker, repo, controller, graph)

**P1 — Fix this session**:
- Critical path untested (invoke dispatch, runner routing, job status transitions)
- Error propagation untested on critical path
- ExecutionContext not verified flowing correctly
- SSE stream shape untested

**P2 — Queue for next session**:
- Edge case coverage gaps (missing config, empty results, partial state)
- Non-critical module coverage under 80%
- Secondary agent coverage gaps (marketing-swarm, data-analyst, etc.)

**P3 — Backlog**:
- Existing test could have stronger assertions
- Test naming or structure improvements
- Nice-to-have additional scenarios

## Deduplication Algorithm

Each agent that drops findings MUST compute the hash before writing:

```bash
HASH=$(echo -n "{product}:{file}:{test}" | shasum | cut -c1-8)
FILENAME="${HASH}-{product}-{short-slug}.md"
```

Before writing to `open/`, check if the hash exists anywhere:
```bash
ls docs/testing/findings/*/  | grep "^${HASH}-"
```

- If found in `open/`, `triaged/`, `in-fix/`, or `needs-verify/` → skip (already tracked)
- If found in `closed/` → this is a **regression** → write to `open/` with type `regression`, severity P0, note "REGRESSION: was closed on {closed finding's verified-date}"
- If not found → write normally

## Verify Command Construction

The verify command must:
1. `cd` to the product API directory
2. Run `npx jest` with the specific test path
3. Use `--testNamePattern` to target the exact failing test
4. Pipe through `tail -20` for readable output

Examples:

```bash
# Test failure in worker
cd apps/forge/api && npx jest agents/legal-department/jobs/legal-jobs-worker --testNamePattern 'detects HITL interrupt' 2>&1 | tail -20

# Coverage gap — verify new test passes
cd apps/forge/api && npx jest agents/legal-department/jobs/legal-jobs-worker --testNamePattern 'honors cancel_requested' 2>&1 | tail -20

# Compose runner
cd apps/compose/api && npx jest invoke/runners/context-family --testNamePattern 'passes ExecutionContext whole' 2>&1 | tail -20

# Transport contract
cd apps/forge/api && npx jest invoke/invoke.controller --testNamePattern 'returns JSON-RPC 2.0 shape' 2>&1 | tail -20
```

## Status Transition Rules

```
open → triaged       (triage-agent: assessed, not P0)
open → in-fix        (triage-agent: P0, immediate)
triaged → in-fix     (fix agent picks up)
in-fix → needs-verify (fix agent: work complete)
needs-verify → closed (verify-agent: test passes, committed)
needs-verify → open  (verify-agent: test still fails)
closed → open        (regression: same id re-appears in open/)
```

Only the designated agent for each step makes the move. Testers only write to `open/`. Triage only reads `open/` and writes to `triaged/` or `in-fix/`. Verify only reads `needs-verify/` and writes to `closed/` or `open/`.

## Report Naming Convention

| Agent | Report Pattern |
|-------|---------------|
| compose-test-agent | `docs/testing/reports/{YYYY-MM-DD}-compose.md` |
| forge-test-agent | `docs/testing/reports/{YYYY-MM-DD}-forge.md` |
| test-triage-agent | `docs/testing/reports/triage-{YYYY-MM-DD}.md` |
| test-verify-agent | `docs/testing/reports/verify-{YYYY-MM-DD}.md` |

## Regression Lock

A finding is not truly closed until:
1. The `verify-command` passes
2. The test file is tracked in git (`git status` shows no untracked/modified for that file)
3. The `regression-lock` field is set: `{relative-test-file}:{test-name}`

This field is the machine-readable proof that the fix is permanent. Future triage agents check this when they see a re-appearing hash.

## Quick Reference: Which Agent Does What

| Task | Agent |
|------|-------|
| Run Compose tests, find gaps, write tests | `compose-test-agent` |
| Run Forge tests, find gaps, write tests | `forge-test-agent` |
| Assess severity, assign ownership, dedup | `test-triage-agent` |
| Confirm fix worked, close or re-open | `test-verify-agent` |
| Fix Forge product code bugs | `forge-product-agent` |
| Fix Compose product code bugs | General agent or `compose-test-agent` |
| Write missing Compose tests | `compose-test-agent` |
| Write missing Forge tests | `forge-test-agent` |
