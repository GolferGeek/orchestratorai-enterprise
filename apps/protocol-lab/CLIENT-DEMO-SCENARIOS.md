# Agent Communication Protocol Playground — Client Demonstration Scenarios

**Purpose**: Comprehensive walkthrough of every capability in the Agent Communication Protocol Playground. Each scenario is designed to be run live in a browser, with specific validation points that demonstrate security, cryptography, and protocol features to a technical audience.

**Prerequisites**:
- Main API running on port 6100 (`npm run dev:api`)
- Agent Communication services running (`cd apps/agent-communication && npm run dev`)
- Browser open to `http://localhost:4010`

**Automation**: Run `./scripts/run-demo.sh all` to seed data, then walk through scenarios in the browser. Each scenario below includes API calls that generate the specific traffic needed to populate the UI.

---

## Scenario 1: Authentication — Real JWT from Orchestrator AI API

### Overview
Demonstrates that the entire agent ecosystem uses real Supabase JWT authentication, not mock tokens. The frontend authenticates against the main Orchestrator AI API (port 6100), which returns a Supabase-signed JWT. This same JWT is validated by every agent backend using HMAC-SHA256 signature verification against the shared Supabase secret.

### Steps
1. Navigate to `http://localhost:4010` — observe redirect to `/login`
2. Enter credentials: `golfergeek@orchestratorai.io` / `GolferGeek123!`
3. Click "Log In" — observe redirect to home page
4. Open browser DevTools → Application → Local Storage
5. Inspect `agent-comm-jwt` — this is a real Supabase JWT (3 base64url segments)
6. Inspect `agent-comm-user` — decoded user info from JWT payload

### Security Validation Points
- **JWT structure**: Three dot-separated segments (header.payload.signature)
- **JWT payload** (decode at jwt.io): Contains `iss` (Supabase issuer), `sub` (user UUID), `email`, `role: "authenticated"`, `exp` (expiration), `user_metadata.display_name`
- **Signature**: HMAC-SHA256 signed with Supabase's `super-secret-jwt-token-with-at-least-32-characters-long`
- **Auth guard**: Every non-public API call includes `Authorization: Bearer <token>` header (visible in DevTools Network tab)
- **Public paths**: `/health` and `/.well-known/*` are accessible without JWT (by design — discovery must work pre-auth)
- **Token expiry**: JWT expires after 1 hour; `exp` claim is checked server-side

### Technology
- **Auth provider**: Supabase GoTrue (email/password authentication)
- **Token format**: JSON Web Token (RFC 7519) with HS256 signing
- **Server validation**: Custom `JwtAuthGuard` (NestJS CanActivate) with `crypto.timingSafeEqual` to prevent timing attacks
- **Token flow**: Frontend → POST /auth/login → Supabase → JWT → localStorage → Authorization header on every request
- **Inter-agent auth**: Backend agents obtain their own JWT on startup via `getAgentToken()` — cached and auto-refreshed before expiry

---

## Scenario 2: Agent Discovery — Well-Known Protocol (RFC 8615)

### Overview
Demonstrates the `.well-known/agent.json` discovery protocol. Each agent publishes a machine-readable agent card at a standardized URL. The Protocol API discovers agents by fetching these cards, learning their capabilities, endpoints, version, and supported protocols.

### Steps
1. Navigate to **Overview** page
2. Observe 3 Connected Agents: ResearchHub, MarketPulse, ContentForge
3. Each card shows: name, version (v0.1.0), trust score, interaction count, trust provider, last heartbeat
4. Navigate to **Agent Consumer** → enter `http://localhost:4001/.well-known/agent.json` → click Go
5. Observe the full agent card JSON with capabilities, endpoints, supported protocols

### Security Validation Points
- **Agent card integrity**: The card is served from the agent itself — not from a central registry
- **Capability declaration**: Each agent declares exactly what it can do (e.g., `text-analysis`, `content-generation`)
- **Version pinning**: Cards include `version` for protocol compatibility checking
- **Endpoint mapping**: All available endpoints are listed, allowing capability-based routing

### Technology
- **Standard**: RFC 8615 Well-Known URIs (`/.well-known/agent.json`)
- **Format**: JSON agent card following the A2A protocol specification
- **Discovery flow**: Protocol API → GET `/.well-known/agent.json` → Parse → Register → Broadcast via WebSocket
- **Auto-discovery**: Protocol API attempts discovery of known agents on startup
- **Health monitoring**: Heartbeat tracking with online/offline status

### API Calls (run these to generate traffic)
```bash
# Discover all agents
curl -s -X POST http://localhost:4000/api/agents/discover \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"url":"http://localhost:4001"}'

curl -s -X POST http://localhost:4000/api/agents/discover \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"url":"http://localhost:4002"}'

curl -s -X POST http://localhost:4000/api/agents/discover \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"url":"http://localhost:4003"}'
```

---

## Scenario 3: Identity — Ed25519 Local Keys

### Overview
Demonstrates the Ed25519 local key identity provider. Each agent generates an Ed25519 keypair. When sending messages, the sender signs the payload with their private key and includes the public key in the security envelope. The receiver can verify the signature to confirm message authenticity and non-repudiation.

### Steps
1. Open **Protocol Drawer** (click protocol badges in status bar)
2. Set Identity to `local-keys`
3. Click "Test" next to Identity — observe success with Ed25519 key details
4. Navigate to **Observability** → Message Log
5. Click any message → expand **Security** section
6. Observe: Sender Public Key (Ed25519 format), Signature, Identity Provider = `local-keys`

### Security Validation Points
- **Key format**: Ed25519 public keys (32 bytes, hex-encoded with `04` prefix for uncompressed point)
- **Signature**: EdDSA signature over the message payload
- **Non-repudiation**: Only the holder of the private key could have produced the signature
- **Replay protection**: Status badge shows "Passed" — nonce-based replay detection
- **Schema validation**: Status badge shows "Passed" — JSON-RPC payload validated against schema

