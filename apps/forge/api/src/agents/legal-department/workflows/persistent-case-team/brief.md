---
title: Persistent Case Team
video:
---

## Benefits

- **Build a growing knowledge base for every matter.** Instead of re-reading documents every time you need to recall a witness's role or a key date, the Case Team extracts named entities and timeline events from every document you upload and accumulates them in a persistent, matter-scoped knowledge base. The more documents you add, the richer the picture becomes.

- **Automatically classify every document in the matter.** Each uploaded file is classified (contract, court filing, correspondence, deposition, evidence, or other), dated, summarized, and tagged with parties and key terms — without you touching a form.

- **See the entire cast of characters at a glance.** The Case Overview tab groups all extracted entities by type (people, organizations, dates, amounts, contracts, claims) so you can instantly see who is involved, what role they play, and how many source documents reference them.

- **Track what happened and when.** Timeline events extracted across all documents are stored with dates, event types, significance ratings, and parties involved — giving you a chronological record of the matter built from your own documents.

- **Runs on your local infrastructure.** All LLM calls use your local Ollama instance. No case facts, document content, or extracted knowledge leaves your machine.

## Features

- **Two-agent processing pipeline**: Facts Agent (entity + timeline extraction) and Documents Agent (classification + metadata extraction) run in parallel for every uploaded document
- **Persistent checkpoint state**: thread ID is scoped to the matter, so each new document can see prior-document context without re-reading all past documents
- **Entity deduplication**: upserts on `(matter_id, entity_type, lower(name))` — the same person mentioned across 10 documents appears as one entity with all source documents tracked
- **Document classification**: 6 classes (contract, deposition, court_filing, correspondence, evidence, other); includes document date, summary, parties, key terms, and additional metadata
- **Real-time processing status**: Documents tab polls every 5 seconds while any document is still processing; spinner clears when both agents complete
- **Stats bar**: live counts of documents, entities, timeline events, and pending-processing jobs

## When to use it

- You've just been retained on a new matter and need to quickly understand the cast of characters and chronology
- You're receiving a rolling production of documents over weeks and need each batch to enrich the same knowledge base without starting over
- You need to hand off a matter to another attorney and want them to see an organized entity list and timeline without reading every document
- You're preparing for a deposition and want to quickly pull up all documents that reference a specific witness

## How it works

1. Navigate to **Case Team** under Legal Department in the sidebar
2. Click **New Matter** and fill out the matter name, client, type, jurisdiction, and opposing parties
3. Open the matter dashboard and switch to the **Documents** tab
4. Click **Upload Document** and select any PDF, DOCX, or TXT file
5. Two processing jobs launch automatically — watch the spinner; it clears when both Facts Agent and Documents Agent have finished
6. Switch to the **Case Overview** tab to see extracted entities grouped by type with source document counts
7. Return to the Documents tab to see the classification badge, document date, summary, parties, and key terms for each uploaded file
8. Upload more documents at any time — each new file adds to the same entity and timeline knowledge base for the matter
