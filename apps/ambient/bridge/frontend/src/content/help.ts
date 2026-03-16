export interface HelpEntry {
  id: string;
  title: string;
  oneLiner: string;
  sections: { heading: string; content: string }[];
  crossLinks: string[];
  category: 'protocol' | 'provider' | 'concept' | 'app';
}

export const HELP_ENTRIES: HelpEntry[] = [
  // ─── Protocol Layers ───────────────────────────────────────────────

  {
    id: 'layer-discovery',
    title: 'Discovery Layer',
    oneLiner: 'How agents find and advertise themselves on the network.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The discovery layer is the first step in agent communication. It defines how agents publish their capabilities and how other agents find them. Without discovery, agents are invisible to each other and no communication can begin.',
      },
      {
        heading: 'How it works',
        content:
          'Agents publish an AgentCard at a well-known URL (typically /.well-known/agent.json). This card describes the agent\'s identity, capabilities, supported protocols, and pricing. Other agents fetch this card to learn what services are available before initiating contact.',
      },
      {
        heading: 'Why it matters',
        content:
          'Discovery is the foundation of decentralized agent networks. Unlike traditional APIs where endpoints are hardcoded, discovery allows agents to dynamically find and evaluate potential collaborators. This enables open ecosystems where new agents can join without central registration.',
      },
    ],
    crossLinks: ['provider-well-known', 'concept-agent-card', 'concept-a2a'],
    category: 'protocol',
  },
  {
    id: 'layer-transport',
    title: 'Transport Layer',
    oneLiner: 'The communication channel agents use to exchange messages.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The transport layer handles the actual sending and receiving of messages between agents. It abstracts the underlying network protocol so higher layers can focus on message content rather than delivery mechanics.',
      },
      {
        heading: 'Available transports',
        content:
          'HTTP REST provides simple request-response semantics. A2A JSON-RPC uses the Google A2A protocol\'s JSON-RPC 2.0 format for structured method calls. WebSocket enables real-time bidirectional streaming. gRPC offers high-performance binary serialization with Protobuf. MCP provides tool-calling semantics for LLM integration.',
      },
      {
        heading: 'Choosing a transport',
        content:
          'Use HTTP REST for simplicity and debugging. Use A2A JSON-RPC for standards compliance. Use WebSocket when agents need to push updates to each other. Use gRPC for high-throughput enterprise scenarios. Use MCP when integrating with LLM tool-calling workflows.',
      },
    ],
    crossLinks: ['provider-http-rest', 'provider-a2a-jsonrpc', 'provider-websocket', 'provider-grpc', 'provider-mcp'],
    category: 'protocol',
  },
  {
    id: 'layer-negotiation',
    title: 'Negotiation Layer',
    oneLiner: 'How agents agree on terms before performing work.',
    sections: [
      {
        heading: 'What it does',
        content:
          'Before an agent performs work for another, they need to agree on what will be done, at what quality, and at what price. The negotiation layer handles this agreement process, from simple capability matching to complex multi-party auctions.',
      },
      {
        heading: 'Negotiation strategies',
        content:
          'Capability Card Exchange is the simplest: agents compare their published capabilities and agree if there\'s a match. ACP (Agent Communication Protocol) adds semantic negotiation where agents can discuss and refine requirements. Auction mode lets multiple agents bid competitively on tasks.',
      },
      {
        heading: 'Impact on workflow',
        content:
          'The negotiation strategy affects latency and cost. Simple capability matching is fast but inflexible. Semantic negotiation is slower but handles nuanced requirements. Auctions find the best price but require multiple agents and add significant overhead.',
      },
    ],
    crossLinks: ['provider-capability-card', 'provider-acp', 'provider-auction', 'concept-agent-card'],
    category: 'protocol',
  },
  {
    id: 'layer-identity',
    title: 'Identity Layer',
    oneLiner: 'How agents prove who they are and verify others.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The identity layer provides authentication and cryptographic identity for agents. Every message can be signed and verified, ensuring agents know who they are communicating with and that messages have not been tampered with.',
      },
      {
        heading: 'Identity providers',
        content:
          'Local Key Pairs use simple Ed25519 keys for development. DIDs (Decentralized Identifiers) provide self-sovereign identity without central authorities. X.509 certificates integrate with traditional PKI infrastructure. OAuth2/JWT tokens work with existing enterprise identity systems.',
      },
      {
        heading: 'Security considerations',
        content:
          'Identity is critical for trust and payment. Without verified identity, an agent cannot build reputation, receive payments, or participate in encrypted communications. In production, always use DIDs or X.509 rather than local keys.',
      },
    ],
    crossLinks: ['provider-did', 'provider-x509', 'provider-local-keys', 'provider-oauth-jwt', 'layer-trust', 'layer-encryption'],
    category: 'protocol',
  },
  {
    id: 'layer-payment',
    title: 'Payment Layer',
    oneLiner: 'How agents pay each other for services rendered.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The payment layer enables agents to transact value. When one agent requests work from another, the payment layer handles invoicing, payment verification, and settlement. This is what makes agent economies possible.',
      },
      {
        heading: 'Payment providers',
        content:
          'Mock payments simulate transactions for development. x402 USDC uses the HTTP 402 Payment Required flow with USDC stablecoin on Base Sepolia testnet. Lightning L402 uses Bitcoin\'s Lightning Network for instant micropayments. Stripe handles traditional fiat currency payments.',
      },
      {
        heading: 'The x402 flow',
        content:
          'An agent requests work. The server responds with HTTP 402 and a payment requirement. The client agent\'s wallet signs the payment. The signed payment is included in a retry of the original request. The server verifies payment before executing the work.',
      },
    ],
    crossLinks: ['provider-x402-usdc', 'provider-lightning-l402', 'provider-stripe-fiat', 'provider-mock-payment', 'layer-wallet'],
    category: 'protocol',
  },
  {
    id: 'layer-wallet',
    title: 'Wallet Layer',
    oneLiner: 'Manages agent funds and signs payment transactions.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The wallet layer manages an agent\'s cryptocurrency keys and balances. It provides the signing capability needed to authorize payments and the address that receives incoming payments. Think of it as the agent\'s bank account.',
      },
      {
        heading: 'Wallet providers',
        content:
          'Local Keypair creates a simple in-memory wallet from a private key, suitable for testing. Coinbase CDP (Cloud Development Platform) uses multi-party computation (MPC) for secure key management without exposing private keys, suitable for production use.',
      },
      {
        heading: 'Security model',
        content:
          'Wallets hold real value (even on testnets, the patterns matter). Local keypairs store the private key in memory or environment variables. CDP wallets use MPC so the full private key never exists in one place, providing defense-in-depth against key theft.',
      },
    ],
    crossLinks: ['provider-local-keypair', 'provider-coinbase-cdp', 'layer-payment'],
    category: 'protocol',
  },
  {
    id: 'layer-trust',
    title: 'Trust Layer',
    oneLiner: 'How agents decide whether to work with each other.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The trust layer evaluates whether an agent should be trusted based on history, reputation, or predefined rules. It provides a trust score that other layers (especially payment and negotiation) use to make decisions about risk.',
      },
      {
        heading: 'Trust strategies',
        content:
          'Allowlist is the simplest: only pre-approved agents are trusted. Reputation scoring tracks interaction history and calculates a dynamic trust score based on successful completions, failures, and disputes. First Contact presents a challenge to unknown agents, establishing baseline trust through a verification task.',
      },
      {
        heading: 'Trust and payments',
        content:
          'Trust directly affects payment behavior. A highly trusted agent might receive payment after work completion. An unknown agent might require prepayment or escrow. A distrusted agent might be refused service entirely. These policies are configured per-deployment.',
      },
    ],
    crossLinks: ['provider-allowlist', 'provider-reputation', 'provider-first-contact', 'layer-identity'],
    category: 'protocol',
  },
  {
    id: 'layer-encryption',
    title: 'Encryption Layer',
    oneLiner: 'Protects message content from eavesdropping.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The encryption layer provides end-to-end encryption for agent messages. Even if the transport channel is compromised, encrypted messages remain confidential. This is separate from transport-level TLS and provides application-level security.',
      },
      {
        heading: 'Encryption providers',
        content:
          'None sends messages in plaintext (suitable for local development only). Envelope encryption uses AES-256-GCM for message encryption with ECDH key exchange for key agreement. Mutual TLS (mTLS) provides both encryption and mutual authentication at the transport level.',
      },
      {
        heading: 'When to use what',
        content:
          'Use None only in development with trusted local networks. Envelope encryption is best for cross-network agent communication where you need end-to-end security. mTLS is ideal for enterprise deployments where both sides have X.509 certificates and you want the TLS stack to handle everything.',
      },
    ],
    crossLinks: ['provider-envelope', 'provider-tls-mutual', 'layer-identity'],
    category: 'protocol',
  },
  {
    id: 'layer-resilience',
    title: 'Resilience Layer',
    oneLiner: 'Keeps communication working when things go wrong.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The resilience layer handles failures gracefully. Network requests fail, agents go offline, and services overload. Resilience patterns detect these failures and apply strategies to maintain system availability without losing work.',
      },
      {
        heading: 'Resilience patterns',
        content:
          'Retry with Backoff automatically retries failed requests with exponentially increasing delays. Circuit Breaker tracks failure rates and stops sending requests to failing services, allowing them time to recover. Bulkhead isolates different agent interactions so one failing agent cannot consume all resources.',
      },
      {
        heading: 'Choosing a pattern',
        content:
          'Use retry for transient failures like network blips. Use circuit breaker when an agent might be down for an extended period. Use bulkhead when you interact with many agents and need to prevent cascade failures. In production, these patterns are often combined.',
      },
    ],
    crossLinks: ['provider-retry', 'provider-circuit-breaker', 'provider-bulkhead'],
    category: 'protocol',
  },
  {
    id: 'layer-observability',
    title: 'Observability Layer',
    oneLiner: 'Tracks and records what happens across agent interactions.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The observability layer captures logs, metrics, and traces from agent interactions. It provides the visibility needed to debug issues, understand performance, and audit agent behavior. Every message exchange, payment, and trust decision is recorded.',
      },
      {
        heading: 'Current implementation',
        content:
          'File Logger writes structured JSON logs to disk. Each log entry includes timestamps, agent IDs, message types, durations, and outcomes. The playground\'s Observability view reads these logs and presents them as a searchable, filterable timeline.',
      },
      {
        heading: 'Future directions',
        content:
          'Production systems would integrate with OpenTelemetry for distributed tracing, Prometheus for metrics collection, and centralized logging platforms. The observability layer\'s interface is designed to support these backends without changing the calling code.',
      },
    ],
    crossLinks: ['provider-file-log'],
    category: 'protocol',
  },
  {
    id: 'layer-orchestration',
    title: 'Orchestration Layer',
    oneLiner: 'Coordinates multi-step workflows across multiple agents.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The orchestration layer manages workflows that span multiple agents and multiple steps. Instead of point-to-point communication, orchestration defines pipelines where the output of one agent feeds into the next, handling failures and retries across the entire chain.',
      },
      {
        heading: 'Pipeline orchestration',
        content:
          'The pipeline pattern defines a linear sequence of agent tasks. Each step specifies which agent to call, what input to provide, and what to do with the output. The orchestrator tracks progress, handles failures, and can resume interrupted workflows.',
      },
      {
        heading: 'Multi-agent coordination',
        content:
          'Real-world tasks often require multiple specialized agents. ResearchHub finds articles, MarketPulse identifies trends, and ContentForge creates content. Orchestration ties these together into coherent workflows that produce results no single agent could achieve alone.',
      },
    ],
    crossLinks: ['provider-pipeline', 'app-research-hub', 'app-market-pulse', 'app-content-forge'],
    category: 'protocol',
  },

  // ─── Providers ─────────────────────────────────────────────────────

  {
    id: 'provider-well-known',
    title: 'Well-Known Discovery',
    oneLiner: 'Publishes agent capabilities at /.well-known/agent.json.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Each agent serves a JSON document at the standardized path /.well-known/agent.json. This follows the IETF RFC 8615 convention used by web standards like SSL certificates and OAuth. Any agent can discover another by fetching this URL from the agent\'s base address.',
      },
      {
        heading: 'The AgentCard format',
        content:
          'The agent.json file contains an AgentCard with fields for name, description, version, capabilities (with pricing), supported protocols, and endpoints. This gives discovering agents all the information needed to decide whether and how to communicate.',
      },
    ],
    crossLinks: ['layer-discovery', 'concept-agent-card', 'concept-well-known'],
    category: 'provider',
  },
  {
    id: 'provider-http-rest',
    title: 'HTTP REST Transport',
    oneLiner: 'Standard HTTP request-response communication.',
    sections: [
      {
        heading: 'How it works',
        content:
          'HTTP REST uses standard HTTP methods (POST, GET) to send and receive agent messages. Each message is a JSON payload sent to the agent\'s endpoint. Responses are synchronous, making it easy to debug with standard tools like curl and browser dev tools.',
      },
      {
        heading: 'Trade-offs',
        content:
          'HTTP REST is the simplest transport to implement and debug. However, it only supports request-response patterns. For streaming results or server-pushed updates, you need WebSocket or gRPC. REST is ideal for development and simple production use cases.',
      },
    ],
    crossLinks: ['layer-transport', 'provider-a2a-jsonrpc'],
    category: 'provider',
  },
  {
    id: 'provider-a2a-jsonrpc',
    title: 'A2A JSON-RPC 2.0',
    oneLiner: 'Google\'s Agent-to-Agent protocol using JSON-RPC method calls.',
    sections: [
      {
        heading: 'How it works',
        content:
          'A2A JSON-RPC wraps agent communication in the JSON-RPC 2.0 format. Every request specifies a method name (like "tasks/send" or "tasks/get") with structured parameters. Responses include result or error fields. This provides a standardized RPC interface that any JSON-RPC client can consume.',
      },
      {
        heading: 'Why JSON-RPC',
        content:
          'JSON-RPC 2.0 is a minimal, well-specified protocol. It supports batching, error codes, and notifications (one-way messages). Google chose it for A2A because it\'s transport-agnostic, language-agnostic, and has existing tooling in every major programming language.',
      },
    ],
    crossLinks: ['layer-transport', 'concept-a2a', 'concept-jsonrpc'],
    category: 'provider',
  },
  {
    id: 'provider-websocket',
    title: 'WebSocket Transport',
    oneLiner: 'Persistent bidirectional connection for real-time agent messaging.',
    sections: [
      {
        heading: 'How it works',
        content:
          'WebSocket establishes a persistent TCP connection between agents. Once connected, either side can send messages at any time without the overhead of HTTP request/response cycles. This enables real-time streaming of results, progress updates, and event notifications.',
      },
      {
        heading: 'When to use it',
        content:
          'WebSocket is ideal when agents need to exchange many messages quickly, when the server needs to push updates, or when you want to stream partial results (like token-by-token LLM output). The persistent connection does consume more resources than HTTP REST.',
      },
    ],
    crossLinks: ['layer-transport', 'provider-http-rest'],
    category: 'provider',
  },
  {
    id: 'provider-grpc',
    title: 'gRPC Transport',
    oneLiner: 'High-performance binary protocol using Protocol Buffers.',
    sections: [
      {
        heading: 'How it works',
        content:
          'gRPC uses HTTP/2 with Protocol Buffer serialization for compact, fast message exchange. It supports unary calls, server streaming, client streaming, and bidirectional streaming. Message schemas are defined in .proto files and compiled to type-safe client/server code.',
      },
      {
        heading: 'Enterprise advantages',
        content:
          'gRPC provides strong typing, automatic code generation, and significantly smaller payloads than JSON. It is the preferred transport for high-throughput enterprise deployments where performance matters more than human readability. It also integrates naturally with service mesh infrastructure.',
      },
    ],
    crossLinks: ['layer-transport', 'provider-http-rest'],
    category: 'provider',
  },
  {
    id: 'provider-mcp',
    title: 'MCP Transport',
    oneLiner: 'Anthropic\'s Model Context Protocol for LLM tool integration.',
    sections: [
      {
        heading: 'How it works',
        content:
          'MCP (Model Context Protocol) enables LLMs to call external tools through a standardized interface. Instead of treating agents as services, MCP treats them as tools that an LLM can invoke. This bridges the gap between AI assistants and agent networks.',
      },
      {
        heading: 'MCP vs A2A',
        content:
          'MCP is designed for LLM-to-tool communication (vertical integration), while A2A is designed for agent-to-agent communication (horizontal integration). In practice, an orchestrating agent might use MCP to let its LLM call other agents via A2A, combining both protocols.',
      },
    ],
    crossLinks: ['layer-transport', 'concept-mcp', 'concept-a2a'],
    category: 'provider',
  },
  {
    id: 'provider-capability-card',
    title: 'Capability Card Exchange',
    oneLiner: 'Simple negotiation by comparing published capability lists.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Each agent publishes its capabilities in its AgentCard. When an agent needs a service, it fetches the target agent\'s card and checks if the required capability is listed. If it matches, work proceeds at the published price with no further negotiation.',
      },
      {
        heading: 'Limitations',
        content:
          'Capability card exchange is a take-it-or-leave-it model. There is no room for negotiation on price, quality, or delivery time. For simple, well-defined services this is efficient. For complex or variable tasks, ACP or auction-based negotiation is more appropriate.',
      },
    ],
    crossLinks: ['layer-negotiation', 'concept-agent-card'],
    category: 'provider',
  },
  {
    id: 'provider-acp',
    title: 'ACP Negotiation',
    oneLiner: 'Semantic negotiation where agents discuss and refine requirements.',
    sections: [
      {
        heading: 'How it works',
        content:
          'ACP (Agent Communication Protocol) enables multi-turn negotiation. The requesting agent describes what it needs. The provider agent can ask clarifying questions, propose alternatives, or counter-offer on price and terms. Both agents converge on a mutually acceptable agreement.',
      },
      {
        heading: 'Use cases',
        content:
          'ACP shines for complex tasks where requirements are ambiguous. For example, a content request might start as "write about AI trends" and through negotiation become "write a 1500-word analysis of LLM agent frameworks, focusing on A2A and MCP, with 5 sources, delivered in 2 hours."',
      },
    ],
    crossLinks: ['layer-negotiation', 'provider-capability-card', 'provider-auction'],
    category: 'provider',
  },
  {
    id: 'provider-auction',
    title: 'Auction Negotiation',
    oneLiner: 'Multiple agents bid competitively on tasks.',
    sections: [
      {
        heading: 'How it works',
        content:
          'The requesting agent broadcasts a task to multiple potential providers. Each provider submits a bid with their price, estimated quality, and delivery time. The requester evaluates bids based on configurable criteria (cheapest, fastest, best reputation) and selects a winner.',
      },
      {
        heading: 'When to use auctions',
        content:
          'Auctions are best when multiple agents can perform the same task and you want market-driven pricing. They add latency (waiting for bids) but can significantly reduce costs. They require a network with multiple competing agents offering similar capabilities.',
      },
    ],
    crossLinks: ['layer-negotiation', 'provider-acp', 'layer-trust'],
    category: 'provider',
  },
  {
    id: 'provider-local-keys',
    title: 'Local Key Pairs',
    oneLiner: 'Simple Ed25519 key pairs for development identity.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Each agent generates an Ed25519 key pair on startup. The public key serves as the agent\'s identity, and the private key signs messages. Keys are stored in memory or environment variables. This provides cryptographic identity without any external infrastructure.',
      },
      {
        heading: 'Development only',
        content:
          'Local keys are suitable for development and testing. They lack key rotation, revocation, and discovery mechanisms. In production, use DIDs for decentralized identity or X.509 certificates for enterprise PKI integration.',
      },
    ],
    crossLinks: ['layer-identity', 'provider-did', 'provider-x509'],
    category: 'provider',
  },
  {
    id: 'provider-did',
    title: 'DID Identity',
    oneLiner: 'Decentralized Identifiers for self-sovereign agent identity.',
    sections: [
      {
        heading: 'How it works',
        content:
          'DIDs (Decentralized Identifiers) are globally unique identifiers that agents control without relying on a central authority. A DID resolves to a DID Document containing public keys, service endpoints, and authentication methods. Agents can prove ownership of their DID by signing challenges with their private key.',
      },
      {
        heading: 'Why DIDs for agents',
        content:
          'DIDs are ideal for agent networks because they support self-sovereign identity (no central registrar), key rotation (compromise recovery), and multiple verification methods. They are a W3C standard with broad industry support and work naturally with Web3 payment systems.',
      },
    ],
    crossLinks: ['layer-identity', 'provider-local-keys', 'layer-payment'],
    category: 'provider',
  },
  {
    id: 'provider-x509',
    title: 'X.509 Certificates',
    oneLiner: 'Traditional PKI certificates for enterprise agent identity.',
    sections: [
      {
        heading: 'How it works',
        content:
          'X.509 certificates are issued by a Certificate Authority (CA) and bind an agent\'s identity to a public key. They include metadata like organization, validity period, and usage constraints. Verification follows the certificate chain back to a trusted root CA.',
      },
      {
        heading: 'Enterprise integration',
        content:
          'X.509 is the standard for enterprise security. If your organization already has PKI infrastructure, using X.509 for agents integrates naturally with existing security policies, mTLS deployments, and compliance frameworks like SOC 2 and ISO 27001.',
      },
    ],
    crossLinks: ['layer-identity', 'provider-tls-mutual', 'provider-did'],
    category: 'provider',
  },
  {
    id: 'provider-oauth-jwt',
    title: 'OAuth2 / JWT',
    oneLiner: 'Token-based identity using existing OAuth infrastructure.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Agents authenticate via OAuth2 flows and receive JWT tokens. These tokens contain claims about the agent\'s identity, roles, and permissions. Other agents verify the JWT signature against the identity provider\'s public key without needing to contact the provider for each request.',
      },
      {
        heading: 'Integration scenario',
        content:
          'OAuth2/JWT is ideal when agents operate within an organization that already uses an identity provider like Auth0, Okta, or Azure AD. Agents receive scoped tokens that limit what actions they can perform, integrating with existing access control policies.',
      },
    ],
    crossLinks: ['layer-identity', 'provider-local-keys'],
    category: 'provider',
  },
  {
    id: 'provider-x402-usdc',
    title: 'x402 USDC Payment',
    oneLiner: 'HTTP 402-based payment with USDC stablecoin on Base.',
    sections: [
      {
        heading: 'How it works',
        content:
          'When an agent requests a paid service, the server responds with HTTP 402 Payment Required, including a payment requirement (amount, recipient address, network). The client\'s wallet signs a USDC transfer on Base Sepolia. The signed transaction is included in the retry request header, and the server verifies payment on-chain before executing.',
      },
      {
        heading: 'Why USDC on Base',
        content:
          'USDC is a dollar-pegged stablecoin, eliminating price volatility. Base is an Ethereum L2 with low transaction fees and fast confirmations. Together, they provide predictable pricing with sub-dollar transaction costs, making micropayments for agent services economically viable.',
      },
    ],
    crossLinks: ['layer-payment', 'layer-wallet', 'provider-coinbase-cdp'],
    category: 'provider',
  },
  {
    id: 'provider-lightning-l402',
    title: 'Lightning L402',
    oneLiner: 'Bitcoin Lightning Network micropayments for instant settlement.',
    sections: [
      {
        heading: 'How it works',
        content:
          'L402 (formerly LSAT) combines HTTP 402 with Lightning Network invoices. The server issues a macaroon (capability token) that requires a Lightning payment to activate. Once paid, the macaroon serves as both proof of payment and an access credential. Payments settle in milliseconds.',
      },
      {
        heading: 'Micropayment advantage',
        content:
          'Lightning enables payments as small as 1 satoshi (fractions of a cent). This opens up pricing models where agents charge per-token, per-query, or per-result rather than flat fees. The near-zero transaction cost makes even sub-cent payments economically rational.',
      },
    ],
    crossLinks: ['layer-payment', 'provider-x402-usdc'],
    category: 'provider',
  },
  {
    id: 'provider-stripe-fiat',
    title: 'Stripe Fiat Payment',
    oneLiner: 'Traditional USD payments via Stripe for enterprise billing.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Stripe integration enables agents to transact in traditional fiat currency. Payments are processed through Stripe\'s API with support for invoicing, subscriptions, and metered billing. This connects agent economies to existing business payment infrastructure.',
      },
      {
        heading: 'Enterprise use case',
        content:
          'Many organizations cannot or will not use cryptocurrency. Stripe payments let agents participate in commercial workflows using familiar USD billing, with Stripe handling compliance, fraud detection, and payment processing. Settlements occur through standard banking rails.',
      },
    ],
    crossLinks: ['layer-payment', 'provider-x402-usdc'],
    category: 'provider',
  },
  {
    id: 'provider-mock-payment',
    title: 'Mock Payments',
    oneLiner: 'Simulated payments for development and testing.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Mock payments simulate the entire payment flow without moving real funds. Invoices are generated, payments are "signed," and verification always succeeds. This lets you develop and test payment-dependent workflows without wallet setup or testnet tokens.',
      },
      {
        heading: 'Testing scenarios',
        content:
          'Mock mode supports configurable failure rates for testing error handling. You can simulate payment timeout, insufficient funds, or verification failure to ensure your agent handles payment edge cases correctly before switching to real payment providers.',
      },
    ],
    crossLinks: ['layer-payment', 'provider-x402-usdc'],
    category: 'provider',
  },
  {
    id: 'provider-local-keypair',
    title: 'Local Keypair Wallet',
    oneLiner: 'In-memory wallet from a private key for testing.',
    sections: [
      {
        heading: 'How it works',
        content:
          'A local keypair wallet is initialized from a private key (typically from an environment variable). It can sign transactions and provide a public address. The wallet exists only in memory during the agent\'s runtime. This is the simplest wallet implementation, suitable for development.',
      },
      {
        heading: 'Security warning',
        content:
          'Local keypair wallets store the raw private key in process memory. Never use this in production with real funds. For production deployments, use Coinbase CDP or a hardware security module (HSM) backed wallet where private keys are never exposed.',
      },
    ],
    crossLinks: ['layer-wallet', 'provider-coinbase-cdp'],
    category: 'provider',
  },
  {
    id: 'provider-coinbase-cdp',
    title: 'Coinbase CDP Wallet',
    oneLiner: 'MPC-secured wallet via Coinbase Cloud Development Platform.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Coinbase CDP uses multi-party computation (MPC) to split the private key across multiple parties. No single party ever holds the complete key. Transaction signing requires coordination between parties, providing security even if one party is compromised.',
      },
      {
        heading: 'Production ready',
        content:
          'CDP wallets are designed for production use. They provide key management, transaction signing, and balance queries through Coinbase\'s API. The MPC approach meets enterprise security requirements while remaining accessible through a developer-friendly SDK.',
      },
    ],
    crossLinks: ['layer-wallet', 'provider-local-keypair', 'provider-x402-usdc'],
    category: 'provider',
  },
  {
    id: 'provider-allowlist',
    title: 'Allowlist Trust',
    oneLiner: 'Only pre-approved agents are trusted.',
    sections: [
      {
        heading: 'How it works',
        content:
          'The allowlist maintains a static list of trusted agent identifiers. Any agent on the list receives full trust. Any agent not on the list is untrusted and may be refused service. This is the simplest trust model, requiring no interaction history or reputation tracking.',
      },
      {
        heading: 'Best for',
        content:
          'Allowlists work well for closed networks where all participants are known in advance, such as internal enterprise agent deployments. They are easy to audit and provide deterministic trust decisions. They do not scale to open networks where new agents join dynamically.',
      },
    ],
    crossLinks: ['layer-trust', 'provider-reputation', 'provider-first-contact'],
    category: 'provider',
  },
  {
    id: 'provider-reputation',
    title: 'Reputation Trust',
    oneLiner: 'Dynamic trust scores based on interaction history.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Each agent\'s trust score is computed from its interaction history. Successful task completions increase the score. Failures, disputes, and timeouts decrease it. The score is a weighted average that gives more weight to recent interactions, allowing agents to recover from past failures.',
      },
      {
        heading: 'Score-based policies',
        content:
          'Different trust score ranges trigger different behaviors. Agents above 0.8 might receive extended credit terms. Agents between 0.5-0.8 require prepayment. Agents below 0.5 are refused service. These thresholds are configurable per deployment.',
      },
    ],
    crossLinks: ['layer-trust', 'provider-allowlist', 'layer-payment'],
    category: 'provider',
  },
  {
    id: 'provider-first-contact',
    title: 'First Contact Trust',
    oneLiner: 'Challenge-based verification for unknown agents.',
    sections: [
      {
        heading: 'How it works',
        content:
          'When an unknown agent makes first contact, it receives a verification challenge rather than immediate service. The challenge might be a proof-of-work computation, a small prepayment, or a test task. Successfully completing the challenge establishes baseline trust.',
      },
      {
        heading: 'Open network design',
        content:
          'First contact is designed for open networks where any agent can join. It prevents spam and denial-of-service by requiring new agents to invest effort before accessing services. Once baseline trust is established, the reputation system takes over for subsequent interactions.',
      },
    ],
    crossLinks: ['layer-trust', 'provider-reputation', 'provider-allowlist'],
    category: 'provider',
  },
  {
    id: 'provider-envelope',
    title: 'Envelope Encryption',
    oneLiner: 'AES-256-GCM message encryption with ECDH key exchange.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Envelope encryption generates a random AES-256-GCM key for each message. The message is encrypted with this key. The key itself is encrypted using ECDH (Elliptic Curve Diffie-Hellman) with the recipient\'s public key. Both the encrypted message and encrypted key are sent together as an "envelope."',
      },
      {
        heading: 'End-to-end security',
        content:
          'Because the message key is encrypted with the recipient\'s public key, only the intended recipient can decrypt it. Even if the transport is compromised, intermediary nodes, or the transport provider itself, cannot read the message content. This provides true end-to-end encryption.',
      },
    ],
    crossLinks: ['layer-encryption', 'provider-tls-mutual', 'layer-identity'],
    category: 'provider',
  },
  {
    id: 'provider-tls-mutual',
    title: 'Mutual TLS',
    oneLiner: 'Both sides present certificates for encrypted, authenticated channels.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Standard TLS authenticates only the server. Mutual TLS (mTLS) requires both client and server to present X.509 certificates. Both sides verify the other\'s certificate chain. This provides encryption, server authentication, and client authentication in a single handshake.',
      },
      {
        heading: 'Zero-trust networking',
        content:
          'mTLS is a cornerstone of zero-trust architecture. Every connection is authenticated and encrypted regardless of network location. Service meshes like Istio and Linkerd use mTLS to secure all inter-service communication automatically, making it natural for agent deployments on Kubernetes.',
      },
    ],
    crossLinks: ['layer-encryption', 'provider-envelope', 'provider-x509'],
    category: 'provider',
  },
  {
    id: 'provider-retry',
    title: 'Retry with Backoff',
    oneLiner: 'Automatically retries failed requests with increasing delays.',
    sections: [
      {
        heading: 'How it works',
        content:
          'When a request fails with a transient error (network timeout, 503, etc.), the retry provider waits and tries again. The wait time increases exponentially (1s, 2s, 4s, 8s...) with jitter to prevent thundering herd. After a configurable maximum number of retries, the error is propagated.',
      },
      {
        heading: 'Configuration',
        content:
          'Key parameters include max retries (typically 3-5), initial delay (typically 1 second), backoff multiplier (typically 2x), and which error codes trigger retries. Only idempotent operations should be retried automatically to avoid duplicate side effects.',
      },
    ],
    crossLinks: ['layer-resilience', 'provider-circuit-breaker'],
    category: 'provider',
  },
  {
    id: 'provider-circuit-breaker',
    title: 'Circuit Breaker',
    oneLiner: 'Stops calling failing services to let them recover.',
    sections: [
      {
        heading: 'How it works',
        content:
          'The circuit breaker tracks the success/failure rate of requests. When failures exceed a threshold (e.g., 50% in the last minute), the circuit "opens" and all requests immediately fail without being sent. After a timeout period, the circuit moves to "half-open" and allows one test request through to check if the service has recovered.',
      },
      {
        heading: 'Why it matters',
        content:
          'Without a circuit breaker, a failing downstream agent causes cascading delays as requests pile up waiting for timeouts. The circuit breaker fails fast, preserving resources and giving the failing service time to recover. It is essential for production agent networks.',
      },
    ],
    crossLinks: ['layer-resilience', 'provider-retry', 'provider-bulkhead'],
    category: 'provider',
  },
  {
    id: 'provider-bulkhead',
    title: 'Bulkhead Isolation',
    oneLiner: 'Isolates agent interactions to prevent cascade failures.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Bulkhead assigns each agent interaction its own resource pool (thread pool, connection pool, or semaphore). If one agent is slow or unresponsive, it only consumes resources from its own pool. Other agent interactions continue unaffected with their own dedicated resources.',
      },
      {
        heading: 'Named after ships',
        content:
          'The pattern takes its name from ship bulkheads, the watertight compartments that prevent a hull breach from flooding the entire vessel. In agent networks, this means one misbehaving agent cannot take down your entire system by exhausting shared resources like connections or threads.',
      },
    ],
    crossLinks: ['layer-resilience', 'provider-circuit-breaker'],
    category: 'provider',
  },
  {
    id: 'provider-file-log',
    title: 'File Logger',
    oneLiner: 'Writes structured JSON logs for all agent interactions.',
    sections: [
      {
        heading: 'How it works',
        content:
          'Every agent interaction is logged as a structured JSON object to a log file. Entries include timestamp, source agent, target agent, message type, duration, payload size, and outcome (success/failure). The playground\'s Observability view parses these logs for visualization.',
      },
      {
        heading: 'Log structure',
        content:
          'Each log entry follows a consistent schema with fields for correlation ID (linking related messages), protocol layer, provider used, and timing information. This structured format enables filtering, searching, and aggregation across thousands of interactions.',
      },
    ],
    crossLinks: ['layer-observability'],
    category: 'provider',
  },
  {
    id: 'provider-pipeline',
    title: 'Pipeline Orchestration',
    oneLiner: 'Sequential multi-agent workflow execution.',
    sections: [
      {
        heading: 'How it works',
        content:
          'A pipeline defines a sequence of steps, each assigned to a specific agent. The orchestrator executes steps in order, passing each step\'s output as input to the next. If a step fails, the pipeline can retry, skip, or abort based on the step\'s failure policy.',
      },
      {
        heading: 'Example pipeline',
        content:
          'A content creation pipeline might be: (1) ResearchHub scouts for trending topics, (2) MarketPulse analyzes which topics have market relevance, (3) ContentForge drafts an article from the research and analysis. Each agent contributes its specialty to the final result.',
      },
    ],
    crossLinks: ['layer-orchestration', 'app-research-hub', 'app-market-pulse', 'app-content-forge'],
    category: 'provider',
  },

  // ─── Concepts ──────────────────────────────────────────────────────

  {
    id: 'concept-a2a',
    title: 'A2A Protocol',
    oneLiner: 'Google\'s open standard for agent-to-agent communication.',
    sections: [
      {
        heading: 'What is A2A',
        content:
          'A2A (Agent-to-Agent) is an open protocol specification by Google for enabling autonomous AI agents to communicate, negotiate, and transact with each other. It defines standard message formats, discovery mechanisms, and interaction patterns that work across different agent frameworks and vendors.',
      },
      {
        heading: 'Core concepts',
        content:
          'A2A introduces AgentCards for discovery, Tasks as units of work, Artifacts as deliverables, and Parts as multimodal message components. It uses JSON-RPC 2.0 as the transport format and supports both synchronous request-response and asynchronous streaming patterns.',
      },
      {
        heading: 'In the playground',
        content:
          'This playground implements a superset of A2A. The 11 protocol layers extend beyond A2A\'s core specification to include payment, wallet, trust, and encryption layers that are needed for real-world autonomous agent economies.',
      },
    ],
    crossLinks: ['concept-jsonrpc', 'concept-agent-card', 'provider-a2a-jsonrpc', 'concept-mcp'],
    category: 'concept',
  },
  {
    id: 'concept-mcp',
    title: 'MCP (Model Context Protocol)',
    oneLiner: 'Anthropic\'s protocol for connecting LLMs to external tools.',
    sections: [
      {
        heading: 'What is MCP',
        content:
          'MCP (Model Context Protocol) is a standard created by Anthropic for giving LLMs access to external tools, data sources, and services. It defines how tools expose their capabilities and how LLMs invoke them, providing a universal plugin system for AI models.',
      },
      {
        heading: 'MCP vs A2A',
        content:
          'MCP and A2A solve different problems. MCP connects an LLM to its tools (vertical: human -> LLM -> tools). A2A connects autonomous agents to each other (horizontal: agent <-> agent). A sophisticated system uses both: an agent uses MCP internally to access tools, and A2A externally to communicate with other agents.',
      },
      {
        heading: 'In the playground',
        content:
          'The MCP Comparison view demonstrates how the same agent capability can be accessed via both MCP (tool-calling) and A2A (agent messaging) interfaces, highlighting the complementary nature of these protocols.',
      },
    ],
    crossLinks: ['concept-a2a', 'provider-mcp', 'concept-protocol-factory'],
    category: 'concept',
  },
  {
    id: 'concept-protocol-factory',
    title: 'ProtocolFactory',
    oneLiner: 'Creates protocol layer instances from configuration.',
    sections: [
      {
        heading: 'What it does',
        content:
          'The ProtocolFactory is the central configuration mechanism. Given a ProtocolConfig (which specifies a provider for each of the 11 layers), it creates and wires together the concrete provider instances. This is how you switch from "mock payments" to "x402 USDC" with a single config change.',
      },
      {
        heading: 'Design pattern',
        content:
          'ProtocolFactory implements the Abstract Factory pattern. Each layer has an interface (e.g., IPaymentProvider). The factory maps config strings (e.g., "x402-usdc") to concrete implementations (e.g., X402USDCPaymentProvider). This decouples configuration from implementation.',
      },
      {
        heading: 'Runtime swapping',
        content:
          'Because all providers implement the same layer interface, you can change providers at runtime through the Protocol Drawer in the UI. The factory rebuilds the protocol stack instantly. This is what makes the playground a powerful learning tool: you can experiment with different combinations in real time.',
      },
    ],
    crossLinks: ['layer-discovery', 'layer-transport', 'layer-payment'],
    category: 'concept',
  },
  {
    id: 'concept-agent-card',
    title: 'AgentCard',
    oneLiner: 'A JSON document describing an agent\'s identity and capabilities.',
    sections: [
      {
        heading: 'What it contains',
        content:
          'An AgentCard includes the agent\'s name, description, version, base URL, supported capabilities (with pricing), supported protocols, and authentication requirements. It is the agent\'s public profile, everything another agent needs to decide whether and how to interact.',
      },
      {
        heading: 'Discovery and negotiation',
        content:
          'AgentCards serve double duty. In discovery, they tell other agents that this agent exists and what it can do. In negotiation, they provide the terms (pricing, protocols) that the requesting agent must accept or negotiate further.',
      },
    ],
    crossLinks: ['concept-well-known', 'layer-discovery', 'provider-capability-card'],
    category: 'concept',
  },
  {
    id: 'concept-well-known',
    title: '.well-known Convention',
    oneLiner: 'Standardized URL path for agent discovery metadata.',
    sections: [
      {
        heading: 'What it is',
        content:
          'The .well-known URI convention (RFC 8615) reserves the path /.well-known/ for standardized metadata. Just as /.well-known/openid-configuration is used for OAuth discovery, /.well-known/agent.json is used for agent discovery. Any HTTP client can find an agent\'s card by appending this path to the agent\'s base URL.',
      },
      {
        heading: 'Why it works',
        content:
          'The .well-known convention requires no central registry or DNS-level changes. Any web server can serve an agent card at this path. This makes agent discovery as simple as fetching a URL, working with existing web infrastructure including CDNs, load balancers, and reverse proxies.',
      },
    ],
    crossLinks: ['concept-agent-card', 'layer-discovery', 'provider-well-known'],
    category: 'concept',
  },
  {
    id: 'concept-jsonrpc',
    title: 'JSON-RPC 2.0',
    oneLiner: 'A lightweight remote procedure call protocol using JSON.',
    sections: [
      {
        heading: 'The format',
        content:
          'A JSON-RPC request contains jsonrpc (always "2.0"), method (the function to call), params (arguments), and id (for matching responses). The response contains jsonrpc, result or error, and the matching id. This minimal structure has no opinions about transport, authentication, or serialization beyond JSON.',
      },
      {
        heading: 'Why agents use it',
        content:
          'JSON-RPC provides just enough structure for reliable RPC without the complexity of SOAP, GraphQL, or gRPC. It supports batch requests (multiple calls in one HTTP request), notifications (calls without responses), and typed error codes. It is simple enough to implement in any language in under 100 lines.',
      },
    ],
    crossLinks: ['concept-a2a', 'provider-a2a-jsonrpc'],
    category: 'concept',
  },

  // ─── Apps ──────────────────────────────────────────────────────────

  {
    id: 'app-research-hub',
    title: 'ResearchHub',
    oneLiner: 'An agent that discovers, categorizes, and analyzes research articles.',
    sections: [
      {
        heading: 'What it does',
        content:
          'ResearchHub is a research aggregation agent. It scouts the web for articles matching configured topics, categorizes them, extracts key signals, and generates narrative summaries. Other agents can request research on specific topics through the A2A protocol.',
      },
      {
        heading: 'Capabilities',
        content:
          'ResearchHub offers article scouting (finding relevant content), categorization (organizing by topic), narrative generation (AI-written summaries), and signal detection (identifying trending patterns). Each capability has independent pricing and can be invoked separately.',
      },
      {
        heading: 'In the playground',
        content:
          'The ResearchHub views let you browse categories, read articles, view AI-generated narratives, and monitor the scout agent. You can see the protocol messages exchanged for each operation and how different protocol configurations affect behavior.',
      },
    ],
    crossLinks: ['app-market-pulse', 'app-content-forge', 'layer-orchestration'],
    category: 'app',
  },
  {
    id: 'app-market-pulse',
    title: 'MarketPulse',
    oneLiner: 'An agent that tracks market trends and curates relevant content.',
    sections: [
      {
        heading: 'What it does',
        content:
          'MarketPulse monitors content feeds, identifies trending topics, and maintains a processing queue for incoming articles. It acts as a market intelligence agent, surfacing what matters from the noise of information streams.',
      },
      {
        heading: 'Capabilities',
        content:
          'MarketPulse offers feed management (configuring content sources), trend detection (identifying rising topics), queue processing (prioritizing and analyzing incoming content), and market analysis (synthesizing trends into actionable insights).',
      },
      {
        heading: 'Agent interaction',
        content:
          'MarketPulse often works with ResearchHub: ResearchHub finds the raw content, MarketPulse determines its market significance. This agent-to-agent collaboration demonstrates how specialized agents create value together that neither could achieve alone.',
      },
    ],
    crossLinks: ['app-research-hub', 'app-content-forge', 'layer-orchestration'],
    category: 'app',
  },
  {
    id: 'app-content-forge',
    title: 'ContentForge',
    oneLiner: 'An agent that creates polished content from research and analysis.',
    sections: [
      {
        heading: 'What it does',
        content:
          'ContentForge is a content creation agent. It takes research data from ResearchHub and market analysis from MarketPulse, then generates polished articles, reports, or summaries. It manages drafts through a review workflow before publication.',
      },
      {
        heading: 'Capabilities',
        content:
          'ContentForge offers topic discovery (finding content-worthy subjects), draft generation (AI-written first drafts), content refinement (editing and improving drafts), and multi-source synthesis (combining inputs from multiple agents into coherent output).',
      },
      {
        heading: 'The full pipeline',
        content:
          'ContentForge demonstrates the full value of multi-agent orchestration. It consumes outputs from ResearchHub and MarketPulse, combining multiple agent perspectives into a single polished deliverable. This is the kind of workflow that protocol standardization makes possible.',
      },
    ],
    crossLinks: ['app-research-hub', 'app-market-pulse', 'layer-orchestration', 'provider-pipeline'],
    category: 'app',
  },
  {
    id: 'concept-suite-a2a',
    title: 'A2A Suite Presets',
    oneLiner: 'A2A full-stack presets for agent discovery, trust, and lifecycle orchestration.',
    sections: [
      {
        heading: 'What it includes',
        content:
          'The A2A suite combines Agent Card discovery, A2A JSON-RPC transport, A2A skill negotiation, OAuth/JWT identity metadata, JWS trust verification, and A2A task lifecycle orchestration.',
      },
      {
        heading: 'Available presets',
        content:
          'Use a2a-full for canonical A2A interactions or a2a-ap2 when you want A2A control flow plus Coinbase/x402 payment integration.',
      },
    ],
    crossLinks: ['concept-a2a', 'provider-a2a-jsonrpc', 'provider-oauth-jwt', 'provider-x402-usdc'],
    category: 'concept',
  },
  {
    id: 'concept-suite-agntcy',
    title: 'AGNTCY ACP Suite',
    oneLiner: 'Federated OASF discovery + cryptographic identity + SLIM encrypted exchange.',
    sections: [
      {
        heading: 'What it includes',
        content:
          'The AGNTCY suite introduces OASF discovery, cryptographically verifiable identity, and SLIM encryption to support secure cross-organization messaging.',
      },
      {
        heading: 'When to use it',
        content:
          'Use AGNTCY providers when interop requires explicit identity proofs and encrypted message envelopes aligned to AGNTCY standards.',
      },
    ],
    crossLinks: ['layer-discovery', 'layer-identity', 'layer-encryption', 'concept-a2a'],
    category: 'concept',
  },
  {
    id: 'concept-suite-commerce-acp',
    title: 'Commerce ACP Suite',
    oneLiner: 'Cart negotiation, checkout payment, and checkout FSM orchestration as one bundle.',
    sections: [
      {
        heading: 'What it includes',
        content:
          'Commerce ACP adds specialized providers for cart negotiation, checkout execution, and checkout state machine orchestration to support agentic commerce flows.',
      },
      {
        heading: 'Workflow shape',
        content:
          'A typical flow is cart-created -> payment-pending -> completed, with audit records proving each state transition.',
      },
    ],
    crossLinks: ['layer-negotiation', 'layer-payment', 'layer-orchestration'],
    category: 'concept',
  },
  {
    id: 'concept-suite-coinbase-x402',
    title: 'Coinbase x402 / AgentKit',
    oneLiner: 'USDC payment requirements and AgentKit wallet execution on Base.',
    sections: [
      {
        heading: 'What it includes',
        content:
          'The Coinbase composition pairs x402 USDC payment requirements with Coinbase CDP wallet execution, including Smart Wallet and gasless-capable transaction metadata.',
      },
      {
        heading: 'Why it matters',
        content:
          'This enables monetized agent tasks with programmable payment rails while keeping task orchestration in standard A2A-compatible flows.',
      },
    ],
    crossLinks: ['provider-x402-usdc', 'provider-coinbase-cdp', 'layer-payment', 'layer-wallet'],
    category: 'concept',
  },
];
