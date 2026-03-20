# Agent Communication — Demonstration Test Scenarios

**Purpose**: Generate real inter-agent traffic that exercises every security feature, then verify the UI displays it. These scenarios are designed to be run in sequence during a live demo or automated test.

**Prerequisites**: `cd apps/agent-communication && npm run dev` (starts all services on ports 4000-4010)

**Scenario sets:**
- **Scenarios 1-10** (Protocol API playground, port 4000): Exercise all 31 protocol providers via ResearchHub, MarketPulse, and ContentForge
- **Scenarios 6-11** (Industry Fishbowls): Realistic business workflows — Scenarios 1-5+11 on Prairie Ridge Credit (port 4007), Scenarios 6-11 on BuildWell Manufacturing (port 4008)

---

## CRITICAL: How Message Observability Works

Agent-to-agent calls (ResearchHub, MarketPulse, ContentForge) go **direct HTTP**. They do NOT automatically log to the Protocol API's observability store. To populate the Message Log, Audit Trail, and message detail views, messages must be **posted to `POST /api/messages`** on the Protocol API (port 4000).

The **Quick Seed** script below does this automatically. Run it after starting services to populate the UI with realistic security-rich messages.

**What the UI can show per message** (when posted with full metadata):
- Source/Target/Method/Timing/Duration
- Protocol Layers used (all 12)
- Payment details (amount, currency, status, txHash)
- Trust Progression (visual timeline with dots)
- Circuit Breaker state (OPEN/CLOSED/HALF-OPEN, failures, cooldown)
- Full JSON-RPC request with Security Envelope (nonce, timestamp, senderId, senderPublicKey, signature, identityProvider)
- Full JSON-RPC response

---

## Quick Seed (Run First for Any Demo)

Discovers agents and populates the message log with security-rich messages:

