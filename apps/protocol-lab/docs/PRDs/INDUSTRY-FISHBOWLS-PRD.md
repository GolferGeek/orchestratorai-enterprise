# Industry Fishbowl Apps — Secure Agentic Communication in Action

## Vision

Two self-contained "fishbowl" applications that let you watch three companies interact through the full Agent Communication Protocol stack in real-time. Each app is a complete world — its own NestJS backend with three org modules, its own Vue frontend showing the inter-org communication, and full integration with the existing Protocol API for global observability.

The existing playground (ResearchHub, MarketPulse, ContentForge) demonstrates the protocol with generic media/content agents. These fishbowl apps demonstrate the same protocol solving **real industry problems** — regulated financial services and manufacturing supply chains — where secure agentic communication isn't a nice-to-have, it's mandatory.

## Architecture Overview

```
Existing (unchanged):
  Protocol API (4000)     — Global observability, provider registry
  ResearchHub (4001)      — Analysis agent
  MarketPulse (4002)      — Market intelligence agent
  ContentForge (4003)     — Content generation agent
  Agent-Consumer (4006)   — Consumer agent
  Frontend SPA (4010)     — Main playground UI

New:
  Prairie Ridge Credit App (4007)    — Farm Credit ecosystem fishbowl
    Backend: NestJS with 3 org modules (Prairie Ridge Credit, AgriServ Financial, Central Farm Bank)
    Frontend: Vue SPA showing inter-org communication

  BuildWell Manufacturing App (4008)     — Manufacturing ecosystem fishbowl
    Backend: NestJS with 3 org modules (BuildWell Manufacturing, AlloyTech Supply, Apex OEM)
    Frontend: Vue SPA showing inter-org communication
```

All apps share:
- `@agent-communication/shared-protocols` (31 providers, JWT auth, message logging)
- `@agent-communication/shared-types` (protocol types, message types)
- Protocol API (4000) for global message observability
- Same Supabase JWT authentication

## App 1: Prairie Ridge Credit — Farm Credit Secure Communications

### The Story
Prairie Ridge Credit is a shared-services provider for Farm Credit System associations. AgriServ Financial is one of those associations — a lender making agricultural loans. Central Farm Bank is the funding bank that oversees all associations. These three entities must exchange regulated financial data securely, with full audit trails, compliance verification, and identity-verified communications.

### The Three Orgs

**Prairie Ridge Credit (shared-services provider)**
- Capabilities: compliance-checking, cornerstone-operations, helpdesk, cross-association-reporting
- Identity: x509 certificates (regulated entity)
- Role: Receives requests from associations, processes them, returns results
- Trust level: Pre-authorized (allowlist) by all associations

**AgriServ Financial (lending association)**
- Capabilities: loan-submission, compliance-request, borrower-data-query
- Identity: oauth-jwt (association-level auth)
- Role: Submits loan documents for compliance, requests helpdesk support
- Trust level: Established (reputation-based) with Prairie Ridge Credit

**Central Farm Bank (funding bank / oversight)**
- Capabilities: oversight-review, capital-adequacy-check, examination-request
- Identity: x509 certificates (regulatory authority)
- Role: Requests cross-association reports, runs oversight reviews
- Trust level: Maximum (allowlist + x509 mutual TLS)

### Scenarios (Each exercises specific protocol layers)

**Scenario 1: Loan Compliance Check**
AgriServ Financial submits a loan application to Prairie Ridge Credit for compliance validation.
- **Discovery**: FCS discovers Prairie Ridge Credit's compliance capability via well-known
- **Transport**: A2A JSON-RPC 2.0 (method: `compliance.validateLoan`)
- **Identity**: FCS signs with oauth-jwt; Prairie Ridge Credit verifies
- **Encryption**: Envelope (ECDH + AES-256-GCM) — loan data is PII
- **Trust**: Reputation check (FCS has 95% success rate with Prairie Ridge Credit)
- **Audit**: Hash-chain entry for regulatory compliance
- **Payment**: None (covered by SLA)
- **Resilience**: Retry with backoff (compliance service is critical)

