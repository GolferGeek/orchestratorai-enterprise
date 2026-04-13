# Regulatory Compliance Audit — Product Requirements Document

## 1. Overview

A new Legal Department workflow that cross-references an organization's internal policies against regulatory framework text (GDPR, HIPAA, SOX) to produce a structured compliance gap analysis with remediation recommendations. Two modes share a single LangGraph graph: **Compliance Scan** (AI-driven discovery, open-ended) and **Full Audit** (theme-driven, scored per-theme). The workflow follows the DD Room pattern — batch document ingestion, dispatcher loop, specialist evaluation, HITL gate, report generation — adapted for policy-vs-framework cross-referencing instead of deal-level risk assessment.

This fills the market gap between cheap AI regulatory intelligence tools ($200-500/mo, no structure) and enterprise GRC platforms ($200K+/yr). The cross-reference engine built here is directly reused by Portfolio Sentinel (#6).

## 2. Goals & Success Criteria

### Goals

1. **Policy ingestion into per-audit RAG collection** — upload company policies, extract text, segment by section, index into `compliance-audit-{conversationId}-policies`.
2. **Pre-seeded framework RAG collections** — ship GDPR, HIPAA, SOX as org-scoped RAG collections (`framework-gdpr`, `framework-hipaa`, `framework-sox`) ingested from primary regulatory text.
3. **Cross-reference engine** — for each policy section (Scan) or theme question (Full Audit), query both RAG collections, evaluate compliance status, score, and generate remediation.
4. **Two modes, one graph** — a `mode` field on state (`scan` | `full-audit`) controls whether the dispatcher iterates over policy sections or compliance themes. All other nodes are shared.
5. **Theme configs for Full Audit** — lightweight markdown files per framework (~15 themes x 5-10 questions). Ship configs for GDPR, HIPAA, SOX.
6. **HITL gate** — compliance officer reviews findings before report generation, using the same `interrupt()` / `Command({ resume })` pattern as DD Room.
7. **Structured report** — executive summary, compliance scorecard, gap analysis, remediation roadmap, policy-to-requirement mapping, appendix with per-finding evidence.
8. **Frontend** — create audit modal, four-tab detail view (Scorecard / Gap Analysis / Remediation Roadmap / Report).

### Success Criteria

- End-to-end Compliance Scan: upload 3 policy PDFs, select GDPR, receive gap analysis with cited policy sections and framework articles within 5 minutes.
- End-to-end Full Audit: upload 3 policy PDFs, select GDPR Full Audit, receive scored compliance posture across all ~15 themes within 10 minutes.
- HITL gate functional: compliance officer can approve, reject with feedback (re-runs analysis), or override individual findings.
- Report downloadable as markdown with all 6 sections populated.
- Mode toggle works: switching from Scan to Full Audit in the create modal shows the theme checklist for the selected framework(s).
- Framework RAG collections queryable: GDPR, HIPAA, SOX collections return relevant regulatory text for compliance queries.

## 3. User Stories / Use Cases

### Primary: Compliance Officer — First Assessment

A compliance officer at a mid-market company (200 employees, handles EU customer data) uploads their data handling policy, privacy policy, and employee handbook. They select GDPR and run a Compliance Scan. The system identifies that their data retention policy partially addresses GDPR Article 5(1)(e) but lacks a defined retention period for marketing data, their breach notification procedure doesn't mention the 72-hour window, and they have no Data Protection Officer documentation. The officer reviews findings at the HITL gate, marks DPO as "not applicable" (they're under the threshold), and approves the rest. The report gives them a prioritized remediation list.

### Secondary: In-House Counsel — Systematic Audit

An in-house legal team preparing for an external audit runs Full Audit mode against HIPAA. The system works through all 15 compliance themes systematically, scoring each. The result is a compliance scorecard showing 82% on Administrative Safeguards, 45% on Breach Notification, 90% on Physical Safeguards. The team uses this to prioritize remediation before the external audit arrives.

### Tertiary: Compliance Scan as Intake Tool