### Technology
- **Algorithm**: Ed25519 (Edwards-curve Digital Signature Algorithm)
- **Key size**: 256-bit (32 bytes)
- **Standard**: RFC 8032 (Edwards-Curve Digital Signature Algorithm)
- **Implementation**: Node.js `crypto.sign`/`crypto.verify` with `ed25519` algorithm
- **Key storage**: In-memory keypair generation per agent instance

### API Calls
```bash
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"identity": "local-keys"}'

curl -s -X POST http://localhost:4000/api/protocol/test/identity \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)"
```

---

## Scenario 4: Identity — W3C Decentralized Identifiers (DID)

### Overview
Demonstrates the DID identity provider. Instead of raw public keys, agents identify themselves using W3C Decentralized Identifiers (`did:key` method). DIDs provide a self-certifying, globally unique identity that doesn't depend on any central authority.

### Steps
1. Open **Protocol Drawer** → set Identity to `did`
2. Click "Test" next to Identity
3. Observe the DID in format `did:key:z6Mkf...` with resolved DID document
4. Navigate to **Observability** → click a message → expand **Security**
5. Observe Identity Provider = `did`

### Security Validation Points
- **DID format**: `did:key:z6Mk...` — the `z6Mk` prefix indicates Ed25519 key material
- **DID Document**: Contains `verificationMethod` with the public key, `authentication` for proving control
- **Self-certifying**: The DID encodes the public key itself — no external resolution needed for `did:key`
- **W3C compliant**: Follows W3C DID Core 1.0 specification

### Technology
- **Standard**: W3C Decentralized Identifiers (DID) v1.0
- **Method**: `did:key` (self-certifying, no blockchain needed)
- **Key encoding**: Multibase + Multicodec (z-base58btc + Ed25519 public key codec)
- **DID Document**: JSON-LD document with verification methods and authentication
- **Resolution**: Local resolution (no network call needed for `did:key`)

### API Calls
```bash
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"identity": "did"}'

curl -s -X POST http://localhost:4000/api/protocol/test/identity \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)"
```

---

## Scenario 5: Identity — X.509 Certificates

### Overview
Demonstrates X.509 certificate-based identity — the same technology that secures HTTPS. Each agent has a self-signed X.509 certificate containing its public key, organization, and validity period. This is the enterprise-grade identity option.

### Steps
1. Open **Protocol Drawer** → set Identity to `x509`
2. Click "Test" — observe certificate details (subject, issuer, validity, serial number)
3. Navigate to **Observability** → click a message with x509 identity
4. Observe the certificate chain details in the Security section

### Security Validation Points
- **Certificate fields**: Subject DN (Distinguished Name), Issuer DN, Serial Number, Validity Period
- **Key usage**: Digital Signature, Non-Repudiation
- **Self-signed**: For demo, certificates are self-signed; production would use a CA chain
- **Expiration**: Certificates have a defined validity period

### Technology
- **Standard**: ITU-T X.509 v3 / RFC 5280
- **Encoding**: DER/PEM format
- **Key type**: RSA-2048 or ECDSA P-256
- **Chain of trust**: Certificate → Intermediate CA → Root CA (production)
- **Use case**: Enterprise environments with existing PKI infrastructure

### API Calls
```bash
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"identity": "x509"}'

curl -s -X POST http://localhost:4000/api/protocol/test/identity \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)"
```

---

## Scenario 6: Identity — OAuth/JWT Tokens

### Overview
Demonstrates OAuth 2.0 / JWT-based identity. Agents authenticate using bearer tokens issued by an OAuth provider. This integrates with existing enterprise identity systems (Azure AD, Auth0, Okta, etc.).

### Steps
1. Open **Protocol Drawer** → set Identity to `oauth-jwt`
2. Click "Test" — observe JWT token claims (issuer, audience, scopes)
3. Navigate to messages with oauth-jwt identity in the Security section

### Security Validation Points
- **JWT claims**: `iss` (issuer URL), `sub` (subject), `aud` (audience), `exp` (expiration), `scope` (permissions)
- **Token validation**: Signature verified against issuer's JWKS endpoint
- **Scopes**: Fine-grained permission control (e.g., `agent:read`, `agent:write`)
- **Integration**: Works with any OAuth 2.0 / OpenID Connect provider

### Technology
- **Standards**: OAuth 2.0 (RFC 6749), JWT (RFC 7519), OpenID Connect
- **Token format**: Signed JWT with RS256 or HS256
- **Discovery**: OIDC Well-Known Configuration for automatic setup
- **Use case**: Organizations with existing SSO / identity providers

### API Calls
```bash
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"identity": "oauth-jwt"}'

curl -s -X POST http://localhost:4000/api/protocol/test/identity \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)"
```

---

## Scenario 7: Encryption — Envelope (AES-256-GCM + ECDH Key Exchange)

### Overview
Demonstrates end-to-end envelope encryption. Before sending a message, the sender generates an ephemeral ECDH keypair, derives a shared secret with the recipient's public key, and encrypts the payload using AES-256-GCM. The encrypted message includes the ephemeral public key so the recipient can derive the same shared secret and decrypt.

### Steps
1. Open **Protocol Drawer** → set Encryption to `envelope`
2. Click "Test" — observe encrypted payload preview, algorithm, key exchange details
3. Generate a real encrypted message:
   - Run: `curl -s -X POST http://localhost:4001/agent/analyze -H "Content-Type: application/json" -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" -d '{"topic":"encryption","prompt":"test"}'`
