# Deal Memo Generation — What It Does

## Purpose

Deal Memo Generation takes a completed Due Diligence Room and drafts a professional deal memorandum. It hydrates from the DD room's full analysis checkpoint — 5 sections drafted in parallel — then goes through HITL review with a hard cap of one re-synthesis iteration.

## Prerequisite

A completed Due Diligence Room job is required. The Deal Memo workflow reads the DD room's state from the LangGraph checkpointer — no re-upload needed.

## 5 Parallel Section Drafters

Each section is drafted independently in parallel:
1. **Reps & Warranties** — representations and warranty analysis from the DD findings
2. **Indemnification** — indemnification obligations and caps
3. **Disclosure Schedules** — material disclosures and their risk assessment
4. **Conditions Precedent** — conditions that must be satisfied before closing
5. **Covenants** — pre-closing and post-closing covenant analysis

After all 5 sections complete, `memo_synthesis` assembles the final memo.

## Per-Citation Validation

Every citation in the memo is validated against the DD room's registries (findings registry, risk matrix, document registry). This prevents hallucinated additions — if a citation doesn't exist in the DD room's findings, it doesn't appear in the memo.

**"No LLM re-composition = no hallucinated additions"** — the memo is assembled deterministically from the DD room's data, with LLM used only to draft narrative text.

## HITL: Approve / Reject / Modify

The review modal (`DealMemoReviewSection`) shows the complete drafted memo.
- **Approve** → finalize and make available for download
- **Reject** → re-draft all 5 sections with reviewer's feedback (1 re-synthesis max)
- **Modify** → apply direct edits + re-synthesize (1 re-synthesis max)

The **1 re-synthesis cap** is a hard architectural constraint — after one reject/modify cycle, the memo is finalized as-is.

## Download

Completed memo available as:
- **Markdown** — raw markdown file
- **DOCX** — Microsoft Word document (what lawyers actually want)

The DOCX download is an important differentiator — lawyers live in Word.

## UI Layout

`DealMemoWorkspaceView` with two tabs:
- **Memo Sections** — formatted sections with inline citations
- **Markup View** — track-changes style view showing what changed from DD findings
