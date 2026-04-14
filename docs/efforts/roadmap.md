# Efforts Roadmap

**Last updated**: 2026-04-14

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
| Adversarial Brief Stress-Testing | #21 | 2026-04-11 | Red Team Your Brief — multi-round adversarial debate (Blue 3 agents, Red 3 agents, Judge). Citation grounding, position-bias mitigation, convergence detection. Custom debate UI (DebateRound, StressTestReport, FortificationDiff). Global RAG search (19ms org-wide vector query). Legal Research upgraded with verified citations from firm knowledge base. 53 files, 6447 lines. |
| Due Diligence Room | #22 | 2026-04-13 | Multi-document M&A due diligence — 8 graph nodes, dispatch loop pattern, 2 HITL gates, 7-section report with risk matrix + deal-breaker flags. Purpose-built specialist prompts with deal context + cross-document running findings. 32 files, 5422 lines, 25 unit tests. |
| Regulatory Compliance Audit | — | 2026-04-13 | Two-mode compliance audit (Scan + Full Audit). RAG-based cross-reference of policies against GDPR/HIPAA/SOX framework text. 43 framework docs (5,476 lines) with front-matter, auto-seeded into RAG on startup. 358 chunks, 112K tokens. Scorecard, gap analysis, remediation, and report tabs. |
| DD Room: Incremental Updates | #24 | 2026-04-14 | Add new documents to a completed DD room and re-run analysis incrementally. `POST /jobs/:id/add-documents`, `incremental_start` graph node, merge reducers on `perDocumentOutputs`/`runningFindings`, both HITL gates fire on incremental runs, `AddDocumentsModal.vue` + "Add Documents" button + in-progress banner. E2E browser-tested. 5 bug fixes found during testing. |

## Current

| Effort | Status | Description |
|---|---|---|
| **DD Room: Deal Memo Generation** | — | Auto-draft acquisition agreement sections from DD report findings. New workflow triggered from completed DD report. |

## Next

| Priority | Effort | Why now | Blocked by |
|---|---|---|---|
| 1 | **DD Room: Financial Analysis** | Extend specialists to analyze financial statements alongside legal documents. | — |
| 2 | **DD Room: Access Controls** | Per-room permissions for authorized users only. | — |
| 3 | **DD Room: Cross-Room Comparison** | Compare risk profiles across multiple DD rooms. Analytics dashboard. | — |
| 4 | **Portfolio Sentinel** | Always-on monitoring of external legal signals cross-referenced against client portfolio. Reuses compliance audit RAG cross-reference pattern. | — |

## Future

### Legal Workflows (priority order)

| # | Effort | Description | File |
|---|--------|-------------|------|
| 6 | **Portfolio Sentinel** | Always-on monitoring of external legal signals cross-referenced against a client's legal portfolio in real time. | `docs/efforts/future/06-portfolio-sentinel.md` |
| 7 | **Discovery Document Review** | AI-powered document review for litigation discovery — relevance, privilege, issue coding at scale. | `docs/efforts/future/07-discovery-document-review.md` |
| 8 | **Deposition Prep & Cross-Exam Simulator** | Simulated deposition prep with adversarial cross-examination practice. | `docs/efforts/future/08-deposition-prep-cross-exam-simulator.md` |
| 9 | **Monte Carlo Trial Simulator** | 50-100 simulated mini-trials with varied jury, judge, and strategy variations to estimate case outcomes. | `docs/efforts/future/09-monte-carlo-trial-simulator.md` |
| 10 | **Persistent Case Team** | Team of 6-10 agents persistently assigned to a legal matter for its lifecycle. | `docs/efforts/future/10-persistent-case-team.md` |

### DD Room Extensions (after #4 ships)

| Effort | Description |
|---|---|
| **DD Room: Incremental Updates** | Add new documents to an existing DD room after analysis has started. Re-run synthesis with new + existing findings. |
| **DD Room: Deal Memo Generation** | Auto-draft acquisition agreement sections from DD report findings. Separate workflow triggered from completed DD report. |
| **DD Room: Financial Analysis** | Extend specialists to analyze financial statements (balance sheets, P&L, cap tables) alongside legal documents. |
| **DD Room: Access Controls** | Per-room permissions so only authorized users can view specific DD rooms. Role-based within the org. |
| **DD Room: Cross-Room Comparison** | Compare risk profiles across multiple DD rooms ("how does this target compare to the last three acquisitions?"). Analytics dashboard. |

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
        ├── 02 legal-research-deep-dive     ✅  ← recursive research pattern
        ├── 03 adversarial-brief-stress-testing  ✅  ← adversarial debate + global RAG
        ├── 04 due-diligence-room               ✅  ← batch dispatch + cross-doc findings
        │     ├── ext: incremental updates     ✅  ← graph.updateState() + conditional __start__
        │     ├── ext: deal memo generation    ← CURRENT
        │     ├── ext: financial analysis      (depends on 04)
        │     ├── ext: access controls         (depends on 04)
        │     └── ext: cross-room comparison   (depends on 04)
        ├── 05 regulatory-compliance-audit      ✅  ← RAG-based cross-reference, framework docs seeded
        ├── 06 portfolio-sentinel               (reuses 05 cross-reference pattern)
        ├── 07 discovery-document-review       (reuses 04 batch pattern)
        ├── 08 deposition-prep-cross-exam-simulator
        ├── 09 monte-carlo-trial-simulator     (depends on 03)
        └── 10 persistent-case-team
