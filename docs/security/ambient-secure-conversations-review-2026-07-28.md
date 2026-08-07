# Ambient and Secure Conversations Security Review

Review date: August 6, 2026  
Scope: `apps/api/src/ambient`, `apps/api/src/secure-conversations`, shared
authentication/RBAC boundaries, webhook ingress, outbound HTTP, persistence,
streaming, and integration tests.

## Executive result

The review found and remediated material issues that would have blocked a
technical diligence recommendation:

- streaming endpoints were reachable without authentication;
- authenticated streaming was not organization-isolated;
- Ambient events could be evaluated outside the originating organization;
- inbound A2A replay state was process-local and therefore unsafe across
  multiple Cloud Run instances;
- external ExecutionContext fields could cross a trust boundary;
- outbound agent URLs allowed server-side request-forgery paths;
- messaging webhooks did not consistently verify provider signatures;
- registry and message reads were not consistently organization-scoped;
- stream and signing secrets had unsafe development fallbacks;
- external-agent API keys could be returned through controller-facing reads;
- several error paths exposed implementation detail or silently accepted
  failed delivery.

The working tree now fails closed for those paths. The API unit gate passes 45
suites and 210 tests. The full monorepo unit run passes 119 suites and 1,357
tests. Local integration passes 5 suites and 70 tests, including focused
Ambient/Secure HTTP boundary tests against the running API and database.

This is an internal review, not an external penetration test or certification.

## Trust boundaries and controls

| Boundary | Current control |
|---|---|
| Ambient/Secure invoke | JWT, RBAC, strict JSON-RPC and ExecutionContext validation, authenticated-user binding |
| Ambient/Secure SSE | JWT or short-lived stream token, RBAC, explicit organization, tenant-filtered event delivery |
| External A2A ingress | Public endpoint with strict origin, network and agent rate limits, signed sender binding, timestamp window, distributed nonce claim |
| External A2A routing | Frozen `invoke` transport; signed sender is bound to exactly one registered origin and organization; caller-supplied ExecutionContext must match that external identity and is passed whole |
| Agent discovery and send | HTTP(S)-only URL validation, DNS/private-address rejection, redirect refusal, timeouts, bounded response bodies |
| Telegram webhook | Constant-time shared-secret verification |
| WhatsApp webhook | Twilio request-signature validation against the configured canonical URL |
| OpenClaw messaging | Required configured token; upstream errors are not reflected to callers |
| Registry/messages/triggers/workflows/scenarios | Authorized organization is applied to reads and mutations |
| External-agent credentials | API keys remain internal to connection services and are removed from controller-facing records |

## Replay protection

Signature verification retains a short local nonce cache for fast duplicate
rejection. A valid signed request must also atomically insert its nonce into
`ambient.a2a_inbound_nonces`. The nonce primary key is the distributed claim
shared by all API instances. Duplicate claims return JSON-RPC error `-32001`;
database unavailability returns `-32050` and the request is not routed.

Migration:
`supabase/migrations/20260728210000_add_secure_conversation_nonce_replay_protection.sql`

## Test coverage added

- invoke envelope, method, ID, context, user, data, and metadata validation;
- Ambient and Secure invoke controller error contracts;
- signing key configuration, sender binding, expiry, tampering, and replay;
- distributed nonce replay and fail-closed database behavior;
- A2A origin, network identity, rate-limit, signature, and sender-header cases;
- rejection of incomplete, cross-tenant, or identity-spoofed external ExecutionContext values;
- loopback, private network, metadata endpoint, hostname, and protocol SSRF
  cases;
- bounded and malformed external JSON responses;
- Telegram and WhatsApp webhook authentication;
- stream-token secret, TTL, rate-limit, and URL-redaction behavior;
- cross-organization Ambient workflow, scenario, event, and SSE isolation;
- cross-organization Secure Conversations SSE isolation;
- external-agent secret removal;
- 18 real HTTP boundary tests against the local stack.

## In-app browser verification

The authenticated local application was exercised through the in-app browser
after the hardening changes. Verification covered:

- Agents catalog, context/RAG invocation, media configuration, and custom
  pipeline persistence;
- Workflows catalog and Marketing Swarm configuration;
- Ambient dashboard, listener simulation, tenant-filtered live stream,
  scenarios, workflows, triggers, and executions;
- Secure Conversations overview, registry, inbound live stream, outbound form,
  security monitor, message log, settings, scenarios, protocol tools, and
  observability pages;
- canonical platform authentication and concrete organization selection for
  Ambient and Secure Conversations browser API calls;
- short-lived product-bound stream tokens for Ambient, Workflows, and Secure
  Conversations SSE connections.

## Required deployment configuration

Production deployment must supply unique secret-manager values for:

- `SECURE_CONVERSATIONS_SIGNING_KEY` (at least 32 bytes);
- `STREAM_TOKEN_SECRET`;
- `TELEGRAM_WEBHOOK_SECRET` when Telegram is enabled;
- `TWILIO_AUTH_TOKEN` and `TWILIO_WEBHOOK_URL` when WhatsApp is enabled;
- `OPENCLAW_AUTH_TOKEN` when OpenClaw is enabled.

Keep `SECURITY_MODE=strict`,
`ORIGIN_VALIDATION=strict`, and
`SECURE_CONVERSATIONS_ALLOW_PRIVATE_NETWORKS=false`. Configure exact trusted
origins; wildcard origins are rejected in strict mode.

## Remaining diligence items

These are not known bypasses in the reviewed paths, but they remain appropriate
before handling sensitive production customer data:

1. Obtain an independent architecture review and penetration test.
2. Store external-agent API keys in a secret manager or encrypted credential
   store rather than plaintext database columns.
3. Replace in-memory rate limiting with a shared gateway or distributed store
   before horizontally scaling adversarial public ingress.
4. Add automated key rotation and per-partner signing credentials; the current
   implementation uses one shared HMAC trust domain.
5. Exercise backup/restore, incident response, and secret-rotation runbooks.
6. Verify the Spark and Google Cloud deployments use the strict settings above
   after the reviewed changes are deployed.

## Verification commands

```bash
npm run lint --workspace apps/api
npm run build --workspace apps/api
npm test --workspace apps/api -- --runInBand
npm run test:integration:security
npm ci --ignore-scripts
npm run lint
npm run build
npm test
npm run test:integration
npm run test:gcp:migrations
npm audit --audit-level=high
npm run audit:accepted
```
