# Due Diligence Room — What It Does

## Purpose

The Due Diligence Room analyzes a package of deal documents (financials, contracts, IP, employment, regulatory filings) and produces a risk matrix, deal-breaker flags, cross-reference map, and deal memo. It's designed for M&A, investment, and acquisition transactions.

## Architecture

- **19 document type classifications** — automatic at intake
- **12 parallel specialists** — 7 legal (liability, IP, regulatory, employment, contracts, governance, litigation) + 5 financial (revenue, assets, liabilities, forecasts, capitalization)
- **Two HITL gates** — post-extraction review, then post-synthesis review
- **Incremental mode** — add more documents to an existing room without re-analyzing completed ones
- **Deal Memo trigger** — after completion, a "Generate Deal Memo" button launches the Deal Memo workflow

## Two HITL Gates

**Gate 1** (post-extraction): Reviewer sees classified documents, extracted entities. Approve to proceed to specialist analysis, reject to re-classify.

**Gate 2** (post-synthesis): Reviewer sees full risk matrix, deal-breaker flags, cross-references. Approve to generate final report, reject to re-run synthesis.

## What the Output Shows

- **Risk matrix** — 7 categories × 4 severity levels (critical/high/medium/low)
- **Deal-breaker flags** — specific findings that would block the deal, with reasoning
- **Missing document detection** — documents the AI expected but didn't find
- **Cross-reference map** — relationships between documents (e.g., "Employment agreement references IP assignment in Exhibit C")
- **Per-document risk score** — normalized score for each uploaded document

## Incremental Mode

If more documents arrive mid-diligence, they can be added to the existing room. Already-analyzed documents are not re-run. The new documents are classified, dispatched to specialists, and the synthesis is updated.

## Deal Memo Connection

After HITL Gate 2 approval, a "Generate Deal Memo" button appears. This launches the Deal Memo workflow, which hydrates from the DD room's checkpoint state. No re-upload needed — it uses the full analysis already done.