4. Navigate to **Observability** → click the new message → expand **Encryption**
5. Observe: Algorithm = AES-256-GCM, Key Exchange = ECDH P-256, Original Size, Encrypted Size, Overhead %

### Security Validation Points
- **Algorithm**: AES-256-GCM — authenticated encryption (confidentiality + integrity)
- **Key exchange**: ECDH P-256 — ephemeral Diffie-Hellman for forward secrecy
- **Initialization vector**: Unique per message (visible in encrypted envelope)
- **Authentication tag**: GCM provides authentication — tampered ciphertext is rejected
- **Overhead visualization**: Red bar shows encryption overhead percentage (typically 12-18%)
- **Lock icon**: Green lock icon when encryption is active, gray when plaintext

### Technology
- **Encryption**: AES-256-GCM (NIST SP 800-38D) — 256-bit key, 96-bit IV, 128-bit auth tag
- **Key exchange**: ECDH with P-256 curve (NIST SP 800-56A)
- **Forward secrecy**: Ephemeral keypairs per message — compromising long-term keys doesn't decrypt past messages
- **Envelope format**: `{ algorithm, ephemeralPublicKey, iv, ciphertext, authTag }`

### API Calls
```bash
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"encryption": "envelope"}'

curl -s -X POST http://localhost:4000/api/protocol/test/encryption \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)"
```

---

## Scenario 8: Encryption — TLS Mutual Authentication

### Overview
Demonstrates mutual TLS (mTLS) where both the client and server present certificates. This ensures both parties are authenticated at the transport layer — neither side is anonymous. Used in zero-trust network architectures.

### Steps
1. Open **Protocol Drawer** → set Encryption to `tls-mutual`
2. Click "Test" — observe TLS handshake details
3. Generate traffic and check message detail → Encryption section
4. Observe: Algorithm = TLS 1.3 / AES-256-GCM, Key Exchange = X25519

### Security Validation Points
- **Mutual authentication**: Both client and server present X.509 certificates
- **TLS 1.3**: Latest TLS version with reduced handshake (1-RTT)
- **X25519**: Curve25519 key exchange — faster and more secure than P-256
- **Certificate pinning**: Agents can pin expected certificates for known peers

### Technology
- **Protocol**: TLS 1.3 (RFC 8446)
- **Key exchange**: X25519 (RFC 7748)
- **Cipher suite**: TLS_AES_256_GCM_SHA384
- **Certificate**: X.509 v3 with client authentication extended key usage
- **Use case**: Zero-trust architectures, high-security environments

### API Calls
```bash
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"encryption": "tls-mutual"}'

curl -s -X POST http://localhost:4000/api/protocol/test/encryption \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)"
```

---

## Scenario 9: Payment — x402 USDC (Blockchain)

### Overview
Demonstrates the x402 payment protocol for agent-to-agent commerce using USDC stablecoin on Base Sepolia testnet. Before an agent processes an expensive request, it returns a 402 Payment Required response with a payment gate. The calling agent pays via the Coinbase Developer Platform wallet, then retries with the payment receipt.

### Steps
1. Open **Protocol Drawer** → set Payment to `x402-usdc`
2. Click "Test" — observe payment gate (gateId, price, currency, capabilities)
3. Navigate to **Observability** → click a message with payment data
4. Observe Payment section: Required = Yes, Amount = 0.001 USDC, Status = paid
5. Check **Settings** for wallet balance on Base Sepolia Testnet

### Security Validation Points
- **Payment gate**: Server declares price before work — no surprise charges
- **USDC stablecoin**: Dollar-pegged, auditable on-chain
- **Transaction hash**: Every payment has a verifiable on-chain transaction
- **Wallet isolation**: Each agent has its own wallet (Coinbase CDP managed)

### Technology
- **Protocol**: x402 (HTTP 402 Payment Required standard)
- **Currency**: USDC on Base Sepolia testnet (ERC-20 stablecoin)
- **Wallet**: Coinbase Developer Platform (CDP) — MPC-secured wallet
- **Network**: Base (Coinbase L2 on Ethereum)
- **Settlement**: On-chain USDC transfer with transaction hash proof

### API Calls
```bash
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"payment": "x402-usdc"}'

curl -s -X POST http://localhost:4000/api/protocol/test/payment \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)"
```

---

## Scenario 10: Payment — Lightning L402 (Bitcoin)

### Overview
Demonstrates Lightning Network L402 payments (formerly LSAT). This uses Bitcoin's Lightning Network for instant, near-zero-fee micropayments. An agent issues a Lightning invoice, the caller pays it, and the payment preimage serves as proof of payment (macaroon credential).

### Steps
1. Open **Protocol Drawer** → set Payment to `lightning-l402`
2. Click "Test" — observe Lightning invoice, macaroon, payment hash
3. Note: Requires Docker regtest environment (bitcoind + LND) to be running

### Security Validation Points
- **Lightning invoice**: BOLT11-encoded invoice with amount, payment hash, expiry
- **Macaroon**: Cryptographic bearer credential with caveats (conditions)
- **Payment preimage**: Proof of payment — only revealed when payment completes
- **Atomic**: Payment is all-or-nothing — no partial payments or double-spending

### Technology
- **Protocol**: L402 (Lightning HTTP 402) — formerly LSAT
- **Network**: Lightning Network (Bitcoin Layer 2)
- **Authentication**: Macaroons (RFC draft, Google) with caveats
- **Invoice format**: BOLT11 (Lightning payment requests)
- **Node**: LND (Lightning Network Daemon) on Docker regtest
- **Use case**: Micropayments (< $0.01), API monetization, pay-per-call

### API Calls
```bash
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"payment": "lightning-l402"}'

curl -s -X POST http://localhost:4000/api/protocol/test/payment \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)"
```

---

## Scenario 11: Payment — Stripe Fiat

