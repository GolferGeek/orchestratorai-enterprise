// Help content: Protocol Layer definitions
// Each layer represents a concern in agent-to-agent communication

export interface LayerDefinition {
  id: string;
  name: string;
  color: string;
  question: string;
  summary: string;
  realWorldAnalogy: string;
  whyItMatters: string;
  providers: string[];
}

export const LAYER_DEFINITIONS: LayerDefinition[] = [
  {
    id: 'discovery',
    name: 'Discovery',
    color: '#a78bfa',
    question: 'How do agents find each other?',
    summary:
      'Before agents can communicate, they need to discover each other\'s capabilities and endpoints. Discovery providers publish and resolve agent metadata — what an agent can do, where to reach it, and what protocols it supports.',
    realWorldAnalogy:
      'DNS for agents. Just as browsers find web servers through DNS, agents find each other through discovery protocols.',
    whyItMatters:
      'Without discovery, agents need hardcoded endpoints. Discovery enables dynamic agent ecosystems where new agents can join and be found automatically.',
    providers: ['well-known', 'a2a-agent-card', 'agntcy-oasf'],
  },
  {
    id: 'transport',
    name: 'Transport',
    color: '#8b5cf6',
    question: 'How do messages get from A to B?',
    summary:
      'Transport providers handle the actual delivery of messages between agents. Different transports optimize for different use cases — request/response, streaming, high-throughput, or tool invocation.',
    realWorldAnalogy:
      'The postal service, phone lines, and courier services of the agent world. Each transport protocol is suited for different message patterns.',
    whyItMatters:
      'Agent-to-agent communication isn\'t one-size-fits-all. A compliance check needs reliable request/response (A2A JSON-RPC). A real-time quality alert needs streaming (WebSocket). A tool call needs structured invocation (MCP). The transport layer lets agents pick the right delivery mechanism.',
    providers: ['a2a-jsonrpc', 'http-rest', 'websocket', 'grpc', 'mcp'],
  },
  {
    id: 'identity',
    name: 'Identity',
    color: '#3b82f6',
    question: 'Who is sending this message?',
    summary:
      'Identity providers verify that the agent sending a message is who it claims to be. Different identity methods offer different security guarantees — from self-asserted keys to PKI certificates to decentralized identifiers.',
    realWorldAnalogy:
      'Government ID, corporate badges, and driver\'s licenses. x509 is like a government-issued passport (PKI chain of trust). OAuth-JWT is like a corporate badge (issued by an auth server). DID is like a self-sovereign ID (you control your own identity). Local-keys is like a business card (self-asserted, no third-party verification).',
    whyItMatters:
      'In regulated industries, you must prove identity before exchanging sensitive data. A bank examiner (AgriBank) uses x509 certificates — the strongest identity guarantee. A lending association (FCS Financial) uses OAuth-JWT — good enough for established relationships. A brand-new partner uses local-keys — minimal identity that must be upgraded as trust builds.',
    providers: ['oauth-jwt', 'x509', 'did', 'local-keys', 'first-contact', 'agntcy-crypto-identity'],
  },
  {
    id: 'encryption',
    name: 'Encryption',
    color: '#10b981',
    question: 'Can anyone else read this message?',
    summary:
      'Encryption providers protect message content from eavesdropping. The encryption method matches the sensitivity of the data and the trust relationship between agents.',
    realWorldAnalogy:
      'Sealed envelopes vs registered mail vs armored transport. Envelope encryption is like a sealed letter (contents encrypted, envelope visible). TLS-mutual is like an armored truck where both driver and recipient show ID. None is like a postcard — appropriate for public catalogs.',
    whyItMatters:
      'Loan applications contain PII. Quality test results are trade secrets. Pricing is competitively sensitive. Each data type needs appropriate encryption. Over-encrypting wastes resources; under-encrypting creates liability.',
    providers: ['envelope', 'tls-mutual', 'none', 'agntcy-slim'],
  },
  {
    id: 'trust',
    name: 'Trust',
    color: '#f59e0b',
    question: 'Should I accept this message?',
    summary:
      'Trust providers evaluate whether the sender is trustworthy enough for the requested operation. Trust is dynamic — it builds over successful interactions and degrades after failures. Different trust models serve different relationship types.',
    realWorldAnalogy:
      'Credit scores, security clearances, and VIP lists. Reputation is like a credit score (built over time from transaction history). Allowlist is like a security clearance (pre-authorized by an authority). First-contact is like meeting someone at a conference (unknown, but willing to start small).',
    whyItMatters:
      'Trust determines what an agent can do. A TRUSTED agent gets full API access. A FIRST-CONTACT agent gets read-only access to public data. Trust progression is how new agents earn access — the system is open but guarded, not closed.',
    providers: ['reputation', 'allowlist', 'first-contact-trust', 'a2a-jws-trust'],
  },
  {
    id: 'payment',
    name: 'Payment',
    color: '#ec4899',
    question: 'How does value transfer happen?',
    summary:
      'Payment providers attach monetary value to agent interactions. Agents can pay per API call (micropayments), per transaction (purchase orders), or handle refunds and credits when things go wrong.',
    realWorldAnalogy:
      'Credit cards, wire transfers, and Bitcoin. Lightning L402 is like a prepaid API token (pay-per-use, instant settlement). Stripe is like a corporate credit card (fiat currency, 3-5 day settlement). x402-USDC is like a stablecoin escrow (programmable money, smart contract settlement).',
    whyItMatters:
      'Agents doing real work need to exchange real value. A purchase order without payment is just a wish list. Payment-attached-to-message means the PO and the payment arrive together — no reconciliation needed, no EDI batch files, no 30-day net terms unless you want them.',
    providers: ['lightning-l402', 'stripe-fiat', 'x402-usdc', 'commerce-checkout'],
  },
  {
    id: 'negotiation',
    name: 'Negotiation',
    color: '#06b6d4',
    question: 'What can this agent do for me?',
    summary:
      'Negotiation providers handle capability exchange, protocol agreement, and competitive interactions between agents. Before doing business, agents need to agree on what\'s possible and what\'s allowed.',
    realWorldAnalogy:
      'RFPs, menus, and auctions. Capability-card is like a restaurant menu (here\'s what I offer). ACP is like an RFP negotiation (let\'s agree on format and scope). Auction is like a sealed-bid procurement (multiple agents compete for the work).',
    whyItMatters:
      'Not every agent can do everything. Capability negotiation prevents wasted calls — an agent learns upfront what\'s available at its trust level. Auctions enable competitive pricing. ACP standardizes how agents agree on interaction parameters.',
    providers: ['capability-card', 'acp', 'auction', 'a2a-skill-negotiation', 'commerce-cart-negotiation'],
  },
  {
    id: 'audit',
    name: 'Audit',
    color: '#ef4444',
    question: 'Can we prove this happened?',
    summary:
      'Audit providers create tamper-evident records of agent interactions. In regulated industries, every significant transaction must be provably recorded and retrievable.',
    realWorldAnalogy:
      'Notarized documents and blockchain receipts. Hash-chain is like a notary\'s ledger — each entry references the previous one, making it impossible to alter history without detection.',
    whyItMatters:
      'Farm Credit Act requires audit trails for all lending decisions. Quality complaints need traceable records for liability. Hash-chain audit means neither party can deny what happened — the cryptographic chain proves the sequence of events.',
    providers: ['hash-chain'],
  },
  {
    id: 'resilience',
    name: 'Resilience',
    color: '#f97316',
    question: 'What happens when things break?',
    summary:
      'Resilience providers prevent cascading failures and manage degraded operations. When one agent is slow or down, resilience patterns protect the rest of the system.',
    realWorldAnalogy:
      'Circuit breakers in your house and traffic lanes on a highway. Circuit-breaker stops calling a broken service (like a fuse blowing to protect the house). Bulkhead isolates failures (like watertight compartments on a ship). Retry handles transient failures (like redialing a busy phone).',
    whyItMatters:
      'In a multi-agent system, one slow agent can bring down everything. Circuit breakers prevent cascade failures. Bulkheads limit blast radius. These patterns are essential for production agent systems — without them, one bad agent takes out the whole network.',
    providers: ['circuit-breaker', 'bulkhead', 'retry'],
  },
  {
    id: 'observability',
    name: 'Observability',
    color: '#6366f1',
    question: "What's happening inside the system?",
    summary:
      'Observability providers expose the internal state of agent interactions — traces, metrics, and logs that let operators understand system behavior.',
    realWorldAnalogy:
      'Flight data recorders and hospital monitors. OpenTelemetry is like the black box on an airplane — recording everything so you can reconstruct what happened.',
    whyItMatters:
      "You can't fix what you can't see. When a compliance check takes 3 seconds instead of 300ms, observability tells you which step was slow. When a cross-ecosystem call fails, the trace shows exactly where it broke.",
    providers: ['opentelemetry'],
  },
  {
    id: 'orchestration',
    name: 'Orchestration',
    color: '#84cc16',
    question: 'How do multi-step workflows execute?',
    summary:
      'Orchestration providers manage complex multi-step agent workflows — coordinating multiple agents, handling partial failures, and ensuring all steps complete.',
    realWorldAnalogy:
      'A construction project manager coordinating electricians, plumbers, and carpenters. Pipeline orchestration ensures each step happens in order and the whole workflow completes.',
    whyItMatters:
      "Real agent interactions are rarely single-step. A quality hold notification involves Lube-Tech detecting → Ascentek confirming → OEM being notified → refund being issued. Orchestration ensures the whole chain executes correctly.",
    providers: ['pipeline', 'a2a-task-lifecycle', 'commerce-checkout-fsm'],
  },
  {
    id: 'business',
    name: 'Business',
    color: '#6b7280',
    question: 'What actual work is being done?',
    summary:
      'Business layer steps represent the domain-specific logic — compliance validation, formulation lookup, quality inspection. This is where the protocol stack delivers value.',
    realWorldAnalogy:
      'The actual work product. Everything else in the pipeline exists to make this step possible, secure, and trustworthy.',
    whyItMatters:
      'The protocol layers are the infrastructure. Business logic is the payload. Every pipeline starts with data and ends with a business result — the layers in between make sure that result is authentic, private, trustworthy, and auditable.',
    providers: [],
  },
];

// Lookup helpers
const layerMap = new Map(LAYER_DEFINITIONS.map((l) => [l.id, l]));

export function getLayerDefinition(id: string): LayerDefinition | undefined {
  return layerMap.get(id);
}

export function getLayerForProvider(providerId: string): LayerDefinition | undefined {
  return LAYER_DEFINITIONS.find((l) => l.providers.includes(providerId));
}
