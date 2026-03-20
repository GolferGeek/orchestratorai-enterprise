// Help content: Code references
// Maps each provider and key abstraction to its actual source file

export interface CodeReference {
  id: string;
  label: string;
  sourceFile: string;
  totalLines: number;
  className?: string;
  interfaceFile?: string;
}

// All paths are relative to packages/shared-protocols/src/
const BASE = 'packages/shared-protocols/src';

// ── Provider implementations ──

export const PROVIDER_CODE_REFS: CodeReference[] = [
  // Discovery
  {
    id: 'well-known',
    label: 'WellKnownDiscoveryProvider',
    sourceFile: `${BASE}/discovery/providers/well-known.provider.ts`,
    totalLines: 42,
    className: 'WellKnownDiscoveryProvider',
    interfaceFile: `${BASE}/discovery/discovery.interface.ts`,
  },
  {
    id: 'a2a-agent-card',
    label: 'A2AAgentCardDiscoveryProvider',
    sourceFile: `${BASE}/discovery/providers/a2a-agent-card.provider.ts`,
    totalLines: 236,
    className: 'A2AAgentCardDiscoveryProvider',
    interfaceFile: `${BASE}/discovery/discovery.interface.ts`,
  },
  {
    id: 'agntcy-oasf',
    label: 'AgntcyOasfDiscoveryProvider',
    sourceFile: `${BASE}/discovery/providers/agntcy-oasf.provider.ts`,
    totalLines: 125,
    className: 'AgntcyOasfDiscoveryProvider',
    interfaceFile: `${BASE}/discovery/discovery.interface.ts`,
  },

  // Transport
  {
    id: 'a2a-jsonrpc',
    label: 'A2AJsonRpcTransportProvider',
    sourceFile: `${BASE}/transport/providers/a2a-jsonrpc.provider.ts`,
    totalLines: 151,
    className: 'A2AJsonRpcTransportProvider',
    interfaceFile: `${BASE}/transport/transport.interface.ts`,
  },
  {
    id: 'http-rest',
    label: 'HttpRestTransportProvider',
    sourceFile: `${BASE}/transport/providers/http-rest.provider.ts`,
    totalLines: 53,
    className: 'HttpRestTransportProvider',
    interfaceFile: `${BASE}/transport/transport.interface.ts`,
  },
  {
    id: 'websocket',
    label: 'WebSocketTransportProvider',
    sourceFile: `${BASE}/transport/providers/websocket.provider.ts`,
    totalLines: 208,
    className: 'WebSocketTransportProvider',
    interfaceFile: `${BASE}/transport/transport.interface.ts`,
  },
  {
    id: 'grpc',
    label: 'GrpcTransportProvider',
    sourceFile: `${BASE}/transport/providers/grpc.provider.ts`,
    totalLines: 190,
    className: 'GrpcTransportProvider',
    interfaceFile: `${BASE}/transport/transport.interface.ts`,
  },
  {
    id: 'mcp',
    label: 'McpTransportProvider',
    sourceFile: `${BASE}/transport/providers/mcp.provider.ts`,
    totalLines: 200,
    className: 'McpTransportProvider',
    interfaceFile: `${BASE}/transport/transport.interface.ts`,
  },

  // Identity
  {
    id: 'oauth-jwt',
    label: 'OAuthJWTIdentityProvider',
    sourceFile: `${BASE}/identity/providers/oauth-jwt.provider.ts`,
    totalLines: 110,
    className: 'OAuthJWTIdentityProvider',
    interfaceFile: `${BASE}/identity/identity.interface.ts`,
  },
  {
    id: 'x509',
    label: 'X509IdentityProvider',
    sourceFile: `${BASE}/identity/providers/x509.provider.ts`,
    totalLines: 62,
    className: 'X509IdentityProvider',
    interfaceFile: `${BASE}/identity/identity.interface.ts`,
  },
  {
    id: 'did',
    label: 'DIDIdentityProvider',
    sourceFile: `${BASE}/identity/providers/did.provider.ts`,
    totalLines: 140,
    className: 'DIDIdentityProvider',
    interfaceFile: `${BASE}/identity/identity.interface.ts`,
  },
  {
    id: 'local-keys',
    label: 'LocalKeysIdentityProvider',
    sourceFile: `${BASE}/identity/providers/local-keys.provider.ts`,
    totalLines: 55,
    className: 'LocalKeysIdentityProvider',
    interfaceFile: `${BASE}/identity/identity.interface.ts`,
  },
  {
    id: 'agntcy-crypto-identity',
    label: 'AgntcyCryptoIdentityProvider',
    sourceFile: `${BASE}/identity/providers/agntcy-crypto-identity.provider.ts`,
    totalLines: 162,
    className: 'AgntcyCryptoIdentityProvider',
    interfaceFile: `${BASE}/identity/identity.interface.ts`,
  },
  {
    id: 'first-contact',
    label: 'FirstContactIdentityProvider',
    sourceFile: `${BASE}/identity/providers/local-keys.provider.ts`,
    totalLines: 55,
    className: 'LocalKeysIdentityProvider',
    interfaceFile: `${BASE}/identity/identity.interface.ts`,
  },

  // Encryption
  {
    id: 'envelope',
    label: 'EnvelopeEncryptionProvider',
    sourceFile: `${BASE}/encryption/providers/envelope.provider.ts`,
    totalLines: 104,
    className: 'EnvelopeEncryptionProvider',
    interfaceFile: `${BASE}/encryption/encryption.interface.ts`,
  },
  {
    id: 'tls-mutual',
    label: 'TLSMutualEncryptionProvider',
    sourceFile: `${BASE}/encryption/providers/tls-mutual.provider.ts`,
    totalLines: 164,
    className: 'TLSMutualEncryptionProvider',
    interfaceFile: `${BASE}/encryption/encryption.interface.ts`,
  },
  {
    id: 'none',
    label: 'NoneEncryptionProvider',
    sourceFile: `${BASE}/encryption/providers/none.provider.ts`,
    totalLines: 21,
    className: 'NoneEncryptionProvider',
    interfaceFile: `${BASE}/encryption/encryption.interface.ts`,
  },
  {
    id: 'agntcy-slim',
    label: 'AgntcySlimEncryptionProvider',
    sourceFile: `${BASE}/encryption/providers/agntcy-slim.provider.ts`,
    totalLines: 174,
    className: 'AgntcySlimEncryptionProvider',
    interfaceFile: `${BASE}/encryption/encryption.interface.ts`,
  },

  // Trust
  {
    id: 'reputation',
    label: 'ReputationTrustProvider',
    sourceFile: `${BASE}/trust/providers/reputation.provider.ts`,
    totalLines: 70,
    className: 'ReputationTrustProvider',
    interfaceFile: `${BASE}/trust/trust.interface.ts`,
  },
  {
    id: 'allowlist',
    label: 'AllowlistTrustProvider',
    sourceFile: `${BASE}/trust/providers/allowlist.provider.ts`,
    totalLines: 43,
    className: 'AllowlistTrustProvider',
    interfaceFile: `${BASE}/trust/trust.interface.ts`,
  },
  {
    id: 'first-contact-trust',
    label: 'FirstContactTrustProvider',
    sourceFile: `${BASE}/trust/providers/first-contact.provider.ts`,
    totalLines: 72,
    className: 'FirstContactTrustProvider',
    interfaceFile: `${BASE}/trust/trust.interface.ts`,
  },
  {
    id: 'a2a-jws-trust',
    label: 'A2AJwsTrustProvider',
    sourceFile: `${BASE}/trust/providers/a2a-jws-trust.provider.ts`,
    totalLines: 124,
    className: 'A2AJwsTrustProvider',
    interfaceFile: `${BASE}/trust/trust.interface.ts`,
  },

  // Payment
  {
    id: 'lightning-l402',
    label: 'LightningL402PaymentProvider',
    sourceFile: `${BASE}/payment/providers/lightning-l402.provider.ts`,
    totalLines: 269,
    className: 'LightningL402PaymentProvider',
    interfaceFile: `${BASE}/payment/payment.interface.ts`,
  },
  {
    id: 'stripe-fiat',
    label: 'StripeFiatPaymentProvider',
    sourceFile: `${BASE}/payment/providers/stripe-fiat.provider.ts`,
    totalLines: 133,
    className: 'StripeFiatPaymentProvider',
    interfaceFile: `${BASE}/payment/payment.interface.ts`,
  },
  {
    id: 'x402-usdc',
    label: 'X402UsdcPaymentProvider',
    sourceFile: `${BASE}/payment/providers/x402-usdc.provider.ts`,
    totalLines: 200,
    className: 'X402UsdcPaymentProvider',
    interfaceFile: `${BASE}/payment/payment.interface.ts`,
  },
  {
    id: 'commerce-checkout',
    label: 'CommerceCheckoutPaymentProvider',
    sourceFile: `${BASE}/payment/providers/commerce-checkout.provider.ts`,
    totalLines: 223,
    className: 'CommerceCheckoutPaymentProvider',
    interfaceFile: `${BASE}/payment/payment.interface.ts`,
  },
  {
    id: 'local-keypair',
    label: 'LocalKeypairWalletProvider',
    sourceFile: `${BASE}/wallet/providers/local-keypair.provider.ts`,
    totalLines: 37,
    className: 'LocalKeypairWalletProvider',
    interfaceFile: `${BASE}/wallet/wallet.interface.ts`,
  },
  {
    id: 'coinbase-cdp',
    label: 'CoinbaseCdpWalletProvider',
    sourceFile: `${BASE}/wallet/providers/coinbase-cdp.provider.ts`,
    totalLines: 223,
    className: 'CoinbaseCdpWalletProvider',
    interfaceFile: `${BASE}/wallet/wallet.interface.ts`,
  },

  // Negotiation
  {
    id: 'capability-card',
    label: 'CapabilityCardNegotiationProvider',
    sourceFile: `${BASE}/negotiation/providers/capability-card.provider.ts`,
    totalLines: 39,
    className: 'CapabilityCardNegotiationProvider',
    interfaceFile: `${BASE}/negotiation/negotiation.interface.ts`,
  },
  {
    id: 'acp',
    label: 'AcpNegotiationProvider',
    sourceFile: `${BASE}/negotiation/providers/acp.provider.ts`,
    totalLines: 220,
    className: 'AcpNegotiationProvider',
    interfaceFile: `${BASE}/negotiation/negotiation.interface.ts`,
  },
  {
    id: 'auction',
    label: 'AuctionNegotiationProvider',
    sourceFile: `${BASE}/negotiation/providers/auction.provider.ts`,
    totalLines: 221,
    className: 'AuctionNegotiationProvider',
    interfaceFile: `${BASE}/negotiation/negotiation.interface.ts`,
  },
  {
    id: 'a2a-skill-negotiation',
    label: 'A2ASkillNegotiationProvider',
    sourceFile: `${BASE}/negotiation/providers/a2a-skill-negotiation.provider.ts`,
    totalLines: 264,
    className: 'A2ASkillNegotiationProvider',
    interfaceFile: `${BASE}/negotiation/negotiation.interface.ts`,
  },
  {
    id: 'commerce-cart-negotiation',
    label: 'CommerceCartNegotiationProvider',
    sourceFile: `${BASE}/negotiation/providers/commerce-cart-negotiation.provider.ts`,
    totalLines: 176,
    className: 'CommerceCartNegotiationProvider',
    interfaceFile: `${BASE}/negotiation/negotiation.interface.ts`,
  },

  // Audit
  {
    id: 'hash-chain',
    label: 'HashChainAuditProvider',
    sourceFile: `${BASE}/audit/providers/hash-chain-audit.provider.ts`,
    totalLines: 255,
    className: 'HashChainAuditProvider',
    interfaceFile: `${BASE}/audit/audit.interface.ts`,
  },

  // Resilience
  {
    id: 'circuit-breaker',
    label: 'CircuitBreakerResilienceProvider',
    sourceFile: `${BASE}/resilience/providers/circuit-breaker.provider.ts`,
    totalLines: 181,
    className: 'CircuitBreakerResilienceProvider',
    interfaceFile: `${BASE}/resilience/resilience.interface.ts`,
  },
  {
    id: 'bulkhead',
    label: 'BulkheadResilienceProvider',
    sourceFile: `${BASE}/resilience/providers/bulkhead.provider.ts`,
    totalLines: 94,
    className: 'BulkheadResilienceProvider',
    interfaceFile: `${BASE}/resilience/resilience.interface.ts`,
  },
  {
    id: 'retry',
    label: 'RetryResilienceProvider',
    sourceFile: `${BASE}/resilience/providers/retry.provider.ts`,
    totalLines: 53,
    className: 'RetryResilienceProvider',
    interfaceFile: `${BASE}/resilience/resilience.interface.ts`,
  },

  // Observability
  {
    id: 'opentelemetry',
    label: 'OpenTelemetryObservabilityProvider',
    sourceFile: `${BASE}/observability/providers/opentelemetry.provider.ts`,
    totalLines: 170,
    className: 'OpenTelemetryObservabilityProvider',
    interfaceFile: `${BASE}/observability/observability.interface.ts`,
  },

  // Orchestration
  {
    id: 'pipeline',
    label: 'PipelineOrchestrationProvider',
    sourceFile: `${BASE}/orchestration/providers/pipeline.provider.ts`,
    totalLines: 47,
    className: 'PipelineOrchestrationProvider',
    interfaceFile: `${BASE}/orchestration/orchestration.interface.ts`,
  },
  {
    id: 'a2a-task-lifecycle',
    label: 'A2ATaskLifecycleOrchestrationProvider',
    sourceFile: `${BASE}/orchestration/providers/a2a-task-lifecycle.provider.ts`,
    totalLines: 142,
    className: 'A2ATaskLifecycleOrchestrationProvider',
    interfaceFile: `${BASE}/orchestration/orchestration.interface.ts`,
  },
  {
    id: 'commerce-checkout-fsm',
    label: 'CommerceCheckoutFsmOrchestrationProvider',
    sourceFile: `${BASE}/orchestration/providers/commerce-checkout-fsm.provider.ts`,
    totalLines: 146,
    className: 'CommerceCheckoutFsmOrchestrationProvider',
    interfaceFile: `${BASE}/orchestration/orchestration.interface.ts`,
  },
];

