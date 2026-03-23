# Prediction Dashboard — Chrome Tests

## Overview
The Forge Prediction Dashboard is a comprehensive trading prediction and portfolio management system
with 16 core routes, 25+ backend handlers, and 70+ API methods.

## Architecture
- **Frontend:** Forge Web (port 6201)
- **Backend:** Forge API (port 6200) — dashboard handlers read from prediction schema
- **Processing:** Pulse API (port 6500) — creates predictions via cron/triggers
- **Database:** prediction schema in Supabase (Postgres 54322)

## Test Order (recommended)
Start with the main dashboard, verify data flows, then work outward:

1. **Dashboard** — main hub, verify predictions display
2. **Portfolios** — manage universes and targets (data foundation)
3. **Analysts** — manage prediction analysts
4. **Trading** — portfolio performance, P&L
5. **Daily Report** — automated postmortem analysis
6. **Learnings** — learning management
7. **Learning Queue** — approval workflow
8. **Review Queue** — prediction approval
9. **Missed Opportunities** — system-detected learnings
10. **Test Lab** — scenario building and testing
11. **Alerts** — system monitoring
12. **Crawl Status** — source health
13. **Tool Wishlist** — feature tracking
14. **Prediction Detail** — deep dive into individual predictions
15. **Target Detail** — instrument details

## Key Data Flow
```
Articles (crawler) → Predictors (Pulse trigger) → Predictions (Pulse batch/trigger)
                                                          ↓
                                                  Forge Dashboard reads & displays
```

## Prerequisites
- Forge API running on port 6200
- Forge Web running on port 6201
- Auth API running on port 6100
- Pulse API running on port 6500 (for prediction generation)
- Supabase running (REST 54321, Postgres 54322)
- Logged in as super-admin (golfergeek@orchestratorai.io)

## Current Data (as of 2026-03-19)
- 3,651 predictors
- 83 predictions (37 active, 37 resolved, 14 expired)
- 2 universes (US Tech Stocks 2025, Crypto Majors 2025)
- Agent slug: us-tech-stocks
