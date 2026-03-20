/**
 * Shared provider registration for ProtocolFactory.
 * Used by Protocol API and agent apps to register all 31 providers
 * with consistent constructor args.
 */
import { ProtocolFactory } from '../factory';
import { ProtocolLayer } from '@agent-communication/shared-types';
import { PaymentPersistenceService } from '../payment/payment-persistence.service';

// Discovery
import { WellKnownDiscoveryProvider } from '../discovery/providers/well-known.provider';
import { A2AAgentCardDiscoveryProvider } from '../discovery/providers/a2a-agent-card.provider';
import { AgntcyOasfDiscoveryProvider } from '../discovery/providers/agntcy-oasf.provider';
// Transport
import { HttpRestTransportProvider } from '../transport/providers/http-rest.provider';
import { A2AJsonRpcTransportProvider } from '../transport/providers/a2a-jsonrpc.provider';
import { WebSocketTransportProvider } from '../transport/providers/websocket.provider';
import { GrpcTransportProvider } from '../transport/providers/grpc.provider';
import { McpTransportProvider } from '../transport/providers/mcp.provider';
// Negotiation
import { CapabilityCardNegotiationProvider } from '../negotiation/providers/capability-card.provider';
import { AcpNegotiationProvider } from '../negotiation/providers/acp.provider';
import { AuctionNegotiationProvider } from '../negotiation/providers/auction.provider';
import { A2ASkillNegotiationProvider } from '../negotiation/providers/a2a-skill-negotiation.provider';
import { CommerceCartNegotiationProvider } from '../negotiation/providers/commerce-cart-negotiation.provider';
// Identity
import { LocalKeysIdentityProvider } from '../identity/providers/local-keys.provider';
import { DIDIdentityProvider } from '../identity/providers/did.provider';
import { X509IdentityProvider } from '../identity/providers/x509.provider';
import { OAuthJWTIdentityProvider } from '../identity/providers/oauth-jwt.provider';
import { AgntcyCryptoIdentityProvider } from '../identity/providers/agntcy-crypto-identity.provider';
// Payment
import { MockPaymentProvider } from '../payment/providers/mock.provider';
import { StripeFiatPaymentProvider } from '../payment/providers/stripe-fiat.provider';
import { X402UsdcPaymentProvider } from '../payment/providers/x402-usdc.provider';
import { LightningL402PaymentProvider } from '../payment/providers/lightning-l402.provider';
import { CommerceCheckoutPaymentProvider } from '../payment/providers/commerce-checkout.provider';
// Wallet
import { LocalKeypairWalletProvider } from '../wallet/providers/local-keypair.provider';
import { CoinbaseCdpWalletProvider } from '../wallet/providers/coinbase-cdp.provider';
// Trust
import { AllowlistTrustProvider } from '../trust/providers/allowlist.provider';
import { ReputationTrustProvider } from '../trust/providers/reputation.provider';
import { FirstContactTrustProvider } from '../trust/providers/first-contact.provider';
import { A2AJwsTrustProvider } from '../trust/providers/a2a-jws-trust.provider';
// Encryption
import { NoneEncryptionProvider } from '../encryption/providers/none.provider';
import { EnvelopeEncryptionProvider } from '../encryption/providers/envelope.provider';
import { TLSMutualEncryptionProvider } from '../encryption/providers/tls-mutual.provider';
import { AgntcySlimEncryptionProvider } from '../encryption/providers/agntcy-slim.provider';
// Resilience
import { RetryResilienceProvider } from '../resilience/providers/retry.provider';
import { CircuitBreakerResilienceProvider } from '../resilience/providers/circuit-breaker.provider';
import { BulkheadResilienceProvider } from '../resilience/providers/bulkhead.provider';
// Observability
import { FileLogObservabilityProvider } from '../observability/providers/file-log.provider';
import { OpenTelemetryObservabilityProvider } from '../observability/providers/opentelemetry.provider';
// Orchestration
import { PipelineOrchestrationProvider } from '../orchestration/providers/pipeline.provider';
import { A2ATaskLifecycleOrchestrationProvider } from '../orchestration/providers/a2a-task-lifecycle.provider';
import { CommerceCheckoutFsmOrchestrationProvider } from '../orchestration/providers/commerce-checkout-fsm.provider';
// Audit
import { HashChainAuditProvider } from '../audit/providers/hash-chain-audit.provider';

