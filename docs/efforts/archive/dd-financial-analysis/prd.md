# DD Room: Financial Analysis — Product Requirements Document

## 1. Overview

Extend the existing Due Diligence Room workflow in Forge's Legal Department agent (`apps/forge/api/src/agents/legal-department/workflows/due-diligence/`) so it analyzes **financial documents** alongside the legal corpus it already handles. A law firm uploads a folder containing a 10-K, board decks, cap table exports, AR aging reports, and debt schedules into the *same* DD Room; the same graph processes them; the unified risk matrix displays a populated `financial` row; and the downstream deal memo's Representations & Warranties and Disclosure Schedules sections are grounded in real financial line items instead of boilerplate.

This is **not a new workflow**. It is a targeted extension of the existing `due-diligence` job type: new specialists, new classification subtypes, one new frontend panel, and a sharpening of the deal memo reps prompts to consume financial findings when present. Infrastructure (dispatch loop, HITL gates, incremental updates, deal memo trigger, artifact service) is unchanged.

## 2. Goals & Success Criteria

### Goals
1. A single DD Room can classify, route, and analyze a mixed upload of legal + financial documents without any user-visible distinction in setup.
2. Financial specialists produce structured findings that are **citation-grounded at the line-item level** (specific numbers, specific documents, specific dates).
3. The unified risk matrix's `financial` row populates with real cells (it currently maps to near-zero findings because no specialist produces `financial` findings today).
4. The deal memo's reps & warranties section — specifically the "Financial statements and absence of undisclosed liabilities" and "Capitalization" outline entries — cites actual findings from financial specialists instead of producing empty/boilerplate text.
5. A dedicated **Financial Findings** panel in the DD Room surfaces cap-table structure, AR aging, and debt schedule data as tabular non-narrative views for lawyers to drill into.

### Success Criteria
- Classification accuracy on a 10-doc mixed test set (≥3 financial docs): correct subtype (balance-sheet vs P&L vs cash-flow vs cap-table vs debt-schedule vs audit-letter vs projections vs board-deck) for ≥8/10 documents, with no legal doc misclassified as financial or vice versa.
- Every finding produced by a financial specialist has: a document reference, a specific page/section reference, and at least one verbatim numeric quote from the source (`$X`, `N%`, or a count). Zero findings with no numbers at all.
- Risk matrix `financial` cells populate for at least 3 severities across a realistic DD corpus that includes a balance sheet + P&L + cap table + debt schedule.
- Deal memo reps & warranties section includes at least one financial rep citing a financial finding when the DD has ≥1 `financial`-category finding; zero financial reps are drafted when no financial findings exist (no hallucinated reps).
- Existing legal-only DD rooms continue to function identically (regression: same outputs for unchanged inputs).
- Incremental updates work across document types: adding financial docs to a previously legal-only room re-runs synthesis and produces a merged matrix.

## 3. User Stories / Use Cases

### Story 1 — Unified upload
As an M&A associate at the firm, I drag a folder containing an NDA, the target's latest 10-K, a cap table export, and a debt schedule into a new DD Room. I do not pre-sort or pre-label. The room classifies each document to its correct subtype and routes it to the right specialist without my intervention.

### Story 2 — Financial findings in the risk matrix
As a deal partner reviewing the DD room after extraction, I open the Risk Matrix tab and see the `financial` row with cells populated by severity. Clicking a `financial` / `high` cell shows me the specific findings — e.g., "Top-3 customers represent 67% of FY2025 revenue (10-K, p. 42)" — with citation back to the source.

### Story 3 — Financial Findings panel
As an associate verifying the cap table for a stock-purchase deal, I open the new Financial Findings panel in the DD Room and see a tabular view of the cap table (rows per class, columns for count/percent/liquidation preference) and a separate AR aging table. I do not want narrative prose here — I want the numbers laid out for me.

### Story 4 — Deal memo reps grounded in numbers
As the partner drafting the reps & warranties, when I generate the deal memo from a DD Room that has financial findings, the "Financial Statements and Absence of Undisclosed Liabilities" rep now references specific audit qualifications or balance-sheet items from the DD, each citing a finding ID. The "Capitalization" rep references the actual cap table structure. When the DD has no financial docs, these reps are drafted with the existing generic outline (no regression).

