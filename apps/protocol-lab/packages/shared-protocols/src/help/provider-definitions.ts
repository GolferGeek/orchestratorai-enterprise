// Help content: Protocol Provider definitions
// Each provider implements a specific layer's concern

export interface ProviderDefinition {
  id: string;
  layer: string;
  name: string;
  oneLiner: string;
  howItWorks: string;
  whatToLookFor: string;
  scenarios: number[];
  relatedProviders: string[];
  spec: string;
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  // ── Discovery ──
  {
    id: 'well-known',
    layer: 'discovery',
    name: 'Well-Known Discovery',
    oneLiner:
      'Agents publish a JSON agent card at /.well-known/agent.json describing their capabilities and endpoints.',
    howItWorks:
      "The requesting agent sends a GET to the target's /.well-known/agent.json URL. The response contains the agent's name, capabilities, supported protocols, and endpoint URLs. This follows the IETF well-known URI pattern (RFC 8615) adapted for agent discovery.",
    whatToLookFor:
      "In the pipeline trace, look for the Discovery step showing the discovered capabilities array and the agent card URL. The capabilities listed here determine what operations the requesting agent can attempt.",
    scenarios: [1, 3, 5, 6, 10],
    relatedProviders: ['capability-card'],
    spec: 'Google A2A Protocol — Agent Card specification',
  },
  {
    id: 'a2a-agent-card',
    layer: 'discovery',
    name: 'A2A Agent Card',
    oneLiner:
      'A2A-specific agent card at /.well-known/agent-card.json including skills, capabilities, and security schemes.',
    howItWorks:
      'The caller fetches /.well-known/agent-card.json and receives an A2A card document with skill metadata, supported UI modes, capabilities, and securitySchemes. Cards can optionally include a JWS signature for integrity verification.',
    whatToLookFor:
      'In discovery steps, look for skills with inputModes/outputModes and securitySchemes sections. These drive negotiation and identity compatibility in later steps.',
    scenarios: [12, 15],
    relatedProviders: ['a2a-skill-negotiation', 'oauth-jwt', 'a2a-jws-trust'],
    spec: 'A2A Protocol v0.3 Agent Discovery',
  },
  {
    id: 'agntcy-oasf',
    layer: 'discovery',
    name: 'AGNTCY OASF Directory',
    oneLiner:
      'Open Agent Schema Framework discovery using OCI-style descriptors and federated directories.',
    howItWorks:
      'Publishes and resolves agent descriptors that include OASF metadata, federation domains, and interop hints for A2A and MCP-compatible endpoints.',
    whatToLookFor:
      'Discovery step should include OASF descriptor metadata and federated lookup details.',
    scenarios: [13],
    relatedProviders: ['agntcy-crypto-identity', 'agntcy-slim'],
    spec: 'AGNTCY Open Agent Schema Framework',
  },