export interface RegistrationOptions {
  /** Directory for payment persistence (gates, receipts). Defaults to join(cwd, 'data') */
  dataDir?: string;
}

/**
 * Register all 31 providers into a ProtocolFactory instance.
 * Returns a map of provider IDs that failed to register (e.g., missing env vars).
 */
export function registerAllProviders(
  factory: ProtocolFactory,
  options?: RegistrationOptions,
): Map<string, string> {
  const errors = new Map<string, string>();
  const dataDir = options?.dataDir ?? process.cwd() + '/data';
  const persistence = new PaymentPersistenceService(dataDir);

  function safeRegister<L extends ProtocolLayer>(
    layer: L,
    create: () => { providerId: string },
  ) {
    try {
      const provider = create();
      factory.register(layer, provider as any);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.set(`${layer}:unknown`, message);
    }
  }

  // --- Discovery ---
  safeRegister('discovery', () => new WellKnownDiscoveryProvider());
  safeRegister('discovery', () => new A2AAgentCardDiscoveryProvider());
  safeRegister('discovery', () => new AgntcyOasfDiscoveryProvider());

  // --- Transport ---
  safeRegister('transport', () => new HttpRestTransportProvider());
  safeRegister('transport', () => new A2AJsonRpcTransportProvider());
  safeRegister('transport', () => new WebSocketTransportProvider());
  safeRegister('transport', () => new GrpcTransportProvider());
  safeRegister('transport', () => new McpTransportProvider());

  // --- Negotiation ---
  safeRegister('negotiation', () => new CapabilityCardNegotiationProvider());
  safeRegister('negotiation', () => new AcpNegotiationProvider());
  safeRegister('negotiation', () => new AuctionNegotiationProvider());
  safeRegister('negotiation', () => new A2ASkillNegotiationProvider());
  safeRegister('negotiation', () => new CommerceCartNegotiationProvider());

  // --- Identity ---
  safeRegister('identity', () => new LocalKeysIdentityProvider());
  safeRegister('identity', () => new DIDIdentityProvider());
  safeRegister('identity', () => new X509IdentityProvider());
  safeRegister('identity', () => new OAuthJWTIdentityProvider());
  safeRegister('identity', () => new AgntcyCryptoIdentityProvider());

  // --- Payment (with persistence) ---
  safeRegister('payment', () => new MockPaymentProvider());
  safeRegister('payment', () => new StripeFiatPaymentProvider(undefined, persistence));
  safeRegister('payment', () => new X402UsdcPaymentProvider(persistence));
  safeRegister('payment', () => new LightningL402PaymentProvider(persistence));
  safeRegister('payment', () => new CommerceCheckoutPaymentProvider());

  // --- Wallet ---
  safeRegister('wallet', () => new LocalKeypairWalletProvider());
  safeRegister('wallet', () => new CoinbaseCdpWalletProvider());

  // --- Trust ---
  safeRegister('trust', () => new AllowlistTrustProvider());
  safeRegister('trust', () => new ReputationTrustProvider());
  safeRegister('trust', () => new FirstContactTrustProvider());
  safeRegister('trust', () => new A2AJwsTrustProvider());

  // --- Encryption ---
  safeRegister('encryption', () => new NoneEncryptionProvider());
  safeRegister('encryption', () => new EnvelopeEncryptionProvider());
  safeRegister('encryption', () => new TLSMutualEncryptionProvider());
  safeRegister('encryption', () => new AgntcySlimEncryptionProvider());

  // --- Resilience ---
  safeRegister('resilience', () => new RetryResilienceProvider());
  safeRegister('resilience', () => new CircuitBreakerResilienceProvider());
  safeRegister('resilience', () => new BulkheadResilienceProvider());

  // --- Observability ---
  safeRegister('observability', () => new FileLogObservabilityProvider());
  safeRegister('observability', () => new OpenTelemetryObservabilityProvider());

  // --- Orchestration ---
  safeRegister('orchestration', () => new PipelineOrchestrationProvider());
  safeRegister('orchestration', () => new A2ATaskLifecycleOrchestrationProvider());
  safeRegister('orchestration', () => new CommerceCheckoutFsmOrchestrationProvider());

  // --- Audit ---
  safeRegister('audit', () => new HashChainAuditProvider());

  return errors;
}
