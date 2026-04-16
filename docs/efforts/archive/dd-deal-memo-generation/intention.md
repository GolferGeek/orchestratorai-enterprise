# DD Room: Deal Memo Generation

## What

Auto-draft an acquisition agreement deal memo from a completed Due Diligence Room's findings. The memo is a structured legal document with sections like representations & warranties, indemnification provisions, disclosure schedules, conditions precedent, and covenants — each drafted based on what the DD analysis surfaced.

This is a **new workflow** triggered from a completed DD room, not an extension of the DD graph itself. The DD room produces findings; the deal memo workflow consumes those findings to produce drafting.

## Why

The DD report tells you what's there (and what's wrong with it). A deal memo translates that into actual contract language — what reps the seller should give, what indemnities the buyer needs, what disclosures have to be scheduled, what conditions must be satisfied before closing.

Today, after a DD analysis finishes, a senior attorney spends 10-20 hours translating findings into draft contract language. This is pattern-matching work: "contract X has an IP assignment gap → we need rep Y about IP ownership → with disclosure schedule carve-out Z → with indemnification cap $N." A model that has the full DD report and a library of deal memo templates can produce a solid first draft.

A law firm needs to:
1. Complete a DD room for a target company
2. Click "Generate Deal Memo" on the completed room
3. See drafting for each standard acquisition agreement section, grounded in the specific findings from the DD report
4. Review and iterate with HITL approval before finalizing

## Shape

### Backend
- New LangGraph workflow: `deal-memo-generation` (separate from DD graph)
- New job type: `deal-memo-generation`
- New endpoint: `POST /legal-department/jobs/:id/generate-deal-memo` — triggered from a completed DD room's jobId
- Workflow reads DD outputs from the parent DD room's checkpointer: `riskMatrix`, `dealBreakerFlags`, `perDocumentOutputs`, `runningFindings`, `missingDocuments`, `dealContext`
- Graph nodes:
  - `memo_intake` — validates DD room is completed, loads DD findings into memo state
  - `section_reps_warranties` — drafts representations & warranties (seller, buyer, mutual)
  - `section_indemnification` — drafts indemnification provisions (caps, baskets, survival periods)
  - `section_disclosure_schedules` — identifies items from DD that need scheduling
  - `section_conditions_precedent` — drafts closing conditions based on DD gaps
  - `section_covenants` — drafts pre-closing and post-closing covenants
  - `memo_synthesis` — assembles all sections into final memo with cross-references
  - `memo_hitl_gate` — single HITL review of complete draft
  - `memo_finalize` — generates final markdown document + artifact
- Memo is persisted as a rich markdown document with section navigation

### Frontend
- "Generate Deal Memo" button on completed DD Room view (alongside "Add Documents")
- Deal memo page with tabs per section (Reps & Warranties, Indemnification, etc.)
- Each section shows drafted language + references to specific DD findings that informed it
- HITL review modal presenting complete memo draft
- Download as markdown or DOCX

### Relationship to DD Room
- Deal memo is a **child job** of the DD room — stored separately but references the DD room's jobId
- Multiple deal memos can be generated from one DD room (e.g., different deal structures: stock purchase vs asset purchase)
- If DD room gets incremental updates, existing deal memos stay as-is (they're snapshots); user can regenerate a fresh memo

### Key Constraints
- The DD room must be `status: completed` — cannot draft memo from in-progress rooms
- Deal memo reads DD findings but never modifies the DD room state
- Each section cites which DD findings informed the language (traceability)
- No templates baked into code — drafting is LLM-driven from DD context, with prompting that encodes standard memo structure
- Single HITL gate at the end (not per-section) — attorneys review the whole memo

## What This Is NOT
- Not a general contract drafting tool — scoped to acquisition agreement memos from DD findings
- Not auto-filing or e-signature — produces a draft document, nothing more
- Not a template library — the "templates" live in the prompts, not in code
- Not multi-party negotiation — this drafts from one side's perspective (buyer-focused by default)
- Not connected to deal closing workflows (cap table updates, regulatory filings, etc.) — out of scope