// ── Key abstractions (not providers, but important classes) ──

export const ABSTRACTION_CODE_REFS: CodeReference[] = [
  {
    id: 'pipeline-tracer',
    label: 'PipelineTracer',
    sourceFile: `${BASE}/tracing/pipeline-tracer.ts`,
    totalLines: 120,
    className: 'PipelineTracer',
  },
  {
    id: 'protocol-factory',
    label: 'ProtocolFactory',
    sourceFile: `${BASE}/factory.ts`,
    totalLines: 127,
    className: 'ProtocolFactory',
  },
  {
    id: 'data-loader',
    label: 'DataLoaderService',
    sourceFile: `${BASE}/data/data-loader.service.ts`,
    totalLines: 164,
    className: 'DataLoaderService',
  },
  {
    id: 'hash-chain-audit',
    label: 'HashChainAuditProvider',
    sourceFile: `${BASE}/audit/providers/hash-chain-audit.provider.ts`,
    totalLines: 255,
    className: 'HashChainAuditProvider',
  },
  {
    id: 'secure-transport',
    label: 'SecureTransportMiddleware',
    sourceFile: `${BASE}/security/secure-transport.middleware.ts`,
    totalLines: 0,
    className: 'SecureTransportMiddleware',
  },
  {
    id: 'nonce-store',
    label: 'InMemoryNonceStore',
    sourceFile: `${BASE}/security/nonce-store.ts`,
    totalLines: 0,
    className: 'InMemoryNonceStore',
  },
  {
    id: 'schema-validator',
    label: 'SchemaValidator',
    sourceFile: `${BASE}/security/schema-validator.ts`,
    totalLines: 0,
    className: 'SchemaValidator',
  },
  {
    id: 'message-logging',
    label: 'MessageLoggingInterceptor',
    sourceFile: `${BASE}/observability/message-logging.interceptor.ts`,
    totalLines: 0,
    className: 'MessageLoggingInterceptor',
  },
];

// Combined
export const ALL_CODE_REFS: CodeReference[] = [
  ...PROVIDER_CODE_REFS,
  ...ABSTRACTION_CODE_REFS,
];

// Lookup
const codeRefMap = new Map(ALL_CODE_REFS.map((r) => [r.id, r]));

export function getCodeReference(id: string): CodeReference | undefined {
  return codeRefMap.get(id);
}

/**
 * Resolve a code reference's sourceFile to an absolute path.
 * Call with the agent-communication root directory.
 */
export function resolveSourcePath(ref: CodeReference, agentCommRoot: string): string {
  return `${agentCommRoot}/${ref.sourceFile}`;
}