  // ── Transport ──
  {
    id: 'a2a-jsonrpc',
    layer: 'transport',
    name: 'A2A JSON-RPC 2.0',
    oneLiner:
      'The primary agent-to-agent transport. Structured request/response over HTTP using the JSON-RPC 2.0 envelope.',
    howItWorks:
      "Messages are wrapped in JSON-RPC 2.0 format: { jsonrpc: '2.0', id, method, params }. The method field identifies the operation (e.g., 'compliance.validateLoan'). Params carry the business payload. Responses include result or error. This is the Google A2A protocol's core transport.",
    whatToLookFor:
      'In the pipeline trace, the TRANSPORT step shows the HTTP call with method, target URL, and response status. The method string tells you exactly what operation was invoked. Duration here includes network latency.',
    scenarios: [1, 3, 4, 6, 8, 9, 11, 12, 15],
    relatedProviders: ['http-rest', 'websocket', 'grpc'],
    spec: 'Google A2A Protocol, JSON-RPC 2.0 (jsonrpc.org)',
  },
  {
    id: 'http-rest',
    layer: 'transport',
    name: 'HTTP REST',
    oneLiner:
      "Standard REST API calls for simple queries that don't need the full A2A envelope.",
    howItWorks:
      'Plain HTTP GET/POST to REST endpoints. Used when the interaction is simple (read-only queries), the overhead of JSON-RPC wrapping isn\'t justified, and both agents agree on the API contract directly.',
    whatToLookFor:
      'Simpler transport step with standard HTTP verbs. No JSON-RPC envelope overhead. Typically used for read operations like catalog queries.',
    scenarios: [7, 10],
    relatedProviders: ['a2a-jsonrpc'],
    spec: 'HTTP/1.1 (RFC 7231)',
  },
  {
    id: 'websocket',
    layer: 'transport',
    name: 'WebSocket',
    oneLiner:
      'Persistent bidirectional connection for real-time streaming between agents.',
    howItWorks:
      'Agents establish a WebSocket connection for scenarios requiring real-time updates — helpdesk conversations, quality alerts, live data feeds. Messages flow in both directions without per-message HTTP overhead.',
    whatToLookFor:
      'The transport step shows WebSocket as the protocol. Used for scenarios where latency matters or the interaction is conversational rather than request/response.',
    scenarios: [2, 8],
    relatedProviders: ['a2a-jsonrpc'],
    spec: 'WebSocket Protocol (RFC 6455)',
  },
  {
    id: 'grpc',
    layer: 'transport',
    name: 'gRPC',
    oneLiner:
      'High-performance binary RPC for internal service-to-service communication.',
    howItWorks:
      'Protocol Buffers over HTTP/2. Used for internal high-throughput communication where both sides control the schema. Binary serialization is faster than JSON. Supports streaming, deadline propagation, and built-in load balancing.',
    whatToLookFor:
      'Appears in cross-ecosystem scenarios where internal services notify each other before the cross-boundary A2A call. Low latency, binary payload.',
    scenarios: [11],
    relatedProviders: ['a2a-jsonrpc', 'mcp'],
    spec: 'gRPC (grpc.io), Protocol Buffers',
  },
  {
    id: 'mcp',
    layer: 'transport',
    name: 'Model Context Protocol (MCP)',
    oneLiner:
      "Tool-use protocol that lets agents invoke each other's capabilities as structured tool calls.",
    howItWorks:
      "Anthropic's Model Context Protocol. An agent exposes tools with typed input/output schemas. Other agents call these tools by name with structured parameters. MCP handles schema validation, error propagation, and result typing.",
    whatToLookFor:
      "In cross-ecosystem scenarios, MCP is used to query another ecosystem's rules or data as a tool call. Look for the tool name, input schema, and output summary in the pipeline step.",
    scenarios: [11],
    relatedProviders: ['a2a-jsonrpc', 'grpc'],
    spec: 'Anthropic Model Context Protocol',
  },

