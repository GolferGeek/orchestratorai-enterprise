# Testing Team

## Mission

Find real bugs. Report them precisely. Fix them cleanly. Never ship broken code.

The testing team is an autonomous agent squad that runs daily, reports findings, triages issues, and drives fixes — without human intervention for routine work. Humans are only pulled in for P0 escalations and architectural decisions.

## Team Roster

| Agent | Role | Trigger |
|-------|------|---------|
| `compose-test-agent` | Runs Compose test suite, finds gaps, writes new tests, drops findings in `open/` | Daily schedule or manual |
| `forge-test-agent` | Runs Forge test suite (HITL, job queue, SSE, LangGraph), drops findings in `open/` | Daily schedule or manual |
| `test-triage-agent` | Reads `open/`, deduplicates, assigns severity + fix agent, moves to `triaged/` or `in-fix/` | After testers run, or manual |
| `test-verify-agent` | Reads `needs-verify/`, runs verify-command, closes or re-opens | After fix agents report done |

**Fix agents** (not part of testing team — they receive work from triage):
- `forge-product-agent` — fixes Forge issues
- Compose fixes are small enough for any general agent

## Daily Flow

```
1. compose-test-agent runs    → drops findings in docs/testing/findings/open/
2. forge-test-agent runs      → drops findings in docs/testing/findings/open/
3. test-triage-agent runs     → reads open/, deduplicates, assigns severity + owner
   → P0: moves to in-fix/, pings fix agent immediately
   → P1/P2: moves to triaged/, queued for next session
4. Fix agents work            → update finding status to needs-verify
5. test-verify-agent runs     → reads needs-verify/, runs verify-command
   → PASS: moves to closed/, confirms test added to suite
   → FAIL: moves back to open/ with additional context
```

## Findings Folder

```
docs/testing/findings/
  open/          ← tester drops new issues here (named {hash}-{slug}.md)
  triaged/       ← triage assessed: severity, owner, effort estimate
  in-fix/        ← fix agent actively working
  needs-verify/  ← fix done, verify-command must be run to confirm
  closed/        ← verified fixed, regression-locked
docs/testing/reports/
  {date}-{product}.md   ← daily test run summaries
```

## Finding File Format

See `docs/testing/findings/TEMPLATE.md` for the exact format.

**Naming**: `{8-char-hash}-{product}-{short-slug}.md`  
Example: `a3f92b1c-forge-hitl-worker-not-marking-awaiting-review.md`

**Hash**: first 8 chars of `sha1("{product}:{file}:{test-name}")` — ensures same bug = same filename across runs (deduplication key).

## Severity Levels

| Level | Meaning | SLA |
|-------|---------|-----|
| P0 | Broken behavior, test fails, production risk | Fix today |
| P1 | Coverage gap — critical path untested | Fix this session |
| P2 | Coverage gap — edge case or non-critical path | Queue for next session |
| P3 | Improvement — test could be stronger | Backlog |

## Regression Lock Protocol

When `test-verify-agent` closes an issue:
1. Confirm the specific test now passes
2. Confirm the test file is committed (not just written)
3. Add a note in the closed finding: "Regression-locked: {test file}:{test name}"

If the test is NOT in the committed suite, the issue stays in `needs-verify` until it is.

## What the Testing Team Does NOT Do

- **Does not fix product code** — testers find and report, fix agents fix
- **Does not skip or mark-as-expected** failing tests — every failure is real
- **Does not write tests that pass by not testing** — `expect(true).toBe(true)` is banned
- **Does not silence errors** — if a test can't run, that's a P1 finding itself