### Overview
Demonstrates traditional fiat payment integration via Stripe. Agents can charge for services using credit cards, ACH, or other Stripe-supported payment methods. This bridges traditional commerce with agent-to-agent communication.

### Steps
1. Open **Protocol Drawer** → set Payment to `stripe-fiat`
2. Click "Test" — observe Stripe payment intent, client secret, amount
3. Note test mode badge in status bar

### Security Validation Points
- **PCI compliance**: Stripe handles all card data — agents never see card numbers
- **Payment intent**: Server-side payment intent with confirmation
- **Idempotency**: Stripe idempotency keys prevent duplicate charges
- **Webhook verification**: Stripe signature verification for event webhooks

### Technology
- **Provider**: Stripe (PCI DSS Level 1 certified)
- **API**: Stripe Payment Intents API
- **Currency**: USD (fiat)
- **Test mode**: Uses `sk_test_*` keys — no real charges
- **Use case**: Enterprise billing, subscription-based agent services

### API Calls
```bash
curl -s -X PUT http://localhost:4000/api/protocol/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
  -d '{"payment": "stripe-fiat"}'

curl -s -X POST http://localhost:4000/api/protocol/test/payment \
  -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)"
```

---

## Scenario 12: Trust — Allowlist (Static Trust)

### Overview
Demonstrates static trust via allowlists. Only pre-approved agents can communicate. This is the simplest trust model — suitable for closed ecosystems where all participants are known in advance.

### Steps
1. Open **Protocol Drawer** → set Trust to `allowlist`
2. Click "Test" — observe allowed agent list, trust evaluation result
3. On **Overview**, observe trust badges: "Trusted" for allowlisted agents

### Security Validation Points
- **Explicit allow**: Only agents on the list are trusted — all others rejected
- **No score decay**: Trust is binary (allowed/denied), not probabilistic
- **Admin controlled**: Allowlist is managed by the system operator

### Technology
- **Model**: Static allowlist (whitelist)
- **Evaluation**: O(1) lookup — agent ID checked against allowed set
- **Use case**: Private networks, known agent ecosystems, compliance environments

---

## Scenario 13: Trust — Reputation (Dynamic Scoring)

### Overview
Demonstrates dynamic reputation-based trust. Trust scores start neutral (0.5) and increase with successful interactions or decrease with failures. This creates an emergent trust network where reliable agents earn higher scores over time.

### Steps
1. Open **Protocol Drawer** → set Trust to `reputation`
2. Click "Test" — observe initial score, interaction, updated score
3. Navigate to **Observability** → click a message → observe **Trust Progression** timeline
4. See the trust score climb: First contact (0.30) → Identity verified (0.45) → Negotiation (0.55) → Payment confirmed (0.65) → Audit verified (0.72) → Current score
5. On **Overview**, observe trust score rings with interaction counts

### Security Validation Points
- **Score range**: 0.0 (untrusted) to 1.0 (fully trusted)
- **Trust levels**: Untrusted (<0.3), Cautious (0.3-0.5), Neutral (0.5-0.7), Trusted (0.7-0.9), Highly Trusted (>0.9)
- **Progression visibility**: Timeline shows exactly how trust was built, step by step
- **Interaction counting**: Each successful exchange incrementally builds trust
- **Decay potential**: Trust can decrease with failed interactions

### Technology
- **Model**: Weighted reputation scoring with interaction history
- **Score formula**: `newScore = currentScore + (weight * (1 - currentScore))` for success
- **Visualization**: Trust Progression Timeline component with animated dots and score labels
- **Use case**: Open ecosystems, marketplaces, public agent networks

---

## Scenario 14: Trust — First Contact (Challenge-Response)

### Overview
Demonstrates the first-contact trust protocol — a challenge-response handshake for establishing initial trust with unknown agents. When two agents meet for the first time, they exchange cryptographic challenges to prove they are live and capable.

### Steps
1. Open **Protocol Drawer** → set Trust to `first-contact`
2. Click "Test" — observe challenge generation, response, verification result
3. Navigate to messages — observe trust events showing handshake completion

### Security Validation Points
- **Challenge**: Random nonce that the responder must sign or hash
- **Response**: Cryptographic proof that the responder controls their claimed identity
- **Liveness**: Proves the agent is currently online and responding (not a replay)
- **One-time**: Each challenge is unique — prevents replay attacks

### Technology
- **Protocol**: Challenge-response handshake
- **Challenge**: Random 256-bit nonce
- **Response**: Signed challenge + agent metadata
- **Verification**: Signature check against agent's declared public key
- **Use case**: First interaction between unknown agents, public discovery

---

## Scenario 15: Transport — HTTP REST

### Overview
Demonstrates standard HTTP REST transport — the simplest and most widely compatible transport option. Agents communicate via standard HTTP methods (GET, POST, PUT, DELETE) with JSON bodies.

### Steps
1. Open **Protocol Drawer** → set Transport to `http-rest`
2. Click "Test" — observe ping/pong with latency measurement
3. Generate traffic via any agent endpoint
4. Check **Metrics** → Messages by Protocol bar chart shows HTTP REST count

### Technology
- **Protocol**: HTTP/1.1 or HTTP/2
- **Format**: JSON request/response bodies
- **Methods**: Standard REST verbs (GET, POST, PUT, DELETE)
- **Use case**: Maximum compatibility, simple integrations

---

## Scenario 16: Transport — A2A JSON-RPC 2.0

### Overview
Demonstrates the A2A (Agent-to-Agent) JSON-RPC 2.0 transport — the native protocol for structured agent communication. Every request follows the JSON-RPC 2.0 specification with method, params, and structured result/error responses.