  // ── Identity ──
  {
    id: 'oauth-jwt',
    layer: 'identity',
    name: 'OAuth JWT',
    oneLiner:
      'Bearer token identity — the agent presents a signed JWT issued by an OAuth provider to prove its identity.',
    howItWorks:
      "The sending agent obtains a JWT from its identity provider (Supabase, Auth0, custom). The JWT contains claims: sub (agent ID), org, roles, exp. The receiving agent validates the signature against the issuer's public key, checks expiration, and extracts the sender's identity.",
    whatToLookFor:
      "The IDENTITY step shows 'oauth-jwt' with a signature hash, nonce (replay protection), and the sender's public key. Signature valid = the JWT hasn't been tampered with. Nonce unused = this isn't a replay attack.",
    scenarios: [1, 2, 6, 7, 10, 12, 15],
    relatedProviders: ['x509', 'did', 'local-keys'],
    spec: 'OAuth 2.0 (RFC 6749), JWT (RFC 7519)',
  },
  {
    id: 'agntcy-crypto-identity',
    layer: 'identity',
    name: 'AGNTCY Crypto Identity',
    oneLiner:
      'Cross-boundary cryptographic identity with verifiable signatures for inter-organization trust.',
    howItWorks:
      'Generates Ed25519 identities, signs outbound payloads, and verifies signatures from peer agents using public-key cryptography.',
    whatToLookFor:
      'Identity steps should show generated identity IDs, algorithm selection, and signature verification success.',
    scenarios: [13],
    relatedProviders: ['agntcy-oasf', 'agntcy-slim'],
    spec: 'AGNTCY identity framework',
  },
  {
    id: 'x509',
    layer: 'identity',
    name: 'X.509 Certificate',
    oneLiner:
      'PKI certificate identity — the strongest identity guarantee, backed by a certificate authority chain.',
    howItWorks:
      "The agent presents an X.509 certificate issued by a trusted CA. The certificate contains the agent's public key, organization details, and validity period. The receiver validates the certificate chain up to a trusted root CA. Used in regulated environments where identity must be provably issued by a known authority.",
    whatToLookFor:
      "The IDENTITY step shows certificate details: issuer (who issued the cert), subject (who the cert identifies), key usage, and validity dates. In Farm Credit scenarios, the issuer is 'Farm Credit System Root CA' — a real-world trust anchor.",
    scenarios: [3, 4, 11],
    relatedProviders: ['tls-mutual', 'oauth-jwt'],
    spec: 'X.509 (RFC 5280), PKI',
  },
  {
    id: 'did',
    layer: 'identity',
    name: 'Decentralized Identifier (DID)',
    oneLiner:
      'Self-sovereign identity — the agent controls its own identifier without depending on a central authority.',
    howItWorks:
      'A DID (e.g., did:web:buildwell.example.com) is a URI that resolves to a DID Document containing public keys and service endpoints. The agent proves ownership by signing with the corresponding private key. No central authority needed — the identifier is controlled by the agent itself.',
    whatToLookFor:
      'The IDENTITY step shows the DID string and verification status. In cross-ecosystem scenarios, DID identity is bridged to x509 — showing how different identity systems can interoperate.',
    scenarios: [8, 11],
    relatedProviders: ['x509', 'oauth-jwt'],
    spec: 'W3C DID Core (did-core)',
  },
  {
    id: 'local-keys',
    layer: 'identity',
    name: 'Local Keys',
    oneLiner:
      'Self-generated key pair — the weakest identity, used for internal communication or initial contact.',
    howItWorks:
      "The agent generates an ECDSA or Ed25519 key pair locally. The public key is shared directly (not issued by any authority). The receiver has no way to verify the key belongs to who it claims — there's no certificate chain. Used for internal org communication (where both sides are known) or first-contact scenarios.",
    whatToLookFor:
      "The IDENTITY step shows 'local-keys' with a public key hash. No issuer, no certificate chain. This is appropriate for internal AlloyTech Supply → Buildwell communication (same parent company) but insufficient for cross-organization trust.",
    scenarios: [5, 8, 10],
    relatedProviders: ['oauth-jwt', 'first-contact'],
    spec: 'ECDSA (FIPS 186-4), Ed25519 (RFC 8032)',
  },
  {
    id: 'first-contact',
    layer: 'identity',
    name: 'First Contact',
    oneLiner:
      'Initial identity for brand-new agents — trust starts at zero and must be earned.',
    howItWorks:
      'When an unknown agent connects for the first time, it presents whatever identity it has (usually local-keys). The receiver assigns FIRST-CONTACT trust level (score: 0). The agent gets minimal capabilities — typically read-only access to public data. Trust grows through successful interactions.',
    whatToLookFor:
      "The IDENTITY step shows trust score starting at 0 with level 'FIRST-CONTACT'. Subsequent steps show the trust score increasing as interactions succeed. This is the entry point for the trust progression system.",
    scenarios: [5, 9, 10],
    relatedProviders: ['local-keys', 'reputation'],
    spec: 'Custom — models the real-world pattern of building business relationships',
  },