### Story 5 — Incremental financial drop
As an associate who started a DD with only the legal bundle, when I receive the CFO's data pack a day later, I click "Add Documents", drop the financial bundle in, and the room re-synthesizes — the risk matrix re-renders with financial cells populated, the deal memo (if already generated) can be re-generated with the new findings.

## 4. Technical Requirements

### 4.1 Architecture

The extension touches five concerns, in this order through the graph:

1. **Classification** (`classify-all.node.ts`) — expand the document-type vocabulary to include financial subtypes.
2. **Specialist registry** (new `nodes/specialists/` directory) — introduce five financial specialist configs and refactor the specialist dispatch to consult a registry instead of a hardcoded inline map+generic prompt.
3. **Analysis** (`analyze-document.node.ts`) — route classified financial docs to the new specialists; ensure the findings they emit carry the exact-number constraint via specialist-specific prompt templates.
4. **Synthesis** (`synthesis.node.ts`) — no schema changes; findings flagged `category: "financial"` flow naturally into the existing matrix. Narrative prompt should cover financial findings when present.
5. **Report + Deal memo** (`report-generation.node.ts`, `deal-memo/nodes/section-reps-warranties.node.ts`, `section-disclosure-schedules.node.ts`) — reps & warranties and disclosure schedules consume findings with `category: "financial"` via the existing citation framework.

Frontend changes are isolated to the DD Room view: a new panel sibling to the risk matrix, and badge label additions.

### 4.2 Data Model Changes

#### 4.2.1 Document Classification (`classify-all.node.ts`)

Expand `CLASSIFY_SYSTEM` prompt document-type vocabulary. Current list:
```
contract, nda, employment_agreement, lease, ip_assignment, privacy_policy,
corporate_governance, regulatory_filing, financial_statement, insurance_policy,
litigation, amendment, schedule, exhibit, other
```

Replace the single `financial_statement` catch-all with subtypes:
```
balance_sheet, profit_and_loss, cash_flow, cap_table, debt_schedule,
audit_letter, projections, board_deck
```

Final consolidated list (alphabetical, 22 types):
```
amendment, audit_letter, balance_sheet, board_deck, cap_table, cash_flow,
contract, corporate_governance, debt_schedule, employment_agreement, exhibit,
insurance_policy, ip_assignment, lease, litigation, nda, privacy_policy,
profit_and_loss, projections, regulatory_filing, schedule, other
```

**Backward compatibility rule (per CLAUDE.md: "clean cuts, no parallel paths"):** The legacy `financial_statement` type is removed. If classification returns it due to prompt drift, the parser normalizes it to `other` and the analyze step routes to the fallback `contract` specialist. No silent coercion to a new subtype.

#### 4.2.2 DealContext (`due-diligence.types.ts`)

Add one optional field. Current shape:
```typescript
interface DealContext {
  transactionType: TransactionType;
  targetCompany: string;
  buyerCompany: string;
  dealValueRange?: string;
  jurisdictions: string[];
  focusAreas: string[];
  knownIssues: string[];
}
```

Add:
```typescript
  financialFocusAreas?: string[]; // e.g., "revenue concentration", "working capital", "debt covenants"
```

Not required — when absent, financial specialists use their default focus. When present, the string is appended to the specialist prompt as emphasis (same pattern as `focusAreas`).

#### 4.2.3 Finding enrichment (no type change; prompt-level constraint)

Do **not** change the `RunningFinding` or `CategoryAnalysis.findings[]` types. The line-item quote lives inside the `finding` string and the `clauseRef` field is reused to carry the page/section pointer (e.g., `"10-K, p. 42, Note 4"`).

Validation happens at the specialist parser: a financial specialist's `keyFindings[].finding` MUST contain at least one of: `$`, `%`, or a digit-followed-by-non-digit sequence (`/\d[\d,.]*/`). Findings that fail validation are dropped with a warning emitted to observability — they are not silently retained. (Per CLAUDE.md rule 2: no cheating. Missing numbers = malformed finding = dropped.)

