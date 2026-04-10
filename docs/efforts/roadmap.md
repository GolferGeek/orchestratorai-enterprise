# Efforts Roadmap

**Last updated**: 2026-04-10

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
| Migration Drift Cleanup | — | 2026-04-09 | 7 unapplied legal-department migrations applied. 272/272 synced. |
| Forge Async Workflow Skills | pending | 2026-04-09 | Phase 1: job cancellation + retention + userId filter (3 backend features). Phase 2: cleanup service + controller filter. Phase 3: 4 skills (1104 total lines). Legal async workspace follow-ups bundled (items 1+2 already built, 4+5+6 done here). **New legal workflows now unblocked.** |
| Workflow Briefs | #18 | 2026-04-10 | BriefModal: marked + DOMPurify markdown renderer, YouTube/Loom video embeds, edit flow with save spinner + toasts. BriefLandingPanel replaces empty state with brief content + CTA. Shared briefUtils + useBrief composable. |
| Forge RAG Integration | #19 | 2026-04-10 | WorkflowRagService with hybrid search (vector + keyword RRF). Migrated 8 specialists from keyword-only. Wired RAG into contract-review (was zero). Fixed org slug mismatch ('legal' → 'big-ideas'). Removed HR Assistant + RagHttpClientService. Idempotent ingestion. |
| Legal Research Deep Dive | #20 | 2026-04-10 | Recursive depth-first research LangGraph workflow. 7 graph nodes, cyclic DAG, RAG-grounded citation verification, depth/budget controls, research tree visualization, Deepen/Redirect HITL. 147 backend + 86 frontend tests. Left nav integration, job type badges across all capabilities. |

## Current

**Adversarial Brief Stress-Testing** — Intention written. Next: `/build-prd`. Red team your brief with multi-round adversarial debate using the recursive research pattern from Legal Research Deep Dive.

## Next

| Priority | Effort | Why now | Blocked by |
|---|---|---|---|
| 1 | **Adversarial Brief Stress-Testing** | Red team your brief — multi-round adversarial debate. Reuses the recursive research pattern from Legal Research Deep Dive. | — |
| 2 | **Due Diligence Room** | Multi-specialist team for data room analysis (50-500 docs). | — |

## Future

### Legal Workflows (priority order)

| # | Effort | Description | File |
|---|--------|-------------|------|
| 4 | **Due Diligence Room** | Multi-specialist team crawls a virtual data room (50-500 docs), classifies, extracts terms, flags risks, produces structured DD report. | `docs/efforts/future/04-due-diligence-room.md` |
| 5 | **Regulatory Compliance Audit** | Systematic cross-reference of company policies against regulatory frameworks (GDPR, HIPAA, SOX, etc.) — gaps, conflicts, weaknesses. | `docs/efforts/future/05-regulatory-compliance-audit.md` |
| 6 | **Portfolio Sentinel** | Always-on monitoring of external legal signals cross-referenced against a client's legal portfolio in real time. | `docs/efforts/future/06-portfolio-sentinel.md` |
| 7 | **Discovery Document Review** | AI-powered document review for litigation discovery — relevance, privilege, issue coding at scale. | `docs/efforts/future/07-discovery-document-review.md` |
| 8 | **Deposition Prep & Cross-Exam Simulator** | Simulated deposition prep with adversarial cross-examination practice. | `docs/efforts/future/08-deposition-prep-cross-exam-simulator.md` |
| 9 | **Monte Carlo Trial Simulator** | 50-100 simulated mini-trials with varied jury, judge, and strategy variations to estimate case outcomes. | `docs/efforts/future/09-monte-carlo-trial-simulator.md` |
| 10 | **Persistent Case Team** | Team of 6-10 agents persistently assigned to a legal matter for its lifecycle. | `docs/efforts/future/10-persistent-case-team.md` |

### Platform

| Effort | Description |
|---|---|
| **Forge/Compose Auth Remote Unification (Phase 2)** | Migrate forge-api and compose-api from in-process auth to the remote-authorization pattern (packages/auth-client/). Three preconditions: latency measurement, packages/auth-client/ extraction triggered by second consumer, StreamTokenService migration path chosen. Filed at `docs/efforts/future/forge-auth-remote-unification.md` and `compose-auth-remote-unification.md`. |
| **Admin Role Permission Audit** | Systematic review of the admin role's permission grants. Two seed gaps already found and fixed (agents:execute/manage, rag:read/write/delete). Check the full hierarchy (admin ≥ manager ≥ member) for consistency. |

## Dependency Graph

```
auth hardening sweep ✅
  └── forge/compose Phase 2 (remote-auth unification)

legal async workspace + skills ✅
  └── new legal workflows
        ├── 01 contract-review-redlining    ✅
        ├── 02 legal-research-deep-dive     ✅  ← recursive research pattern established
        ├── 03 adversarial-brief-stress-testing  ← NEXT (reuses research pattern)
        ├── 04 due-diligence-room               ← NEXT
        ├── 05 regulatory-compliance-audit
        ├── 06 portfolio-sentinel
        ├── 07 discovery-document-review
        ├── 08 deposition-prep-cross-exam-simulator
        ├── 09 monte-carlo-trial-simulator
        └── 10 persistent-case-team
```

## Key Decisions

- **2026-04-08**: forge-api auth hardening split into Phase 1 (additive in-process) + Phase 2 (remote-auth unification) because forge-api already had a working 256-line in-process JwtAuthGuard and migrating to remote-auth carries latency risk for legal-department workflows. Compose-api got the same split for the same reason.
- **2026-04-08**: admin-api adopted the remote-authorization model (AuthClient → POST /auth/authorize) because it started with zero auth infrastructure and is latency-insensitive (dashboards, not agent workflows).
- **2026-04-08**: crawler module removed from admin-api — crawler was moved to divinr.ai. Compose-api retains its own independent crawler module.
- **2026-04-09**: admin role permission seed has recurring gaps. Two migrations so far: agents:execute/manage (forge-auth), rag:read/write/delete (compose-auth). A systematic audit is queued as a future effort.
- **2026-04-09**: compose-api identified as a plausible FIRST candidate for remote-auth adoption (lower latency sensitivity than forge-api), which would trigger packages/auth-client/ extraction and unblock forge-api Phase 2.
- **2026-04-10**: RAG administration stays in Admin (already built). Forge workflows consume RAG — they don't manage it. Collection slug is a code-level decision per workflow, not a runtime user choice. HR Assistant removed from Forge (should be a Compose RAG agent instead).
- **2026-04-10**: Org slug mismatch discovered and fixed — legal RAG collections were seeded under org 'legal' but workflows run under 'big-ideas'. Collections must match the org users operate in.
- **2026-04-10**: Legal Research Deep Dive completed and browser-tested end-to-end. The recursive research pattern (question → sub-questions → depth control → synthesis) is now proven and ready for extraction into Adversarial Brief (#3) and downstream workflows. Citation verification, budget enforcement, and research tree visualization are all battle-tested.
