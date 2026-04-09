# Efforts Roadmap

**Last updated**: 2026-04-09 (post auth sweep)

## Completed

| Effort | PR | Date | Summary |
|---|---|---|---|
| Legal Department Upgrades (Phases 1-3) | — | — | Async job queue, HITL, multi-document support, chunked specialists |
| Legal Department Phase 4 | — | — | Reasoning capture across LLM calls |
| Phase 4.5 Reasoning Capture | — | — | Extended reasoning capture to all providers |
| Legal Department Hardening | — | — | Phase 5 hardening + verification |
| Legal Workspace Review UX | — | — | HITL review modal and workspace UX |
| Remove Predictor/Risk | — | — | Dropped prediction/risk/crawler schemas from dev codebase |
| Admin API Auth Hardening | #10 | 2026-04-08 | Remote-authorization model: AuthClient → POST /auth/authorize. 7 controllers guarded. Reference pattern for other products. |
| Forge API Auth Hardening (Phase 1) | #11 | 2026-04-08 | Additive in-process hardening. 18 controllers guarded, 6 @Public(), 3 exceptions. Phase 2 committed. |
| Compose API Auth Hardening (Phase 1) | #12 | 2026-04-09 | Same pattern as forge. 11 controllers guarded, 5 @Public(), 3 exceptions. Phase 2 committed. |
| Pulse + Bridge Auth Hardening | #13 | 2026-04-09 | Final two products. Pulse: 7 guarded + 3 public + 2 exceptions. Bridge: 5 guarded + 6 public (JwtAuthGuard only — no RBAC, appropriate for A2A gateway). **Auth sweep complete across all 5 API products (77 controllers).** |

## Current

*Empty — ready for next effort.*

## Next

| Priority | Effort | Why now | Blocked by |
|---|---|---|---|
| ~~1~~ | ~~**Migration drift cleanup**~~ | ~~8 migrations behind on local DB.~~ **DONE** — 7 unapplied legal-department migrations applied. 272/272 synced. | — |
| 1 | **Legal Async Workspace Follow-ups** | Vue workspace UI (Phase 4 of original plan), per-node model config helper, job retention, job cancellation, cross-user activity feed. All APIs now hardened — no blockers. | — |
| 3 | **Forge Async Workflow Skills** | Pure knowledge capture — distill the legal-department pattern into reusable Claude skills for building new async HITL workflows. No code changes to forge-api. | Legal async workspace follow-ups (the pattern should be fully baked before documenting it) |

## Future

| Effort | Description |
|---|---|
| **Forge/Compose Auth Remote Unification (Phase 2)** | Migrate forge-api and compose-api from in-process auth to the remote-authorization pattern (packages/auth-client/). Three preconditions: latency measurement, packages/auth-client/ extraction triggered by second consumer, StreamTokenService migration path chosen. Filed at `docs/efforts/future/forge-auth-remote-unification.md` and `compose-auth-remote-unification.md`. |
| **Admin Role Permission Audit** | Systematic review of the admin role's permission grants. Two seed gaps already found and fixed (agents:execute/manage, rag:read/write/delete). Check the full hierarchy (admin ≥ manager ≥ member) for consistency. |
| **Adversarial Brief Stress-Testing** | "Red team your brief" — mirror legal team runs structured debate against a draft motion/brief. `docs/efforts/future/adversarial-brief-stress-testing.md` |
| **Persistent Case Team** | "Agent associates assigned for life" — team of 6-10 agents persistently assigned to a legal matter for its lifecycle. `docs/efforts/future/persistent-case-team.md` |
| **Portfolio Sentinel** | Always-on monitoring system that watches external legal signals and cross-references them against a client's legal portfolio. `docs/efforts/future/portfolio-sentinel.md` |

## Dependency Graph

```
auth hardening sweep
  ├── admin-api ✅
  ├── forge-api Phase 1 ✅
  ├── compose-api Phase 1 ✅
  ├── pulse-api ✅
  └── bridge-api ✅
        │
        ▼
forge/compose Phase 2 (remote-auth unification)
  ├── requires: latency measurement
  ├── requires: packages/auth-client/ extraction (triggered by 2nd consumer)
  └── requires: StreamTokenService migration path chosen
        │
        ▼
legal async workspace follow-ups
  ├── Vue workspace UI (Phase 4)
  ├── per-node model config helper
  ├── job retention/cancellation
  └── cross-user activity feed
        │
        ▼
forge async workflow skills (knowledge capture)
  ├── forge-async-workflow-skill
  ├── forge-document-onboarding-workflow-skill
  ├── forge-workflow-frontend-skill
  └── forge-reasoning-capture-skill
        │
        ▼
new legal workflows (ready to build)
  ├── adversarial-brief-stress-testing
  ├── persistent-case-team
  └── portfolio-sentinel
```

## Key Decisions

- **2026-04-08**: forge-api auth hardening split into Phase 1 (additive in-process) + Phase 2 (remote-auth unification) because forge-api already had a working 256-line in-process JwtAuthGuard and migrating to remote-auth carries latency risk for legal-department workflows. Compose-api got the same split for the same reason.
- **2026-04-08**: admin-api adopted the remote-authorization model (AuthClient → POST /auth/authorize) because it started with zero auth infrastructure and is latency-insensitive (dashboards, not agent workflows).
- **2026-04-08**: crawler module removed from admin-api — crawler was moved to divinr.ai. Compose-api retains its own independent crawler module.
- **2026-04-09**: admin role permission seed has recurring gaps. Two migrations so far: agents:execute/manage (forge-auth), rag:read/write/delete (compose-auth). A systematic audit is queued as a future effort.
- **2026-04-09**: compose-api identified as a plausible FIRST candidate for remote-auth adoption (lower latency sensitivity than forge-api), which would trigger packages/auth-client/ extraction and unblock forge-api Phase 2.