```bash
#!/bin/bash
BASE="http://localhost:4000"

# Discover agents
curl -s -X POST $BASE/api/agents/discover -H "Content-Type: application/json" -d '{"url":"http://localhost:4001"}' > /dev/null
curl -s -X POST $BASE/api/agents/discover -H "Content-Type: application/json" -d '{"url":"http://localhost:4002"}' > /dev/null
curl -s -X POST $BASE/api/agents/discover -H "Content-Type: application/json" -d '{"url":"http://localhost:4003"}' > /dev/null

# Helper to post a message
post_msg() {
  local id=$1 src=$2 tgt=$3 method=$4 status=$5 dur=$6 pay_provider=$7 enc=$8 trust=$9 identity=${10}
  local ts=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
  curl -s -X POST $BASE/api/messages -H "Content-Type: application/json" -d "{
    \"id\": \"$id\",
    \"timestamp\": \"$ts\",
    \"source\": \"$src\",
    \"target\": \"$tgt\",
    \"method\": \"$method\",
    \"protocol\": {
      \"discovery\": \"well-known\",
      \"transport\": \"a2a-jsonrpc\",
      \"negotiation\": \"capability-card\",
      \"identity\": \"$identity\",
      \"payment\": \"$pay_provider\",
      \"encryption\": \"$enc\",
      \"trust\": \"$trust\"
    },
    \"request\": {
      \"jsonrpc\": \"2.0\",
      \"id\": \"req-$id\",
      \"method\": \"$method\",
      \"params\": {\"topic\": \"agent communication\", \"security\": {
        \"nonce\": \"$(uuidgen | tr '[:upper:]' '[:lower:]')\",
        \"timestamp\": $(date +%s)000,
        \"senderId\": \"$src\",
        \"senderPublicKey\": \"MCowBQYDK2VwAyEAx7VpKm3nYb8QW2p0yR4K9HhJ5vTz6Lm8Fn1Gw2Xk3Y4=\",
        \"signature\": \"MEUCIQDx7VpKm3nYb8QW2p0yR4K9HhJ5vTz6Lm8Fn1Gw2Xk3Y4AIgRq8W5tN0mJ7kL2pS9vF6hD3wE1xC4yB0aR8uI5oK7nM=\",
        \"identityProvider\": \"$identity\"
      }}
    },
    \"response\": {\"jsonrpc\": \"2.0\", \"id\": \"req-$id\", \"result\": {\"content\": \"Analysis complete\", \"metadata\": {\"encrypted\": $([ \"$enc\" != \"none\" ] && echo true || echo false), \"algorithm\": \"AES-256-GCM\"}}},
    \"timing\": {\"sentAt\": \"$ts\", \"durationMs\": $dur},
    \"payment\": {\"required\": $([ \"$pay_provider\" != \"mock\" ] && echo true || echo false), \"amount\": 0.001, \"currency\": \"USDC\", \"status\": \"paid\"},
    \"status\": \"$status\"
  }" > /dev/null
}

# Generate diverse messages exercising different security features
post_msg "seed-01" "research-hub" "market-pulse" "tasks/send"         "success" 142 "mock"          "none"      "allowlist"    "local-keys"
post_msg "seed-02" "market-pulse" "content-forge" "tasks/get"         "success" 287 "mock"          "envelope"  "reputation"   "local-keys"
post_msg "seed-03" "content-forge" "research-hub" "agent-card"        "success" 98  "x402-usdc"     "envelope"  "reputation"   "did"
post_msg "seed-04" "research-hub" "market-pulse" "feeds/sync"         "error"   740 "mock"          "none"      "allowlist"    "local-keys"
post_msg "seed-05" "market-pulse" "content-forge" "drafts/generate"   "success" 412 "stripe-fiat"   "tls-mutual" "first-contact" "x509"
post_msg "seed-06" "content-forge" "research-hub" "topics/suggest"    "success" 156 "mock"          "envelope"  "reputation"   "oauth-jwt"
post_msg "seed-07" "research-hub" "content-forge" "analyze"           "success" 334 "x402-usdc"     "envelope"  "reputation"   "local-keys"
post_msg "seed-08" "market-pulse" "research-hub" "signals/subscribe"  "success" 67  "lightning-l402" "tls-mutual" "first-contact" "did"
post_msg "seed-09" "content-forge" "market-pulse" "trending/query"    "error"   890 "mock"          "none"      "allowlist"    "local-keys"
post_msg "seed-10" "research-hub" "content-forge" "narrative/generate" "success" 523 "x402-usdc"    "envelope"  "reputation"   "local-keys"

echo "Seeded 10 messages with diverse security profiles"
curl -s "$BASE/api/messages?limit=1" | python3 -c "import sys,json; print(f'Total messages: {json.load(sys.stdin)[\"total\"]}')"
```

---

## Scenario 1: Agent Discovery & Basic Communication

**Goal**: Discover agents, send basic requests, populate the message log.

```bash
# 1a. Discover all three agents
curl -s -X POST http://localhost:4000/api/agents/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:4001"}'

curl -s -X POST http://localhost:4000/api/agents/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:4002"}'

curl -s -X POST http://localhost:4000/api/agents/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:4003"}'

# 1b. Verify agents appear
curl -s http://localhost:4000/api/agents | jq '.[] | {id, name, status}'

# 1c. Generate inter-agent traffic via AgentConsumer
curl -s http://localhost:4001/api/explore/discovery | jq .
curl -s http://localhost:4001/api/explore/categories | jq .
curl -s http://localhost:4001/api/explore/signals | jq .
curl -s http://localhost:4001/api/explore/narratives/analyst | jq .
```

**UI Verification**:
- Overview: Connected Agents section shows 3 agents with status dots
- Overview: Recent Activity feed populates
- Status bar: Agent count updates from "None connected" to "3 connected"

---

## Scenario 2: Protocol Layer Testing (All 12 Layers)

**Goal**: Exercise each protocol layer's active provider via the test endpoint.

```bash
# Test each layer
for layer in discovery transport negotiation identity payment wallet trust encryption resilience observability orchestration audit; do
  echo "--- Testing $layer ---"
  curl -s -X POST "http://localhost:4000/api/protocol/test/$layer" | jq '{layer: .layer, provider: .provider, success: .success, details: .details}'
done
```

