# DD Room: Financial Analysis

## What

Extend the Due Diligence Room to analyze **financial documents** (balance sheets, P&L statements, cash-flow statements, cap tables, debt schedules, projections) alongside the existing legal corpus. The output is a financial-health view that integrates with the existing risk matrix and feeds the deal memo's reps-and-warranties + disclosure-schedule sections.

This is an **extension of the existing DD Room workflow** (not a new top-level workflow). Same room, same job type (`due-diligence`), same lifecycle — but with new specialists, new finding types, and new tabs.

## Why

DD today is legal-only. A real M&A diligence covers:
- **Legal**: contracts, IP, employment, litigation, privacy, real estate, corporate governance — already done
- **Financial**: revenue concentration, AR/AP aging, off-balance-sheet liabilities, working capital trends, audit qualifications, related-party transactions — **missing**
- **Operational**: customer churn, headcount, vendor concentration — out of scope for v1

Without financial analysis, the deal memo's reps & warranties section is incomplete (financial reps are a major contractual category) and the disclosure schedules can't flag balance-sheet items. Buyers expect financial DD; right now we punt to a separate workflow they have to assemble themselves.

A law firm working a deal needs to:
1. Upload a folder containing both legal AND financial documents (a 10-K, the data room export, etc.) into one DD room
2. See findings from both legal AND financial specialists in the unified risk matrix
3. Get a deal memo whose reps & warranties section includes financial reps grounded in the actual numbers

## Shape

### Backend
- New specialists in `workflows/due-diligence/nodes/specialists/`:
  - `financial-statements` — balance sheet / P&L / cash flow analysis (anomalies, trend breaks, qualification flags)
  - `revenue-concentration` — top-customer revenue %, geographic mix, segment risk
  - `working-capital` — AR/AP aging, DSO/DPO trends, liquidity ratios
  - `cap-table` — equity structure, anti-dilution provisions, preferred liquidation preferences
  - `debt-schedule` — covenants, change-of-control triggers, balloon payments
- Each specialist follows the existing DD specialist contract: takes a document chunk + deal context, returns structured findings with citations
- `classify_all` extended to recognize financial document types (balance-sheet, p-and-l, cash-flow, cap-table, debt-schedule, audit-letter, projections, board-deck)
- New finding category `financial` joins the existing legal categories (contractual, ip, regulatory, etc.) in the risk matrix
- Deal context extended with optional `financial-focus-areas` array (e.g., "revenue concentration", "working capital", "debt covenants")
- Deal memo generation: reps & warranties node prompt extended to include financial reps when `financial` findings are present

### Frontend
- DD Room view: existing risk matrix gets a `financial` row in the categories axis
- Document classification badge gets new types
- Deal memo workspace: no new tabs (financial findings flow into existing 5 sections via citations)
- New "Financial Findings" panel in DD Room (sibling to risk matrix) for direct exploration of cap-table, AR aging, etc. — non-narrative tabular view

### Out of scope (deliberately)
- Operational DD (churn, headcount) — different document set, different specialists
- Quantitative analysis (DCF, comparable transactions, valuation) — not what the firm needs from a legal-DD tool
- Live market data lookup — financial DD here is point-in-time on the documents provided
- Auditing the audit (e.g., red-flagging the auditor's procedures) — out of scope; we trust the audit letter as-is and flag what it says

## Constraints

- Reuses the entire DD Room infrastructure: dispatch loop, HITL gates, incremental updates, deal memo trigger. No new endpoints.
- Financial specialists must produce findings that are citation-grounded just like the legal specialists — no "the company looks healthy" without a specific line item from a specific document
- Document classification must distinguish financial subtypes (a balance sheet ≠ a P&L ≠ a cap table). Misclassified docs get analyzed by the wrong specialist and the findings are noise.
- Numbers in findings must be exact quotes from the source documents (no rounding, no synthesis from multiple docs unless explicitly noted)