### Steps
1. Open **Protocol Drawer** → set Transport to `a2a-jsonrpc`
2. Click "Test" — observe JSON-RPC formatted request/response
3. Navigate to **Observability** → click any message → expand **Request** and **Response**
4. Observe JSON-RPC structure: `{"jsonrpc": "2.0", "id": "...", "method": "...", "params": {...}}`

### Security Validation Points
- **Strict schema**: Every message validates against JSON-RPC 2.0 schema
- **Request ID**: Correlates request to response — prevents mismatched replies
- **Error codes**: Standardized error codes (-32700 parse error, -32600 invalid request, etc.)
- **Method namespacing**: Methods are namespaced (e.g., `agent.analyze`, `tasks.send`)

### Technology
- **Standard**: JSON-RPC 2.0 (jsonrpc.org specification)
- **Format**: `{jsonrpc: "2.0", id, method, params}` / `{jsonrpc: "2.0", id, result}` or `{error}`
- **Batch**: Supports batch requests (array of requests)
- **Use case**: Structured agent-to-agent communication with strong contracts

---

## Scenario 17: Transport — WebSocket

### Overview
Demonstrates WebSocket transport for bidirectional, persistent connections. Unlike HTTP, WebSocket connections stay open, allowing agents to push messages to each other in real-time without polling.

### Steps
1. Open **Protocol Drawer** → set Transport to `websocket`
2. Click "Test" — observe WebSocket connection, message exchange
3. Status bar shows real-time updates via WebSocket (agent status broadcasts)

### Technology
- **Protocol**: WebSocket (RFC 6455) over TCP
- **Adapter**: NestJS WsAdapter
- **Use case**: Real-time updates, streaming responses, event subscriptions
- **Benefit**: Lower latency than HTTP polling, bidirectional communication

---

## Scenario 18: Transport — gRPC

### Overview
Demonstrates gRPC transport using Protocol Buffers for high-performance, strongly-typed communication. gRPC provides code generation, streaming, and efficient binary serialization.

### Steps
1. Open **Protocol Drawer** → set Transport to `grpc`
2. Click "Test" — observe gRPC service definition, method call

### Technology
- **Protocol**: gRPC (HTTP/2 + Protocol Buffers)
- **Serialization**: Protocol Buffers (binary, schema-enforced)
- **Streaming**: Unary, server-streaming, client-streaming, bidirectional
- **Use case**: High-throughput systems, polyglot environments, strong typing

---

## Scenario 19: Transport — MCP (Model Context Protocol)

### Overview
Demonstrates MCP transport — Anthropic's Model Context Protocol for AI-native tool use. MCP allows agents to expose their capabilities as "tools" that LLMs can discover and invoke.

### Steps
1. Open **Protocol Drawer** → set Transport to `mcp`
2. Click "Test" — observe MCP tool listing, tool invocation
3. Navigate to **MCP vs A2A** view for comparison

### Technology
- **Protocol**: Model Context Protocol (Anthropic)
- **Format**: Tool definitions with JSON Schema parameters
- **Discovery**: Tool listing endpoint for LLM integration
- **Use case**: LLM-powered agents, Claude tool use, AI-native communication

---

## Scenario 20: Negotiation — Capability Card Matching

### Overview
Demonstrates capability-based negotiation. Before sending a request, the caller checks the target's capability card to find the best matching capability. This prevents sending requests that the target can't handle.

### Steps
1. Open **Protocol Drawer** → set Negotiation to `capability-card`
2. Click "Test" — observe negotiation result: agreed capabilities, agreed protocol
3. Navigate to **Agent Consumer** → browse agent cards to see declared capabilities

### Technology
- **Model**: Static capability matching
- **Format**: Capability cards with supported actions, input/output schemas
- **Use case**: Heterogeneous agent ecosystems, capability-based routing

---

## Scenario 21: Negotiation — ACP Semantic Negotiation

### Overview
Demonstrates the Agent Communication Protocol's semantic negotiation. Two agents exchange their capability sets and find the overlap — the intersection becomes the agreed protocol for the session.

### Steps
1. Open **Protocol Drawer** → set Negotiation to `acp`
2. Click "Test" — observe semantic overlap detection, agreed capabilities

### Technology
- **Model**: Semantic overlap detection
- **Process**: Exchange capabilities → compute intersection → agree on common ground
- **Use case**: Dynamic agent pairing, capability discovery at runtime

---

## Scenario 22: Negotiation — Auction-Based Assignment

### Overview
Demonstrates auction-based negotiation where multiple agents bid for a task. The orchestrator collects bids (price, estimated time, confidence) and awards the task to the best bidder.

### Steps
1. Open **Protocol Drawer** → set Negotiation to `auction`
2. Click "Test" — observe bid collection, winner selection, assignment

### Technology
- **Model**: Sealed-bid auction
- **Bids**: Price, estimated completion time, confidence score
- **Selection**: Weighted scoring (price × confidence / time)
- **Use case**: Task delegation, load balancing, competitive agent marketplaces

---

## Scenario 23: Resilience — Circuit Breaker

### Overview
Demonstrates the circuit breaker pattern. When an agent fails repeatedly, the circuit "opens" — subsequent requests are immediately rejected without attempting the call. After a cooldown period, a single "probe" request is allowed (half-open state). If it succeeds, the circuit closes; if it fails, it opens again.

### Steps
1. Open **Protocol Drawer** → set Resilience to `circuit-breaker`
2. Click "Test" — observe circuit breaker state machine
3. Navigate to **Observability** → click a message → expand **Resilience** section
4. Observe: Circuit Breaker state (CLOSED/HALF_OPEN/OPEN), Failure Count, Threshold, Cooldown, Failure Rate bar

