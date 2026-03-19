// Help content: Scenario explanations
// Per-scenario deep dives for both SunStream and Ascentek fishbowls

export interface ScenarioExplanation {
  id: number;
  name: string;
  ecosystem: 'sunstream' | 'ascentek';
  whatIsBeingTested: string;
  whyThisMatters: string;
  keyTechnologies: Record<string, string>;
  whatToVerify: string[];
}

// ── SunStream Scenarios (S-1 through S-5, S-11) ──

export const SUNSTREAM_SCENARIOS: ScenarioExplanation[] = [
  {
    id: 1,
    name: 'Loan Compliance Check',
    ecosystem: 'sunstream',
    whatIsBeingTested:
      'End-to-end secure message delivery between two regulated financial entities. FCS Financial (a lending association) sends a loan application to SunStream (shared services) for compliance validation. Tests the core pipeline: discover → authenticate → encrypt → transport → verify → trust-check → process → audit → respond.',
    whyThisMatters:
      "Under the Farm Credit Act, every lending decision must be compliance-checked and audited. This isn't optional — it's federal regulation. The protocol ensures the loan data is encrypted in transit (PII protection), the sender's identity is verified (prevents spoofing), the interaction is audited (regulatory requirement), and the trust relationship is checked (only authorized associations can submit).",
    keyTechnologies: {
      'oauth-jwt':
        "FCS proves its identity with a signed JWT — SunStream verifies the token signature before processing",
      'envelope':
        'Loan data contains PII (borrower names, amounts, collateral) — envelope encryption ensures only SunStream can read it',
      'reputation':
        "SunStream checks FCS's reputation score (95.7%) before accepting the request — a low score would trigger additional verification",
      'hash-chain':
        'The compliance result is recorded in an immutable audit chain — neither party can later deny the outcome',
      'a2a-jsonrpc':
        'The structured JSON-RPC envelope ensures the method (compliance.validateLoan) and parameters are well-defined',
    },
    whatToVerify: [
      'Pipeline shows 7 steps progressing through data → identity → encryption → transport → identity-verified → trust → business',
      "Identity step shows oauth-jwt with 'Signature: valid'",
      'Trust step shows reputation score ~95 and level TRUSTED',
      'Expand the Raw Payload step to see actual loan data from loan-applications.json',
      'Check the Data Inspector → Loan Applications to see the source data',
    ],
  },
  {
    id: 2,
    name: 'Helpdesk Ticket',
    ecosystem: 'sunstream',
    whatIsBeingTested:
      "Real-time bidirectional communication for operational support. FCS Financial reports a Cornerstone system issue to SunStream's helpdesk. Tests WebSocket transport, capability-card routing (helpdesk vs compliance vs reporting), and pipeline orchestration (classify → search KB → resolve/escalate).",
    whyThisMatters:
      'When a critical banking system (Cornerstone) is down, response time matters. WebSocket provides real-time streaming instead of polling. The capability-card ensures the request is routed to the helpdesk handler (not compliance or reporting). The pipeline orchestration manages the multi-step triage process.',
    keyTechnologies: {
      'websocket':
        'Persistent connection for real-time back-and-forth — FCS can see triage updates as they happen',
      'capability-card':
        'Routes the request to the correct handler based on the issue category — prevents compliance queries from reaching helpdesk and vice versa',
      'pipeline':
        'Orchestrates the triage workflow: classify symptom → search knowledge base → generate resolution or escalate',
    },
    whatToVerify: [
      'Pipeline shows 7 steps with WebSocket transport instead of HTTP',
      'The helpdesk triage result includes matched KB articles from helpdesk-kb.json',
      'Both FCS Financial and SunStream panels show the message',
    ],
  },
  {
    id: 3,
    name: 'Quarterly Oversight Review',
    ecosystem: 'sunstream',
    whatIsBeingTested:
      'Regulatory authority accessing cross-association data with maximum security. AgriBank (the funding bank) requests performance data across all associations from SunStream. Tests x509 mutual authentication, TLS-mutual encryption, allowlist trust, hash-chain audit, and OpenTelemetry tracing.',
    whyThisMatters:
      "Bank examiners have legal authority to access any association's data, but that access must be provably secure and audited. x509 certificates prove the examiner is actually AgriBank (not someone pretending). TLS-mutual means both sides authenticate at the transport level. Every data access is hash-chain audited for the examination record.",
    keyTechnologies: {
      'x509':
        'Certificate-based identity — the strongest authentication, backed by the Farm Credit System Root CA',
      'tls-mutual':
        'Both AgriBank and SunStream present certificates — mutual authentication at the transport layer',
      'allowlist':
        "AgriBank is pre-authorized as a regulator — doesn't need to build reputation, trust is granted by authority",
      'hash-chain':
        'Examination data access is permanently recorded — required for regulatory compliance',
      'opentelemetry':
        'The multi-step report generation is traced end-to-end for performance monitoring',
    },
    whatToVerify: [
      'Pipeline shows 8 steps with x509 identity and tls-mutual encryption',
      'Trust shows MAXIMUM level with score 100 — AgriBank is pre-authorized',
      'AgriBank panel shows the message (this is the first scenario to involve AgriBank)',
      'AUDIT step shows hash-chain entry',
      'OBSERVABILITY step shows OpenTelemetry trace',
    ],
  },
  {
    id: 4,
    name: 'Capital Adequacy Stress Test',
    ecosystem: 'sunstream',
    whatIsBeingTested:
      "High-load regulatory operation with resilience patterns. AgriBank runs a stress test that queries multiple associations' data simultaneously through SunStream. Tests bulkhead isolation (limit concurrent queries), circuit breaker (handle individual association failures), and pipeline orchestration.",
    whyThisMatters:
      "Stress tests hit multiple data sources simultaneously. Without bulkhead isolation, one slow association could consume all connection pool resources, blocking queries to healthy associations. Without circuit breakers, a failing association's timeout would cascade, making the entire stress test hang.",
    keyTechnologies: {
      'bulkhead':
        'Limits concurrent requests per association — prevents resource exhaustion when querying many associations simultaneously',
      'circuit-breaker':
        "If one association's data feed is down, the circuit breaker opens and queries to that association fail fast instead of timing out. Other associations are unaffected.",
      'x509 + tls-mutual':
        'Same regulatory-grade security as the oversight review',
    },
    whatToVerify: [
      'Pipeline shows 9 steps including two RESILIENCE steps (bulkhead, circuit-breaker)',
      'Bulkhead step shows maxConcurrent and queueSize parameters',
      'Circuit breaker shows state CLOSED (normal operation) with failure count and threshold',
      'Trust is MAXIMUM (100) — same as Scenario 3',
    ],
  },
  {
    id: 5,
    name: 'New Association Onboarding',
    ecosystem: 'sunstream',
    whatIsBeingTested:
      'Trust progression from zero — a brand-new association connects for the first time and builds trust through interactions. Tests the complete trust lifecycle: discovery → first-contact → limited capabilities → first interaction → trust growth → expanded access.',
    whyThisMatters:
      "The protocol must be open enough for new agents to join, but secure enough that untrusted agents can't access sensitive data. This scenario proves that trust is dynamic — you start with nothing and earn access through legitimate behavior. It's the difference between a locked door (no entry) and a guarded door (enter with restrictions, earn full access).",
    keyTechnologies: {
      'well-known':
        "New association discovers SunStream's agent card — the first step in any new relationship",
      'first-contact':
        'Trust starts at 0. The identity is local-keys (self-asserted, no verification). Only public capabilities are granted.',
      'capability-card':
        'The new association requests 4 capabilities but only gets 1 (service-catalog). The denied list shows why — trust score too low.',
      'envelope':
        "Even at first-contact, communication is encrypted — security doesn't wait for trust",
      'circuit-breaker':
        'Starts CLOSED and stays CLOSED through successful onboarding — shows the system is monitoring from day one',
    },
    whatToVerify: [
      'Pipeline shows 9 steps with trust progressing from 0 → 15 (FIRST-CONTACT → UNVERIFIED)',
      'Capability negotiation shows granted vs denied capabilities with reasons',
      'Service catalog response is filtered — only public/new-member services visible',
      'Trust progression step shows the full journey: FIRST-CONTACT → UNVERIFIED → VERIFIED (projected) → TRUSTED (projected)',
      "SunStream panel shows the message from 'new-association' (a source we haven't seen before)",
    ],
  },
  {
    id: 11,
    name: 'Cross-Ecosystem: Quality → Compliance',
    ecosystem: 'sunstream',
    whatIsBeingTested:
      'Two completely separate ecosystems communicating — Ascentek (manufacturing) sends a quality complaint that triggers a Farm Credit compliance review in SunStream. Tests identity bridging (DID → x509), encryption upgrade (envelope → tls-mutual), cross-ecosystem trust evaluation, and dual hash-chain audit.',
    whyThisMatters:
      'Real-world agent ecosystems don\'t exist in isolation. A quality problem in manufacturing affects lending risk in financial services. This scenario proves that agents from different ecosystems — with different identity systems, different trust models, and different encryption — can securely interoperate. The identity bridge (DID ↔ x509) and encryption upgrade (envelope → tls-mutual) are the key innovations.',
    keyTechnologies: {
      'grpc':
        'Internal notification between Lube-Tech and Ascentek (high-performance, binary)',
      'mcp':
        "Ascentek queries SunStream's compliance rules as an MCP tool call — structured cross-ecosystem data access",
      'did + x509':
        'Identity bridge — Ascentek identifies with DID, SunStream with x509. The bridge verifies both against their respective trust anchors.',
      'envelope + tls-mutual':
        'Encryption upgrade at the ecosystem boundary — internal envelope encryption upgrades to mutual TLS for the cross-boundary call',
      'reputation + allowlist':
        'Dual trust evaluation — each ecosystem evaluates the other using its own trust model',
    },
    whatToVerify: [
      'Pipeline shows 11 steps spanning both transport protocols and identity systems',
      'Identity steps show both DID and x509 in the same pipeline — the bridge between them',
      'Encryption transitions from envelope to tls-mutual at the ecosystem boundary',
      'Trust is evaluated twice — once by each ecosystem with different trust models',
      'Hash-chain shows cross-chain link hash tying both ecosystem audit logs together',
      'Run this scenario on BOTH ports (6409 and 6410) to see each ecosystem\'s perspective',
    ],
  },
  {
    id: 12,
    name: 'A2A Full Suite Task Lifecycle',
    ecosystem: 'sunstream',
    whatIsBeingTested:
      'Core A2A v0.3 protocol flow: discover an A2A Agent Card, negotiate a skill with mode compatibility, and complete a task through submitted → working → completed lifecycle states.',
    whyThisMatters:
      'This is the canonical A2A execution path. It validates that discovery metadata, negotiation semantics, trust verification, and orchestration state transitions are aligned in one cohesive flow.',
    keyTechnologies: {
      'a2a-agent-card':
        'Discovers skill definitions, capabilities, and securitySchemes from /.well-known/agent-card.json',
      'a2a-skill-negotiation':
        'Negotiates skill and mode compatibility before task execution',
      'a2a-task-lifecycle':
        'Tracks A2A states from submission through completion',
      'a2a-jws-trust':
        'Verifies signed-card trust posture and TLS baseline',
    },
    whatToVerify: [
      'Pipeline includes discovery, negotiation, orchestration, trust, and audit steps',
      'Task lifecycle shows submitted → working → completed in order',
      'Negotiation result reports agreed mode(s) and successful status',
    ],
  },
  {
    id: 13,
    name: 'AGNTCY ACP Secure Exchange',
    ecosystem: 'sunstream',
    whatIsBeingTested:
      'AGNTCY secure message path: OASF lookup, cryptographic identity verification, and SLIM encrypted message delivery.',
    whyThisMatters:
      'Validates AGNTCY infrastructure interoperability as a secure cross-organization communications baseline.',
    keyTechnologies: {
      'agntcy-oasf':
        'Federated discovery of agent descriptors and interop metadata',
      'agntcy-crypto-identity':
        'Cryptographic identity generation/signature validation across org boundaries',
      'agntcy-slim':
        'Low-latency encrypted message transport for secure payload exchange',
    },
    whatToVerify: [
      'Scenario 13 appears in scenario listings',
      'Pipeline includes discovery, identity, encryption, and audit steps',
      'Result stages show oasf-discovery, crypto-identity, and slim-encryption',
    ],
  },
  {
    id: 14,
    name: 'Commerce ACP Checkout Flow',
    ecosystem: 'sunstream',
    whatIsBeingTested:
      'Agentic commerce sequence: cart negotiation, checkout creation, payment pending, and checkout completion using the Commerce ACP provider bundle.',
    whyThisMatters:
      'Validates the coupled commerce suite behavior where negotiation output drives payment and orchestration state transitions in one coherent transaction flow.',
    keyTechnologies: {
      'commerce-cart-negotiation':
        'Builds an agreed cart from requested product capabilities',
      'commerce-checkout':
        'Creates checkout state and delegated payment token, then issues payment receipt',
      'commerce-checkout-fsm':
        'Enforces cart-created → payment-pending → completed state progression',
    },
    whatToVerify: [
      'Scenario 14 appears in the scenario list',
      'Pipeline shows negotiation, payment, orchestration, and audit steps for commerce checkout',
      'Result includes checkout state progression ending in completed',
    ],
  },
  {
    id: 15,
    name: 'Mixed Suite: A2A + Coinbase x402',
    ecosystem: 'sunstream',
    whatIsBeingTested:
      'Cross-suite composition where A2A discovery and skill negotiation are combined with Coinbase AgentKit wallet readiness and x402 USDC payment before task lifecycle completion.',
    whyThisMatters:
      'Proves protocol layers can be mixed across suites without tight coupling: A2A flow control can execute with Coinbase payment rails and still preserve trust + audit guarantees.',
    keyTechnologies: {
      'a2a-agent-card':
        'Discovers A2A skills/security metadata before task execution',
      'a2a-skill-negotiation':
        'Negotiates selected skill/mode for the mixed-suite task',
      'coinbase-cdp':
        'Provides AgentKit/Smart Wallet capabilities for payment execution',
      'x402-usdc':
        'Authorizes paid task execution via USDC payment requirement',
      'a2a-task-lifecycle':
        'Completes submitted → working → completed lifecycle after payment',
    },
    whatToVerify: [
      'Scenario 15 is listed in SunStream scenario catalog',
      'Pipeline includes discovery, negotiation, wallet, payment, orchestration, trust, and audit',
      'Result stages include a2a-agent-card, a2a-skill-negotiation, x402-usdc, a2a-task-lifecycle',
    ],
  },
];

