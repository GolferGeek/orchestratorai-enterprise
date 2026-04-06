# Intention: Remove Predictor and Risk Runner Agents

## What

Completely remove the Predictor and Risk Runner agents from the orchestratorai-enterprise-dev codebase, including all UI views, API capabilities, processing engines, database schemas, and supporting infrastructure (crawler, Diviner bridge service).

## Why

These agents exist to demonstrate prediction and risk analysis dashboards powered by Diviner running on a separate Spark machine. They:
- Add ~690 files of complexity that only one person finds impressive
- Depend on an external Diviner instance via Bridge A2A routing (Tailscale to Spark machine)
- Create port/CORS issues between dev and prod environments
- Pull in crawler infrastructure (sources, articles) that serves no other purpose
- Include 4 database schemas (prediction, predictions, risk, crawler) that no other agent uses

The enterprise repo retains these agents. This dev repo should be clean.

## Constraints

- Zero technical debt — no orphaned imports, dead types, unused env vars, broken routes, or empty directories left behind
- No regression — the remaining agents (Marketing Swarm, Legal Department, CAD Agent) must continue to work
- Database must be clean — schemas dropped, migrations handled properly
- Build must pass — all products (Forge, Compose, Pulse, Bridge, Auth, Admin, Command) must build and start