A law firm uses Compliance Scan during new client intake. Client uploads their policies, firm runs a quick scan against relevant frameworks. The gap analysis becomes the basis for the engagement scope. Findings flagged for deeper research fire Legal Research (#2) for ambiguous areas.

## 4. Technical Requirements

### 4.1 Architecture

#### 4.1.1 LangGraph Workflow

New workflow under `apps/forge/api/src/agents/legal-department/workflows/compliance-audit/`. Follows the DD Room pattern with these nodes:

```
start → intake → ingest_policies → cross_reference_loop → evaluate_finding
  → [conditional: cross_reference_loop if queue not empty, else hitl_gate]
  → hitl_gate → report_generation → complete
```

**Nodes:**

| Node | Responsibility |
|------|---------------|
| `start` | Emit observability started event, initialize state |
| `intake` | Validate audit context, build policy section index or theme queue based on mode |
| `ingest_policies` | Extract text from uploaded documents, segment into sections, index into per-audit RAG collection |
| `cross_reference_loop` | Stateless dispatcher — emits progress, conditional edge routes to `evaluate_finding` or `hitl_gate` |
| `evaluate_finding` | Pop next item from queue (policy section or theme question), query both RAG collections, run specialist evaluation, score, generate remediation, append to findings |
| `hitl_gate` | `interrupt()` with review payload containing all findings; resume with decision |
| `report_generation` | LLM call to synthesize findings into structured report |
| `complete` | Emit observability completed event |

**Mode branching (intake node):**

- **Scan mode**: `intake` reads the policy section index (built during `ingest_policies`) and populates `evaluationQueue` with one entry per policy section. Each entry contains `{ sectionId, sectionText, complianceDomain }`.
- **Full Audit mode**: `intake` reads the theme config(s) for the selected framework(s) and populates `evaluationQueue` with one entry per theme question. Each entry contains `{ frameworkSlug, themeId, themeName, questionId, questionText }`.

Both modes feed the same `evaluate_finding` node — the difference is what's in the queue entry.

#### 4.1.2 Graph Registration

Add `compliance-audit` to the existing patterns:
- `LegalDepartmentService.processComplianceAudit()` — new method, compiles and invokes the graph
- `legal-jobs-worker.service.ts` — new branch for `jobType === 'compliance-audit'`
- `legal-department.module.ts` — register the workflow graph factory
- `legal-department.presentation.ts` — add `ComplianceAuditPresentation` stage manifest

#### 4.1.3 Service Dependencies

Same as DD Room — injected via constructor:
- `LLMHttpClientService` — LLM calls for classification, evaluation, report generation
- `ObservabilityService` — event emission
- `PostgresCheckpointerService` — LangGraph state persistence
- `WorkflowRagService` — RAG collection queries

### 4.2 Data Model Changes

#### 4.2.1 Workflow State

New state annotation: `ComplianceAuditStateAnnotation` in `compliance-audit.state.ts`.

```typescript
interface ComplianceAuditState {
  // --- Inherited ---
  messages: BaseMessage[];
  executionContext: ExecutionContext;
  status: ComplianceAuditStatus;
  error?: string;
  startedAt: number;
  completedAt?: number;

  // --- Audit Context (set at intake) ---
  auditContext: AuditContext;

  // --- Documents ---
  documents: Array<{ documentId: string; name: string; content: string; mimeType?: string; sizeBytes: number }>;
  policySections: PolicySection[];
  policyCollectionSlug: string;  // 'compliance-audit-{conversationId}-policies'

  // --- Evaluation Queue (mode-dependent) ---
  evaluationQueue: EvaluationQueueEntry[];   // items not yet evaluated
  evaluationsCompleted: string[];            // IDs done
  evaluationsFailed: Record<string, string>; // ID → error

  // --- Findings ---
  findings: ComplianceFinding[];

  // --- Synthesis ---
  scorecard?: ComplianceScorecard;
  remediationPlan?: RemediationItem[];

  // --- Report ---
  report?: string;

  // --- HITL ---
  hitlDecision?: ReviewDecisionPayload;
}
```

#### 4.2.2 Domain Types

New types file: `compliance-audit.types.ts`.

```typescript
export const COMPLIANCE_AUDIT_JOB_TYPE = 'compliance-audit';

export type AuditMode = 'scan' | 'full-audit';

export interface AuditContext {
  mode: AuditMode;
  frameworkSlugs: string[];           // e.g., ['gdpr', 'hipaa']
  selectedThemes?: string[];          // Full Audit: which themes to evaluate (default: all)
  organizationContext?: {
    industry?: string;
    jurisdiction?: string;
    employeeCount?: string;
  };
}

export interface PolicySection {
  sectionId: string;
  documentId: string;
  documentName: string;
  sectionTitle: string;
  sectionText: string;
  complianceDomain?: string;  // classified by LLM: 'data-handling', 'security', etc.
}

export type EvaluationQueueEntry =
  | { type: 'policy-section'; sectionId: string; sectionText: string; complianceDomain: string }
  | { type: 'theme-question'; frameworkSlug: string; themeId: string; themeName: string; questionId: string; questionText: string };

export type ComplianceStatus = 'compliant' | 'partially-compliant' | 'non-compliant' | 'not-addressed' | 'unable-to-evaluate';

export interface ComplianceFinding {
  id: string;
  status: ComplianceStatus;
  severity: 'critical' | 'high' | 'medium' | 'low';
  frameworkSlug: string;
  requirementRef: string;       // e.g., 'GDPR Art. 5(1)(e)'
  requirementText: string;
  policyCitations: Array<{ sectionId: string; documentName: string; sectionTitle: string; excerpt: string }>;
  gapDescription: string;
  remediationRecommendation: string;
  specialistReasoning: string;
  // Full Audit only
  themeId?: string;
  themeName?: string;
  questionId?: string;
}

export interface ThemeScore {
  themeId: string;
  themeName: string;
  frameworkSlug: string;
  totalQuestions: number;
  compliant: number;
  partiallyCompliant: number;
  nonCompliant: number;
  notAddressed: number;
  score: number;  // percentage: (compliant + 0.5*partial) / total * 100
}

export interface ComplianceScorecard {
  overallScore: number;
  perFramework: Array<{
    frameworkSlug: string;
    frameworkName: string;
    score: number;
    themeScores: ThemeScore[];
  }>;
}

export interface RemediationItem {
  findingId: string;
  priority: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  effort: 'small' | 'medium' | 'large';
  description: string;
  requirement: string;
  currentState: string;
  recommendedAction: string;
}

export type ComplianceAuditStatus =
  | 'intake'
  | 'ingesting'
  | 'evaluating'
  | 'awaiting_review'
  | 'generating_report'
  | 'completed'
  | 'failed';
```

#### 4.2.3 Job Table

No schema changes. The existing `legal.agent_jobs` table supports this:
- `job_type`: `'compliance-audit'`
- `input`: `{ data: { documents, auditContext }, metadata: { jobType: 'compliance-audit' } }`
- `result`: `{ findings, scorecard, remediationPlan, report }`
- `status`: Uses existing status enum (`queued`, `processing`, `awaiting_review`, `completed`, `failed`)

### 4.3 API Changes

#### 4.3.1 Existing Endpoints (Extended)

**`POST /legal-department/jobs/upload`** — already handles file uploads. The controller checks `metadata.jobType` and routes accordingly. For `compliance-audit`:
- Accepts files + `auditContext` (JSON) in form data
- Validates: at least 1 file, at least 1 framework selected
- Creates job with `job_type: 'compliance-audit'`

**`POST /legal-department/jobs/:id/review`** — HITL review endpoint, already generic. No changes needed.

**`GET /legal-department/jobs/:id`** — already returns job with result. No changes needed.

#### 4.3.2 New Endpoints

**`GET /legal-department/compliance-audit/:jobId/scorecard`** — returns the `ComplianceScorecard` from job result. Separate endpoint because the scorecard is fetched independently by the frontend tab.

**`GET /legal-department/compliance-audit/:jobId/findings`** — returns findings array with filtering support: `?framework=gdpr&status=non-compliant&severity=critical&theme=data-breach-notification`. Paginated.

**`GET /legal-department/compliance-audit/:jobId/remediation`** — returns the remediation plan sorted by priority.

**`GET /legal-department/frameworks`** — returns available framework collections for the org. Each entry: `{ slug, name, description, hasThemeConfig: boolean }`.

#### 4.3.3 Controller

New controller: `compliance-audit.controller.ts` mounted under the legal-department module. Handles the compliance-audit-specific read endpoints. Upload and review use the existing shared endpoints.

### 4.4 Frontend Changes

#### 4.4.1 New Page

**`ComplianceAuditPage.vue`** — follows the DD Room page pattern:
- `JobActivityList` filtered by `capability-slug="compliance-audit"`
- When a job is selected, shows `ComplianceAuditView.vue`
- Accessible from the Legal Department workspace navigation

#### 4.4.2 Create Audit Modal

**`CreateComplianceAuditModal.vue`**:
- File upload area (same drag-drop pattern as `CreateDDRoomModal.vue`)
- Framework selector: multi-select chips from `GET /legal-department/frameworks`
- Mode toggle: `ion-segment` with "Compliance Scan" (default) / "Full Audit"
- When Full Audit selected AND frameworks have theme configs: show expandable theme checklist per framework. All themes checked by default; user can uncheck specific themes to exclude.
- Organization context fields (optional): industry dropdown, jurisdiction text, employee count range
- Submit calls `legalJobsService.createComplianceAudit(context, files, auditContext)`

#### 4.4.3 Audit Detail View

**`ComplianceAuditView.vue`** — four-tab `ion-segment` layout:

1. **Scorecard tab** — `ComplianceScorecard.vue`:
   - Per-framework horizontal bar showing overall compliance percentage
   - Expandable per-theme breakdown: green (compliant), yellow (partial), red (non-compliant), gray (not evaluated)
   - Full Audit: all themes filled. Compliance Scan: only discovered themes shown, with note about undiscovered themes and Full Audit upsell
   - Fetches from `GET .../scorecard`

2. **Gap Analysis tab** — `ComplianceGapAnalysis.vue`:
   - Sortable/filterable table of findings
   - Columns: status (color-coded chip), severity, framework, requirement ref, gap description
   - Filter bar: framework dropdown, status multi-select, severity multi-select, theme dropdown (Full Audit only)
   - Click row to expand: full specialist reasoning, policy citations with excerpts, requirement text, remediation recommendation
   - Fetches from `GET .../findings`

3. **Remediation Roadmap tab** — `ComplianceRemediation.vue`:
   - Findings sorted by priority (severity x effort)
   - Card layout: severity badge, effort estimate (S/M/L), requirement, current state, recommended action
   - Fetches from `GET .../remediation`

4. **Report tab** — `ComplianceReport.vue`:
   - Rendered markdown via `ReportMarkdown` component (already exists)
   - Download button (markdown file)
   - Reads report from job result via existing `GET /legal-department/jobs/:id` (report is in `result.report`), reusing existing `fetchReport` pattern

#### 4.4.4 Service Extension

Add to `legalJobsService.ts`:
- `createComplianceAudit(context, files, auditContext)` — FormData POST with `metadata: { jobType: 'compliance-audit' }`
- `fetchScorecard(jobId, orgSlug)` — `GET /compliance-audit/:jobId/scorecard`
- `fetchFindings(jobId, orgSlug, filters?)` — `GET /compliance-audit/:jobId/findings`
- `fetchRemediation(jobId, orgSlug)` — `GET /compliance-audit/:jobId/remediation`
- `fetchFrameworks(orgSlug)` — `GET /frameworks`
- Report: reuse existing `fetchReport(jobId, orgSlug)` which reads `result.report` from `GET /jobs/:id` — no new endpoint needed

#### 4.4.5 Navigation

Add "Compliance Audit" to the Legal Department workspace left nav, alongside Due Diligence Room, Contract Review, Legal Research, and Adversarial Brief.

### 4.5 Infrastructure Requirements

#### 4.5.1 Framework RAG Collections

Seed migration: `20260413000001_create_compliance_framework_collections.sql`

Creates three org-scoped RAG collections:
- `framework-gdpr` — EU General Data Protection Regulation (full text)
- `framework-hipaa` — US Health Insurance Portability and Accountability Act (full text)
- `framework-sox` — US Sarbanes-Oxley Act (relevant compliance sections)

Each collection record includes metadata: `{ frameworkSlug, frameworkName, version, sourceUrl, hasThemeConfig }`.

The actual regulatory text must be ingested into these collections. This is a data seeding task — the text is publicly available. Ingestion uses the existing RAG pipeline (chunk, embed, store).

#### 4.5.2 Theme Config Files

Stored at `apps/forge/api/src/agents/legal-department/workflows/compliance-audit/themes/`:
- `gdpr.themes.md`
- `hipaa.themes.md`
- `sox.themes.md`

Format:
```markdown
# GDPR Compliance Themes

## Theme: Data Lawfulness & Consent
Articles: 6, 7
Questions:
- Does the organization document the legal basis for each data processing activity?
- Is consent obtained through clear, affirmative action?
- Can data subjects withdraw consent as easily as they gave it?
- Are records maintained of all consent obtained?
- Is legitimate interest assessed through a balancing test?

## Theme: Data Subject Rights
Articles: 12-23
Questions:
- ...
```

Parsed at runtime by the `intake` node. No database storage needed — they're config files versioned with the code.

#### 4.5.3 Per-Audit Policy Collection

Created dynamically during the `ingest_policies` node:
- Slug: `compliance-audit-{conversationId}-policies`
- Scoped to the org
- Documents chunked by section (paragraph-level), embedded, stored
- Cleaned up on audit deletion (future — out of scope for this effort)

Uses `WorkflowRagService` for creation and querying. The RAG storage plane (`@orchestratorai/planes/rag`) handles the actual storage.

## 5. Non-Functional Requirements

### Performance
- Compliance Scan (3 documents, 1 framework): complete evaluation within 5 minutes on cloud LLM provider.
- Full Audit (3 documents, 1 framework, ~15 themes): complete within 10 minutes on cloud LLM provider.
- RAG queries: <2 seconds per query. Framework collections are small enough (~50-200 chunks per framework) that retrieval is fast.
- Sequential on Ollama, parallel on cloud (same pattern as DD Room — `evaluate_finding` node checks provider).

### Security
- Policy documents stored in the existing `legal-documents` Supabase bucket, scoped by job ID.
- RAG collections scoped by org — no cross-org data leakage.
- Report output includes compliance disclaimer: "AI-assisted analysis, not a legal opinion. Review by qualified counsel before reliance."

### Scalability
- Queue-based dispatcher handles any number of policy sections or theme questions.
- Per-audit RAG collection isolates data — no cross-audit interference.
- Framework collections are shared (org-level) and read-only during audits.

### Compatibility
- Integrates with existing Legal Department workspace — no separate app.
- Uses same job table, worker, HITL infrastructure, SSE event streaming.
- Framework collections are addable by uploading regulatory text — no code changes for new frameworks.

## 6. Out of Scope

- **Requirement-level GRC tracking** — we produce gap analysis, not ongoing compliance management. That's OneTrust's market.
- **Continuous monitoring** — that's Portfolio Sentinel (#6). This is point-in-time.
- **Automated policy drafting** — remediation recommendations tell you *what* to change, not *how* to write it.
- **Custom framework builder UI** — uploading a PDF works. A structured builder is future.
- **Certification preparation workflows** — ISO 27001, SOC 2 evidence collection. Future expansion.
- **Cross-organization benchmarking** — future analytics.
- **CCPA framework** — intention mentions CCPA but scope is GDPR, HIPAA, SOX for this effort. CCPA can be added by uploading the text and writing a theme config.
- **Policy collection cleanup** — per-audit RAG collections are not auto-deleted. Future housekeeping.

## 7. Dependencies & Risks

### Dependencies (All Completed)

| Dependency | Status | Notes |
|---|---|---|
| Contract Review (#1) | Completed | Clause segmentation pattern reused for policy section extraction |
| Legal Research (#2) | Completed | Available for deep-dive on ambiguous findings (HITL "deepen") |
| Due Diligence Room (#4) | Completed | Batch dispatcher pattern, HITL gates, report generation — all reused |
| Forge RAG integration | Completed | `WorkflowRagService` with `getContext()` for collection queries |
| Legal Department HITL | Completed | `interrupt()` / `Command({ resume })` pattern, review endpoint |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RAG retrieval quality on regulatory text | Medium | High | Framework text is structured (articles, sections) — chunk by article/section rather than arbitrary token windows. Test retrieval quality during framework seeding. |
| Policy section segmentation accuracy | Medium | Medium | Use the existing `DocumentExtractionRouter` + LLM classification. For poorly structured policies, the LLM can still identify topic boundaries. Mark uncertain segments as "unable to evaluate" rather than guessing. |
| Theme config completeness | Low | Medium | Ship with 3 frameworks. Theme configs are markdown — easy to iterate. Incomplete themes produce "not evaluated" rather than wrong scores. |
| Cross-reference relevance (policy ↔ framework) | Medium | High | Use `topK: 5` for RAG queries with relevance threshold. The `evaluate_finding` specialist validates relevance before scoring — irrelevant matches are filtered, not scored. |
| Long evaluation time for Full Audit | Medium | Low | Full Audit with 15 themes x 8 questions = 120 evaluations. On cloud with parallel execution, this is ~5-10 minutes. On Ollama (sequential), could be 30+ minutes — acceptable for local dev. Progress events keep the user informed. |

## 8. Phasing

### Phase 1: Workflow Foundation + Policy Ingestion

**Build the graph skeleton and policy ingestion pipeline.**

- Create `workflows/compliance-audit/` directory structure: graph, state, types, nodes/
- Implement `ComplianceAuditStateAnnotation` and domain types
- Implement `start`, `intake`, `complete`, `handle_error` nodes
- Implement `ingest_policies` node: extract text from uploaded documents, segment into policy sections by topic (LLM classification), create per-audit RAG collection, index sections
- Register `compliance-audit` job type in worker routing
- Add `LegalDepartmentService.processComplianceAudit()` method
- Add stage presentation manifest
- Wire upload endpoint to accept `jobType: 'compliance-audit'` with `auditContext`

**Validates:** Documents upload, text extraction, section segmentation, RAG collection creation, job lifecycle (queued → processing → completed).

### Phase 2: Framework Collections + Cross-Reference Engine

**Seed regulatory framework data and build the evaluation core.**

- Create seed migration for framework RAG collections (GDPR, HIPAA, SOX)
- Ingest regulatory text into framework collections (chunk by article/section)
- Write theme config files for GDPR, HIPAA, SOX (~15 themes each)
- Implement `evaluate_finding` node: query both RAG collections, run specialist evaluation, score compliance status, generate remediation
- Implement `cross_reference_loop` node with conditional routing (queue empty → hitl_gate, else → evaluate_finding)
- Add `GET /frameworks` endpoint
- Wire Compliance Scan mode end-to-end: intake builds section-based queue, dispatcher loops, findings accumulate

**Validates:** Framework RAG retrieval returns relevant regulatory text. Cross-reference evaluation produces scored findings with citations. Compliance Scan mode completes end-to-end.

### Phase 3: Full Audit Mode + Scorecard

**Add theme-driven evaluation and compliance scoring.**

- Extend `intake` node: when mode is `full-audit`, parse theme configs, build theme-question queue
- Theme config parser: reads markdown theme files, produces `EvaluationQueueEntry[]`
- Extend `evaluate_finding` to handle `theme-question` entries (same evaluation logic, different queue entry shape)
- Implement scorecard synthesis: after all evaluations complete, compute per-theme and per-framework scores
- Wire Full Audit mode end-to-end
- Add `GET /compliance-audit/:jobId/scorecard` endpoint

**Validates:** Full Audit processes all themes, scores accurately, scorecard percentages match finding counts.

### Phase 4: HITL + Report Generation

**Add human review gate and final report.**

- Implement `hitl_gate` node: `interrupt()` with findings review payload
- Handle review decisions: approve (proceed), reject (re-run evaluation with feedback), override individual findings (modify status/assessment)
- Implement `report_generation` node: LLM synthesis into 6-section markdown report (executive summary, scorecard, gap analysis, remediation roadmap, policy-to-requirement mapping, appendix)
- Add `GET /compliance-audit/:jobId/findings` (with filters) and `GET /compliance-audit/:jobId/remediation` endpoints
- Add compliance disclaimer to report output

**Validates:** HITL gate pauses graph, review decisions resume correctly, report contains all 6 sections with accurate data.

### Phase 5: Frontend

**Build the user-facing interface.**

- `CreateComplianceAuditModal.vue`: file upload, framework selector, mode toggle, theme checklist (Full Audit), organization context fields
- `ComplianceAuditPage.vue`: job list + detail view routing
- `ComplianceAuditView.vue`: four-tab layout (Scorecard / Gap Analysis / Remediation / Report)
- `ComplianceScorecard.vue`: per-framework bars, per-theme breakdown, color coding
- `ComplianceGapAnalysis.vue`: filterable findings table with expandable rows
- `ComplianceRemediation.vue`: priority-sorted remediation cards
- `ComplianceReport.vue`: markdown rendering + download (reuse `ReportMarkdown`)
- Extend `legalJobsService.ts` with compliance-audit methods
- Add "Compliance Audit" to Legal Department workspace navigation
- HITL review integration: `LegalJobReviewModal` already handles the review flow — ensure `compliance-audit` findings render correctly in the review payload display

**Validates:** Full user flow in browser — create audit, watch progress via SSE, review at HITL gate, view all four tabs, download report.
