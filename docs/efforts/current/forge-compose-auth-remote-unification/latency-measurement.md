# Latency Measurement — Phase 1 Results

**Date**: 2026-04-18
**Measured by**: Phase 1 of forge-compose-auth-remote-unification effort

## Measurement Setup

- All services running locally in dev mode (not Docker)
- Test user: golfergeek@orchestratorai.io (super-admin)
- auth-api: http://localhost:6100
- compose-api: http://localhost:6300
- forge-api: http://localhost:6200
- 10 runs each, first run excluded from p50 calculation (warm-up)

## Results

### auth-api POST /auth/authorize (standalone)
| Run | Latency |
|-----|---------|
| 1 (warm-up) | 54ms |
| 2 | 27ms |
| 3 | 29ms |
| 4 | 28ms |
| 5 | 31ms |
| 6 | 32ms |
| 7 | 32ms |
| 8 | 28ms |
| 9 | 31ms |
| 10 | 29ms |

**p50 (runs 2–10)**: ~29ms

### compose-api GET /rbac/roles baseline (in-process auth)
| Run | Latency |
|-----|---------|
| 1 | 7ms |
| 2–10 | 6–8ms |

**p50**: ~6ms

### forge-api GET /rbac/roles baseline (in-process auth)
| Run | Latency |
|-----|---------|
| 1 | 8ms |
| 2–10 | 6–7ms |

**p50**: ~6ms

## Decision

**Projected post-migration p50**: ~29ms + ~6ms overhead = ~35ms per guarded request.

**Threshold**: <50ms → proceed, no LRU cache.

**Decision: PROCEED. No LRU cache required.**

Note: The in-process auth baseline (6ms) becomes ~35ms after adding the auth-api network hop. This is a ~29ms increase per guarded request, which is acceptable for both compose-api (composable runners) and forge-api (legal workflows where LLM calls dwarf auth overhead).

## @Public() Endpoint Audit

### compose-api

| File | Route | Category | Decision |
|------|-------|----------|----------|
| `app.controller.ts` | `GET /` | Root ping | Legitimately @Public — health/ping endpoint |
| `health/health.controller.ts` | `GET /health` | Health check | Legitimately @Public — monitoring needs no auth |
| `speech/speech.controller.ts` | All speech routes | Accessible to guest sessions | Legitimately @Public — serves both authenticated users and guest widgets |
| `customer-service/customer-service.controller.ts` | `POST /customer-service/session`, `POST /customer-service/converse` | Guest session auth | Legitimately @Public — GuestSession JWT issued/verified locally |
| `analytics/analytics.controller.ts` | `POST /analytics/events` | Frontend telemetry | Legitimately @Public — pre-login pages send events; intentionally no-op |
| `rag/internal-query.controller.ts` | `POST /rag/internal/query` | Internal service-to-service | Keep @Public — already has TODO for network-level isolation (loopback/mTLS/shared secret). Out of scope for this effort. |
| `assets/assets.controller.ts:51` | `GET /assets/storage/:bucket/*` | Storage proxy | Keep @Public — browser proxy for Supabase storage files. Scoping with signed URLs is a separate effort. |
| `assets/assets.controller.ts:82` | `GET /assets/:id` | Asset stream by ID | Keep @Public — same as above. |
| `crawler/crawler-admin.controller.ts:495` | `POST /api/crawler/admin/trigger/:frequency` | Dev-only trigger | Keep @Public for now — comment says "no auth for dev". Needs admin permission guard for production. Out of scope. |

### forge-api
(Populated during Phase 3, step 3.2)