### Security Validation Points
- **State machine**: CLOSED → (failures ≥ threshold) → OPEN → (cooldown expires) → HALF_OPEN → (probe succeeds) → CLOSED
- **Failure rate visualization**: Red progress bar showing failures / threshold ratio
- **Color coding**: Green = CLOSED (healthy), Yellow = HALF_OPEN (probing), Red = OPEN (rejecting)
- **Cooldown timer**: Shows time until next probe attempt
- **Alert text**: Contextual warnings when circuit is open or half-open

### Technology
- **Pattern**: Circuit Breaker (Michael Nygard, "Release It!")
- **States**: CLOSED, OPEN, HALF_OPEN
- **Threshold**: 5 failures trigger open
- **Cooldown**: 30 seconds before half-open probe
- **Use case**: Preventing cascade failures, protecting degraded services

---

## Scenario 24: Resilience — Retry with Exponential Backoff

### Overview
Demonstrates automatic retry with exponential backoff. Failed requests are retried with increasing delays (1s, 2s, 4s, 8s...) to avoid overwhelming a recovering service.

### Steps
1. Open **Protocol Drawer** → set Resilience to `retry`
2. Click "Test" — observe retry execution, attempt count

### Technology
- **Pattern**: Exponential backoff with jitter
- **Delays**: 1s, 2s, 4s, 8s, 16s (power of 2)
- **Jitter**: Random ±25% to prevent thundering herd
- **Max retries**: Configurable (default 3)
- **Use case**: Transient failures, network hiccups, rate limiting

---

## Scenario 25: Resilience — Bulkhead Isolation

### Overview
Demonstrates the bulkhead pattern. Each agent target gets its own concurrency pool. If one target is slow or failing, it only exhausts its own pool — other targets continue unaffected.

### Steps
1. Open **Protocol Drawer** → set Resilience to `bulkhead`
2. Click "Test" — observe isolation configuration, concurrent slots

### Technology
- **Pattern**: Bulkhead (compartmentalization)
- **Isolation**: Per-target concurrency pools
- **Limit**: Max concurrent requests per target
- **Queue**: Overflow requests wait in bounded queue
- **Use case**: Multi-tenant, preventing noisy neighbors, resource isolation

---

## Scenario 26: Wallet — Local Keypair

### Overview
Demonstrates the local keypair wallet for managing agent funds. Each agent has a local ECDSA keypair-based wallet that can hold and transfer USDC on the mock testnet.

### Steps
1. Open **Protocol Drawer** → observe Wallet = `local-keypair`
2. Click "Test" — observe wallet address, balance, currency, network
3. Navigate to **Settings** — check wallet balance display

### Technology
- **Key type**: ECDSA secp256k1 (Ethereum-compatible)
- **Address**: Ethereum-format address (0x...)
- **Balance**: USDC on mock testnet
- **Use case**: Development, testing, local agent wallets

---

## Scenario 27: Wallet — Coinbase CDP (Production)

### Overview
Demonstrates Coinbase Developer Platform (CDP) wallet — a production-grade MPC wallet. The private key is split across Coinbase's secure enclaves using Multi-Party Computation, so no single party ever holds the full key.

### Steps
1. Open **Protocol Drawer** → observe wallet configuration
2. Check `.env` for CDP credentials: `CDP_API_KEY_ID`, `CDP_WALLET_SECRET`
3. Status bar shows "Base Sepolia Testnet" — real testnet connected

### Technology
- **Provider**: Coinbase Developer Platform (CDP)
- **Security**: Multi-Party Computation (MPC) — key never exists in one place
- **Network**: Base Sepolia testnet (Coinbase L2)
- **API**: REST API with API key + wallet secret authentication
- **Use case**: Production deployments, institutional-grade key management

---

## Scenario 28: Observability — Message Log & Detail Inspection

### Overview
Demonstrates the full observability stack. Every agent-to-agent message is captured by the `MessageLoggingInterceptor` and stored in the Protocol API. The UI provides a message log with filters, and a rich detail view showing every security aspect of each message.

### Steps
1. Navigate to **Observability** → **Message Log** tab
2. Observe the list: each row shows Status (color badge), Source → Target, Method, Time
3. Use filters: filter by Source agent, Target agent, Status (success/error)
4. Click any message — full detail panel opens on the right
5. Walk through each section:
   - **Header**: Source, Target, Method, ID, Status badge
   - **Timing**: Sent, Received, Completed, Duration (ms)
   - **Protocol Layers**: All 12 active layers with current provider names
   - **Payment**: Required, Status, Amount, Currency
   - **Trust Progression**: Visual timeline with 6 events, score climbing from 0.30 to 0.82+
   - **Security** (expandable): Nonce, Timestamp, Sender ID, Public Key, Signature (with copy button), Identity Provider badge, Replay Protection badge, Schema Validation badge
   - **Encryption** (expandable): Encrypted/Plaintext badge, Algorithm, Key Exchange, Original Size, Encrypted Size, Overhead % with red bar
   - **Resilience** (expandable): Circuit Breaker state badge, Failure Count/Threshold, Cooldown, Failure Rate bar with contextual warning
   - **Request**: Full JSON-RPC request with syntax highlighting
   - **Response**: Full JSON-RPC response with syntax highlighting

### Security Validation Points
- **Complete audit trail**: Every field of every message is captured and inspectable
- **Security envelope**: Nonce + timestamp + sender ID + public key + signature = complete non-repudiation
- **Replay protection badge**: Shows "Passed" — nonce was unique and not previously seen
- **Schema validation badge**: Shows "Passed" — request conformed to expected JSON-RPC schema
- **Encryption indicator**: Green lock = encrypted, gray = plaintext
- **Trust progression**: Visual proof of how trust was established over multiple interactions