**Scenario 2: Helpdesk Ticket — Cornerstone System Issue**
AgriServ Financial reports a Cornerstone system problem to Prairie Ridge Credit's helpdesk.
- **Transport**: WebSocket (real-time back-and-forth)
- **Identity**: oauth-jwt
- **Encryption**: Envelope
- **Trust**: Established reputation
- **Negotiation**: Capability-card (route to helpdesk vs compliance vs reporting)
- **Orchestration**: Pipeline (classify → search-kb → resolve/escalate)

**Scenario 3: Quarterly Oversight Review**
Central Farm Bank requests cross-association performance data from Prairie Ridge Credit.
- **Discovery**: Central Farm Bank discovers Prairie Ridge Credit's reporting capability
- **Transport**: A2A JSON-RPC 2.0 (method: `reporting.quarterlyReview`)
- **Identity**: x509 mutual authentication (regulatory requirement)
- **Encryption**: TLS-mutual (highest security — examiner data)
- **Trust**: Allowlist (Central Farm Bank is pre-authorized regulator)
- **Audit**: Hash-chain (examination records are permanent)
- **Negotiation**: ACP (negotiate report format, date range, associations included)
- **Observability**: OpenTelemetry (trace the full multi-step report generation)

**Scenario 4: Capital Adequacy Stress Test**
Central Farm Bank runs a stress test requesting data from multiple associations through Prairie Ridge Credit.
- **Transport**: A2A JSON-RPC 2.0
- **Identity**: x509 (regulatory authority)
- **Encryption**: TLS-mutual
- **Resilience**: Bulkhead (limit concurrent queries to prevent overload)
- **Resilience**: Circuit-breaker (if one association's data feed is down, don't cascade)
- **Orchestration**: Pipeline (collect from N associations → aggregate → analyze → report)
- **Payment**: None (regulatory authority)

**Scenario 5: New Association Onboarding (First Contact)**
A new association (not yet trusted) attempts to connect to Prairie Ridge Credit.
- **Discovery**: New association discovers Prairie Ridge Credit via well-known
- **Trust**: First-contact (starts untrusted, must build reputation)
- **Identity**: local-keys initially, upgrades to oauth-jwt after verification
- **Negotiation**: Capability-card (limited capabilities until trusted)
- **Encryption**: Envelope (standard until trust earned, then mutual TLS available)
- Circuit-breaker starts CLOSED, demonstrating trust progression over multiple interactions

### Frontend — The Fishbowl View

Three-panel layout:
- **Left panel**: AgriServ Financial — shows outgoing requests, responses received, trust status
- **Center panel**: Prairie Ridge Credit — shows incoming requests, processing, routing decisions
- **Right panel**: Central Farm Bank — shows oversight queries, examination results, flags

**Shared elements**:
- Message timeline at bottom — every inter-org message in chronological order
- Click any message → slide-out detail showing full security envelope, encryption, trust, payment
- Protocol stack indicator per message (which of the 31 providers were active)
- Trust progression visualization (dots/timeline showing trust building over interactions)
- Circuit breaker status per org-to-org connection
- Scenario selector — pick a scenario, watch it play out with real API calls

## App 2: BuildWell Manufacturing — Manufacturing Supply Chain Communications

### The Story
BuildWell Manufacturing is a specialty lubricant formulator. AlloyTech Supply is their manufacturing and distribution arm. Apex OEM is an automotive manufacturer that buys lubricants. These three entities exchange purchase orders, quality data, and shipping logistics — replacing traditional EDI with secure agentic communication. Money changes hands (Lightning payments for POs), quality holds require re-negotiation, and the supply chain must be resilient.

### The Three Orgs

**BuildWell Manufacturing (formulator / parent)**
- Capabilities: formulation-lookup, spec-validation, oem-onboarding, pricing
- Identity: did (decentralized identity — modern company)
- Role: Receives spec queries, validates formulations, manages OEM relationships
- Trust level: Pre-authorized (allowlist) for known Apex OEMs

**AlloyTech Supply (manufacturer / distributor)**
- Capabilities: production-scheduling, quality-inspection, inventory-check, shipping
- Identity: local-keys (internal operations)
- Role: Manufactures products, runs quality tests, ships orders
- Trust level: Maximum (internal org, same parent company)

**Apex OEM (customer / buyer)**
- Capabilities: po-submission, spec-query, order-tracking, coa-request
- Identity: oauth-jwt (external partner)
- Role: Submits purchase orders, queries specs, tracks shipments
- Trust level: Starts at first-contact, builds to reputation-based