#### 4.2.4 Specialist registry (new — `nodes/specialists/`)

New directory: `apps/forge/api/src/agents/legal-department/workflows/due-diligence/nodes/specialists/`

New files:
- `specialist-registry.ts` — exports `SPECIALISTS: Record<SpecialistKey, SpecialistConfig>`
- `financial-statements.specialist.ts` — config for `financial-statements`
- `revenue-concentration.specialist.ts` — config for `revenue-concentration`
- `working-capital.specialist.ts` — config for `working-capital`
- `cap-table.specialist.ts` — config for `cap-table`
- `debt-schedule.specialist.ts` — config for `debt-schedule`

`SpecialistConfig` shape:
```typescript
interface SpecialistConfig {
  key: string;                    // e.g., "revenue-concentration"
  findingCategory: RiskCategory;  // always "financial" for these five
  role: string;                   // opening line — "You are a financial-statements analyst conducting..."
  focus: string;                  // specialty-specific instruction (1-3 sentences)
  outputContract: string;         // JSON schema text — re-uses the existing overallRisk/riskFlags/keyFindings/summary shape
  requireNumericQuote: boolean;   // true for all five — enforces finding validation
}
```

The existing legal specialists (`contract`, `compliance`, `ip`, `employment`, `real_estate`, `privacy`, `corporate`, `litigation`) are NOT refactored into this registry in this effort. They continue to use the generic `${specialistKey} law specialist` template in `runSingleSpecialist`. The registry is consulted *first*; if no registry entry exists, the function falls back to the current template. (Clean cut within the financial scope; legacy legal specialists stay where they are.)

#### 4.2.5 Dispatch mapping (`analyze-document.node.ts`)

Extend `DOC_TYPE_TO_SPECIALISTS`:
```typescript
const DOC_TYPE_TO_SPECIALISTS: Record<string, string[]> = {
  // ... existing legal mappings unchanged ...
  balance_sheet:    ['financial-statements', 'working-capital'],
  profit_and_loss:  ['financial-statements', 'revenue-concentration'],
  cash_flow:        ['financial-statements', 'working-capital'],
  cap_table:        ['cap-table'],
  debt_schedule:    ['debt-schedule'],
  audit_letter:     ['financial-statements'],
  projections:      ['financial-statements', 'revenue-concentration'],
  board_deck:       ['financial-statements'],
};
```

Remove the old `financial_statement: ['corporate']` entry (clean cut).

### 4.3 API Changes

**No new endpoints.** The existing DD Room endpoints unchanged:
- `POST /invoke` (capability action: start DD room) — request payload gains optional `financialFocusAreas: string[]`
- `POST /jobs/:id/resume` — unchanged (HITL interrupts unchanged)
- `POST /jobs/:id/add-documents` — unchanged (incremental update path works for financial docs)
- `POST /jobs/:id/generate-deal-memo` — unchanged (reads parent DD state which now includes financial findings)

The invoke payload type in the capability handler and the invoke controller must accept the new optional field; the transport contract (method=`invoke`, JSON-RPC 2.0) is not changed.

### 4.4 Frontend Changes

Scope: `apps/forge/web/src/...` DD Room views. No changes to deal memo workspace layout; its output changes because the upstream data changes.

**Changes:**

1. **DocumentClassificationBadge** — add label mappings for 8 new subtypes:
   - balance_sheet → "Balance Sheet"
   - profit_and_loss → "P&L"
   - cash_flow → "Cash Flow"
   - cap_table → "Cap Table"
   - debt_schedule → "Debt Schedule"
   - audit_letter → "Audit Letter"
   - projections → "Projections"
   - board_deck → "Board Deck"
   - Color: use a distinct hue for the financial cluster (e.g., green family) so lawyers can visually scan.

2. **RiskMatrixComponent** — no structural change. The `financial` row already exists in the 7-category grid (see `due-diligence.types.ts:85`). Confirm click-through from a financial cell surfaces the financial-specialist findings with their line-item citations in the cell detail popover.