**UI Verification**:
- Protocol Drawer: Open and click each "Test" button — results should match
- Audit Trail: Test events should appear as entries

---

## Scenario 3: Identity & Signing (Security Envelope)

**Goal**: Switch identity providers and verify signing works with each.

```bash
# 3a. Test with local-keys (Ed25519)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"identity": "local-keys"}'
curl -s -X POST http://localhost:4000/api/protocol/test/identity | jq .

# 3b. Test with DID (W3C Decentralized Identifiers)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"identity": "did"}'
curl -s -X POST http://localhost:4000/api/protocol/test/identity | jq .

# 3c. Test with X.509 certificates
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"identity": "x509"}'
curl -s -X POST http://localhost:4000/api/protocol/test/identity | jq .

# 3d. Test with OAuth/JWT
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"identity": "oauth-jwt"}'
curl -s -X POST http://localhost:4000/api/protocol/test/identity | jq .

# 3e. Reset to local-keys
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"identity": "local-keys"}'
```

**UI Verification**:
- Message detail: Click a message → Security section shows `identityProvider`, `senderPublicKey`, `signature`
- Audit Trail: Each identity switch creates a "Config Changed" entry
- Protocol Drawer: Identity dropdown updates to match

---

## Scenario 4: Encryption Providers

**Goal**: Switch encryption and verify messages show encryption metadata.

```bash
# 4a. Enable envelope encryption (AES-256-GCM + ECDH)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"encryption": "envelope"}'
curl -s -X POST http://localhost:4000/api/protocol/test/encryption | jq .

# 4b. Enable TLS mutual auth
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"encryption": "tls-mutual"}'
curl -s -X POST http://localhost:4000/api/protocol/test/encryption | jq .

# 4c. Generate a message with encryption active — call ResearchHub analyze
curl -s -X POST http://localhost:4001/agent/analyze \
  -H "Content-Type: application/json" \
  -d '{"topic": "agent-to-agent encryption", "prompt": "Analyze the state of E2E encryption in agent protocols"}'

# 4d. Reset to none
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"encryption": "none"}'
```

**UI Verification**:
- Message detail: Encryption section shows algorithm (AES-256-GCM), key exchange (ECDH), encrypted: true
- Status bar: Protocol badges update to show active encryption
- Audit Trail: Encryption config changes logged

---

## Scenario 5: Payment Flows

**Goal**: Exercise all 4 payment providers.

```bash
# 5a. Mock payment (free pass)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"payment": "mock"}'
curl -s -X POST http://localhost:4000/api/protocol/test/payment | jq .

# 5b. x402 USDC payment (requires CDP wallet)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"payment": "x402-usdc"}'
curl -s -X POST http://localhost:4000/api/protocol/test/payment | jq .

# 5c. Stripe fiat payment
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"payment": "stripe-fiat"}'
curl -s -X POST http://localhost:4000/api/protocol/test/payment | jq .

# 5d. Lightning L402 (requires Docker regtest running)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"payment": "lightning-l402"}'
curl -s -X POST http://localhost:4000/api/protocol/test/payment | jq .

# 5e. Reset to mock
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"payment": "mock"}'
```

**UI Verification**:
- Message detail: Payment section shows amount, currency, status, transactionHash
- Settings: Wallet balance may change after x402 payment
- Audit Trail: Payment events logged

---

## Scenario 6: Trust Establishment & Progression

**Goal**: Exercise trust providers and show trust scores changing.

```bash
# 6a. Start with first-contact (challenge/response handshake)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"trust": "first-contact"}'
curl -s -X POST http://localhost:4000/api/protocol/test/trust | jq .

# 6b. Switch to reputation-based trust
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"trust": "reputation"}'
curl -s -X POST http://localhost:4000/api/protocol/test/trust | jq .

# 6c. Get trust scores
curl -s http://localhost:4000/api/trust | jq .

# 6d. Generate multiple successful interactions to build trust
for i in $(seq 1 5); do
  curl -s http://localhost:4001/api/explore/categories > /dev/null
  curl -s http://localhost:4001/api/explore/signals > /dev/null
done
curl -s http://localhost:4000/api/trust | jq .

# 6e. Reset to allowlist
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"trust": "allowlist"}'
```

