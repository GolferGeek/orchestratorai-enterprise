---
title: Legal Research Deep Dive — Institutional Knowledge
---

## Domain Insights

- **Jurisdiction and practice area matter for prompt quality.** When users provide a specific jurisdiction (e.g., "9th Circuit") and practice area (e.g., "Employment"), the research nodes produce significantly more targeted sub-questions. When left blank, the model defaults to broad federal analysis which may miss state-specific issues.

- **Unverified citations are the primary user concern.** The citation verification system (RAG-based, source name + text overlap matching) flags citations as verified/unverified. Users consistently focus on unverified citations first. The warning cards with dark text on yellow background were added specifically because users missed subtle warnings.

- **Depth 3 is the sweet spot.** maxDepth=3 with 3 sub-questions per level produces thorough research without runaway cost. Depth 4+ rarely adds value — the sub-questions become too granular. Depth 2 is fine for quick research but misses important threads.

## Technical Learnings

- **The cyclic graph pattern works reliably.** The depth_controller → research_dispatcher → research_node loop is the foundation pattern we reused for adversarial-brief's debate loop. Convergence via `pendingQuestions.length === 0` is clean — no edge cases found in production use.

- **Citation verification is soft matching.** The current `verifyCitation()` in research.node.ts does source name matching + text snippet overlap against RAG results. This catches obvious hallucinations but lets through citations that are "close enough" to real cases. The adversarial-brief effort extracted a shared `CitationGroundingService` with hard rejection — legal-research should adopt it.

- **HITL deepen/redirect is powerful but rarely used.** The review modal supports three decisions: approve, deepen (target specific nodes for more analysis), and redirect (replace sub-questions). In practice, users mostly approve or occasionally deepen. Redirect is complex to use well.

- **Token/time budgets work as expected.** When configured, the depth_controller respects both budgets and synthesizes early. The budget fields default to unlimited (null) which is what most users want.

## Architecture Decisions

- **Separate graph from document-onboarding.** Legal research has fundamentally different state (research tree, pending questions, depth tracking) vs document analysis (specialists, routing, synthesis). Sharing a graph would have been a mess — separate graphs with shared infrastructure (checkpointer, observability, LLM client) was the right call.

- **Research tree is the state, not messages.** Unlike document-onboarding which accumulates specialist outputs, legal-research builds a tree of ResearchTreeNode objects. The tree IS the research — each node has question, findings, citations, confidence, and child IDs. The memo is synthesized from the tree at the end.

- **Presentation manifest is separate from document-onboarding.** Legal research has its own WorkflowPresentation (registered as a separate agent slug lookup with `?capability=legal-research`). The stages (question analysis, research rounds, synthesis, HITL, report) are different from the document-onboarding stages.