3. **FinancialFindingsPanel** (new) — sibling to `RiskMatrixComponent.vue` in the Risk Matrix tab, rendered when `runningFindings` contains any specialist with `findingCategory === "financial"` or when `riskMatrix.cells` has any financial cell. Three sub-sections:
   - **Cap Table Snapshot** — if a `cap-table` specialist ran, show its structured output as a table (class, shares, %, liquidation preference). No prose.
   - **AR/AP Aging** — if `working-capital` findings include aging data, show as table.
   - **Debt Schedule Highlights** — if `debt-schedule` findings exist, show a table of covenants, change-of-control triggers, balloon payments.
   Each row links to its source document via `documentId`.
   When no financial specialists have run, the panel does not render (no empty state prose).

4. **GenerateDealMemoModal** / Deal memo flow — **no changes**. The deal memo workspace already has the right 5 sections; the content changes because the upstream DD state changes.

5. **DD Room intake form** (the form that sets `DealContext`) — add an optional multi-select chip input for `financialFocusAreas` with a small vocabulary of suggestions ("revenue concentration", "working capital", "debt covenants", "off-balance-sheet liabilities", "related-party transactions"). Free-text entries allowed.

### 4.5 Infrastructure Requirements

None new. Reuses:
- Existing `LLM_SERVICE` plane (local Ollama default — gemma4:e4b everyday, gemma4:26b heavier — per user memory on local models for workflows).
- Existing `OBSERVABILITY_SERVICE` plane for finding validation warnings.
- Existing `DATABASE_SERVICE` plane — no schema changes (state lives in LangGraph checkpointer).
- Existing artifact service for deal memo exports (unchanged).

No new npm dependencies. No new env vars. No new Supabase migrations.

## 5. Non-Functional Requirements

### Performance
- Classification: financial subtype classification adds zero new LLM calls — still one call per document. Prompt is larger but bounded (~15% more tokens for the expanded type list).
- Analysis: financial documents add 1–2 specialist calls per document, same pattern as legal. Sequential processing (Ollama constraint) unchanged.
- A DD room with 20 documents (10 legal + 10 financial) should complete extraction (pre-HITL-gate-1) within 1.5× the time of a 20-document legal-only room. No regression.

### Security
- No PII handling changes. Financial documents may contain PII (employee counts, compensation, related-party names) but flow through the same pipeline as legal docs. Same sanitization, same storage plane.
- The Financial Findings panel renders tables — render them through the existing DOMPurify-sanitized markdown path if any user-supplied text reaches the DOM. No raw `v-html` additions.

### Scalability
- Same scalability profile as the current DD workflow. Sequential per-document analysis; no change.

### Compatibility
- Existing DD rooms (legal-only) must behave identically after this change. A room created before the change and opened after must render correctly.
- Existing deal memos generated from legal-only rooms remain valid — they cite the findings they cited before.
- The removal of the `financial_statement` classification type is a clean cut (CLAUDE.md rule). Any checkpointed state referring to that type gets normalized on read via the parser fallback.

## 6. Out of Scope

The intention file pins the out-of-scope line; this PRD holds it exactly:

- **Operational DD** — churn, headcount trends, vendor concentration (different document set; different specialists; not v1).
- **Quantitative analysis** — DCF, comparable transactions, valuation models. This is legal DD, not an investment banker's model.
- **Live market data lookup** — no API calls to pricing feeds, no market-comparable pulls. Findings are point-in-time on the documents provided.
- **Audit-the-audit** — not flagging the auditor's procedures. Trust the audit letter as-is; surface what it says.
- **New deal-memo tabs** — the deal memo workspace keeps its current 6 tabs. Financial reps flow into existing sections via citations, not into a new "Financial" tab.
- **Refactor of existing legal specialists** — the eight legal specialist keys (`contract`, `compliance`, `ip`, `employment`, `real_estate`, `privacy`, `corporate`, `litigation`) stay in their current inline form. Only the five new financial specialists use the new registry.
- **Operational model switching** — no addition of cloud LLM fallbacks for heavy financial docs; sticks to the local-model default (per feedback memory).

## 7. Dependencies & Risks