**UI Verification**:
- Message detail: Trust section shows trust score, trust level, verification method
- Audit Trail: "Trust Updated" events with scores

---

## Scenario 7: Resilience — Circuit Breaker & Retry

**Goal**: Trigger circuit breaker and show recovery.

```bash
# 7a. Enable circuit-breaker
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"resilience": "circuit-breaker"}'
curl -s -X POST http://localhost:4000/api/protocol/test/resilience | jq .

# 7b. Test with retry (exponential backoff)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"resilience": "retry"}'
curl -s -X POST http://localhost:4000/api/protocol/test/resilience | jq .

# 7c. Test with bulkhead (isolation)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"resilience": "bulkhead"}'
curl -s -X POST http://localhost:4000/api/protocol/test/resilience | jq .
```

**UI Verification**:
- Network Topology: Circuit breaker edges show CB: OPEN/CLOSED/HALF-OPEN states
- Message detail: Resilience section shows retry count, circuit state
- Timeline: Failed messages appear as red dots, recovered as green

---

## Scenario 8: Transport Switching

**Goal**: Switch transports and send messages through each.

```bash
# 8a. HTTP REST (default)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"transport": "http-rest"}'
curl -s -X POST http://localhost:4000/api/protocol/test/transport | jq .

# 8b. A2A JSON-RPC 2.0
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"transport": "a2a-jsonrpc"}'
curl -s -X POST http://localhost:4000/api/protocol/test/transport | jq .

# 8c. WebSocket
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"transport": "websocket"}'
curl -s -X POST http://localhost:4000/api/protocol/test/transport | jq .

# 8d. gRPC
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"transport": "grpc"}'
curl -s -X POST http://localhost:4000/api/protocol/test/transport | jq .

# 8e. MCP
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"transport": "mcp"}'
curl -s -X POST http://localhost:4000/api/protocol/test/transport | jq .

# 8f. Reset to http-rest
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"transport": "http-rest"}'
```

**UI Verification**:
- Protocol Compare: Stack A and B show different transports
- Metrics: "Messages by Protocol" bars update with counts per transport
- Status bar: Protocol badges update

---

## Scenario 9: Full Content Pipeline (End-to-End)

**Goal**: Run the complete multi-agent workflow that exercises all layers.

```bash
# 9a. Set up a production-like protocol stack
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{
    "discovery": "well-known",
    "transport": "a2a-jsonrpc",
    "negotiation": "capability-card",
    "identity": "local-keys",
    "payment": "mock",
    "wallet": "local-keypair",
    "trust": "reputation",
    "encryption": "envelope",
    "resilience": "circuit-breaker",
    "observability": "file-log",
    "orchestration": "pipeline",
    "audit": "hash-chain"
  }'

# 9b. Run the full AgentConsumer demo (hits all agents)
curl -s http://localhost:4001/api/explore/full-demo | jq .

# 9c. Generate content pipeline:
#     ResearchHub analyzes → MarketPulse scans → ContentForge drafts
curl -s -X POST http://localhost:4001/agent/analyze \
  -H "Content-Type: application/json" \
  -d '{"topic": "agent-to-agent commerce", "prompt": "Analyze the emerging market for autonomous agent transactions"}'

curl -s -X POST http://localhost:4002/agent/scan \
  -H "Content-Type: application/json" \
  -d '{"query": "agent commerce payments"}'

curl -s -X POST http://localhost:4003/agent/draft \
  -H "Content-Type: application/json" \
  -d '{"topic": "The Rise of Agent-to-Agent Commerce", "sources": ["research-hub", "market-pulse"]}'

# 9d. Check the message log
curl -s "http://localhost:4000/api/messages?limit=20" | jq '.messages | length'

# 9e. Check audit chain integrity
curl -s http://localhost:4000/api/messages | jq '.messages[-1]'
```

