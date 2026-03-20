# Industry Fishbowl Demo Flow

## Quick Start

```bash
cd apps/agent-communication
npm run dev:all  # Starts all 8 services
```

## Ports

| Service | Port | Purpose |
|---------|------|---------|
| Protocol API | 4000 | Global observability, message log, protocol config |
| ResearchHub | 4001 | Research agent (existing) |
| MarketPulse | 4002 | Market signals agent (existing) |
| ContentForge | 4003 | Content generation agent (existing) |
| Agent-Consumer | 4006 | Consumer demo agent (existing) |
| Prairie Ridge Credit App | 4007 | Farm Credit fishbowl backend |
| BuildWell Manufacturing App | 4008 | Manufacturing fishbowl backend |
| Main Frontend | 4010 | Global Protocol API dashboard |
| Prairie Ridge Credit Frontend | 4017 | Farm Credit fishbowl UI (dev) |
| BuildWell Manufacturing Frontend | 4018 | Manufacturing fishbowl UI (dev) |

---

## Recommended Demo Order

### Act 1: Farm Credit (Prairie Ridge Credit — Port 4007)

**Context**: Three organizations in the Farm Credit System share data through the protocol stack. Prairie Ridge Credit is the service provider, AgriServ Financial is an association member, and Central Farm Bank is the regulatory examiner.

#### 1. Scenario 1: Loan Compliance

AgriServ Financial submits a loan application to Prairie Ridge Credit's compliance engine. The loan data is signed with FCS's oauth-jwt identity, wrapped in an envelope, and sent over a2a-jsonrpc transport.

```bash
curl -X POST http://localhost:4007/scenarios/run/1 | jq .pipelineTrace
```

**What to point out:**
- The `pipelineTrace.steps` waterfall shows data at every transformation: raw loan payload, signed JSON-RPC envelope (with real Ed25519 signature), encrypted ciphertext, transport, decrypted response, reputation trust verification
- The `oauth-jwt` identity step shows the JWT claims that AgriServ Financial presents
- Prairie Ridge Credit's compliance rules (loaded from `data/prairie-ridge/compliance-rules.json`) are visible in the response
- Trust is established via `reputation` — check the trust score in the pipeline step

#### 2. Scenario 3: Quarterly Oversight

Central Farm Bank requests quarterly reporting data from Prairie Ridge Credit. This uses the highest-security stack: x509 mutual authentication, tls-mutual encryption, allowlist trust, and hash-chain audit.

```bash
curl -X POST http://localhost:4007/scenarios/run/3 | jq .pipelineTrace
```

**What to point out:**
- x509 certificate identity — the certificate chain is visible in the signing step
- tls-mutual encryption — both sides present certificates (not just the server)
- allowlist trust — Central Farm Bank is on Prairie Ridge Credit's pre-approved examiner list, trust is granted immediately without challenge
- hash-chain audit — every step is hashed and chained; the audit step shows the hash linking back to previous calls

#### 3. Scenario 5: New Association Onboarding

A new Farm Credit association is introduced to the network for the first time. This is the most important trust scenario — it shows the full trust lifecycle from `first-contact` (no trust, challenge/response handshake) through trust establishment.

```bash
curl -X POST http://localhost:4007/scenarios/run/5 | jq .pipelineTrace
```

**What to point out:**
- The first interaction uses `first-contact` trust — a challenge/response nonce exchange happens before any data is shared
- Circuit breaker starts CLOSED because no prior failure history
- After the handshake succeeds, the association is registered in Prairie Ridge Credit's network

---

### Act 2: Manufacturing (BuildWell Manufacturing — Port 4008)

**Context**: BuildWell Manufacturing is the lubricant formulator, AlloyTech Supply is the manufacturing partner, and Apex OEM is the automotive customer.

#### 4. Scenario 6: Purchase Order

Apex OEM submits a purchase order with a Lightning L402 payment. The full pipeline shows signing, envelope encryption, payment verification, spec validation against BuildWell Manufacturing's formulation catalog, and production scheduling at AlloyTech Supply.

```bash
curl -X POST http://localhost:4008/scenarios/run/6 | jq .pipelineTrace
```

**What to point out:**
- The payment step shows a real Lightning invoice (Bitcoin regtest), amount in satoshis, and payment preimage
- `local-keys` Ed25519 signing on the OEM side, `oauth-jwt` on the BuildWell Manufacturing side
- After payment clears, the spec is validated against `data/buildwell/oem-specifications.json`
- AlloyTech Supply's production schedule (`data/alloytech/production-schedule.json`) is updated in the response