### Dependencies
- The existing DD workflow (already shipped).
- Deal Memo Generation workflow (just shipped per commit `46092f9`).
- Incremental Updates (shipped).
- LLM service plane (`LLM_SERVICE`) available and pointed at local Ollama.

### Risks

**R1: Misclassification of financial subtypes.**
A balance sheet and a cash-flow statement look structurally similar to a model trained on legal text. If the classifier assigns a cash-flow doc to `balance_sheet`, it gets routed to `working-capital` instead of `financial-statements`, producing noisy findings.
*Mitigation:* The classify-all prompt gets one-line descriptors per subtype ("balance_sheet: a statement of assets/liabilities/equity at a point in time"). A test set of 8 real financial docs (one per subtype) is part of the Phase 1 acceptance.

**R2: Hallucinated numbers in findings.**
LLMs are known to invent plausible-looking numbers. A finding that says "Top-3 customers = 67% of revenue" without that number actually being in the document is worse than no finding at all — it's a malpractice risk for the firm.
*Mitigation:* The `requireNumericQuote` gate drops findings whose `finding` string lacks any numeric token. Plus the existing specialist prompt instruction "do not synthesize numbers across documents" is strengthened with "quote verbatim from the document; if you cannot, do not report the finding."

**R3: Financial findings crowd out legal findings in the matrix.**
Financial docs (a 300-page 10-K) can produce many findings, which might swamp the risk matrix visually and push legal findings below the fold.
*Mitigation:* Each specialist caps its `keyFindings` at 10 per document (prompt-level). The matrix's cell detail popover paginates when `>20`.

**R4: Deal memo prompt drift.**
The reps & warranties prompt currently treats "Financial statements and absence of undisclosed liabilities" as an outline stub. If the synthesis LLM doesn't notice `category: "financial"` findings in its context, the rep stays generic.
*Mitigation:* The section-reps-warranties draft step's context assembly explicitly partitions findings into `legal` vs `financial` buckets and hands the financial bucket under a clearly labeled header. Section prompts gain one sentence: "If the financial findings bucket is empty, do not draft financial reps."

**R5: Incremental update race on checkpointed state with legacy type.**
An in-flight DD room whose state was written before this change contains the legacy `financial_statement` type. When resumed, the dispatch map no longer has that key.
*Mitigation:* Phase 1 ships the classifier change with a read-side normalizer (parse returns `other` if classifier emits `financial_statement`), so resume paths don't break even on legacy state.

**R6: Financial Findings panel tabular rendering depends on structured specialist output.**
If a specialist returns `keyFindings[]` as free text, the panel can't build tables.
*Mitigation:* The specialists that feed the panel (`cap-table`, `working-capital`, `debt-schedule`) include a supplementary structured field in their output contract: `tabular: { rows: [...], columns: [...] }`. When absent or malformed, the panel falls back to a list view. No fake rows. No defaults — per CLAUDE.md rule 1, we do not invent data if the specialist didn't produce it.

## 8. Phasing

Each phase is independently verifiable against the success criteria. Quality gate at each: lint/test/build pass, plus a curl-level end-to-end check via the DD room invoke path.

### Phase 1 — Classification vocabulary expansion
**Scope:** `classify-all.node.ts` only.
- Replace `financial_statement` in `CLASSIFY_SYSTEM` prompt with the 8 financial subtypes, each with a one-line descriptor.
- Extend `parseClassification` with normalizer (legacy `financial_statement` → `other`).
- Unit tests in `classify-all.node.spec.ts`: one test per financial subtype on synthetic document snippets; one test confirming the legacy-type normalization.
**Done when:** Classifier correctly routes a test set of 8 financial docs to their subtypes, and a legacy-typed doc from a fixture resolves to `other` without error.

### Phase 2 — Specialist registry + financial specialists
**Scope:** new `nodes/specialists/` directory, `analyze-document.node.ts` dispatch update.
- Create `specialist-registry.ts` and the five specialist config files.
- Update `runSingleSpecialist` in `analyze-document.node.ts` to consult the registry first; fall back to the generic `${specialistKey} law specialist` template.
- Extend `DOC_TYPE_TO_SPECIALISTS` with the 8 new mappings; remove the `financial_statement: ['corporate']` entry.
- Unit tests for each specialist: assert the prompt contains the specialist role, the financial-focus-areas (when passed), and the numeric-quote requirement.
**Done when:** Invoking the DD workflow on a financial doc exercises the new specialist and emits findings of `category: "financial"` visible in `runningFindings`.