  // ── Encryption ──
  {
    id: 'envelope',
    layer: 'encryption',
    name: 'Envelope Encryption',
    oneLiner:
      'ECDH key agreement + AES-256-GCM symmetric encryption — the standard encryption for sensitive agent messages.',
    howItWorks:
      "1) Sender generates an ephemeral ECDH key pair. 2) Derives a shared secret using receiver's public key. 3) Encrypts the message with AES-256-GCM using the derived key. 4) Sends: ciphertext + ephemeral public key + IV + auth tag. The receiver derives the same shared secret and decrypts. Only the intended recipient can read the message.",
    whatToLookFor:
      "The ENCRYPTION step shows 'envelope' with ECDH+AES-256-GCM algorithm. You'll see the ephemeral public key (changes every message — forward secrecy), IV (initialization vector), and tag (authentication — proves the ciphertext hasn't been tampered with).",
    scenarios: [1, 2, 5, 6, 8, 9, 11],
    relatedProviders: ['tls-mutual', 'none'],
    spec: 'ECDH (RFC 6090), AES-GCM (NIST SP 800-38D)',
  },
  {
    id: 'tls-mutual',
    layer: 'encryption',
    name: 'TLS Mutual Authentication',
    oneLiner:
      'Both sides present certificates — the highest encryption tier, required for regulatory data.',
    howItWorks:
      "Standard TLS, but both client AND server present X.509 certificates. The server verifies the client's certificate (not just the other way around). Creates a mutually authenticated encrypted channel. Required when both parties must prove identity at the transport level — common in banking and government.",
    whatToLookFor:
      'The ENCRYPTION step shows TLS 1.3 with mutual auth, cipher suite (TLS_AES_256_GCM_SHA384), and both client and server certificate subjects. This is the strongest channel encryption — used for Central Farm Bank oversight data and cross-ecosystem boundaries.',
    scenarios: [3, 4, 10, 11],
    relatedProviders: ['x509', 'envelope'],
    spec: 'TLS 1.3 (RFC 8446), Mutual TLS',
  },
  {
    id: 'agntcy-slim',
    layer: 'encryption',
    name: 'AGNTCY SLIM Encryption',
    oneLiner:
      'Secure Low-latency Interactive Messaging encryption for network-level payload protection.',
    howItWorks:
      'Uses ephemeral key exchange and authenticated encryption to protect low-latency interactive messages between agents.',
    whatToLookFor:
      'Encryption traces should show SLIM protocol usage, shared-secret establishment, and protected message payload indicators.',
    scenarios: [13],
    relatedProviders: ['agntcy-oasf', 'agntcy-crypto-identity'],
    spec: 'AGNTCY SLIM protocol',
  },
  {
    id: 'none',
    layer: 'encryption',
    name: 'No Encryption',
    oneLiner:
      'Plaintext — appropriate only for public data like catalogs and spec listings.',
    howItWorks:
      'No message encryption applied. The data travels in cleartext (though the HTTP transport itself may use TLS). Used when the data is intentionally public — product catalogs, published specifications, public-facing capability cards.',
    whatToLookFor:
      "The ENCRYPTION step shows 'none'. This is a deliberate choice, not an oversight. Check that the data being sent is actually non-sensitive. If you see 'none' encryption on PII or pricing data, that's a security issue.",
    scenarios: [7, 10],
    relatedProviders: ['envelope'],
    spec: 'N/A — intentional plaintext',
  },

  // ── Trust ──
  {
    id: 'reputation',
    layer: 'trust',
    name: 'Reputation',
    oneLiner:
      'Trust score computed from historical interaction success rate — like a credit score for agents.',
    howItWorks:
      'Each agent-to-agent relationship has a reputation score (0-100) based on: successful interactions / total interactions, weighted by recency. A score above 80 = TRUSTED (full access). 50-80 = ESTABLISHED. 25-50 = BASIC. Below 25 = UNVERIFIED. Failed interactions (timeouts, errors, invalid data) reduce the score.',
    whatToLookFor:
      "The TRUST step shows the reputation score, trust level, and interaction history (e.g., '45/47 successful'). The score determines what capabilities are available. Watch the score change across scenarios — it's dynamic.",
    scenarios: [1, 2, 6, 7, 9, 10, 11],
    relatedProviders: ['allowlist', 'first-contact-trust'],
    spec: 'Custom — inspired by eBay/marketplace reputation systems',
  },
  {
    id: 'allowlist',
    layer: 'trust',
    name: 'Allowlist',
    oneLiner:
      'Pre-authorized trust — the agent is explicitly approved by an authority before any interaction.',
    howItWorks:
      "An allowlist is a registry of pre-approved agent identities for specific access levels. Unlike reputation (earned over time), allowlist trust is granted by an authority. Central Farm Bank is allowlisted as a regulator — it gets MAXIMUM trust from day one. AlloyTech Supply is allowlisted by Buildwell as an internal partner.",
    whatToLookFor:
      "The TRUST step shows 'allowlist' with the approval source and access level. Trust score is typically 85-100. No interaction history needed — the trust comes from the pre-approval, not from past behavior.",
    scenarios: [3, 4, 8, 11],
    relatedProviders: ['reputation', 'first-contact-trust'],
    spec: 'Custom — models ACLs and pre-authorized access',
  },
  {
    id: 'first-contact-trust',
    layer: 'trust',
    name: 'First Contact Trust',
    oneLiner:
      'Starting point for unknown agents — trust begins at zero and grows with each successful interaction.',
    howItWorks:
      'When an agent has no reputation history and no allowlist entry, trust starts at 0 (FIRST-CONTACT). After the first successful interaction, it rises to ~15 (UNVERIFIED). After identity verification + more interactions, it reaches 25 (BASIC), then 50 (VERIFIED), and eventually 80+ (TRUSTED). The progression is visible step-by-step in the pipeline.',
    whatToLookFor:
      'Watch the trust score increase across pipeline steps. In Scenario 5 (Prairie Ridge Credit) and Scenario 10 (Buildwell), trust progresses from 0 → 15 → 25 → 60 → 85 within a single scenario run. Each step shows the previous and new trust scores.',
    scenarios: [5, 10],
    relatedProviders: ['reputation', 'first-contact'],
    spec: 'Custom — models progressive trust building',
  },
  {
    id: 'a2a-jws-trust',
    layer: 'trust',
    name: 'A2A JWS Trust',
    oneLiner:
      'Verifies JWS-signed A2A Agent Cards and enforces TLS 1.2+ requirements for trusted interactions.',
    howItWorks:
      'The trust provider validates JWS signatures for agent-card payloads and records trust interactions. Trust level increases with successful verified interactions and decreases for signature or TLS validation failures.',
    whatToLookFor:
      'Trust steps should indicate signed-card verification status and show trust score changes after success/failure outcomes.',
    scenarios: [12, 15],
    relatedProviders: ['a2a-agent-card', 'oauth-jwt', 'tls-mutual'],
    spec: 'RFC 7515 (JWS), RFC 8785 (JCS), A2A discovery trust model',
  },

