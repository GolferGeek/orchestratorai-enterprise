---
title: Deal Memo Generation
video:
---

## Benefits

- **Turn a completed due diligence room into a professional deal memo in minutes.** The system reads the entire DD room — every document classification, every specialist finding, every risk flag — and drafts a structured acquisition memo covering all five critical sections. No copy-pasting, no synthesizing findings by hand.

- **Every citation traces back to a DD finding.** Every claim in the memo carries a validated citation referencing the specific DD finding, document, or risk flag it came from. Fabricated citations are caught and stripped — what you read is grounded in what the DD room actually found.

- **Five specialized sections, each drafted with full DD context.** Representations & Warranties, Indemnification, Disclosure Schedules, Conditions Precedent, and Covenants — each section is drafted by a specialist that sees the full DD output, not a summary. Cross-references between sections are preserved.

- **Deterministic synthesis — no LLM rewriting your prose.** The final memo is stitched from the five section drafts with deterministic markdown assembly. No LLM re-composition step means no hallucinated additions or silently dropped findings. What the section specialists wrote is what you get.

- **You approve every section before finalization.** Review the full memo and each section individually. Accept it, reject with feedback to re-draft all sections, or directly edit specific sections. One re-synthesis cycle is allowed before the system finalizes — preventing infinite loops while giving you meaningful editorial control.

## Features

- Hydrates the full DD room checkpoint: deal context, document index, specialist outputs, risk matrix, deal-breaker flags
- Five section drafters: Representations & Warranties, Indemnification, Disclosure Schedules, Conditions Precedent, Covenants
- Per-citation validation against DD finding/document/risk registries
- Deterministic markdown synthesis (no LLM re-composition)
- References appendix: findings table, documents table, risk matrix table, deal-breaker table
- HITL review gate with approve/reject/modify decisions
- Reject re-drafts all five sections with reviewer feedback threaded in
- Modify applies your direct edits to specific sections and re-synthesizes
- Re-synthesis hard cap (1 iteration) prevents runaway loops
- Token budget pruning for large DD rooms (>400k chars)
- Download as Markdown or DOCX
- Supports stock purchase, asset purchase, and merger deal structures

## When to use it

- You've completed a due diligence room and need to produce a deal memo
- You want a structured acquisition agreement summary grounded in actual DD findings
- You need a memo that covers all five critical M&A sections with validated citations
- You're preparing for negotiation and need a professional document ready for partner review

## How it works

1. From a completed Due Diligence Room, click **Generate Deal Memo**
2. Select the deal structure (stock purchase, asset purchase, or merger)
3. Watch the system hydrate DD findings and draft each section
4. Review the full memo and individual sections in the tabbed workspace
5. Approve the memo, reject with feedback to re-draft, or directly edit specific sections
6. Download the finalized memo as Markdown or DOCX