// ── Ascentek Scenarios (S-6 through S-11) ──

export const ASCENTEK_SCENARIOS: ScenarioExplanation[] = [
  {
    id: 6,
    name: 'Purchase Order via A2A (EDI Replacement)',
    ecosystem: 'ascentek',
    whatIsBeingTested:
      'Complete commercial transaction — OEM submits a purchase order with attached Lightning payment, routed through Ascentek to Lube-Tech for production. Tests the A2A protocol as a replacement for traditional EDI (Electronic Data Interchange) with payment-attached-to-message.',
    whyThisMatters:
      'Traditional EDI is a 40-year-old batch process — POs are sent as flat files, payments are separate wire transfers, and reconciliation takes days. A2A replaces this with atomic PO + payment in a single protocol message. The order and payment arrive together, settle instantly via Lightning, and the audit trail is immediate.',
    keyTechnologies: {
      'lightning-l402':
        'Payment is attached to the PO message itself — $234K settles in ~1 second via Lightning Network. No invoicing, no net-30 terms, no reconciliation.',
      'a2a-jsonrpc':
        'The PO is a structured JSON-RPC message, not an EDI flat file. Machine-readable, self-describing, and extensible.',
      'envelope':
        'PO contains competitively sensitive pricing — envelope encryption ensures only Ascentek sees it',
      'pipeline':
        'Orchestrates: validate PO → check inventory → schedule production → confirm order',
      'hash-chain':
        'The PO is a legal document — hash-chain creates a tamper-evident record',
    },
    whatToVerify: [
      'Pipeline shows 9 steps ending with production scheduling confirmation',
      'Lightning tab shows the full payment flow: OEM Partner → L402 channel → Ascentek',
      'Payment shows amount in both USD and satoshis with transaction hash',
      'All three org panels show messages (the PO flows through the entire supply chain)',
      'Check Data Inspector → Purchase Orders to see the source PO data',
    ],
  },
  {
    id: 7,
    name: 'Formulation Spec Query',
    ecosystem: 'ascentek',
    whatIsBeingTested:
      'Simple read-only query with micropayment for premium access. OEM asks if Ascentek can meet a specific OEM specification. Tests HTTP-REST (simpler transport), no encryption (public catalog data), and x402-USDC micropayment for detailed spec access.',
    whyThisMatters:
      "Not every interaction needs the full protocol stack. A basic catalog query is low-risk, low-sensitivity data. Using HTTP-REST instead of A2A JSON-RPC, and no encryption instead of envelope, shows the protocol adapts to the security needs of the data — not one-size-fits-all.",
    keyTechnologies: {
      'http-rest':
        'Simple HTTP GET — no JSON-RPC overhead needed for a read-only query',
      'none':
        'No encryption — the spec catalog is non-sensitive public data',
      'x402-usdc':
        'Premium spec details require a micropayment in USDC stablecoin',
      'reputation':
        'Trust check ensures the OEM has sufficient reputation to query the system',
    },
    whatToVerify: [
      'Pipeline shows 6 steps — fewer than other scenarios (simpler interaction)',
      "No ENCRYPTION step (or shows 'none') — appropriate for public catalog data",
      'Transport is http-rest, not a2a-jsonrpc',
      'Formulation lookup results show matching products from formulation-catalog.json',
    ],
  },
  {
    id: 8,
    name: 'Quality Hold — Out-of-Spec Batch',
    ecosystem: 'ascentek',
    whatIsBeingTested:
      'Multi-org notification chain with payment (refund). Lube-Tech discovers a batch out of spec during quality inspection, triggering: Lube-Tech → Ascentek (hold notification) → OEM Partner (customer alert + refund). Tests the full notification chain across trust boundaries.',
    whyThisMatters:
      'Quality failures in manufacturing are expensive and urgent. The notification must be immediate (WebSocket), secure (envelope encryption for proprietary quality data), routed correctly (capability-card), and include financial remediation (Stripe refund). This scenario proves the protocol handles multi-hop urgent notifications with payment.',
    keyTechnologies: {
      'websocket':
        "Real-time notification — quality alerts can't wait for polling",
      'local-keys':
        'Internal Lube-Tech → Ascentek identity (same parent company, simpler auth)',
      'allowlist':
        'Lube-Tech is pre-authorized for internal quality notifications',
      'capability-card':
        "Routes the alert to Ascentek's quality management handler (not production or shipping)",
      'did':
        'Ascentek identifies to OEM Partner with DID when forwarding the alert',
      'circuit-breaker':
        "Monitors the notification channel — if Ascentek is down, the alert isn't silently dropped",
      'stripe-fiat':
        'Automatic delay compensation credit ($1,500) to the affected OEM order',
      'pipeline':
        'Orchestrates the full chain: detect → hold → notify supplier → notify customer → credit',
    },
    whatToVerify: [
      'Pipeline shows 10 steps spanning all three orgs',
      'Quality Hold tab shows: batch number, failed test parameters (Phosphorus 1020ppm vs max 1000ppm), notification chain (LT → AS → OEM)',
      'Stripe credit shows $1,500 delay-compensation with order reference',
      'All three org panels show messages — the notification propagated through the supply chain',
      'Quality inspection step shows actual batch data from batch-records.json',
    ],
  },
  {
    id: 9,
    name: 'Competitive Bid / Auction',
    ecosystem: 'ascentek',
    whatIsBeingTested:
      'Competitive procurement where multiple agents could bid. OEM puts a large order out for bid, Ascentek evaluates and responds with best formulation/price. Tests auction negotiation, Lightning bid deposit, and first-contact trust (new product category).',
    whyThisMatters:
      'Agent-to-agent commerce needs competitive mechanisms. The auction protocol enables sealed-bid procurement where agents compete on multiple criteria (price, quality, delivery time) — not just lowest price. Bid deposits via Lightning ensure participants are serious.',
    keyTechnologies: {
      'auction':
        'Sealed-bid evaluation engine — evaluates bids on price, formulation quality, and delivery capability',
      'lightning-l402':
        'Bid deposit ensures the bidder is committed — deposit is returned if they lose, applied to order if they win',
      'first-contact':
        'New product category means fresh trust evaluation — even established partners start with limited trust for new categories',
      'envelope':
        "Bid pricing is highly confidential — competitors must not see each other's bids",
      'hash-chain':
        'Bid submissions are audited — prevents bid manipulation after submission',
    },
    whatToVerify: [
      'Pipeline shows 8 steps including auction-engine evaluation',
      'Bid evaluation step shows scoring criteria and winning bid details',
      'Pricing lookup step shows actual pricing tiers from pricing-tiers.json',
      'Trust uses first-contact model (new category) even for established partner',
    ],
  },
  {
    id: 10,
    name: 'New OEM Partner Onboarding',
    ecosystem: 'ascentek',
    whatIsBeingTested:
      'Complete trust lifecycle from zero to fully trusted — the most comprehensive trust progression scenario. A brand-new OEM partner (Rivian) connects and progressively earns trust through 12 steps: discovery → first-contact (0%) → first query (25%) → identity upgrade (60%) → full validation (85%) → TLS-mutual channel → formal onboarding.',
    whyThisMatters:
      "This is the definitive demonstration of progressive trust. It shows that agent-to-agent systems aren't all-or-nothing — trust builds incrementally. Each successful interaction unlocks more capabilities. Identity upgrades (local-keys → oauth-jwt → tls-mutual) happen naturally as trust grows. By the end, the new partner has full access with the strongest security.",
    keyTechnologies: {
      'well-known':
        "Partner discovers Ascentek's capabilities at the start",
      'first-contact':
        'Trust begins at 0 (UNKNOWN) — only public catalog access',
      'local-keys → oauth-jwt → tls-mutual':
        'Identity progressively upgrades as trust grows — from self-asserted keys to verified OAuth to mutual TLS certificates',
      'none → envelope → tls-mutual':
        'Encryption also upgrades — matching the sensitivity of data being exchanged at each trust level',
      'capability-card':
        'Capabilities expand: public-catalog-only (0%) → spec-lookup (25%) → pricing (60%) → full-access (85%)',
      'reputation':
        'Trust score shown at each step: 0 → 25 → 60 → 85 — with the reason for each increase',
    },
    whatToVerify: [
      'Pipeline shows 12 steps — the most complex scenario',
      'Trust progression: UNKNOWN (0) → BASIC (25) → ESTABLISHED (60) → TRUSTED (85)',
      'First interaction returns limited catalog (3 items). Third interaction returns full catalog + pricing.',
      'Identity upgrade from local-keys to oauth-jwt is visible in the pipeline',
      'TLS-mutual channel established at step 11 — the partner earned it',
      'Onboarding step shows the full checklist from onboarding-checklist.json',
    ],
  },
  {
    id: 11,
    name: 'Cross-Ecosystem: Quality → Compliance',
    ecosystem: 'ascentek',
    whatIsBeingTested:
      "Same as SunStream S-11 but from Ascentek's perspective — the initiating side. Shows how the quality complaint originates in Ascentek ecosystem and triggers the cross-boundary call to SunStream for compliance review.",
    whyThisMatters:
      "Seeing both sides of a cross-ecosystem interaction. The Ascentek view shows the outbound call; the SunStream view shows the inbound handling. Together they prove end-to-end cross-ecosystem communication works.",
    keyTechnologies: {
      'grpc':
        'Internal gRPC notification from Lube-Tech to Ascentek about the quality issue',
      'mcp':
        "Ascentek uses MCP to query SunStream's compliance rules as a tool call",
      'a2a-jsonrpc':
        'The actual cross-ecosystem compliance check call',
      'did → x509':
        'Identity bridge at the ecosystem boundary',
      'envelope → tls-mutual':
        'Encryption upgrade for the cross-boundary call',
      'hash-chain':
        'Cross-chain audit linking both ecosystem audit logs',
    },
    whatToVerify: [
      'Pipeline shows 11 steps spanning both ecosystems',
      'The actual HTTP call to localhost:6407 (SunStream) is visible in the transport step',
      'Quality complaint data comes from quality-complaints.json',
      'Run the same scenario on SunStream (port 6409) to see the receiving side',
    ],
  },
  {
    id: 12,
    name: 'A2A Full Suite Task Lifecycle',
    ecosystem: 'ascentek',
    whatIsBeingTested:
      'A2A v0.3 task execution from manufacturing perspective using Agent Card discovery, skill negotiation, and task lifecycle completion.',
    whyThisMatters:
      'Demonstrates that A2A can represent manufacturing interactions with the same protocol contract used in financial or mixed ecosystems.',
    keyTechnologies: {
      'a2a-agent-card':
        'Advertises the manufacturing-facing skills and transport/security metadata',
      'a2a-skill-negotiation':
        'Confirms input/output modes before invoking the task',
      'a2a-task-lifecycle':
        'Captures state transitions and completion semantics',
      'a2a-jws-trust':
        'Ensures signed metadata trust and TLS policy adherence',
    },
    whatToVerify: [
      'Scenario pipeline shows A2A discovery + negotiation + lifecycle progression',
      'Task lifecycle transitions end in completed state',
      'Audit records task completion event with immutable flag',
    ],
  },
  {
    id: 13,
    name: 'AGNTCY ACP Secure Exchange',
    ecosystem: 'ascentek',
    whatIsBeingTested:
      'AGNTCY secure exchange from manufacturing ecosystem perspective using OASF, crypto identity, and SLIM encryption.',
    whyThisMatters:
      'Shows the AGNTCY suite can be used for partner interactions requiring explicit cryptographic identity and encrypted transport.',
    keyTechnologies: {
      'agntcy-oasf':
        'Federated descriptor lookup for partner agents',
      'agntcy-crypto-identity':
        'Signature-backed identity verification for cross-boundary trust',
      'agntcy-slim':
        'Encrypted low-latency messaging for secure coordination',
    },
    whatToVerify: [
      'Scenario 13 executes with OASF lookup then crypto identity then SLIM encryption',
      'Pipeline includes audit confirmation for immutable recordkeeping',
      'Result stages include the three AGNTCY milestones',
    ],
  },
  {
    id: 14,
    name: 'Commerce ACP Checkout Flow',
    ecosystem: 'ascentek',
    whatIsBeingTested:
      'Commerce ACP workflow from manufacturing ecosystem perspective with negotiated cart, checkout execution, and completion event.',
    whyThisMatters:
      'Demonstrates that Ascentek can run standardized cart-to-checkout interactions with explicit lifecycle state transitions and no hidden coupling.',
    keyTechnologies: {
      'commerce-cart-negotiation':
        'Matches requested capabilities against available product lines',
      'commerce-checkout':
        'Processes checkout and returns payment receipt metadata',
      'commerce-checkout-fsm':
        'Tracks and validates checkout lifecycle state transitions',
    },
    whatToVerify: [
      'Scenario 14 executes with cart negotiation followed by checkout payment',
      'Lifecycle transitions include cart-created, payment-pending, and completed',
      'Audit step records a commerce checkout completion marker',
    ],
  },
  {
    id: 15,
    name: 'Mixed Suite: A2A + Coinbase x402',
    ecosystem: 'ascentek',
    whatIsBeingTested:
      'Mixed-suite task execution from manufacturing perspective: A2A discovery + skill negotiation, Coinbase wallet activation, x402 payment authorization, and lifecycle completion.',
    whyThisMatters:
      'Demonstrates cross-suite interoperability in production-style procurement paths where protocol control flow and payment rails are sourced from different suites.',
    keyTechnologies: {
      'a2a-agent-card':
        'Discovers manufacturing-facing skills and security schemes',
      'a2a-skill-negotiation':
        'Agrees interaction mode and task skill before execution',
      'coinbase-cdp':
        'Supplies wallet capabilities for USDC transaction signing',
      'x402-usdc':
        'Validates payment requirement before paid task completion',
      'a2a-task-lifecycle':
        'Tracks submitted → working → completed state progression',
    },
    whatToVerify: [
      'Scenario 15 appears in Ascentek scenario list',
      'Pipeline includes wallet and payment steps between negotiation and lifecycle completion',
      'Result lifecycle ends with completed state and success status',
    ],
  },
];

// Combined lookup
export const ALL_SCENARIOS: ScenarioExplanation[] = [
  ...SUNSTREAM_SCENARIOS,
  ...ASCENTEK_SCENARIOS,
];

const scenarioMap = new Map<string, ScenarioExplanation>();
for (const s of ALL_SCENARIOS) {
  scenarioMap.set(`${s.ecosystem}-${s.id}`, s);
}

export function getScenarioExplanation(
  ecosystem: 'sunstream' | 'ascentek',
  scenarioId: number,
): ScenarioExplanation | undefined {
  return scenarioMap.get(`${ecosystem}-${scenarioId}`);
}

export function getScenariosForEcosystem(
  ecosystem: 'sunstream' | 'ascentek',
): ScenarioExplanation[] {
  return ecosystem === 'sunstream' ? SUNSTREAM_SCENARIOS : ASCENTEK_SCENARIOS;
}