### Technology
- **Interceptor**: NestJS `MessageLoggingInterceptor` on all agent `/agent/*` endpoints
- **Storage**: In-memory message store in Protocol API
- **Transport**: Fire-and-forget POST to Protocol API (non-blocking)
- **UI**: Vue 3 reactive components with Pinia state management

---

## Scenario 29: Observability — Audit Trail with Hash Chain Integrity

### Overview
Demonstrates the immutable audit trail. Every event (message sent, message received, trust updated, payment processed, config changed) is appended to a hash chain. Each entry's hash includes the previous entry's hash, creating a tamper-evident chain — if any entry is modified, all subsequent hashes break.

### Steps
1. Navigate to **Observability** → **Audit Trail** tab
2. Observe the chain: each entry shows Sequence #, Event Type, Agent, Timestamp, Hash (truncated), Previous Hash
3. Note the chain linkage: each entry's "Previous Hash" matches the prior entry's "Hash"
4. Click **Verify Chain** — observe each entry being verified (green checkmarks)
5. After verification, see the summary: "Chain verified: X/Y entries valid"

### Security Validation Points
- **Hash chain**: Each hash = H(sequence + eventType + agent + timestamp + previousHash)
- **Genesis block**: First entry has previousHash = all zeros (genesis)
- **Tamper detection**: Modifying any entry breaks the chain from that point forward
- **Event types**: `message_sent`, `message_received`, `trust_updated`, `payment_processed`, `config_changed`
- **Verification animation**: Each entry is checked sequentially with visual feedback

### Technology
- **Data structure**: Blockchain-inspired hash chain (without consensus)
- **Hash function**: SHA-256 (deterministic, collision-resistant)
- **Chain rule**: `hash[n] = SHA256(sequence || eventType || agent || timestamp || hash[n-1])`
- **Verification**: Re-compute all hashes and compare — any mismatch = tampering detected
- **Use case**: Compliance, audit, dispute resolution, regulatory requirements

---

## Scenario 30: Observability — Metrics Dashboard

### Overview
Demonstrates the system-wide metrics dashboard with performance and cost analytics.

### Steps
1. Navigate to **Observability** sub-nav → **Metrics**
2. Observe metric cards: Total Messages, Avg Latency, Success Rate, Total Cost
3. Observe bar charts: Messages by Protocol (A2A JSON-RPC, HTTP REST, WebSocket, gRPC, MCP)
4. Observe latency distribution: 0-50ms, 50-100ms, 100-200ms, 200-500ms, 500ms+

### Technology
- **Aggregation**: Real-time computation from message store
- **Visualization**: Custom bar charts with proportional widths
- **Cost tracking**: Aggregated payment amounts across all messages

---

## Scenario 31: Content Negotiation — Agent Content Browser

### Overview
Demonstrates HTTP content negotiation for agent-readable content. Agents send `Accept: text/markdown` headers and receive structured markdown responses. The Agent Consumer browser lets you navigate agent content just like a web browser — but for AI-readable content.

### Steps
1. Navigate to **Agent Consumer** view
2. Click quick targets: **llms.txt**, **Agent Card**, **Categories**, **Articles**
3. Observe content type detection: MARKDOWN (green badge), JSON (blue badge), HTML (yellow badge)
4. Notice the `Accept: text/markdown, application/json;q=0.9, text/html;q=0.8` header
5. Click links within content — the browser follows them (relative and absolute URLs)
6. JSON responses have clickable URLs (blue, underlined) that navigate in-browser

### Security Validation Points
- **Content type validation**: Response Content-Type is checked and classified
- **HTML sandboxing**: HTML responses rendered in sandboxed iframe (`sandbox="allow-same-origin"`)
- **URL proxying**: All requests go through Vite proxy — no direct cross-origin calls from browser

### Technology
- **Standard**: HTTP Content Negotiation (RFC 7231)
- **Format**: `Accept` header with quality factors (q-values)
- **llms.txt**: Emerging standard for LLM-readable site summaries
- **Rendering**: Markdown → HTML via `marked` library, JSON → syntax-highlighted tree
- **Use case**: AI agents browsing other agents' content, LLM tool integration

---

## Scenario 32: Multi-Agent Workflow — Content Pipeline

### Overview
Demonstrates a multi-agent content generation pipeline: ResearchHub analyzes a topic → MarketPulse scans market data → ContentForge synthesizes both into a publishable draft. This shows orchestrated multi-agent collaboration.

### Steps
1. Generate the pipeline:
   ```bash
   curl -s -X POST http://localhost:4003/api/workflow/execute \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $(cat /tmp/orchestrator_jwt.txt)" \
     -d '{"topic":"The Future of Agent-to-Agent Commerce"}'
   ```
2. Navigate to **ContentForge** → **Workflow** section
3. Observe the 3-step pipeline: Research → Market → Synthesize
4. Each step shows: agent ID, action, duration, result
5. Navigate to **Observability** → see the messages generated by the pipeline

### Technology
- **Pattern**: Pipeline orchestration (sequential multi-agent workflow)
- **Steps**: ResearchHub (narrative analysis) → MarketPulse (trend data) → ContentForge (synthesis)
- **Tracing**: Each step tracked with timing, agent ID, action, result

---

## Scenario 33: Protocol Stack Comparison

### Overview
Demonstrates side-by-side comparison of different protocol stack configurations. Compare a basic stack (mock payment, no encryption, allowlist trust) with a production stack (USDC payment, envelope encryption, reputation trust).

### Steps
1. Navigate to **Protocol Compare** view
2. Observe two stacks side-by-side: Stack A and Stack B
3. Each stack shows all 12 protocol layers with their active provider
4. Differences are highlighted

### Technology
- **Visualization**: Side-by-side protocol stack comparison
- **Use case**: Planning deployments, evaluating security posture, upgrade decisions

---