### Scenarios

**Scenario 6: Purchase Order via A2A (EDI Replacement)**
Apex OEM submits a purchase order to BuildWell Manufacturing, which routes to AlloyTech Supply for production.
- **Discovery**: OEM discovers BuildWell Manufacturing's PO capability via well-known
- **Transport**: A2A JSON-RPC 2.0 (method: `po.submit`)
- **Identity**: OEM signs with oauth-jwt; BuildWell Manufacturing verifies
- **Payment**: Lightning L402 (payment attached to PO — real Bitcoin regtest)
- **Encryption**: Envelope (PO contains pricing and quantities)
- **Trust**: Reputation (OEM has 12 successful orders)
- **Audit**: Hash-chain (purchase order is a legal document)
- **Orchestration**: Pipeline (validate PO → check inventory → schedule production → confirm)

**Scenario 7: Formulation Spec Query**
Apex OEM queries whether BuildWell Manufacturing can meet a specific OEM specification.
- **Transport**: HTTP-REST (simple query, fast response)
- **Identity**: oauth-jwt
- **Encryption**: None (spec catalog is non-sensitive)
- **Trust**: Reputation check
- **Negotiation**: ACP (negotiate response format — full spec sheet vs summary)
- **Payment**: x402-USDC (micro-payment for premium spec access)