**UI Verification**:
- Observability Message Log: Full list of messages with security envelopes
- Message detail: Click any message → see Security, Encryption, Trust, Resilience sections
- Audit Trail: Complete chain of events → click "Verify Chain"
- Timeline: Visual flow of all messages
- Metrics: Updated totals

---

## Scenario 10: Negotiation Protocols

**Goal**: Exercise all 3 negotiation strategies.

```bash
# 10a. Capability Card (static match)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"negotiation": "capability-card"}'
curl -s -X POST http://localhost:4000/api/protocol/test/negotiation | jq .

# 10b. ACP Semantic Negotiation (overlap-based agreement)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"negotiation": "acp"}'
curl -s -X POST http://localhost:4000/api/protocol/test/negotiation | jq .

# 10c. Auction (bid-based assignment)
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -d '{"negotiation": "auction"}'
curl -s -X POST http://localhost:4000/api/protocol/test/negotiation | jq .
```

**UI Verification**:
- Protocol Drawer: Negotiation dropdown reflects active selection
- Audit Trail: Negotiation events logged

---

## Quick Smoke Test (Run All)

For fast verification, run this script that hits every major endpoint:

```bash
#!/bin/bash
echo "=== Agent Communication Smoke Test ==="
BASE="http://localhost:4000"

echo "1. Discovering agents..."
curl -s -X POST $BASE/api/agents/discover -H "Content-Type: application/json" -d '{"url":"http://localhost:4001"}' | jq -r '.name // "FAIL"'
curl -s -X POST $BASE/api/agents/discover -H "Content-Type: application/json" -d '{"url":"http://localhost:4002"}' | jq -r '.name // "FAIL"'
curl -s -X POST $BASE/api/agents/discover -H "Content-Type: application/json" -d '{"url":"http://localhost:4003"}' | jq -r '.name // "FAIL"'

echo "2. Testing all 12 protocol layers..."
for layer in discovery transport negotiation identity payment wallet trust encryption resilience observability orchestration audit; do
  result=$(curl -s -X POST "$BASE/api/protocol/test/$layer" | jq -r '.success // "FAIL"')
  echo "   $layer: $result"
done

echo "3. Generating inter-agent traffic..."
curl -s http://localhost:4001/api/explore/categories | jq -r '.[0].name // "FAIL"'
curl -s -X POST http://localhost:4001/agent/analyze -H "Content-Type: application/json" -d '{"topic":"test","prompt":"test"}' | jq -r '.analysis // "FAIL"' | head -c 50
echo ""
curl -s -X POST http://localhost:4002/agent/scan -H "Content-Type: application/json" -d '{"query":"AI agents"}' | jq -r '.[0].title // "FAIL"'
curl -s -X POST http://localhost:4003/agent/draft -H "Content-Type: application/json" -d '{"topic":"Test Draft"}' | jq -r '.title // "FAIL"'

echo "4. Checking message log..."
curl -s "$BASE/api/messages?limit=5" | jq '.messages | length'

echo "5. Checking audit trail..."
curl -s "$BASE/api/messages" | jq '.total // 0'

echo "=== Smoke Test Complete ==="
```

---

---

---

# Industry Fishbowl Scenarios (Ports 4007 + 4008)

These scenarios run against the dedicated fishbowl backends, not the Protocol API. Run them with:

```bash
# All fishbowl scenarios
./scripts/run-demo.sh fishbowl

# Individual scenario (Prairie Ridge Credit scenarios 1-5 + 11)
curl -X POST http://localhost:4007/scenarios/run/1

# Individual scenario (BuildWell Manufacturing scenarios 6-11)
curl -X POST http://localhost:4008/scenarios/run/6
```

---

## Scenario 6: Purchase Order with Lightning Payment (BuildWell Manufacturing — Port 4008)

**Goal**: Apex OEM submits a purchase order. The pipeline signs with local-keys, pays via Lightning L402, validates the spec against BuildWell Manufacturing's formulation catalog, and schedules production at AlloyTech Supply.

**App**: BuildWell Manufacturing (`http://localhost:4008`)