### Phase 3 — Finding validation + DealContext extension
**Scope:** `due-diligence.types.ts`, `analyze-document.node.ts`, `due-diligence.state.ts`.
- Add `financialFocusAreas?: string[]` to `DealContext`.
- In `runSingleSpecialist`, when the specialist config has `requireNumericQuote: true`, run the numeric validation per finding; drop invalid findings; log via `OBSERVABILITY_SERVICE`.
- Thread `financialFocusAreas` from intake → state → specialist prompt.
- Unit tests: numeric validation drops bad findings; good findings pass through; focus-areas appear in prompt when present.
**Done when:** A financial specialist invoked with a document that has no numbers emits zero findings (observability event logged); with real numbers, findings flow through intact.

### Phase 4 — Synthesis + risk matrix population
**Scope:** `synthesis.node.ts` prompt, `report-generation.node.ts` assembly.
- Confirm synthesis prompt recognizes `category: "financial"` running findings; extend the synthesis system prompt's narrative guidance to include a `financial` category paragraph when such findings are present (symmetrical to the existing category treatment).
- `report-generation.node.ts` markdown assembly: no schema change; confirm the `financial` category appears in the category-analysis section when populated.
- Spec tests: end-to-end integration test on a mixed corpus (2 legal + 2 financial docs); assert `riskMatrix.cells` contains at least one cell where `category === "financial"`.
**Done when:** Running the DD workflow on a mixed corpus produces a risk matrix with populated financial cells and a narrative category analysis.

### Phase 5 — Deal memo reps & warranties grounding
**Scope:** `deal-memo/nodes/shared/section-prompts.ts`, `section-node.factory.ts` (context assembly), `section-reps-warranties.node.ts`, `section-disclosure-schedules.node.ts`.
- In the section factory's context assembly, partition parent findings into `legal` and `financial` buckets and render them under labeled headers in the user message.
- In `section-prompts.ts`: update `reps-warranties.emphasis` with one sentence: "If the financial findings bucket is empty, do NOT draft financial reps (Capitalization, Financial Statements) — leave them absent from the draft rather than drafting boilerplate." Mirror for `disclosure-schedules.emphasis`.
- Spec tests: (a) deal memo generated from a legal-only DD state produces reps output with no financial reps (regression safety); (b) deal memo from a DD state with ≥1 financial finding produces at least one rep citing it.
**Done when:** The success criterion on reps grounding is met on the test corpus.

### Phase 6 — Frontend: badges + intake field + Financial Findings panel
**Scope:** `apps/forge/web/src/` (DD Room views and components).
- Add 8 new label mappings to DocumentClassificationBadge.
- Add `financialFocusAreas` multi-select to the DD room intake form; pipe through to the invoke request payload.
- Create `FinancialFindingsPanel.vue` sibling to `RiskMatrixComponent.vue`; conditional render based on presence of financial findings; three tabular sub-sections (cap table, AR/AP aging, debt schedule highlights).
- Visual verification in Chrome via the local dev servers (Forge API `6200`, Forge web `6201`).
**Done when:** The panel renders correctly on a DD room with financial findings and renders nothing on a legal-only room. Badges display correctly for all new subtypes.

### Phase 7 — Integration, regression, documentation
**Scope:** end-to-end verification, roadmap update, archive.
- Full DD → deal memo flow on a mixed corpus (≥4 legal + ≥4 financial docs), executed via the browser in dev.
- Regression check: run the existing legal-only fixture through the workflow; compare outputs to the prior shipping state. Zero diffs outside of the new, conditionally-empty financial category fields.
- Update the roadmap: mark "DD Financial Analysis" complete. Generate completion report. Archive the effort folder.
**Done when:** Mixed-corpus run matches all success criteria; legal-only regression is clean; roadmap reflects completion.
