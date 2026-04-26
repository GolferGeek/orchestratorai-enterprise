# Portfolio Sentinel — What It Does

## Purpose

Portfolio Sentinel is an always-on monitoring dashboard that watches legal signal sources (RSS feeds, webpages) for developments relevant to a firm's client portfolio. Unlike other workflows, it has no job submission and no HITL — it runs continuously in the background and surfaces alerts.

## What It Monitors

- **RSS feeds** — court filing feeds, regulatory announcement feeds, news feeds
- **Webpages** — any URL that can be polled (e.g., a regulator's "recent actions" page)
- **Signal classification** — each fetched item is classified for legal relevance and impact
- **Portfolio linking** — signals are automatically linked to relevant matters and clients

## The Dashboard (4 Tabs)

**Alerts** — signals that have been elevated to "needs attention" status
- Filter by status (new/acknowledged/resolved) and severity (critical/high/medium/low)
- Each alert links to the underlying signal and the affected matter

**Signals** — all classified signals from all sources
- Legal signals labeled by type (regulatory change, court ruling, industry development)
- Impact badges showing which matters/clients are affected

**Portfolio** — client/matter view with signal correlation
- Each matter shows recent signals linked to it
- At-a-glance risk indicator per matter

**Sources** — source configuration
- Add/remove RSS feeds and webpages
- Configure poll interval, practice area tags
- Show last-polled timestamp and status

## Background Processing

Two background graphs run on schedule or on-demand:
- **Ingest graph**: fetch sources → deduplicate → classify → store → update source record
- **Evaluate graph**: enrich signals → link to portfolio → assess risk

These run without user interaction. The user only sees the results in the dashboard.

## Testing Approach

Testing Sentinel requires:
1. Verifying the dashboard loads with its 4 tabs
2. Adding a test source (RSS URL or webpage URL)
3. Triggering an ingest run (if there's a "Poll Now" button)
4. Confirming signals appear in the Signals tab after processing
5. Confirming alerts are generated for high-impact signals
