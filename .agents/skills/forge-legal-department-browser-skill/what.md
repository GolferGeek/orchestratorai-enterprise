# Legal Department — What It Is

## Purpose

The Legal Department is Forge's flagship workflow. It is a multi-specialist AI legal team that analyzes documents, runs due diligence, simulates trials, and manages ongoing matters. This is the primary reason enterprise clients buy the product.

## Why Browser Testing Matters Here

Legal professionals are the users. If the UI is confusing, slow, missing a review modal, or shows raw JSON instead of formatted analysis — that is a direct revenue and trust impact. The browser is not a convenience; it is the product.

## The 13 Workflows

Each workflow has its own page, input form, and expected output. Testing priority is listed here:

| Priority | Workflow | Route | What It Does |
|----------|---------|-------|-------------|
| P0 | Document Onboarding | `/document-onboarding` | Upload docs → extract + index for all other workflows. Gateway to everything else. |
| P0 | Contract Review | `/contract-review` | Multi-specialist analysis of a contract. Triggers HITL before delivering results. |
| P1 | Legal Research | `/legal-research` | Recursive research chain. Returns structured findings with citations. |
| P1 | Due Diligence | `/due-diligence` | M&A analysis across uploaded documents. Produces deal memo. |
| P1 | Compliance Audit | `/compliance-audit` | Cross-references against regulatory frameworks. |
| P1 | Discovery Review | `/discovery-review` | Batch document coding (relevant/privileged/produced). BatchReviewPanel HITL. |
| P2 | Brief Stress Test | `/adversarial-brief` | Attacks a legal brief to find weaknesses. |
| P2 | Trial Simulator | `/monte-carlo` | Monte Carlo simulation of trial outcomes. Long-running. |
| P2 | Case Team | `/matters` | Persistent case management. Matter dashboard with multiple workflows per matter. |
| P3 | Deposition Prep | via matter | Deposition question generation and prep. |
| P3 | Cross-Exam Simulation | via matter | Adversarial questioning simulation. |
| P3 | Deal Memo | `/dd/:parentJobId/memo/:memoJobId` | Generated from due diligence job. |
| P3 | Sentinel | via matter | Ongoing legal signal monitoring. |

## HITL — Why It Is Critical

HITL (Human-in-the-Loop) is not an optional feature. It is the legal review gate before AI analysis is delivered to clients. If the review modal does not appear:
- The lawyer never approves the analysis
- The job either silently completes without review or hangs forever
- In production: a client receives AI output that was never reviewed

The HITL review modal (`LegalJobReviewModal.vue`) dispatches to different sub-sections based on job type:
- Contract/document analysis → `DocumentAnalysisReviewSection.vue`
- Legal research → `LegalResearchReviewSection.vue`
- Deal memo → `DealMemoReviewSection.vue`
- Discovery → `BatchReviewPanel.vue`

## SSE Stage Ladder — Why It Matters

The `StageLadder.vue` component is the user's only window into what the AI is doing during a long-running job. If stages don't update, users think the job is frozen and cancel it — wasting LLM cost and their time.

Stages flow through LangGraph node names: `clo_routing` → `orchestrator` → specialist nodes → `synthesis` → `report_generation`. Each stage has icon state: pending (○) → active (⟳) → done (✓) or failed (✗).

## Thinking Phase Badges

When extended thinking is enabled, `StageLadder` shows 🧠 (reasoning) and ✍️ (writing) badges per stage. These come from `useThinkingStates.ts`. If thinking is enabled but badges never appear: observability pipeline is broken.
