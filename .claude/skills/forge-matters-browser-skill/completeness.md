# Persistent Case Team — Completeness Audit Reference

## Brief Status
**File**: `apps/forge/api/src/agents/legal-department/workflows/persistent-case-team/brief.md`
**Quality**: Good
**video: field**: ✗ MISSING

## Feature Inventory

| Feature | In Code | In Brief |
|---------|---------|----------|
| Matter creation (name, client, type, jurisdiction) | ✓ | ✓ |
| Two parallel agents (Facts + Documents) | ✓ | ✓ |
| Persistent checkpoint state (thread ID per matter) | ✓ | ✓ |
| Entity deduplication (upsert on matter+type+name) | ✓ | ✗ |
| 6 document classes | ✓ | ✓ |
| Real-time processing status (5-second poll) | ✓ | ~ |
| Stats bar (documents, entities, timeline, pending jobs) | ✓ | ~ |
| Matter dashboard (Case Overview + Documents tabs) | ✓ | ✓ |
| Timeline events with dates, types, significance | ✓ | ~ |
| Sub-workflow connections (Depo Prep, Cross-Exam, Sentinel) | ✓ | ✗ |
| StageLadder | ✓ | ✗ |
| Sovereign/local mode | ✓ | ✗ |

## Known Gaps

**Gap 1: video: field empty (P2)**

**Gap 2: Sub-workflow connections not mentioned (P2)** — Brief doesn't mention that Deposition Prep, Cross-Exam Simulation, and Sentinel monitoring all live inside a matter. This is the "case hub" value proposition and it's entirely absent.

**Gap 3: Entity deduplication not highlighted (P2)** — "Same person across 10 documents = one enriched entity" is technically impressive and differentiating. Not in brief.

**Gap 4: Timeline events undersold (P3)** — Timeline events with dates and significance ratings are a useful visual feature. Could be a demo moment.

## Demo Script

*"Your AI case team that gets smarter with every document"* (3 min)

| Step | Action | Say |
|------|--------|-----|
| 1 | Create a matter. Upload 3 documents | "Create a matter, upload your documents" |
| 2 | Watch Facts Agent + Documents Agent run in parallel | "Two AI agents work simultaneously — one on facts, one on documents" |
| 3 | Show Case Overview: entities extracted | "Everyone mentioned across all 3 documents, deduplicated and linked" |
| 4 | Show Timeline events | "Chronological record of events extracted from the documents" |
| 5 | From Documents tab, launch Deposition Prep | "The case team connects directly to your other workflows — depo prep, cross-exam, monitoring" |

**Key moment**: Step 3 — one entity across multiple documents. This is the "case intelligence" vs "document filing" distinction.