**Providers exercised**: local-keys (identity), lightning-l402 (payment), local-keypair (wallet), envelope (encryption), a2a-jsonrpc (transport), capability-card (negotiation), reputation (trust), circuit-breaker (resilience), pipeline (orchestration), file-log (observability), hash-chain (audit), well-known (discovery)

```bash
# Run scenario 6 — OEM submits PO with Lightning payment
curl -s -X POST http://localhost:4008/scenarios/run/6 | jq .

# Verify the pipeline trace has all steps
curl -s -X POST http://localhost:4008/scenarios/run/6 \
  | jq '.pipelineTrace.steps | length'

# Check the specific data endpoints involved
curl -s http://localhost:4008/oem/purchase-orders | jq '.[0]'
curl -s http://localhost:4008/buildwell/formulations | jq '.[0]'
curl -s http://localhost:4008/alloytech/production | jq '.[0]'
```

**UI Verification**:
- BuildWell Fishbowl: Message flows OEM → BuildWell Manufacturing → AlloyTech Supply in the three-panel layout
- Pipeline View: Shows lightning invoice at payment step with real satoshi amount
- Data Inspector: OEM purchase order visible in left panel, AlloyTech Supply production schedule updates in right panel

---

## Scenario 7: Spec Query with Semantic Negotiation (BuildWell Manufacturing — Port 4008)

**Goal**: Apex OEM queries whether a specific viscosity grade is available. This uses ACP semantic negotiation because OEM and BuildWell Manufacturing use different terminology for the same spec (OEM uses SAE grade, BuildWell Manufacturing uses viscosity index).

**App**: BuildWell Manufacturing (`http://localhost:4008`)

**Providers exercised**: a2a-jsonrpc (transport), acp (negotiation), oauth-jwt (identity), x402-usdc (payment), tls-mutual (encryption), reputation (trust), retry (resilience), opentelemetry (observability), pipeline (orchestration), hash-chain (audit), well-known (discovery), did (identity at OEM side)

```bash
# Run scenario 7 — OEM queries spec availability
curl -s -X POST http://localhost:4008/scenarios/run/7 | jq .

# Also exercise the direct endpoint
curl -s "http://localhost:4008/oem/specs/query?specCode=SAE-5W-30" | jq .
curl -s http://localhost:4008/buildwell/specs | jq '.[0]'
```

**UI Verification**:
- Pipeline View: ACP negotiation step shows semantic overlap between OEM schema and BuildWell Manufacturing schema
- Audit Trail: Negotiation event logged with agreed-upon terms
- Message detail: Transport shows a2a-jsonrpc format with ACP negotiation metadata

---

## Scenario 8: Quality Hold Notification (BuildWell Manufacturing — Port 4008)

**Goal**: AlloyTech Supply discovers an out-of-spec batch (viscosity outside tolerance). The quality hold propagates: AlloyTech Supply → BuildWell Manufacturing (spec verification) → Apex OEM (hold notice + x402 escrow). Three organizations, three different identity/encryption profiles.

**App**: BuildWell Manufacturing (`http://localhost:4008`)

**Providers exercised**: local-keys (AlloyTech Supply identity), oauth-jwt (BuildWell Manufacturing identity), did (OEM identity), x402-usdc (payment/escrow), envelope (encryption), circuit-breaker (resilience), allowlist (trust), pipeline (orchestration), file-log (observability), hash-chain (audit), well-known (discovery), http-rest (transport)

```bash
# Run scenario 8 — quality hold propagation
curl -s -X POST http://localhost:4008/scenarios/run/8 | jq .

# See the batch record that triggered the hold
curl -s http://localhost:4008/alloytech/batches | jq '.[] | select(.status == "hold")'

# Check quality standards that define out-of-spec thresholds
curl -s http://localhost:4008/alloytech/quality-standards | jq '.[0]'

# Check OEM quality complaints (populated after scenario runs)
curl -s http://localhost:4008/oem/quality-complaints | jq '.[0]'
```