  // ── Payment ──
  {
    id: 'lightning-l402',
    layer: 'payment',
    name: 'Lightning L402',
    oneLiner:
      'Bitcoin Lightning Network payment attached to the API call — pay-per-use with instant settlement.',
    howItWorks:
      'L402 (formerly LSAT) attaches a Lightning invoice to an HTTP 402 response. The client pays the invoice via Lightning Network (instant, ~1 second), gets a preimage, and presents it as proof of payment. The server verifies the preimage and serves the response. Payment and data delivery are atomic.',
    whatToLookFor:
      'The PAYMENT step shows the Lightning channel diagram (payer → channel → payee), amount in both USD and satoshis, the transaction hash, and settlement status. In the Buildwell fishbowl, the Lightning tab visualizes the full payment flow.',
    scenarios: [6, 9],
    relatedProviders: ['stripe-fiat', 'x402-usdc'],
    spec: 'Lightning Network BOLT specs, L402 Protocol',
  },
  {
    id: 'stripe-fiat',
    layer: 'payment',
    name: 'Stripe Fiat',
    oneLiner:
      'Traditional payment rails — credit cards, ACH, and refunds via Stripe for fiat currency transactions.',
    howItWorks:
      "Standard Stripe payment integration for USD transactions. Used for refunds, credits, and traditional business payments where cryptocurrency isn't appropriate. Settlement takes 3-5 business days. Supports partial refunds and delay compensation.",
    whatToLookFor:
      'The PAYMENT step shows the Stripe payment details: amount, currency, order reference, payment type (credit, refund, compensation), and settlement timeline. Appears in quality hold scenarios where the customer needs a refund.',
    scenarios: [8],
    relatedProviders: ['lightning-l402'],
    spec: 'Stripe API',
  },
  {
    id: 'x402-usdc',
    layer: 'payment',
    name: 'x402 USDC',
    oneLiner:
      'HTTP 402 micropayment using USDC stablecoin — programmable payments for premium API access.',
    howItWorks:
      'The x402 protocol returns HTTP 402 (Payment Required) with a payment request header specifying USDC amount and wallet address. The client sends USDC on-chain, includes the transaction hash in the retry request, and the server verifies on-chain settlement before serving premium content.',
    whatToLookFor:
      'Appears in spec query scenarios where basic queries are free but premium/detailed specs require a micropayment. The step shows the USDC amount and the payment verification status.',
    scenarios: [7, 15],
    relatedProviders: ['lightning-l402', 'stripe-fiat'],
    spec: 'x402 Payment Protocol, USDC (Circle)',
  },
  {
    id: 'commerce-checkout',
    layer: 'payment',
    name: 'Commerce Checkout',
    oneLiner:
      'ACP checkout flow with delegated payment token and cart-to-payment lifecycle on Stripe-backed rails.',
    howItWorks:
      'Builds a checkout session from the negotiated cart, issues a delegated payment token, and advances through create/update/payment/complete or cancel states. The provider is designed for agentic commerce APIs where cart context and payment confirmation must stay linked.',
    whatToLookFor:
      'In scenario traces, payment should show checkout creation first, then payment-pending with a delegated token/transaction reference, then final completion.',
    scenarios: [14],
    relatedProviders: ['commerce-cart-negotiation', 'commerce-checkout-fsm', 'stripe-fiat'],
    spec: 'Agentic Commerce Protocol + Stripe Agentic Commerce',
  },
  {
    id: 'local-keypair',
    layer: 'payment',
    name: 'Local Keypair Wallet',
    oneLiner:
      'Local wallet for tracking deposits and escrow in bid/auction scenarios.',
    howItWorks:
      "A locally managed cryptographic key pair that serves as a wallet for tracking bid deposits, escrow amounts, and payment references. Not a full custodial wallet — it's a tracking mechanism that records payment commitments and can sign payment authorizations.",
    whatToLookFor:
      'Appears in auction scenarios where bid deposits need to be tracked. The step shows the deposit amount and the wallet reference.',
    scenarios: [9],
    relatedProviders: ['lightning-l402'],
    spec: 'Custom wallet management',
  },
  {
    id: 'coinbase-cdp',
    layer: 'payment',
    name: 'Coinbase CDP Wallet',
    oneLiner:
      'AgentKit wallet integration for programmable USDC settlement and Smart Wallet execution.',
    howItWorks:
      'Uses Coinbase CDP wallet APIs to sign and submit payment transactions. Supports Smart Wallet metadata for gasless-capable flows and works alongside x402 payment authorization.',
    whatToLookFor:
      'In mixed-suite scenario traces, look for wallet readiness before x402 payment authorization. Metadata should show base-sepolia network and Smart Wallet support.',
    scenarios: [15],
    relatedProviders: ['x402-usdc', 'a2a-task-lifecycle'],
    spec: 'Coinbase CDP / AgentKit wallet APIs',
  },

