// Protocol interfaces
export { IDiscoveryProvider } from './discovery/discovery.interface';
export { ITransportProvider, TransportMessage, TransportResponse } from './transport/transport.interface';
export { INegotiationProvider } from './negotiation/negotiation.interface';
export { IIdentityProvider, AgentIdentity } from './identity/identity.interface';
export { IPaymentProvider, PaymentGate, PaymentInvoice, PaymentReceipt } from './payment/payment.interface';
export { PaymentPersistenceService, PersistedPaymentGate, PersistedPaymentReceipt } from './payment/payment-persistence.service';
export { PreflightResult, checkProviderPreflight, checkAllProviders } from './payment/provider-preflight';
export {
  PaymentState,
  PaymentRecord,
  transitionPaymentState,
  createPaymentRecord,
  advancePaymentRecord,
} from './payment/payment-lifecycle';
export { IWalletProvider, WalletInfo } from './wallet/wallet.interface';
export { ITrustProvider } from './trust/trust.interface';
export { IResilienceProvider, RetryOptions, CircuitBreakerOptions, BulkheadOptions } from './resilience/resilience.interface';
export { IEncryptionProvider } from './encryption/encryption.interface';
export { IObservabilityProvider, ObservabilityEvent, ProtocolMetrics } from './observability/observability.interface';
export { IOrchestrationProvider } from './orchestration/orchestration.interface';

// Phase 1 providers
export { WellKnownDiscoveryProvider } from './discovery/providers/well-known.provider';
export { A2AAgentCardDiscoveryProvider } from './discovery/providers/a2a-agent-card.provider';
export { AgntcyOasfDiscoveryProvider } from './discovery/providers/agntcy-oasf.provider';
export { HttpRestTransportProvider } from './transport/providers/http-rest.provider';
export { CapabilityCardNegotiationProvider } from './negotiation/providers/capability-card.provider';
export { LocalKeysIdentityProvider } from './identity/providers/local-keys.provider';
export { MockPaymentProvider } from './payment/providers/mock.provider';
export { LocalKeypairWalletProvider } from './wallet/providers/local-keypair.provider';
export { AllowlistTrustProvider } from './trust/providers/allowlist.provider';
export { NoneEncryptionProvider } from './encryption/providers/none.provider';
export { RetryResilienceProvider } from './resilience/providers/retry.provider';
export { FileLogObservabilityProvider } from './observability/providers/file-log.provider';
export { OpenTelemetryObservabilityProvider } from './observability/providers/opentelemetry.provider';
export { PipelineOrchestrationProvider } from './orchestration/providers/pipeline.provider';
export { A2ATaskLifecycleOrchestrationProvider } from './orchestration/providers/a2a-task-lifecycle.provider';

// Phase 2 providers
export { X402UsdcPaymentProvider } from './payment/providers/x402-usdc.provider';
export { LightningL402PaymentProvider } from './payment/providers/lightning-l402.provider';
export { StripeFiatPaymentProvider } from './payment/providers/stripe-fiat.provider';
export { CommerceCheckoutPaymentProvider } from './payment/providers/commerce-checkout.provider';
export { CoinbaseCdpWalletProvider } from './wallet/providers/coinbase-cdp.provider';
export { DIDIdentityProvider } from './identity/providers/did.provider';
export { X509IdentityProvider } from './identity/providers/x509.provider';
export { OAuthJWTIdentityProvider } from './identity/providers/oauth-jwt.provider';
export { AgntcyCryptoIdentityProvider } from './identity/providers/agntcy-crypto-identity.provider';
export { ReputationTrustProvider } from './trust/providers/reputation.provider';
export { FirstContactTrustProvider } from './trust/providers/first-contact.provider';
export { A2AJwsTrustProvider } from './trust/providers/a2a-jws-trust.provider';
export { EnvelopeEncryptionProvider } from './encryption/providers/envelope.provider';
export { TLSMutualEncryptionProvider } from './encryption/providers/tls-mutual.provider';
export { AgntcySlimEncryptionProvider } from './encryption/providers/agntcy-slim.provider';