```

## Key Decisions

- **2026-04-08**: forge-api auth hardening split into Phase 1 (additive in-process) + Phase 2 (remote-auth unification) because forge-api already had a working 256-line in-process JwtAuthGuard and migrating to remote-auth carries latency risk for legal-department workflows. Compose-api got the same split for the same reason.
- **2026-04-08**: admin-api adopted the remote-authorization model (AuthClient → POST /auth/authorize) because it started with zero auth infrastructure and is latency-insensitive (dashboards, not agent workflows).
- **2026-04-08**: crawler module removed from admin-api — crawler was moved to divinr.ai. Compose-api retains its own independent crawler module.
- **2026-04-09**: admin role permission seed has recurring gaps. Two migrations so far: agents:execute/manage (forge-auth), rag:read/write/delete (compose-auth). A systematic audit is queued as a future effort.
- **2026-04-09**: compose-api identified as a plausible FIRST candidate for remote-auth adoption (lower latency sensitivity than forge-api), which would trigger packages/auth-client/ extraction and unblock forge-api Phase 2.
- **2026-04-10**: RAG administration stays in Admin (already built). Forge workflows consume RAG — they don't manage it. Collection slug is a code-level decision per workflow, not a runtime user choice. HR Assistant removed from Forge (should be a Compose RAG agent instead).
- **2026-04-10**: Legal Research Deep Dive completed and browser-tested end-to-end. The recursive research pattern (question → sub-questions → depth control → synthesis) is now proven and ready for extraction into Adversarial Brief (#3) and downstream workflows. Citation verification, budget enforcement, and research tree visualization are all battle-tested.
- **2026-04-11**: Adversarial Brief completed. Key infrastructure gains beyond the workflow itself: (1) Global RAG search — one 19ms vector query across all org embeddings, replacing per-collection routing. Workflows get org-wide access; interactive users stay collection-scoped. (2) Citation attribution fix — LLM now cites actual filenames from RAG context, enabling verified/unverified distinction. (3) Legal department pages fixed to use org 'legal' (not 'big-ideas' which is the app name). (4) stripMarkdownFences strips `<think>` tags from reasoning models.
- **2026-04-11**: "Big Ideas" is the app/product name, NOT an organization. Legal workflows run under org 'legal'. RAG collections are scoped by organization_slug. This distinction matters for RAG search — wrong org = empty results.
- **2026-04-13**: Due Diligence Room completed. DD specialists use purpose-built prompts (not shared specialist infrastructure) — intentional. Each legal workflow's specialists will be shaped by the firm using them; shared base tools are available but not mandatory. The batch dispatch loop pattern and cross-document running findings are the reusable infrastructure, not the specialist prompts themselves.
- **2026-04-13**: Regulatory Compliance Audit redesigned. Original intention had hand-curated JSON requirement sets per framework (heavy approach). Replaced with RAG-based framework corpus — upload regulatory text, query dynamically. Two modes from shared base: Compliance Scan (AI-driven discovery) and Full Audit (theme-guided with lightweight config). Heavy/requirement-level GRC tracking (OneTrust's market) is explicitly out of scope — we produce the gap analysis that feeds into GRC tools.
- **2026-04-14**: DD Incremental Updates shipped. Key learnings from live testing: (1) `graph.invoke(null, config)` doesn't re-read checkpointer state for conditional `__start__` edges — must pass partial state as input. (2) `job_type` column doesn't reliably indicate DD rooms (all legal jobs default to `document-analysis`); check `input->'metadata'->>'jobType'` instead. (3) `graph.updateState()` on completed threads works, but don't clear synthesis outputs in state — REST endpoints read them, breaking G5 (existing results visible during processing). (4) Guard `classify_all` and `incremental_start` against orphan index entries from failed retry attempts. The merge reducers on `perDocumentOutputs`/`runningFindings` did their job naturally — no manual merge logic needed.