## Scenario 34: Full Security Envelope Inspection (Deep Dive)

### Overview
This is the "show them everything" scenario. Walk through a single message and explain every security artifact present. This is the scenario that demonstrates the depth of the security implementation.

### Steps
1. Run the seed script: `./scripts/run-demo.sh seed`
2. Navigate to **Observability** → **Message Log**
3. Click the message with source=`content-forge`, target=`research-hub`, method=`agent-card` (demo-03)
   - This message uses: x402-usdc payment, envelope encryption, reputation trust, DID identity
4. Walk through EVERY section:

**Header** — Shows this is an inter-agent call from ContentForge to ResearchHub

**Timing** — Precise timestamps: when the request was sent, received, completed, and total duration in milliseconds. This is captured by the MessageLoggingInterceptor in the NestJS pipeline.

**Protocol Layers** — All 12 layers shown:
- discovery: well-known (RFC 8615)
- transport: a2a-jsonrpc (JSON-RPC 2.0)
- negotiation: capability-card (static matching)
- identity: did (W3C Decentralized Identifiers)
- payment: x402-usdc (blockchain USDC)
- encryption: envelope (AES-256-GCM + ECDH)
- trust: reputation (dynamic scoring)

**Payment** — Required: Yes, Amount: 0.001 USDC, Status: paid. This agent charged for its service.

**Trust Progression** — 6-step timeline:
1. First contact — allowlist check passed (0.30)
2. Identity verified — DID resolved (0.45)
3. Capability negotiation successful (0.55)
4. Payment protocol confirmed (0.65)
5. Audit chain integrity verified (0.72)
6. Current trust score (0.82+)

**Security Envelope** (expand):
- **Nonce**: UUID — unique per message, prevents replay attacks
- **Timestamp**: When the security envelope was created
- **Sender ID**: `content-forge` — the claiming identity
- **Sender Public Key**: `04...` — the Ed25519/DID public key (truncated for display, full key copyable)
- **Signature**: Cryptographic signature over the message payload (truncated, with copy button)
- **Identity Provider**: `did` badge — which identity system produced these credentials
- **Replay Protection**: Green "Passed" badge — nonce was checked and is unique
- **Schema Validation**: Green "Passed" badge — JSON-RPC payload conforms to schema

**Encryption** (expand):
- **Status**: Green "Encrypted" badge
- **Algorithm**: AES-256-GCM — authenticated encryption
- **Key Exchange**: ECDH P-256 — Elliptic Curve Diffie-Hellman
- **Original Size**: e.g., 412 B
- **Encrypted Size**: e.g., 461 B
- **Overhead**: Red bar showing +12% — the cost of encryption

**Resilience** (expand):
- **Circuit Breaker**: Green "CLOSED" badge for research-hub
- **Failures**: 0 / 5 (threshold)
- **Cooldown**: 30s
- **Failure Rate**: 0% (green bar)

**Request** — Full JSON-RPC request with syntax-highlighted JSON:
```json
{
  "jsonrpc": "2.0",
  "id": "req-demo-03",
  "method": "agent-card",
  "params": {
    "topic": "agent communication",
    "security": {
      "nonce": "...",
      "timestamp": 1773156000000,
      "senderId": "content-forge",
      "senderPublicKey": "MCowBQYDK2VwAyEA...",
      "signature": "MEUCIQDx7VpKm3nYb8QW...",
      "identityProvider": "did"
    }
  }
}
```

**Response** — Full JSON-RPC response:
```json
{
  "jsonrpc": "2.0",
  "id": "req-demo-03",
  "result": {
    "content": "Analysis complete for agent-card",
    "metadata": {
      "encrypted": true,
      "algorithm": "AES-256-GCM"
    }
  }
}
```

### Security Validation Points
This single message demonstrates:
1. **Authentication** — JWT bearer token in the request
2. **Identity** — DID-based sender identification with public key
3. **Non-repudiation** — Cryptographic signature proves sender
4. **Replay protection** — Unique nonce checked against store
5. **Schema validation** — Request conforms to JSON-RPC schema
6. **Encryption** — AES-256-GCM with ECDH key exchange
7. **Payment** — x402 USDC payment for the service
8. **Trust** — Reputation score built over 6 interactions
9. **Resilience** — Circuit breaker monitoring the target
10. **Audit** — This message is recorded in the hash chain

---

## Running All Scenarios

### Quick Setup
```bash
# 1. Ensure main API is running
curl -s http://localhost:6100/health

# 2. Start agent communication services
cd apps/agent-communication && npm run dev

# 3. Run automated tests (62 checks)
./scripts/run-demo.sh all

# 4. Open browser to http://localhost:4010
# 5. Login with golfergeek@orchestratorai.io / GolferGeek123!
# 6. Walk through scenarios in the browser
```

### Recommended Demo Order
1. **Scenario 1** — Authentication (sets the stage — everything is authenticated)
2. **Scenario 2** — Agent Discovery (introduces the agents)
3. **Scenario 34** — Full Security Deep Dive (the wow moment — show everything at once)
4. **Scenarios 3-6** — Identity Providers (switch between 4 identity systems)
5. **Scenarios 7-8** — Encryption (show envelope encryption detail)
6. **Scenarios 9-11** — Payment (blockchain, Lightning, fiat — 3 payment systems)
7. **Scenarios 12-14** — Trust (static → dynamic → challenge-response)
8. **Scenarios 15-19** — Transport (5 protocols) + Negotiation (3 strategies)
9. **Scenarios 23-25** — Resilience (circuit breaker, retry, bulkhead)
10. **Scenarios 28-30** — Observability (message log, audit chain, metrics)
11. **Scenario 32** — Multi-Agent Workflow (the pipeline)
12. **Scenario 31** — Content Negotiation (Agent Consumer browser)