**UI Verification**:
- BuildWell Fishbowl: Three-hop message chain visible in panel (AlloyTech Supply → BuildWell Manufacturing → OEM)
- Pipeline View: Three separate pipeline traces, one per hop, each with different identity/trust settings
- Data Inspector: Batch record in AlloyTech Supply panel, quality complaint in OEM panel

---

## Scenario 9: Competitive Bid with Auction Negotiation (BuildWell Manufacturing — Port 4008)

**Goal**: Apex OEM needs a large volume of a specialty formulation. Rather than fixed pricing, the OEM triggers an auction — BuildWell Manufacturing and AlloyTech Supply each submit bids, the OEM accepts the winner. Demonstrates the `auction` negotiation provider.

**App**: BuildWell Manufacturing (`http://localhost:4008`)

**Providers exercised**: auction (negotiation), grpc (transport for bid submission), stripe-fiat (payment), x509 (identity), tls-mutual (encryption), allowlist (trust), bulkhead (resilience), opentelemetry (observability), pipeline (orchestration), hash-chain (audit), well-known (discovery), local-keypair (wallet)

```bash
# Run scenario 9 — competitive bid via auction
curl -s -X POST http://localhost:4008/scenarios/run/9 | jq .

# Place a direct bid to exercise the endpoint
curl -s -X POST http://localhost:4008/oem/bids/place \
  -H "Content-Type: application/json" \
  -d '{"specCode":"AT-5W-30","quantityGallons":10000,"maxPricePerGallon":8.50}' | jq .

# Check pricing tiers
curl -s http://localhost:4008/buildwell/pricing | jq '.[0]'
```

**UI Verification**:
- Pipeline View: Auction step shows multiple bid submissions and the winning bid selection
- Message detail: gRPC transport shown (scenario 9 is the only grpc transport scenario in the fishbowls)
- Audit Trail: Bid events logged with winning bid amount and provider

---

## Scenario 10: New OEM Onboarding — Trust Lifecycle (BuildWell Manufacturing — Port 4008)

**Goal**: A brand-new Apex OEM joins the BuildWell Manufacturing network. Shows the full trust lifecycle across three interactions: `first-contact` → `reputation` → `allowlist`. Identity also upgrades: `local-keys` → `oauth-jwt` → `did`.

**App**: BuildWell Manufacturing (`http://localhost:4008`)

**Providers exercised**: first-contact (trust, interaction 1), reputation (trust, interaction 2), allowlist (trust, interaction 3), local-keys (identity, interaction 1), oauth-jwt (identity, interaction 2), did (identity, interaction 3), coinbase-cdp (wallet), x402-usdc (payment), envelope (encryption), websocket (transport for live onboarding status), capability-card (negotiation), circuit-breaker (resilience), pipeline (orchestration), file-log (observability), hash-chain (audit), well-known (discovery)

```bash
# Run scenario 10 — full OEM onboarding trust lifecycle
curl -s -X POST http://localhost:4008/scenarios/run/10 | jq .

# Check the onboarding sequence in the pipeline trace
curl -s -X POST http://localhost:4008/scenarios/run/10 \
  | jq '.pipelineTrace.steps[] | {step: .stepNumber, layer: .layer, provider: .provider, trust: .metadata.trustLevel}'

# Check approved suppliers (populated after onboarding)
curl -s http://localhost:4008/oem/approved-suppliers | jq '.[0]'

# Check partner registry (new partner should appear)
curl -s http://localhost:4008/buildwell/partners | jq '.[-1]'

# Start onboarding directly
curl -s -X POST http://localhost:4008/buildwell/onboarding/start \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Acme Motors","partnerCode":"ACM-001"}' | jq .
```

**UI Verification**:
- BuildWell Fishbowl: Three interaction cards showing trust progression from NONE → ESTABLISHED → TRUSTED
- Pipeline View: Trust step changes provider across the three interactions
- Data Inspector: Partner registry in BuildWell Manufacturing panel updates with new partner after each interaction

---

## Scenario 11: Cross-Ecosystem Quality→Compliance (Both Apps)

