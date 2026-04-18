# Efforts Roadmap

**Last updated**: 2026-04-18

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
| DD Room: Deal Memo Generation | merge `5661274` | 2026-04-16 | Auto-draft 5-section acquisition memo from a completed DD Room. New `deal-memo-generation` workflow + 9 graph nodes + single HITL gate + MD/DOCX artifacts. Frontend workspace with 6 tabs, citations rail resolving findings against parent DD index/risk matrix. Bundled cleanup pass: forge-api lint baseline 214→0, web build:check 34→0 TS errors (incl real bugs: `rbac.activeOrgSlug` typo, AdversarialBriefDetailModal raw v-html XSS), `LegalJobReviewModal` split 1938→151 lines + 3 section components, integration suite ports fixed (5xxx→6xxx) + obsolete admin-crawler tests removed. 133 files, +13210/-2182. |
| DD Room: Financial Analysis | #23 | 2026-04-16 | Extend DD Room with 5 new financial specialists (financial-statements, revenue-concentration, working-capital, cap-table, debt-schedule) + 8 new classified subtypes (balance_sheet, profit_and_loss, cash_flow, cap_table, debt_schedule, audit_letter, projections, board_deck). Registry-driven specialist pattern, numeric-quote gate on findings, tabular validation at write time. `financial` risk matrix category populates live; deal memo Capitalization + Financial Statements reps cite real findings ($28.7M, 67%, 0.06x verbatim) when financial docs present, emit transparent omission stub otherwise. New `FinancialFindingsPanel` with cap-table / working-capital / debt-schedule tables. Incremental update path proven — add financial docs to legal-only room re-synthesizes correctly. 126 API suites / 2081 tests, 27 web files / 753 tests, zero regressions. |
| DD Room: Access Controls | #25 | 2026-04-16 | Per-room allow-list so sensitive deals are not visible across the firm. `agent_jobs.access_control` JSONB column, `AdminLookupService` via DATABASE_SERVICE, `isAccessAllowed` single enforcement point, `callerUserId` on all 14 endpoints, `PATCH /jobs/:id/access-control` with 404/403 layered semantics, observability audit events. Frontend: `OrgUserPicker`, access section in `CreateDDRoomModal`, `ManageAccessModal`, "Restricted" lock badge. Deal memos inherit parent access. 127 API suites / 2125 tests, 16 integration tests, zero regressions. |
| DD Room: Cross-Room Comparison | #26 | 2026-04-17 | Read-only comparison dashboard across 2–10 DD rooms. `POST /legal-department/jobs/compare` with fail-closed access control, parallel checkpoint loading, normalized ComparisonResult. 4-panel frontend: risk heat map (7 categories × N rooms, severity coloring), deal-breaker summary (grouped/sortable), financial metrics (specialist side-by-side with multi-doc aggregation), coverage & status (bar chart + missing docs). Markdown export. Also fixed pre-existing auth bypasses on cancelJob/getDealMemo/downloadDealMemo. 67 API suites / 862 tests, zero regressions. DD Room extension set complete. |
| Portfolio Sentinel | #27 | 2026-04-17 | Always-on legal monitoring: 2 LangGraph workflows (sentinel-ingest + sentinel-evaluate), 4 DB tables, RSS/HTML/API signal ingestion with SHA-256 dedup + LLM classification, RAG cross-reference against client portfolio, ranked alerts with relevance/severity/urgency scoring, Pulse cron trigger sync, 4-tab dashboard (Alerts/Signals/Portfolio/Sources). 69 tests / 12 suites. |
| Discovery Document Review | #28 | 2026-04-17 | Full 4-phase LangGraph pipeline for litigation e-discovery: protocol ingestion, parallel first-pass coding (relevance/privilege/issues/hot-docs), 4-type HITL batch review loop, production set assembly with privilege safety guarantee, privilege log, CSV export. 139 API + 53 web unit tests across 19/4 spec files. |
| Deposition Prep & Cross-Exam Simulator | #29 | 2026-04-17 | Two LangGraph workflows: deposition-prep (preparation outline + predicted cross-exam) and cross-exam-simulation (adversarial HITL per-question interrupt/resume). 5 phases, 48 files, 7245 lines. Establishes per-question interrupt pattern for Monte Carlo Trial. |
| Monte Carlo Trial Simulator | #30 | 2026-04-18 | 50–200 simulated mini-trials with stratified parameter space (jury/judge/evidence/witness variations). Two-graph LangGraph architecture (outer orchestrator + inner trial). Outcome distribution, damages histogram (p10–p90), sensitivity analysis, client-side scenario builder, 4-tab dashboard. 6 phases, ~80 files. |

## Current

| Effort | Status | Description |
|---|---|---|
| **Persistent Case Team** | intention | Capstone: 6-8 persistent agents assigned to a legal matter for its full lifecycle — document ingestion, event-driven wake-ups, synthesis cycles, query mode, autonomous escalation. Depends on all 9 prior workflows. |

## Future

### Legal Workflows (priority order)

| # | Effort | Description | File |
|---|--------|-------------|------|
| — | — | All 10 legal workflows are in Current or Completed. | — |

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
        │     ├── ext: deal memo generation    ✅  ← read-only parent hydration + 5-section drafting
        │     ├── ext: financial analysis      ✅
        │     ├── ext: access controls         ✅
        │     └── ext: cross-room comparison   ✅  (capstone — DD Room complete)
        ├── 05 regulatory-compliance-audit      ✅  ← RAG-based cross-reference, framework docs seeded
        ├── 06 portfolio-sentinel               ✅  ← always-on monitoring, Pulse cron triggers
        ├── 07 discovery-document-review        ✅  ← 4-phase pipeline, privilege safety, HITL batch review
        ├── 08 deposition-prep-cross-exam-simulator  ✅  ← per-question HITL interrupt/resume pattern
        ├── 09 monte-carlo-trial-simulator     ✅  ← stratified parameter space, two-graph arch, 4-tab dashboard
        └── 10 persistent-case-team  ← CURRENT
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
- **2026-04-16**: DD Deal Memo Generation shipped. Two architectural calls worth recording: (1) **Synthesis is deterministic, not LLM-driven** — section text is already attorney-grade after the per-section node + citation validator pass; running another LLM at synthesis adds a fabrication surface for cross-references without value. The synthesis node simply stitches sections + emits a references appendix. (2) **The memo workflow reads the parent DD checkpoint snapshot read-only** — never mutates it. Each memo job has its own LangGraph thread; multiple memos can be drafted from one DD room (e.g., stock vs asset structure variants) without state contention. The cleanup pass also caught real bugs (rbac.activeOrgSlug typo silently overriding org on 3 pages; AdversarialBriefDetailModal raw v-html LLM output XSS gap; integration test ports stuck on the old 5xxx scheme). When efforts run gates, count on them surfacing baseline drift — bundle the cleanup with the feature rather than deferring.