**Scenario 8: Quality Hold — Out-of-Spec Batch**
AlloyTech Supply's quality lab finds a batch out of spec. Triggers notification chain.
- **Transport**: WebSocket (urgent, real-time)
- **Identity**: local-keys (internal AlloyTech Supply → BuildWell Manufacturing)
- **Encryption**: Envelope (quality data is proprietary)
- **Trust**: Allowlist (internal communication)
- **Resilience**: Circuit-breaker (if notification fails, don't silently drop it)
- **Negotiation**: Capability-card (route to quality vs production vs shipping)
- Then BuildWell Manufacturing notifies Apex OEM:
  - **Transport**: A2A JSON-RPC 2.0 (method: `order.qualityHold`)
  - **Identity**: did → oauth-jwt (cross-org)
  - **Trust**: Reputation-based (established partner)
  - **Payment**: Stripe refund initiated if order was prepaid

**Scenario 9: Competitive Bid / Auction**
Apex OEM puts a large order out for bid. Multiple formulations could work.
- **Negotiation**: Auction (BuildWell Manufacturing bids on best formulation/price combo)
- **Transport**: A2A JSON-RPC 2.0
- **Payment**: Lightning L402 (bid deposit)
- **Trust**: First-contact (new product category, fresh trust)
- **Encryption**: Envelope (bid pricing is confidential)
- **Wallet**: local-keypair (track bid deposits)

**Scenario 10: New Apex OEM Onboarding (Full Trust Progression)**
A brand-new Apex OEM connects for the first time. Demonstrates the complete trust lifecycle.
- **Trust**: First-contact → reputation → allowlist (over multiple interactions)
- **Identity**: Starts local-keys, upgrades to oauth-jwt, eventually DID
- **Encryption**: Starts none, progresses to envelope, then tls-mutual for production orders
- **Payment**: Starts mock → Stripe → Lightning as trust increases
- **Negotiation**: Capability-card (limited) → ACP (full) as trust grows
- Each interaction is a separate message, showing trust score increasing in the UI

### Frontend — The Fishbowl View

Three-panel layout:
- **Left panel**: Apex OEM — PO submissions, spec queries, order tracking
- **Center panel**: BuildWell Manufacturing — formulation matching, routing, pricing
- **Right panel**: AlloyTech Supply — production scheduling, quality inspection, shipping

**Shared elements** (same pattern as Prairie Ridge Credit app):
- Message timeline, click-to-detail, protocol stack indicator
- Trust progression visualization
- Circuit breaker status per connection
- Scenario selector
- **Lightning payment visualization** — show the payment channel, invoice, settlement
- **Quality hold alert** — visual indicator when batch fails inspection

## Protocol Provider Coverage Matrix

Every one of the 31 providers is exercised by at least one scenario:

| # | Provider | Prairie Ridge Credit Scenarios | BuildWell Manufacturing Scenarios |
|---|----------|--------------------|--------------------|
| 1 | well-known | 1, 3, 5 | 6, 10 |
| 2 | http-rest | — | 7 |
| 3 | a2a-jsonrpc | 1, 3, 4 | 6, 8, 9 |
| 4 | websocket | 2 | 8 |
| 5 | grpc | (internal ops) | (production data) |
| 6 | mcp | (agent tooling) | (agent tooling) |
| 7 | capability-card | 2, 5 | 8, 10 |
| 8 | acp | 3 | 7 |
| 9 | auction | — | 9 |
| 10 | local-keys | 5 | 8, 10 |
| 11 | did | — | 6, 8 |
| 12 | x509 | 3, 4 | — |
| 13 | oauth-jwt | 1, 2, 5 | 6, 7, 9, 10 |
| 14 | mock | (testing) | (testing) |
| 15 | stripe-fiat | — | 8 |
| 16 | x402-usdc | — | 7 |
| 17 | lightning-l402 | — | 6, 9 |
| 18 | local-keypair | (all) | 9 |
| 19 | coinbase-cdp | (reserve) | (reserve) |
| 20 | allowlist | 3, 4 | 8 |
| 21 | reputation | 1, 2 | 6, 7, 9 |
| 22 | first-contact | 5 | 10 |
| 23 | none | — | 7, 10 (initial) |
| 24 | envelope | 1, 2, 5 | 6, 8, 9 |
| 25 | tls-mutual | 3, 4 | 10 (earned) |
| 26 | retry | 1 | — |
| 27 | circuit-breaker | 5 | 8 |
| 28 | bulkhead | 4 | — |
| 29 | file-log | (all) | (all) |
| 30 | opentelemetry | 3 | 6 |
| 31 | pipeline | 2, 4 | 6, 8 |
| — | hash-chain | 1, 3, 4 | 6, 9 |

## Data Layer — JSON Files Per Org

Each org has its own `data/` directory with JSON files representing its business records. Agents load and query this data at runtime. The data is real, structured, and visible in the fishbowl UI — not hardcoded scenario strings.

### Prairie Ridge Credit App Data

```
apps/prairie-ridge-app/data/
  prairie-ridge/
    compliance-rules.json          # Farm Credit Act rules, thresholds, required fields
    cornerstone-procedures.json    # Cornerstone system operations (loan entry, disbursement, payment)
    service-catalog.json           # Services Prairie Ridge Credit offers to associations
    helpdesk-kb.json               # Known issues, resolutions, escalation paths
    associations.json              # Registered associations and their profiles
  agriserv/
    loan-applications.json         # Pending loan applications (borrower, amount, collateral, terms)
    borrower-records.json          # Existing borrowers (history, credit, relationship)
    rate-sheet.json                # Current lending rates by loan type and term
    collateral-inventory.json      # Appraised collateral (farmland, equipment, livestock)
    portfolio-summary.json         # Aggregate portfolio metrics (concentration, delinquency)
  central-farm-bank/
    examination-criteria.json      # What examiners look for in association reviews
    capital-requirements.json      # Capital adequacy thresholds and stress test parameters
    association-ratings.json       # Current ratings for each association
    risk-concentration-limits.json # Maximum exposure per sector, geography, borrower
    quarterly-report-template.json # Expected format for quarterly association reports
```

### BuildWell Manufacturing App Data

```
apps/buildwell-app/data/
  buildwell/
    formulation-catalog.json       # All formulations (name, spec, viscosity, additives, cost)
    oem-specifications.json        # OEM spec requirements mapped to formulations
    pricing-tiers.json             # Volume-based pricing for each product line
    partner-registry.json          # Registered Apex OEMs and their status
    onboarding-checklist.json      # Steps for new Apex OEM qualification
  alloytech/
    production-schedule.json       # Current batch schedule (facility, product, quantity, dates)
    inventory-levels.json          # Stock by product, by facility (Golden Valley, Shreveport)
    quality-standards.json         # Test parameters, tolerances, pass/fail criteria per spec
    batch-records.json             # Recent batch results (lab values, pass/fail, disposition)
    shipping-routes.json           # Distribution points, carriers, transit times
  apex-oem/
    purchase-orders.json           # Submitted and pending POs (product, qty, delivery, price)
    spec-requirements.json         # OEM's required specifications for each application
    order-history.json             # Past orders with fulfillment status
    quality-complaints.json        # Historical quality issues and resolutions
    approved-suppliers.json        # Qualified supplier list (BuildWell Manufacturing's standing)
```

### How Data Flows Through Scenarios

Each scenario reads from the source org's data, processes it, and writes/returns to the target org. Example for Scenario 1 (Loan Compliance Check):

```
1. FCS reads loan-applications.json → picks application #LA-2026-0847
2. FCS sends to Prairie Ridge Credit via protocol pipeline (signed, encrypted, transported)
3. Prairie Ridge Credit reads compliance-rules.json → validates each field
4. Prairie Ridge Credit reads cornerstone-procedures.json → checks system constraints
5. Prairie Ridge Credit returns compliance result via protocol pipeline
6. Result includes: pass/fail per rule, citations to specific compliance-rules entries
7. Both the INPUT data and OUTPUT data are visible in the fishbowl UI
```

The data files are the "state of the world." Scenarios read from them, and some scenarios modify them (e.g., a PO gets status updated from "submitted" to "confirmed"). The fishbowl UI can show a data inspector panel — browse any org's data files to see the current state.

## Protocol Pipeline View — Data Transformation Visualization

The signature feature of the fishbowl UI. Click any message in the timeline and see the data at every stage of the protocol pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│ Protocol Pipeline: AgriServ Financial → Prairie Ridge Credit (compliance.check) │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ① Raw Payload                                          [JSON]  │
│  { "loanId": "LA-2026-0847",                                   │
│    "borrower": "Henderson Family Farms",                        │
│    "amount": 750000, "collateral": "400 acres" }               │
│                                                                 │
│  ② After Signing (oauth-jwt)                            [JSON]  │
│  + { "signature": "a7f3c9...",                                  │
│      "senderPublicKey": "04b2e1...",                            │
│      "nonce": "f47ac10b-58cc...",                               │
│      "identityProvider": "oauth-jwt" }                          │
│                                                                 │
│  ③ After Encryption (envelope)                          [JSON]  │
│  { "ciphertext": "U2FsdGVkX1+rK3...",                          │
│    "ephemeralPublicKey": "04d8f2...",                            │
│    "iv": "a1b2c3d4...", "tag": "e5f6..." }                     │
│                                                                 │
│  ④ JSON-RPC Envelope                                    [JSON]  │
│  { "jsonrpc": "2.0", "id": "req-847",                          │
│    "method": "compliance.validateLoan",                         │
│    "params": { "encrypted": "U2Fsd..." } }                     │
│                                                                 │
│  ⑤ ──── HTTP Transport ────                                     │
│  POST /prairie-ridge/compliance/validate                            │
│  Headers: Authorization: Bearer <jwt>, x-nonce: f47ac...,      │
│           x-security-signature: a7f3c9...                       │
│                                                                 │
│  ⑥ Received & Decrypted                                [JSON]  │
│  { "loanId": "LA-2026-0847", ... }  ✓ Decrypted                │
│                                                                 │
│  ⑦ Identity Verified                                            │
│  ✓ Sender: AgriServ Financial (oauth-jwt)                            │
│  ✓ Signature valid, nonce unused                                │
│                                                                 │
│  ⑧ Trust Evaluated                                              │
│  ✓ Reputation: 95.7% (45/47 successful interactions)            │
│  ✓ Trust level: TRUSTED                                         │
│                                                                 │
│  ⑨ Business Logic                                               │
│  Compliance engine: 12 rules checked                            │
│  Data sources: compliance-rules.json (rules 1-12),              │
│                cornerstone-procedures.json (system checks)      │
│                                                                 │
│  ⑩ Response Payload                                     [JSON]  │
│  { "approved": true, "score": 94,                               │
│    "rulesChecked": 12, "rulesPassed": 12,                       │
│    "citations": [ { "rule": "FCA-614.4300",                     │
│      "source": "compliance-rules.json#collateral" } ] }         │
│                                                                 │
│  ⑪ Response Encrypted & Signed                                  │
│  [reverse pipeline: sign → encrypt → envelope → transport]      │
│                                                                 │
│  ⑫ Delivered to AgriServ Financial                           [JSON]  │
│  Duration: 847ms | Audit: hash-chain entry #1284                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Each step is expandable. Click to see full JSON. The encrypted step shows real ciphertext. The signature step shows the real Ed25519/HMAC signature. The trust step shows the actual reputation score from the trust provider. The citations reference actual entries in the JSON data files.

### Implementation

The protocol pipeline isn't just a UI rendering — the backend captures the data at each transformation stage:

```typescript
interface PipelineStep {
  step: number;
  label: string;                    // "After Signing", "After Encryption", etc.
  layer: string;                    // "identity", "encryption", "transport", etc.
  provider: string;                 // "oauth-jwt", "envelope", "a2a-jsonrpc", etc.
  data: Record<string, unknown>;    // The actual data at this stage
  metadata?: {                      // Optional layer-specific info
    signatureValid?: boolean;
    trustScore?: number;
    encryptionAlgorithm?: string;
    rulesChecked?: number;
  };
  timestamp: string;                // When this step executed
  durationMs: number;               // How long this step took
}

interface PipelineTrace {
  messageId: string;
  source: string;
  target: string;
  method: string;
  steps: PipelineStep[];            // Ordered list of transformation steps
  totalDurationMs: number;
}
```

Each org's service wraps its protocol calls with a `PipelineTracer` that captures the data before and after each provider runs. The trace is stored with the message and returned to the fishbowl frontend for rendering.

## Technical Implementation

### Backend Structure (per app)

```
apps/agent-communication/apps/prairie-ridge-app/
  src/
    main.ts                        # Bootstrap on port 4007
    app.module.ts                  # Imports 3 org modules + shared
    health/                        # Health check
    well-known/                    # Agent card for the whole ecosystem
    prairie-ridge/                     # Prairie Ridge Credit org module
      prairie-ridge.module.ts
      prairie-ridge.controller.ts      # Endpoints: compliance, helpdesk, reporting
      prairie-ridge.service.ts         # Business logic
    agriserv/                 # AgriServ Financial org module
      agriserv.module.ts
      agriserv.controller.ts  # Endpoints: loan-submit, compliance-request
      agriserv.service.ts
    central-farm-bank/                      # Central Farm Bank org module
      central-farm-bank.module.ts
      central-farm-bank.controller.ts       # Endpoints: oversight, examination
      central-farm-bank.service.ts
    scenarios/                     # Scenario orchestration
      scenario.controller.ts       # POST /scenarios/run/:id — triggers a scenario
      scenario.service.ts          # Orchestrates the multi-step flows
```

Same pattern for `buildwell-app/` with `buildwell/`, `alloytech/`, `apex-oem/` modules.

### Each Org Module Has Its Own Identity

```typescript
// agriserv.module.ts
@Module({
  providers: [
    {
      provide: 'FCS_IDENTITY',
      useFactory: () => {
        const factory = new ProtocolFactory();
        factory.register('identity', new OAuthJwtIdentityProvider({
          orgId: 'agriserv',
          orgName: 'AgriServ Financial',
        }));
        return factory;
      },
    },
  ],
})
```

Each org gets its own ProtocolFactory instance with its own identity, trust level, encryption preference, and wallet. When Org A calls Org B, both factories negotiate the protocol stack for that interaction.

### Frontend Structure (per app)

```
apps/agent-communication/apps/prairie-ridge-app/frontend/
  src/
    App.vue                        # Three-panel fishbowl layout
    stores/
      prairie-ridge.store.ts           # Prairie Ridge Credit state, messages, trust
      fcs.store.ts                 # FCS state, messages, trust
      central-farm-bank.store.ts            # Central Farm Bank state, messages, trust
      timeline.store.ts            # Shared message timeline
      scenario.store.ts            # Scenario runner state
    views/
      FishbowlView.vue             # Main three-panel view
      ScenarioView.vue             # Scenario selector + runner
      MessageDetailView.vue        # Slide-out message detail (reuse from main frontend)
    components/
      OrgPanel.vue                 # Reusable org panel (name, trust, messages)
      MessageTimeline.vue          # Chronological message stream
      TrustProgression.vue         # Trust score visualization
      CircuitBreakerStatus.vue     # Per-connection circuit breaker
      ProtocolStackBadge.vue       # Shows active providers for a message
```

### Shared Frontend Components

Many components already exist in the main frontend (4010). Extract reusable ones into a shared package:
- Message detail viewer
- Protocol stack display
- Trust progression dots
- Circuit breaker indicator
- Security envelope display

### Integration with Protocol API

Both fishbowl apps post messages to Protocol API (4000) via the existing `MessageLoggingInterceptor`. This means:
- The main playground frontend (4010) shows ALL messages from ALL apps
- Each fishbowl frontend shows only its own ecosystem's messages
- Global observability (4010) sees the full picture

### Startup

```bash
# Start everything (add to existing npm run dev)
cd apps/agent-communication && npm run dev
# Starts: protocol-api(4000), research-hub(4001), market-pulse(4002),
#          content-forge(4003), agent-consumer(4006),
#          prairie-ridge-app(4007), buildwell-app(4008), frontend(4010)
```

Each fishbowl app's frontend is served by its NestJS backend (static files), not as a separate dev server. This keeps the port count manageable.

## Phases

### Phase 1: Data Layer + Pipeline Tracer
- Create JSON data files for all 6 orgs (see data structure above)
- Build `PipelineTracer` utility in shared-protocols that captures data at each provider step
- Build `DataLoader` service that reads/queries/updates JSON files per org
- Unit tests for tracer and data loader

### Phase 2: Prairie Ridge Credit Backend
- Create `prairie-ridge-app` NestJS project on port 4007
- Three org modules with own identities and ProtocolFactory instances
- Each org module gets a DataLoader pointed at its `data/` directory
- Implement 5 scenario endpoints with PipelineTracer wired in
- Register with Protocol API for message observability
- Wire well-known agent card

### Phase 3: Prairie Ridge Credit Frontend
- Three-panel fishbowl Vue app
- Protocol Pipeline View — the step-by-step data transformation waterfall
- Data Inspector panel — browse any org's JSON data
- Message timeline with click-to-detail
- Scenario selector and runner
- Trust progression and circuit breaker visualizations
- Served as static files from NestJS backend

### Phase 4: BuildWell Manufacturing Backend
- Create `buildwell-app` NestJS project on port 4008
- Three org modules (BuildWell Manufacturing, AlloyTech Supply, Apex OEM)
- Implement 5 scenario endpoints with PipelineTracer
- Lightning payment integration for PO scenarios
- Quality hold notification chain with data updates

### Phase 5: BuildWell Manufacturing Frontend
- Same fishbowl pattern as Prairie Ridge Credit
- Lightning payment visualization in pipeline view
- Quality hold alert UI with data change highlighting
- Data Inspector showing inventory/batch/order state changes

### Phase 6: Cross-Ecosystem Communication
- Prairie Ridge Credit app can discover and call BuildWell Manufacturing app (and vice versa)
- Protocol API shows cross-ecosystem traffic
- Main frontend (4010) shows unified view of all agents
- Cross-ecosystem scenarios exercise all remaining providers

### Phase 7: Testing & Demo Scripts
- Extend `run-demo.sh` with industry scenarios
- Automated test for all 10 scenarios
- Verify all 31 providers exercised
- Demo flow documentation
- Smoke tests for both apps

## What This Is NOT

- Not a replacement for Orchestrator AI's agent platform
- Not LangGraph workflows or RAG pipelines
- Not multi-tenant org management
- Business logic is lightweight (read JSON, apply rules, return result) — the PROTOCOL is the star
- The security, encryption, trust, payments, audit — all real, all the existing 31 providers
- The JSON data is realistic but synthetic — not connected to real financial systems or ERPs

## Success Criteria

1. Both fishbowl apps start with `npm run dev`
2. All 31 protocol providers exercised across the 10 scenarios
3. Each scenario visible in the fishbowl UI with full protocol detail
4. Messages from both apps appear in the global Protocol API observability view
5. Trust progression visible over multiple interactions
6. Lightning payment completes in BuildWell Manufacturing PO scenario
7. Circuit breaker trips and recovers visibly
8. Hash-chain audit trail verifiable for regulated scenarios
9. Existing test suite (62 checks) still passes
10. New scenarios add to the test suite
