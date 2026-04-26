# Persistent Case Team — What It Does

## Purpose

The Persistent Case Team (Matters) is a container workflow that creates a persistent matter record and runs two parallel agents — Facts Agent and Documents Agent — to build a living case file from uploaded documents. Sub-workflows (Deposition Prep, Cross-Exam Simulation, Sentinel) live inside a matter and share its knowledge base.

## What a Matter Contains

- **Entities** — people, organizations, locations extracted across all documents (deduplicated)
- **Timeline** — chronological events with dates, types, and significance ratings
- **Documents** — classified documents with summaries and status
- **Stats bar** — document count, entity count, timeline event count, pending job count
- **Sub-workflow access** — Deposition Prep and Cross-Exam Simulation are launched from the Matter Dashboard

## Two Parallel Agents

**Facts Agent**: runs when documents are uploaded
- Extracts entities (upsert on matter_id + entity_type + name — same person across 10 docs = one entity)
- Builds timeline events with dates and significance
- Identifies key facts

**Documents Agent**: runs in parallel with Facts Agent
- Ingests documents into 6 classification buckets
- Extracts summaries per document
- Links documents to entities and timeline events

Both agents run every time new documents are added to a matter.

## Entity Deduplication

The entity deduplication is a technical differentiator: the same person appearing in 10 different documents creates exactly one entity record, with references to all 10 documents. This is not trivially achievable with naive document processing.

## Sub-Workflow Access

From the Matter Dashboard → Documents tab:
- **Deposition Prep** — for any witness in the matter's entity list
- **Cross-Exam Simulation** — launched from Deposition Prep workspace
- **Sentinel monitoring** — linked from Portfolio Sentinel page with matter context

## No HITL at Matter Level

Matter creation and agent runs are fully automated — no human review gate. Individual sub-workflows (Deposition Prep) may have their own flows.
