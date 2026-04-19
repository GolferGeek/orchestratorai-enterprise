# Testing Team Cron Schedule

## What Runs in Cron vs. What Runs Manually

### Cron-safe (automated, no browser required)
- Unit tests and coverage
- Brief/completeness audits (file reads only)
- Triage (reading finding files, moving them)
- Fixes (code edits + jest runs)
- Verify (jest runs)

### Manual only (requires live Chrome session)
- Browser flow tests (page load, job submission, SSE progress, HITL modal)
- GIF recording
- Network/console inspection

**Why**: Scheduled/remote agents don't have access to the local Chrome browser instance. Browser tests must be triggered interactively (`! claude` in terminal with Chrome open).

---

## Cron Schedule

### Daily — 6:00 AM

**Phase 1 — Discover** (runs in parallel, ~15 min each)
```
compose-test-agent  →  unit tests + coverage + drop findings to open/
forge-test-agent    →  unit tests + coverage + drop findings to open/
forge-completeness-agent  →  brief audit + drop completeness-gap findings to open/
```

**Phase 2 — Triage** (starts after Phase 1, ~5 min)
```
test-triage-agent  →  reads open/, deduplicates, assigns severity + fix agent, moves to triaged/ or in-fix/
```

**Phase 3 — Fix** (starts after triage, P0 findings only, ~20 min)
```
forge-fix-agent   →  reads in-fix/ where product=forge, fixes, moves to needs-verify/
compose-fix-agent →  reads in-fix/ where product=compose, fixes, moves to needs-verify/
```

**Phase 4 — Verify** (starts after fix, ~10 min)
```
test-verify-agent  →  reads needs-verify/, runs verify-commands, closes or reopens
```

**End of cycle**: verified fixes in `closed/`, new issues in `triaged/` (queued for next session), any P0 regressions escalated in report.

---

### Weekly — Sunday 8:00 AM

**Full completeness audit** (longer run, all 13 workflows)
```
forge-completeness-agent  →  full brief audit across all workflows + demo script review
```

---

## Cron Sequencing Rules

Phase 2 must not start until Phase 1 agents have all written their reports.  
Phase 3 must not start until Phase 2 has moved findings out of `open/`.  
Phase 4 must not start until Phase 3 agents have moved findings to `needs-verify/`.

**Safeguard**: each phase agent checks whether the previous phase's report file exists before starting:

| Agent | Checks before starting |
|-------|----------------------|
| `test-triage-agent` | `docs/testing/reports/{date}-compose.md` AND `docs/testing/reports/{date}-forge.md` both exist |
| `forge-fix-agent` | `docs/testing/reports/triage-{date}.md` exists |
| `compose-fix-agent` | `docs/testing/reports/triage-{date}.md` exists |
| `test-verify-agent` | At least one file exists in `needs-verify/` |

If the prerequisite report is missing, the agent logs the blocker and exits — it does not proceed on a partial queue.

---

## P0 Escalation

If `test-triage-agent` finds a P0 finding, it:
1. Moves it directly to `in-fix/` (skips `triaged/`)
2. Writes a `## P0 ESCALATION` section at the top of the triage report
3. The fix agent processes P0s before P1s

P0 means: active test failure on Forge Tier 1, HITL broken, transport contract violation, or regression on a previously closed finding.

---

## Browser Test Manual Run Protocol

Run interactively when:
- Before any demo
- After a significant UI change
- Weekly at minimum (suggest Saturday)

```bash
# In terminal with Chrome open:
# Compose browser test
! claude --agent compose-test-agent "Run browser test flows for Compose. Services should be running on port 6301."

# Forge browser test (legal department)
! claude --agent forge-test-agent "Run browser test flows for Forge legal department. Services should be running on port 6201."
```

Browser findings go to `open/` the same way as unit test findings. Triage picks them up in the next cron cycle.

---

## Cron Setup

Use `/schedule` to create the cron jobs. Suggested prompts for each:

**Phase 1 — Compose tester (6:00 AM daily)**:
```
Run compose-test-agent unit test suite and coverage audit. Working directory: /Users/golfergeek/projects/orchAI/orchestratorai-enterprise. No browser testing — unit tests only. Drop findings to docs/testing/findings/open/ and write report to docs/testing/reports/{today}-compose.md.
```

**Phase 1 — Forge tester (6:00 AM daily, parallel)**:
```
Run forge-test-agent unit test suite and coverage audit. Working directory: /Users/golfergeek/projects/orchAI/orchestratorai-enterprise. No browser testing — unit tests only. Drop findings to docs/testing/findings/open/ and write report to docs/testing/reports/{today}-forge.md.
```

**Phase 1 — Completeness (6:00 AM daily, parallel)**:
```
Run forge-completeness-agent brief audit for all legal department workflows. Working directory: /Users/golfergeek/projects/orchAI/orchestratorai-enterprise. Read completeness.md from forge-legal-department-browser-skill. Drop completeness-gap findings to docs/testing/findings/open/ and write report to docs/testing/reports/{today}-forge-completeness.md.
```

**Phase 2 — Triage (6:30 AM daily)**:
```
Run test-triage-agent. Working directory: /Users/golfergeek/projects/orchAI/orchestratorai-enterprise. Check that docs/testing/reports/{today}-compose.md and docs/testing/reports/{today}-forge.md both exist before starting. Triage all findings in docs/testing/findings/open/. Write triage report to docs/testing/reports/triage-{today}.md.
```

**Phase 3 — Fix (7:00 AM daily)**:
```
Run forge-fix-agent and compose-fix-agent. Working directory: /Users/golfergeek/projects/orchAI/orchestratorai-enterprise. Check that docs/testing/reports/triage-{today}.md exists before starting. Fix all findings in docs/testing/findings/in-fix/. Move completed fixes to needs-verify/.
```

**Phase 4 — Verify (7:30 AM daily)**:
```
Run test-verify-agent. Working directory: /Users/golfergeek/projects/orchAI/orchestratorai-enterprise. Verify all findings in docs/testing/findings/needs-verify/. Move closed findings to closed/, re-open failures to open/.
```