  // ── Negotiation ──
  {
    id: 'capability-card',
    layer: 'negotiation',
    name: 'Capability Card',
    oneLiner:
      "Agent menu — a structured list of what an agent can do, filtered by the requester's trust level.",
    howItWorks:
      "When an agent connects, it receives a capability card listing available operations. The card is filtered based on the requester's trust level — untrusted agents see fewer capabilities. As trust increases, more capabilities are revealed. This prevents untrusted agents from even knowing about restricted operations.",
    whatToLookFor:
      "The NEGOTIATION step shows requested capabilities vs granted capabilities vs denied capabilities, with denial reasons (usually 'trust-score-below-threshold'). Watch how the granted list grows as trust increases in onboarding scenarios.",
    scenarios: [2, 5, 8, 10],
    relatedProviders: ['well-known', 'acp'],
    spec: 'Custom — inspired by OAuth scopes and API capability discovery',
  },
  {
    id: 'acp',
    layer: 'negotiation',
    name: 'Agent Communication Protocol (ACP)',
    oneLiner:
      'Negotiation protocol for agreeing on interaction parameters — format, scope, date ranges, etc.',
    howItWorks:
      'Before a complex interaction, agents negotiate parameters using ACP. For example, Central Farm Bank and Prairie Ridge Credit agree on which associations to include in a quarterly report, the date range, and the response format. ACP ensures both sides have compatible expectations before the business logic runs.',
    whatToLookFor:
      'The NEGOTIATION step shows the negotiated parameters and their agreed values. Typically appears before complex business operations where the request has multiple configurable dimensions.',
    scenarios: [3, 7],
    relatedProviders: ['capability-card'],
    spec: 'Custom — models contract negotiation patterns',
  },
  {
    id: 'auction',
    layer: 'negotiation',
    name: 'Auction',
    oneLiner:
      'Competitive bidding — multiple agents compete on price, quality, or delivery for a contract.',
    howItWorks:
      'The buyer agent broadcasts a bid request with specifications and quantity. Seller agents submit sealed bids with price, formulation details, and delivery timeline. The auction engine evaluates bids on multiple criteria (not just price) and selects a winner. Bid deposits ensure serious participation.',
    whatToLookFor:
      "The BUSINESS step shows 'auction-engine' with the bid evaluation results — winning bid, score breakdown, and the criteria used (price, quality, delivery). The PAYMENT step shows the bid deposit via Lightning.",
    scenarios: [9],
    relatedProviders: ['lightning-l402', 'capability-card'],
    spec: 'Custom — models sealed-bid procurement',
  },
  {
    id: 'a2a-skill-negotiation',
    layer: 'negotiation',
    name: 'A2A Skill Negotiation',
    oneLiner:
      'Negotiates A2A skills using inputModes/outputModes, content parts, and UI mode compatibility.',
    howItWorks:
      'Agents exchange A2A skill descriptors and agree on overlap across capabilities, transport protocol, content types, and UI affordances such as iframe/video/web forms.',
    whatToLookFor:
      'The negotiation step should show matched skills and explicit agreement on protocol plus UI/content mode compatibility.',
    scenarios: [12, 15],
    relatedProviders: ['a2a-agent-card', 'a2a-task-lifecycle'],
    spec: 'A2A Protocol v0.3 Skill Negotiation',
  },
  {
    id: 'commerce-cart-negotiation',
    layer: 'negotiation',
    name: 'Commerce Cart Negotiation',
    oneLiner:
      'Negotiates purchasable cart items, quantity-compatible capabilities, and discounted terms before checkout.',
    howItWorks:
      'The buyer proposes product capabilities and protocols; the seller responds with a full agreement or a counter-offer containing only available cart lines and adjusted pricing terms.',
    whatToLookFor:
      'Negotiation traces should show matched cart capabilities and whether the flow ended in agreed or counter-offer status.',
    scenarios: [14],
    relatedProviders: ['commerce-checkout', 'commerce-checkout-fsm'],
    spec: 'Agentic Commerce Protocol cart negotiation',
  },