#### 5. Scenario 8: Quality Hold

AlloyTech Supply discovers an out-of-spec batch (viscosity outside tolerance). The quality hold notification propagates through three organizations: AlloyTech Supply batches the alert, BuildWell Manufacturing verifies against spec, and Apex OEM receives a hold notice with x402-usdc payment escrow for the affected order.

```bash
curl -X POST http://localhost:4008/scenarios/run/8 | jq .pipelineTrace
```

**What to point out:**
- Three distinct identity providers in one scenario: local-keys (AlloyTech Supply) → oauth-jwt (BuildWell Manufacturing) → did (Apex OEM)
- The batch record from `data/alloytech/batch-records.json` is visible in the raw step
- x402-usdc escrow is created at the payment step to hold funds while quality is resolved
- circuit-breaker stays CLOSED — this is an intentional quality event, not a system failure

#### 6. Scenario 10: New OEM Onboarding

A brand new Apex OEM joins the network. This is the manufacturing equivalent of Scenario 5 — full trust lifecycle from `first-contact` through `reputation` to `allowlist` in three interactions.

```bash
curl -X POST http://localhost:4008/scenarios/run/10 | jq .pipelineTrace
```

**What to point out:**
- Interaction 1: first-contact, local-keys identity, no prior trust record
- Interaction 2: reputation trust begins building, identity upgrades to oauth-jwt
- Interaction 3: allowlist trust granted, identity fully established as DID
- The partner registry in `data/buildwell/partner-registry.json` is updated at each step

---

### Act 3: Cross-Ecosystem

#### 7. Scenario 11: Quality Complaint Triggers Compliance Review

A quality complaint in the manufacturing ecosystem (contaminated lubricant used in agricultural equipment) triggers a compliance review in the Farm Credit ecosystem. This is a cross-ecosystem call using DID identity bridging (DID on the BuildWell Manufacturing side, x509 on the Prairie Ridge Credit side).

```bash
# Initiate from BuildWell Manufacturing side (manufacturing)
curl -X POST http://localhost:4008/scenarios/run/11 | jq .pipelineTrace

# Receive at Prairie Ridge Credit side (Farm Credit)
curl -X POST http://localhost:4007/scenarios/run/11 | jq .pipelineTrace
```

**What to point out:**
- Identity bridging: BuildWell Manufacturing presents a DID, Prairie Ridge Credit expects x509. The protocol negotiation step shows the credential translation
- Two separate `pipelineTrace` objects — one for each ecosystem's view of the same interaction
- The cross-ecosystem message appears in the Protocol API dashboard (port 4010) under both source orgs
- ACP semantic negotiation is used to agree on data format (manufacturing quality record vs. agricultural compliance format)

---

## What to Point Out (Universal)

- The Pipeline View shows REAL data at every transformation step — not diagrams or mock data
- Encrypted steps show REAL ciphertext (AES-256-GCM). Signatures show REAL Ed25519 signatures
- Trust scores are computed from interaction history, not hardcoded
- Lightning payments use Bitcoin regtest with real LND nodes (auto-started by `npm run dev`)
- All 31 protocol providers are exercised across the 11 scenarios
- Every inter-org message appears in both the fishbowl UI AND the global Protocol API dashboard (port 4010)
- JSON data files (`data/*/`) are visible in the Data Inspector panel — real business data, not lorem ipsum

---

## Running Tests

```bash
# Run fishbowl tests only (Prairie Ridge Credit + BuildWell Manufacturing scenarios)
./scripts/run-demo.sh fishbowl

# Run all tests (62 existing + fishbowl)
./scripts/run-demo.sh all

# Verify all 31 providers are exercised
./scripts/verify-coverage.sh
```

---

## Troubleshooting

**Prairie Ridge Credit (4007) or BuildWell Manufacturing (4008) not responding:**
```bash
# Check if apps are running
curl http://localhost:4007/health
curl http://localhost:4008/health

# Start individually
cd apps/agent-communication
npx nx serve prairie-ridge-app
npx nx serve buildwell-app
```

**Authentication errors (401):**
- The apps require a valid JWT from the main API (port 6100)
- If main API is not running, the apps accept requests without auth in development mode
- Run-demo.sh handles this automatically (falls back gracefully with a warning)

**Pipeline trace missing providers:**
- Run `./scripts/verify-coverage.sh` to see which providers have zero coverage
- Each scenario's service implementation must use `PipelineTracer.trace()` for all 12 protocol layers
- Check the scenario service files in `apps/prairie-ridge-app/src/scenarios/` and `apps/buildwell-app/src/scenarios/`
