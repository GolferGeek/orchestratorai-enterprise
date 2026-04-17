# Portfolio Sentinel

## What

An always-on legal monitoring system that watches external legal signals — regulatory changes, enforcement actions, case law updates, and legislative developments — and cross-references them against a firm's client portfolio to surface actionable alerts. A partner opens the Sentinel dashboard and sees: "3 new alerts this week — GDPR enforcement action affects Client A's EU subsidiary, new Delaware chancery ruling relevant to Client B's pending merger, proposed SEC rule change impacts Client C's fund structure."

This is the first Pulse-triggered, Forge-executed workflow — a cron-scheduled automation that runs without user initiation. It bridges the gap between "reactive analysis" (DD rooms, contract review) and "proactive intelligence" (the system watches for you while you sleep).

## Why

Law firms are drowning in external signals. A mid-size firm with 200 active matters across 50 clients needs to track regulatory changes in 8+ jurisdictions, monitor case law developments in 12+ practice areas, and watch enforcement actions from a dozen agencies. Today that's done by junior associates reading newsletters and hoping they spot the relevant ones. Things get missed. When they do, the firm looks incompetent — or worse, the client suffers.

Portfolio Sentinel turns this from a human-scale problem into a machine-scale problem:

1. **Continuous scanning**: Fetch legal signals from configured sources on a schedule (hourly/daily). No human has to remember to check.

2. **Portfolio cross-reference**: Each signal is evaluated against every active client holding using RAG-based semantic matching. A new GDPR enforcement action doesn't just sit in a feed — the system asks "which of our clients have EU data processing operations?" and surfaces matches.

3. **Alert triage**: Not every match is urgent. The system scores relevance (direct impact vs. tangential), severity (enforcement action vs. guidance update), and urgency (immediate deadline vs. informational). Partners see a ranked dashboard, not a firehose.

4. **Audit trail**: Every alert records what signal triggered it, which portfolio holding it matched, why the system flagged it, and what the recommended action is. When a partner asks "how did we miss that regulatory change?", the answer is either "we didn't — alert #247" or "the source wasn't configured."

5. **Practice area intelligence**: Over time, the alert corpus becomes a searchable knowledge base of legal developments cross-referenced against real client situations. This is the kind of firm-level intelligence that justifies enterprise pricing.

## Shape

### Data Model

**New table: `legal.sentinel_sources`**
Configured external sources the system polls for legal signals.
- `id`, `org_slug`, `name`, `source_type` (rss, api, webpage), `url`, `poll_interval_minutes`, `practice_areas[]`, `jurisdictions[]`, `enabled`, `last_polled_at`, `created_at`

**New table: `legal.sentinel_signals`**
Raw legal signals fetched from sources, deduplicated by content hash.
- `id`, `org_slug`, `source_id`, `title`, `summary`, `full_text`, `url`, `published_at`, `signal_type` (enforcement, ruling, legislation, guidance, news), `jurisdictions[]`, `practice_areas[]`, `content_hash`, `ingested_at`

**New table: `legal.sentinel_portfolio`**
Client/matter portfolio holdings that signals are cross-referenced against.
- `id`, `org_slug`, `client_name`, `matter_name`, `practice_areas[]`, `jurisdictions[]`, `key_entities[]`, `description`, `active`, `created_at`, `updated_at`

**New table: `legal.sentinel_alerts`**
Generated alerts from signal-vs-portfolio cross-referencing.
- `id`, `org_slug`, `signal_id`, `portfolio_id`, `relevance_score` (0-100), `severity` (critical/high/medium/low), `urgency` (immediate/this_week/informational), `summary`, `reasoning`, `recommended_action`, `status` (new/acknowledged/dismissed/actioned), `created_at`, `acknowledged_by`, `acknowledged_at`

### Architecture — Pulse Triggers, Forge Executes

**Signal Ingestion** (Pulse cron → Forge workflow):
1. A Pulse cron trigger fires on schedule (configurable per source, default hourly)
2. Pulse calls `POST /legal-department/jobs` with `jobType: 'sentinel-ingest'` and the source config
3. A Forge LangGraph `sentinel-ingest` workflow:
   - Fetches new content from the source URL (RSS parse, HTML extract, API call)
   - Deduplicates against existing signals by content hash
   - Classifies each signal: type, jurisdictions, practice areas (LLM call)
   - Stores to `legal.sentinel_signals` table
   - Ingests signal text into RAG collection `sentinel-signals-{orgSlug}` for cross-reference

**Portfolio Cross-Reference** (triggered after ingestion, or on schedule):
1. After ingestion completes (or on a separate daily cron), a `sentinel-evaluate` workflow fires
2. For each new/unprocessed signal, the workflow:
   - Queries portfolio RAG collection `sentinel-portfolio-{orgSlug}` with the signal text
   - For each portfolio match above a relevance threshold, generates an alert via LLM:
     - Relevance score (how directly does this signal affect this holding?)
     - Severity (enforcement action = high, guidance = low)
     - Recommended action (review contract, notify client, update filing, monitor)
   - Writes alerts to `legal.sentinel_alerts`

This is the compliance audit's `evaluate_finding` + `cross_reference_loop` pattern with different collections and a different scoring rubric.

**Dashboard** (Forge web):
- Alert feed: chronological list of alerts, filterable by client, severity, practice area, status
- Signal feed: raw signals with source attribution and ingestion status
- Portfolio management: add/edit/deactivate client holdings
- Source configuration: add/edit/disable signal sources, set polling intervals
- Alert detail: signal text, matched portfolio holding, LLM reasoning, recommended action, status controls (acknowledge, dismiss, action)

### Out of Scope

- **Real-time streaming**: This is poll-based, not WebSocket/streaming. Hourly or daily polling is sufficient for legal signals that change on legislative/judicial timescales.
- **Automated client notifications**: The system surfaces alerts to firm attorneys. It does not email clients or file anything externally.
- **Document generation from alerts**: No auto-generated memos or briefs from alerts. That's a future extension (alert → research workflow → memo).
- **Custom source parsers**: V1 supports RSS and basic HTML extraction. Custom API integrations (Westlaw, LexisNexis, PACER) are future.
- **Alert ML training**: No feedback loop to improve scoring. V1 uses LLM scoring per-alert. ML-based relevance tuning is future.

## Constraints

- **Pulse triggers, Forge executes**: The cron schedule lives in Pulse. The LangGraph workflow lives in Forge. Pulse fires via A2A HTTP call to Forge's legal-department job queue. No processing logic in Pulse.
- **Local models for workflow LLM calls**: Per project convention, workflow LLM calls default to local Ollama. Signal classification and alert scoring use local models.
- **RAG-based cross-reference**: Reuse the compliance audit's hybrid RAG search pattern (vector + keyword RRF). Don't build a custom matching engine.
- **No new product**: This is a new capability in the Legal Department workspace, not a new product. New tables go in the `legal` schema. Frontend goes in `apps/forge/web/src/views/agents/legal-department/`.
- **Fail loud on fetch errors**: If a source fetch fails, log the error and surface it in the dashboard. Don't silently skip — the whole point is that monitoring is reliable.