  // ── Audit ──
  {
    id: 'hash-chain',
    layer: 'audit',
    name: 'Hash Chain',
    oneLiner:
      "Tamper-evident audit log — each entry's hash includes the previous entry, creating an unbreakable chain.",
    howItWorks:
      "Each audit entry is hashed (SHA-256) with the previous entry's hash as input. This creates a chain where altering any entry invalidates all subsequent entries. For cross-ecosystem transactions, both ecosystems maintain their own chains with a cross-chain link hash that ties them together.",
    whatToLookFor:
      'The AUDIT step shows the hash chain entry with: entry ID, action description, the hash value, and timestamp. In cross-ecosystem scenarios, look for both ecosystem hashes and the cross-chain link hash. Immutable: true means the entry is permanent.',
    scenarios: [1, 3, 4, 6, 9, 11],
    relatedProviders: [],
    spec: 'Hash chains (Merkle-like), SHA-256',
  },

  // ── Resilience ──
  {
    id: 'circuit-breaker',
    layer: 'resilience',
    name: 'Circuit Breaker',
    oneLiner:
      'Stops calling a failing agent to prevent cascade failures — CLOSED (ok) → OPEN (stopped) → HALF-OPEN (testing).',
    howItWorks:
      'Tracks failures per agent-to-agent connection. CLOSED: normal operation, requests flow through. After N failures (threshold), transitions to OPEN: all requests immediately fail without calling the target. After a timeout, transitions to HALF-OPEN: one test request is sent. If it succeeds, back to CLOSED. If it fails, back to OPEN.',
    whatToLookFor:
      'The RESILIENCE step shows circuit breaker state (CLOSED/OPEN/HALF-OPEN), failure count vs threshold, and the target agent. In the org panels, each connection shows its circuit breaker status with a colored indicator.',
    scenarios: [4, 5, 8],
    relatedProviders: ['bulkhead', 'retry'],
    spec: 'Circuit Breaker pattern (Michael Nygard, Release It!)',
  },
  {
    id: 'bulkhead',
    layer: 'resilience',
    name: 'Bulkhead',
    oneLiner:
      'Limits concurrent requests to prevent one slow agent from consuming all resources.',
    howItWorks:
      "Named after ship bulkheads that prevent flooding from spreading. Limits the number of concurrent requests to a specific agent or operation. If the bulkhead is full, excess requests fail fast instead of queuing up. This isolates slow agents from affecting other operations.",
    whatToLookFor:
      "The RESILIENCE step shows 'bulkhead' with maxConcurrent (how many parallel requests allowed) and queueSize. Appears in stress test scenarios where multiple associations' data is requested simultaneously.",
    scenarios: [4],
    relatedProviders: ['circuit-breaker'],
    spec: 'Bulkhead pattern (Resilience4j)',
  },
  {
    id: 'retry',
    layer: 'resilience',
    name: 'Retry with Backoff',
    oneLiner:
      'Automatically retries failed requests with increasing delays — handles transient failures.',
    howItWorks:
      'When a request fails with a retryable error (timeout, 503, network error), the retry provider waits and tries again. Each retry waits longer (exponential backoff: 1s, 2s, 4s, 8s) with jitter (randomness) to prevent thundering herd. Gives up after max retries.',
    whatToLookFor:
      'Listed in scenario providers but typically invisible in the happy-path pipeline trace (because the first attempt succeeds). Would appear as additional transport steps if the initial call failed.',
    scenarios: [1],
    relatedProviders: ['circuit-breaker'],
    spec: 'Exponential backoff (AWS best practices)',
  },

