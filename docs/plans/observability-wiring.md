# Observability Wiring Plan

## Current State
- Forge + Compose: Full implementation (local events, DB writes, webhook forward, SSE streaming)
- Admin: Aggregator only — calls endpoints on Forge/Compose that don't exist yet
- Auth, Flow, Pulse, Bridge: Zero observability

## Phase 1: Fix Forge/Compose Admin Endpoints
- Add `GET /admin/observability/events` — recent events with filtering
- Add `GET /admin/observability/metrics` — aggregated metrics
- Add `GET /admin/observability/errors` — error aggregation
- These endpoints are what Admin API calls to build its dashboards

## Phase 2: Add Centralized Ingest to Admin
- Add `POST /webhooks/status` endpoint to Admin API
- Receives webhook POSTs from all product APIs
- Stores/aggregates cross-product observability data

## Phase 3: Wire Auth API
- Track login/logout events
- Track RBAC changes (role grant/revoke)
- Track token refresh events

## Phase 4: Wire Flow API
- Track task creation, progress, completion
- Track sprint/team activity

## Phase 5: Wire Pulse + Bridge
- Pulse: automation trigger executions, workflow completions
- Bridge: A2A inbound/outbound message tracking

## Phase 6: LLM Token Tracking
- Capture per-call: input tokens, output tokens, cost, latency, model, provider
- Surface in Admin LLM Analytics dashboard

## Source Pattern
Copy ObservabilityWebhookService + ObservabilityEventsService from Forge into each product, adapting module imports.
