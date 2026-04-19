# Legal Department — Completeness Audit Reference

This file is the source of truth for completeness auditing. It inventories every feature, every workflow, every brief, and every demo moment — then tracks what is documented, what is missing, and what a demo video should show.

Read this when:
- Running a completeness audit (does the brief reflect the product?)
- Preparing a demo script (what should I show?)
- Checking marketing coverage (is every capability represented?)
- Identifying brief gaps (what features exist but aren't written up?)

---

## Workflow Inventory — 13 Workflows

| Workflow | Route | Has brief.md | video: set | Brief Quality |
|----------|-------|-------------|------------|---------------|
| Document Onboarding | `/document-onboarding` | ✓ | ✗ MISSING | Good |
| Contract Review | `/contract-review` | ✓ | ✗ MISSING | Excellent |
| Legal Research | `/legal-research` | ✓ | ✗ MISSING | Excellent |
| Due Diligence Room | `/due-diligence` | ✓ | ✗ MISSING | Excellent |
| Brief Stress Test | `/adversarial-brief` | ✓ | ✗ MISSING | Excellent |
| Compliance Audit | `/compliance-audit` | ✓ | ✗ MISSING | Good |
| Monte Carlo Trial Simulator | `/monte-carlo` | ✓ | ✗ MISSING | Excellent |
| Persistent Case Team | `/matters` | ✓ | ✗ MISSING | Good |
| Deal Memo Generation | via DD room | ✓ | ✗ MISSING | Excellent |
| Discovery Review | `/discovery-review` | ✗ **NO BRIEF** | ✗ MISSING | — |
| Deposition Prep | via matter | ✗ **NO BRIEF** | ✗ MISSING | — |
| Cross-Exam Simulation | via matter | ✗ **NO BRIEF** | ✗ MISSING | — |
| Sentinel | via matter | ✗ **NO BRIEF** | ✗ MISSING | — |

**Critical gaps**:
- `video:` field is empty in ALL 9 existing briefs — no workflow has a video link
- 4 workflows have no brief.md at all: Discovery Review, Deposition Prep, Cross-Exam Simulation, Sentinel

---

## Full Feature Inventory

### Document Onboarding
**What exists in code/UI**:
- File upload (PDF, DOCX, images, TXT) up to 10 files
- Automatic document classification
- Metadata extraction (parties, dates, signatures)
- 8 parallel specialist agents
- Cross-specialist synthesis
- HITL review gate (approve/reject/modify)
- StageLadder with thinking badges
- Markdown report with risk matrix
- Multi-document support
- RAG enrichment against firm knowledge base

**What brief.md says**: ✓ All of the above covered. No significant gaps.

**What brief.md misses**:
- The `video:` field is empty — no demo video linked
- No mention of the stage ladder visualization or thinking badges
- No mention that the StageLadder shows real-time thinking phase (🧠/✍️)
- No mention that RAG enrichment is visible in the output (citations labeled)

---

### Contract Review
**What exists in code/UI**:
- LLM-powered clause segmentation
- 8 domain specialists in parallel
- Per-clause risk scoring (critical/high/medium/low/acceptable)
- Suggested replacement language per clause
- Conflict detection (multiple specialists flagging same clause)
- Redline viewer with color-coded risk badges and diff
- Per-clause accept/reject/modify HITL
- Partial re-run for rejected clauses
- Risk assessment report sorted by severity

**What brief.md says**: ✓ Excellent coverage. All features documented.

**What brief.md misses**:
- The `video:` field is empty
- No mention that conflict detection is visible in the UI
- The "partial re-run" feature (rejected clauses re-analyzed without full re-run) is mentioned briefly but its UI interaction isn't described

---

### Legal Research
**What exists in code/UI**:
- Recursive research with sub-question generation
- RAG-grounded citations from firm's knowledge base
- Verified/unverified citation labeling
- Configurable depth, sub-question caps, token/time budgets
- Research tree visualization (color-coded by confidence)
- HITL: approve, deepen specific branches, redirect
- Scope statement ("limited to N documents")
- SSE real-time research tree building

**What brief.md says**: ✓ Outstanding coverage. Best-written brief in the set.

**What brief.md misses**:
- The `video:` field is empty
- The visual research tree is mentioned but not described in detail (confidence color coding: green/yellow/red/gray)
- "Deepen specific branches" in HITL is mentioned but the UI mechanic isn't described

---

### Due Diligence Room
**What exists in code/UI**:
- 19 document type classification
- 7 legal + 5 financial specialists (12 total)
- Cross-document context for each specialist
- Per-document risk scoring
- Risk matrix (7 categories × 4 severity levels)
- Deal-breaker flags with reasoning
- Missing document detection
- Cross-reference map (inter-document relationships)
- Two HITL review gates (post-extraction + post-synthesis)
- Incremental mode (add docs without re-analyzing completed ones)
- Deal Memo generation from completed DD room

**What brief.md says**: ✓ Very good coverage.

**What brief.md misses**:
- The `video:` field is empty
- The connection to Deal Memo Generation (DD room → "Generate Deal Memo" button) isn't prominently featured
- "Incremental mode" is mentioned but the UI mechanic (which docs are already analyzed vs. new) isn't described
- Missing document detection is mentioned but not described as a UI-visible feature

---

### Brief Stress Test (Adversarial Brief)
**What exists in code/UI**:
- 3-agent Blue Team + 3-agent Red Team
- Judge agent with 5-dimension rubric
- Double-blind position randomization
- Convergence detection (severity threshold + round cap + diminishing returns)
- Ranked stress-test report (attacks, weak citations, factual gaps)
- Per-recommendation accept/reject
- Fortification pass (brief rewritten with accepted changes)
- Citation grounding via RAG
- Provider-aware execution (parallel cloud vs sequential Ollama)
- SSE real-time debate progress

**What brief.md says**: ✓ Excellent coverage.

**What brief.md misses**:
- The `video:` field is empty
- "For demo purposes: watching a Red Team shred a brief in real time is compelling" — this is actually IN the brief, which is great, but no video link
- The provider-aware execution detail (parallel cloud vs sequential Ollama) isn't highlighted as a user-facing feature

---

### Compliance Audit
**What exists in code/UI**:
- Two audit modes: document-driven vs full-audit (theme-question)
- Policy document segmentation
- Compliance domain classification
- Per-finding severity and status (5 statuses)
- RAG integration (framework-specific + policy-specific collections)
- Quantified scorecard (per-theme, per-framework, overall)
- HITL gate: approve/reject/modify
- Override individual finding statuses
- Structured markdown report with remediation plan
- Multiple frameworks simultaneously

**What brief.md says**: Good coverage.

**What brief.md misses**:
- The `video:` field is empty
- The two audit modes aren't clearly differentiated in the benefits section (document-driven vs full-audit)
- The ability to override individual finding statuses (not just approve/reject the whole audit) deserves more prominence
- No mention of which specific frameworks are pre-loaded

---

### Monte Carlo Trial Simulator
**What exists in code/UI**:
- Two-graph LangGraph architecture (outer + inner per-simulation)
- 5-node inner trial graph
- Deterministic parameter space (stratified jury, tiered evidence admissibility, alternating witness credibility)
- Statistical aggregation (outcome distribution, damages histogram p10/p25/p75/p90)
- Sensitivity analysis (delta win-rate per evidence/witness factor)
- Client-side scenario builder (filter without re-run)
- 4-tab dashboard (Progress, Outcomes, Sensitivity, Simulations)
- 1–200 simulation count
- Non-dismissible disclaimer
- Full per-simulation transcripts

**What brief.md says**: ✓ Outstanding. The most detailed brief in the set.

**What brief.md misses**:
- The `video:` field is empty
- The "client-side scenario builder updates instantly — no API call, no re-run" is mentioned but undersells the interactivity
- The per-simulation transcript view (reading individual trial transcripts) is mentioned but not positioned as a demo moment

---

### Persistent Case Team
**What exists in code/UI**:
- Matter creation (name, client, type, jurisdiction, opposing parties)
- Two-agent pipeline: Facts Agent + Documents Agent run in parallel
- Persistent checkpoint state (thread ID scoped to matter)
- Entity deduplication (upsert on matter_id + entity_type + name)
- 6 document classes
- Real-time processing status (5-second poll)
- Stats bar (documents, entities, timeline events, pending jobs)
- Matter dashboard with Case Overview + Documents tabs
- Timeline events with dates, event types, significance ratings

**What brief.md says**: Good.

**What brief.md misses**:
- The `video:` field is empty
- No mention that the matter connects to other workflows (Deposition Prep, Cross-Exam Simulation, Sentinel live inside a matter)
- The timeline events feature is mentioned but not emphasized as a demo moment
- The entity deduplication (same person across 10 docs = one entity) isn't highlighted — this is powerful

---

### Deal Memo Generation
**What exists in code/UI**:
- Hydrates full DD room checkpoint
- 5 section drafters in parallel
- Per-citation validation against DD registries
- Deterministic markdown synthesis
- References appendix (findings, documents, risk matrix, deal-breakers tables)
- HITL: approve/reject/modify
- Reject re-drafts all 5 sections with feedback
- Modify applies direct edits + re-synthesizes
- Re-synthesis hard cap (1 iteration)
- Token budget pruning for large DD rooms
- Download as Markdown or DOCX

**What brief.md says**: ✓ Excellent.

**What brief.md misses**:
- The `video:` field is empty
- The "no LLM re-composition = no hallucinated additions" positioning is strong but the Download as DOCX feature deserves more prominence (lawyers want Word)
- The references appendix (separate tables for findings, documents, risk matrix) isn't highlighted

---

### Discovery Review — NO BRIEF
**What exists in code/UI**:
- Route: `/app/agents/legal-department/discovery-review`
- BatchReviewPanel HITL (batch document coding)
- Document coding: relevant/privileged/produced
- Bulk review workflow

**Brief status**: ✗ **Missing entirely**

**What to cover in brief**:
- Bulk coding of discovery documents (relevant/privileged/produced/withheld)
- The BatchReviewPanel lets reviewers work through documents in batches
- AI pre-codes each document; human confirms, overrides, or corrects
- Privilege log generation
- Chain-of-custody tracking

---

### Deposition Prep — NO BRIEF
**What exists**: Route accessible via matter. Deposition question generation and prep.

**Brief status**: ✗ **Missing entirely**

---

### Cross-Exam Simulation — NO BRIEF
**What exists**: Route accessible via matter. Adversarial questioning simulation.

**Brief status**: ✗ **Missing entirely**

---

### Sentinel — NO BRIEF
**What exists**: Route accessible via matter. Ongoing legal signal monitoring.

**Brief status**: ✗ **Missing entirely**

---

## Demo Script — Priority Order

The best demo flows, ordered by wow-factor and reliability:

### Demo 1: Brief Stress Test (Highest Wow)
*"Watch your brief get shredded by a Red Team AI, then fixed"*
1. Upload a sample legal brief (or use the test brief)
2. Watch the debate: Blue Team defends → Red Team attacks → Judge scores
3. Show the ranked attack list with severity scores
4. Accept top recommendations → Fortify → show the improved brief
5. **Key moment**: real-time debate streaming is visually compelling

### Demo 2: Monte Carlo Trial Simulator
*"Here are your trial odds — backed by 100 simulated trials"*
1. Show pre-populated case record (use saved simulation if available)
2. Show Outcomes tab: probability distribution + damages histogram
3. Switch to Sensitivity tab: drag scenario builder, watch distribution shift instantly
4. Open one simulation transcript: show the actual inner trial
5. **Key moment**: scenario builder updating in real-time (no re-run)

### Demo 3: Contract Review + Redlining
*"AI-powered clause-by-clause redline in 10 minutes"*
1. Upload a sample contract
2. Watch clause segmentation happen in StageLadder
3. Show the redline view: color-coded risk badges, suggested replacements
4. Run through HITL: accept one clause, reject one, modify one
5. **Key moment**: per-clause review is what lawyers understand

### Demo 4: Document Onboarding (Foundation Demo)
*"Upload a document, get an 8-specialist analysis with review gate"*
1. Upload any PDF/DOCX
2. Watch StageLadder: 8 specialists in parallel (routing → specialists → synthesis)
3. Show HITL review modal with synthesis output
4. Approve → show final report with risk matrix
5. **Key moment**: parallel specialists visible in StageLadder

### Demo 5: Legal Research
*"Deep recursive research that knows your firm's documents"*
1. Enter a legal question
2. Watch research tree build (sub-questions expanding)
3. Highlight a verified citation (grounded in firm docs) vs unverified
4. Show HITL: deepen a specific branch
5. **Key moment**: verified/unverified distinction vs ChatGPT

---

## Brief Completeness Checklist

When auditing a brief, check each of these:

- [ ] `title:` field set
- [ ] `video:` field set (has a URL, not blank) — **currently missing on ALL**
- [ ] Benefits section (3–5 bullets, user-outcome focused)
- [ ] Features section (bullet list of every major capability)
- [ ] "When to use it" section
- [ ] "How it works" section (numbered steps)
- [ ] Every feature visible in the UI is mentioned in Features
- [ ] The primary demo moment is hinted at in the brief
- [ ] HITL interaction is described (if applicable)
- [ ] SSE/real-time behavior is mentioned (if applicable)
- [ ] Sovereign/local-model angle mentioned (if applicable)

---

## Marketing Coverage Gaps (Known)

1. **All videos missing** — `video:` field empty in all 9 briefs. No workflow has a demo video linked.
2. **4 workflows unwritten** — Discovery Review, Deposition Prep, Cross-Exam Simulation, Sentinel have no brief.md.
3. **Stage ladder visualization** — not mentioned in any brief. The real-time StageLadder with thinking badges (🧠✍️) is a visual differentiator that's never described.
4. **Persistent Case Team → sub-workflow connection** — brief doesn't mention that Deposition Prep, Cross-Exam, and Sentinel live inside a matter.
5. **Deal Memo → DOCX download** — undersold. Lawyers want Word documents.
6. **Entity deduplication** — the "same person across 10 docs = one enriched entity" is technically impressive and not highlighted.
7. **Sovereign mode** — mentioned in Brief Stress Test, Legal Research, Trial Simulator briefs, but NOT mentioned in Document Onboarding, Contract Review, Compliance Audit — even though they all run locally.