  // ── Observability ──
  {
    id: 'opentelemetry',
    layer: 'observability',
    name: 'OpenTelemetry',
    oneLiner:
      'Distributed tracing and metrics — tracks requests across agent boundaries with trace IDs.',
    howItWorks:
      "Each agent interaction gets a trace ID that propagates across service boundaries. OpenTelemetry captures spans (individual operations), their parent-child relationships, timing, and attributes. The trace can be exported to Jaeger, Zipkin, or any OTLP-compatible backend for visualization.",
    whatToLookFor:
      'The OBSERVABILITY step shows the trace being recorded with trace ID, span information, and exported metrics. Appears in scenarios that cross service boundaries where end-to-end tracing is valuable.',
    scenarios: [3, 6],
    relatedProviders: [],
    spec: 'OpenTelemetry (opentelemetry.io), OTLP',
  },

  // ── Orchestration ──
  {
    id: 'pipeline',
    layer: 'orchestration',
    name: 'Pipeline Orchestration',
    oneLiner:
      'Multi-step workflow coordinator — ensures all steps in a complex agent interaction execute in order.',
    howItWorks:
      'Manages the execution of multi-step workflows: validate → route → process → respond. Each step can involve different agents. The pipeline tracks progress, handles partial failures, and ensures the complete workflow either succeeds or fails cleanly with a clear error.',
    whatToLookFor:
      "The ORCHESTRATION step shows 'pipeline' with the notification chain or workflow steps completed. Appears at the end of multi-agent scenarios as a summary of the full workflow.",
    scenarios: [2, 4, 6, 8],
    relatedProviders: [],
    spec: 'Pipeline pattern (Enterprise Integration Patterns)',
  },
  {
    id: 'a2a-task-lifecycle',
    layer: 'orchestration',
    name: 'A2A Task Lifecycle',
    oneLiner:
      'A2A six-state orchestration model: submitted → working → input-required → completed/failed/canceled.',
    howItWorks:
      'The orchestrator tracks task state transitions, conversation turns, and task events. It supports synchronous completion, SSE stream updates, and callback-driven async completion.',
    whatToLookFor:
      'Orchestration traces should include explicit task state transitions and task-level metadata for completion or input-required turns.',
    scenarios: [12, 15],
    relatedProviders: ['a2a-jsonrpc', 'a2a-skill-negotiation'],
    spec: 'A2A Protocol v0.3 Task Lifecycle',
  },
  {
    id: 'commerce-checkout-fsm',
    layer: 'orchestration',
    name: 'Commerce Checkout FSM',
    oneLiner:
      'State-machine orchestration for cart-created → cart-updated → payment-pending → completed/canceled.',
    howItWorks:
      'Coordinates checkout progression as explicit state transitions so cart and payment layers stay synchronized throughout agent-to-agent commerce workflows.',
    whatToLookFor:
      'Orchestration traces should include checkout state transitions and a terminal completed or canceled state.',
    scenarios: [14],
    relatedProviders: ['commerce-cart-negotiation', 'commerce-checkout'],
    spec: 'Agentic Commerce Protocol checkout state model',
  },
];

// Lookup helpers
const providerMap = new Map(PROVIDER_DEFINITIONS.map((p) => [p.id, p]));

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return providerMap.get(id);
}

export function getProvidersByLayer(layerId: string): ProviderDefinition[] {
  return PROVIDER_DEFINITIONS.filter((p) => p.layer === layerId);
}

export function getProvidersByScenario(scenarioId: number): ProviderDefinition[] {
  return PROVIDER_DEFINITIONS.filter((p) => p.scenarios.includes(scenarioId));
}