// Phase 3 providers
export { CircuitBreakerResilienceProvider } from './resilience/providers/circuit-breaker.provider';
export { BulkheadResilienceProvider } from './resilience/providers/bulkhead.provider';
export { A2AJsonRpcTransportProvider } from './transport/providers/a2a-jsonrpc.provider';
export { WebSocketTransportProvider } from './transport/providers/websocket.provider';
export { GrpcTransportProvider } from './transport/providers/grpc.provider';
export { McpTransportProvider } from './transport/providers/mcp.provider';
export { AcpNegotiationProvider } from './negotiation/providers/acp.provider';
export { AuctionNegotiationProvider } from './negotiation/providers/auction.provider';
export { A2ASkillNegotiationProvider } from './negotiation/providers/a2a-skill-negotiation.provider';
export { CommerceCartNegotiationProvider } from './negotiation/providers/commerce-cart-negotiation.provider';
export { CommerceCheckoutFsmOrchestrationProvider } from './orchestration/providers/commerce-checkout-fsm.provider';

// Auth
export { JwtAuthGuard } from './auth/jwt-auth.guard';
export { getAgentToken, getAuthHeaders, getAuthHeadersAsync } from './auth/agent-token.service';

// Security
export {
  INonceStore,
  InMemoryNonceStore,
  NonceStoreOptions,
} from './security/nonce-store';
export {
  SchemaValidator,
  SchemaValidationOutcome,
  SchemaValidationResult,
  SchemaValidationFailure,
  SchemaValidationError,
  JsonSchema,
} from './security/schema-validator';
export { SecureTransportMiddleware, SecureTransportConfig } from './security/secure-transport.middleware';
export {
  SecurityService,
  SecurityEnvelopeData,
  SecurityValidationResult,
} from './security/security.service';
export { SecurityValidationGuard } from './security/security-validation.guard';

// Audit
export { IAuditProvider } from './audit/audit.interface';
export { HashChainAuditProvider } from './audit/providers/hash-chain-audit.provider';

// Message Logging
export { MessageLoggingInterceptor } from './observability/message-logging.interceptor';
export { postMessageToProtocolApi } from './observability/post-message';

// Factory
export { ProtocolFactory, ProtocolProvider } from './factory';

// Config utilities
export { PROVIDER_LAYER_MAP, providersToConfig, getLayerForProviderId } from './config/provider-layer-map';
export { registerAllProviders } from './config/factory-registration';
export { ProtocolFactoryService } from './config/protocol-factory.service';
export { ProtocolFactoryModule } from './config/protocol-factory.module';

// Tracing
export { PipelineTracer } from './tracing/pipeline-tracer';
export { PipelineStep, PipelineTrace } from './tracing/types';

// Data
export { DataLoaderService } from './data/data-loader.service';
export { DataRecord, DataFile, DataFilter, DataLoaderOptions, TransactionRecord, SourceDataReference } from './data/types';
export { ReconciliationService, ReconciliationReport, ReconciliationDetail } from './data/reconciliation.service';

// Callback lifecycle
export {
  CallbackState,
  CallbackRecord,
  createCallbackRecord,
  transitionCallbackState,
  advanceCallbackRecord,
} from './callback/callback-lifecycle';
export { CallbackCorrelationService } from './callback/callback-correlation.service';

// Help content
export * from './help';

// Source code reader (Node.js only — backend use)
export { readSourceFile } from './help/source-code.controller';

// Agent boundary enforcement
export {
  AgentEndpoint,
  AgentHttpClient,
  AGENT_ENDPOINTS,
} from './boundary/agent-http-client';
export {
  enableStrictBoundaryMode,
  disableStrictBoundaryMode,
  isStrictBoundaryMode,
  assertCrossAgentBoundary,
} from './boundary/strict-boundary';

