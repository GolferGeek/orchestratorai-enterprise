# Future Effort: Always-On Portfolio Sentinel

## Concept

A sovereign, always-on monitoring system that watches the outside world for legal signals and cross-references them against a client's entire legal portfolio (contracts, policies, filings, employment agreements) in real time. When a signal matches something in the portfolio, a specialist team is dispatched to produce an impact memo and a proposed action before the human GC has had their morning coffee.

This is the flagship "sovereignty" workflow — the whole thing runs on the customer's own Mac Studio (or cluster), ingesting the customer's own privileged documents, and never sends anything to a third party.

## Why it was impossible before

- Requires **persistent long-running agents** (watchers) that run for months — only tractable with durable checkpointed state, which LangGraph + our observability plane now provide.
- Requires **cross-referencing a streaming signal against a large static corpus** with specialist reasoning, not just keyword search. Ironclad Repository is passive search; nobody is doing the continuous cross-product loop.
- Requires **event-driven specialist dispatch** — exactly what Pulse was built for.
- Requires **sovereign deployment** because in-house legal teams will not ingest 12,000 privileged contracts into a third-party SaaS.

## Orchestration pattern

1. **Watcher tier (Pulse)** — persistent agents monitoring Federal Register, state AG enforcement feeds, relevant case law (PACER, court RSS), agency actions (SEC, FTC, EEOC, FINRA, HHS), and the client's own industry news.
2. **Triage agent** — for each incoming signal, cross-reference against the portfolio index. Score relevance. Discard noise.
3. **Impact analysis (Legal Department)** — when a signal clears threshold, fire the Legal Department specialist team at the specific contracts / policies / agreements the signal affects. Produce a structured impact memo.
4. **HITL gate** — impact memos land in a GC inbox with proposed actions (amendment, notice, filing, no action). GC approves or edits.
5. **Audit trail** — every signal, every match, every memo, every decision is logged in the sovereign observability plane for regulatory defensibility.

## Economic unlock

- In-house legal teams currently miss 60-80% of applicable regulatory changes (ACC surveys).
- Human equivalent: $500K-$2M/yr per GC office to monitor 50 states + 10 agencies.
- Sentinel tier: $2K-$10K/mo subscription, runs on one Mac Studio.
- Every miss caught is a prevented liability, often 10-100x the annual subscription cost.

## Dependencies

- Legal Department running well on local Ollama models (current effort).
- Pulse watchers with external source adapters (Federal Register, PACER, etc.) — some exist, most don't.
- A portfolio indexer that builds and maintains a vector + structured index of the client's contracts.
- Triage scoring model — likely prompt-engineered gemma4:e4b, escalating to gemma4:26b for borderline cases.
- Sovereign observability plane with "privileged mode" that stores traces only locally.

## Risks

- **Watcher source quality.** Federal Register is clean; state AG feeds are messy; court filings are a nightmare of PDF formats. Garbage in, noise out.
- **Triage false-positive fatigue.** If the GC gets 50 low-quality alerts a day, they turn the product off. Triage calibration is the make-or-break feature.
- **Portfolio index staleness.** When the client amends a contract, the index must update or the next signal misses it.
- **Model drift on specialist analysis.** Local models running for months need periodic re-evaluation against ground-truth examples.

## Estimated scope

Large. 2-4 months of focused work after the current Legal Department local-model effort lands. Depends heavily on how many Pulse watcher adapters need to be built from scratch.

## Why this goes first in the flagship trio

- It's the workflow the Mac Studio hardware is literally made for: low duty cycle, long-running, one customer per box.
- It's the only workflow in the portfolio that produces **recurring subscription revenue** instead of per-project fees.
- It's impossible for Harvey / Hebbia / Ironclad to match because their architectures are SaaS-only.
- It ties three products together (Pulse, Forge/Legal Department, observability plane) in a way that proves the platform thesis.