**Goal**: A quality complaint in the manufacturing ecosystem (contaminated lubricant used in agricultural equipment) triggers a compliance review in the Farm Credit ecosystem. This is the only scenario that crosses ecosystem boundaries, requiring identity bridging (DID ↔ x509) and semantic negotiation (manufacturing quality record → agricultural compliance format).

**Apps**: Both BuildWell Manufacturing (initiator, port 4008) AND Prairie Ridge Credit (receiver, port 4007)

**Providers exercised (combined)**: all 31 providers — this scenario is specifically designed to exercise any providers not covered by scenarios 1-10. In particular: `mcp` (transport for cross-ecosystem capability discovery), `acp` (semantic negotiation for schema translation), `coinbase-cdp` + `local-keypair` (wallet comparison), `opentelemetry` (cross-ecosystem tracing), `websocket` (live status push), `grpc` (compliance record retrieval), `stripe-fiat` (fiat payment for compliance service fee).

```bash
# Initiate from BuildWell Manufacturing side (manufacturing triggers the cross-ecosystem call)
curl -s -X POST http://localhost:4008/scenarios/run/11 | jq .

# Receive at Prairie Ridge Credit side (Farm Credit compliance review is triggered)
curl -s -X POST http://localhost:4007/scenarios/run/11 | jq .

# Compare the two pipeline traces — they show the same message from each side
BUILDWELL_TRACE=$(curl -s -X POST http://localhost:4008/scenarios/run/11 | jq '.pipelineTrace.steps | length')
PRAIRIE_RIDGE_TRACE=$(curl -s -X POST http://localhost:4007/scenarios/run/11 | jq '.pipelineTrace.steps | length')
echo "BuildWell Manufacturing sees $BUILDWELL_TRACE pipeline steps"
echo "Prairie Ridge Credit sees $PRAIRIE_RIDGE_TRACE pipeline steps"
```

**UI Verification**:
- Both fishbowl UIs show an incoming/outgoing cross-ecosystem message
- Protocol API dashboard (port 4010) shows the message attributed to both source ecosystems
- Pipeline View (BuildWell Manufacturing side): DID identity, MCP transport, ACP negotiation, envelope encryption
- Pipeline View (Prairie Ridge Credit side): x509 identity, credential bridging step visible, allowlist trust after DID verification

---

## Demo Flow Order (For Client Presentations)

### Protocol API Dashboard (port 4010)
1. **Start**: Show Overview page (empty state)
2. **Scenario 1**: Discover agents → agents appear on Overview + Topology
3. **Scenario 9**: Run full pipeline → messages populate
4. **Scenario 3**: Switch identity providers → show signing in message detail
5. **Scenario 4**: Enable encryption → show envelope in message detail
6. **Scenario 5**: Run payment → show payment in message detail
7. **Scenario 6**: Build trust → show trust progression
8. **Scenario 7**: Trigger circuit breaker → show in Topology
9. **Audit Trail**: Show hash chain → click Verify Chain
10. **Demo Mode**: Walk through a scripted scenario with step controls
11. **Protocol Compare**: Side-by-side basic vs production stacks

### Industry Fishbowl (Farm Credit + Manufacturing)
See `FISHBOWL-DEMO-FLOW.md` for the complete fishbowl presentation guide.

**Quick order for fishbowl demo:**
1. **Scenario 1** (Prairie Ridge Credit/4007): Loan compliance — shows oauth-jwt signing + reputation trust
2. **Scenario 3** (Prairie Ridge Credit/4007): Quarterly oversight — shows x509 + tls-mutual + hash-chain
3. **Scenario 5** (Prairie Ridge Credit/4007): New association onboarding — shows first-contact trust lifecycle
4. **Scenario 6** (BuildWell Manufacturing/4008): PO with Lightning payment — shows real Bitcoin L402 payment
5. **Scenario 8** (BuildWell Manufacturing/4008): Quality hold — shows 3-org notification chain
6. **Scenario 10** (BuildWell Manufacturing/4008): New OEM onboarding — shows trust/identity upgrade lifecycle
7. **Scenario 11** (Both apps): Cross-ecosystem — shows DID↔x509 bridging across two industries
